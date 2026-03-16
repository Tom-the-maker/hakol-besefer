// Server-side AI endpoint - ALL prompts and IP are hidden from the client
// Client sends only clean inputs, server builds prompts internally
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import sharp from 'sharp';

// ============ SHARED INFRA (rate limiting, cost tracking) ============

const MODEL_PRICING = {
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.5 },
  'gemini-3-pro-preview': { input: 2.0, output: 12.0 },
  'gemini-3.1-pro-preview': { input: 2.0, output: 12.0 },
  'gemini-3.1-flash-image-preview': { input: 0.0, output: 0.0, perImage: 0.101 },
  'gemini-3-pro-image-preview': { input: 0.0, output: 0.0, perImage: 0.134 },
};

const STORY_MODEL = process.env.GEMINI_STORY_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
const STORY_TEMPERATURE = Math.min(2, Math.max(0, Number(process.env.GEMINI_STORY_TEMPERATURE || 0.95)));
const STORY_THINKING_BUDGET = Number(process.env.GEMINI_STORY_THINKING_BUDGET || 7000);
const CHAT_ENTITY_MODEL = process.env.GEMINI_CHAT_ENTITY_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
const CHAT_ENTITY_MODEL_FALLBACK = process.env.GEMINI_CHAT_ENTITY_MODEL_FALLBACK || 'gemini-2.0-flash';
const CHAT_ENTITY_THINKING_LEVEL = String(process.env.GEMINI_CHAT_ENTITY_THINKING_LEVEL || 'low').trim().toLowerCase();
const TITLE_MODEL = process.env.GEMINI_TITLE_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
const ALTERNATIVE_TITLE_MODEL = process.env.GEMINI_ALTERNATIVE_TITLE_MODEL || TITLE_MODEL;
const IMAGE_MODEL_PRIMARY = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const IMAGE_MODEL_COMPLEX = process.env.GEMINI_IMAGE_MODEL_COMPLEX || IMAGE_MODEL_PRIMARY;
const IMAGE_MODEL_FALLBACK = process.env.GEMINI_IMAGE_MODEL_FALLBACK || IMAGE_MODEL_PRIMARY;
const IMAGE_OUTPUT_RESOLUTION = (process.env.GEMINI_IMAGE_OUTPUT_RESOLUTION || '2K').trim().toUpperCase();
const IMAGE_PREFLIGHT_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.GEMINI_IMAGE_PREFLIGHT_ENABLED || '1').trim());
const IMAGE_PREFLIGHT_MODEL = process.env.GEMINI_IMAGE_PREFLIGHT_MODEL || 'gemini-2.0-flash';
const IMAGE_PREFLIGHT_THINKING_BUDGET = Number(process.env.GEMINI_IMAGE_PREFLIGHT_THINKING_BUDGET || 256);

const STORYBOARD_COLUMNS = 4;
const STORYBOARD_ROWS = 3;
const STORYBOARD_TOTAL_PANELS = STORYBOARD_COLUMNS * STORYBOARD_ROWS; // 12
const STORYBOARD_COVER_PANELS = 2;
const STORYBOARD_STORY_SEGMENTS = STORYBOARD_TOTAL_PANELS - STORYBOARD_COVER_PANELS; // 10
const STORYBOARD_FIRST_STORY_PANEL = STORYBOARD_COVER_PANELS + 1; // 3
const STORYBOARD_LAST_STORY_PANEL = STORYBOARD_TOTAL_PANELS; // 12

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function ensureStore(key, defaultValue) {
  if (!globalThis[key]) globalThis[key] = defaultValue;
  return globalThis[key];
}

function checkRateLimit(ip) {
  const windowMs = Number(process.env.GEMINI_RATE_WINDOW_MS || 60_000);
  const maxRequests = Number(process.env.GEMINI_RATE_MAX_REQ || 30);
  const now = Date.now();
  const store = ensureStore('__aiRateLimiter', new Map());
  const entry = store.get(ip);
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

function checkGenerationLimit(ip) {
  const maxPerDay = Number(process.env.MAX_GENERATIONS_PER_IP || 5);
  const today = new Date().toISOString().slice(0, 10);
  const store = ensureStore('__aiGenLimiter', new Map());
  const key = `${ip}:${today}`;
  const count = store.get(key) || 0;
  // if (count >= maxPerDay) return false; // BYPASS FOR TESTING
  store.set(key, count + 1);
  for (const [k] of store) { if (!k.endsWith(today)) store.delete(k); }
  return true;
}

function isDailyBudgetExceeded() {
  const cap = Number(process.env.AI_DAILY_USD_CAP) || 20;
  const today = new Date().toISOString().slice(0, 10);
  const store = ensureStore('__aiDailyCost', { day: null, cost: 0 });
  if (store.day !== today) { store.day = today; store.cost = 0; return false; }
  return store.cost >= cap;
}

function addDailyCost(model, inputTokens, outputTokens, isImage) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return;
  const cost = isImage && pricing.perImage ? pricing.perImage : (inputTokens / 1e6) * pricing.input + (outputTokens / 1e6) * pricing.output;
  const store = ensureStore('__aiDailyCost', { day: null, cost: 0 });
  const today = new Date().toISOString().slice(0, 10);
  if (store.day !== today) { store.day = today; store.cost = 0; }
  store.cost += cost;
}

function estimateModelCost(model, inputTokens = 0, outputTokens = 0, isImage = false) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  if (isImage && pricing.perImage) return pricing.perImage;
  const normalizedInput = Number.isFinite(Number(inputTokens)) ? Number(inputTokens) : 0;
  const normalizedOutput = Number.isFinite(Number(outputTokens)) ? Number(outputTokens) : 0;
  return (normalizedInput / 1e6) * pricing.input + (normalizedOutput / 1e6) * pricing.output;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function splitTitleForCover(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [words.join(' ')];
  let best = [words.join(' ')];
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const score = Math.abs(lines[0].length - lines[1].length);
    if (score < bestScore) {
      bestScore = score;
      best = lines;
    }
  }
  return best;
}

function buildCoverTitleOverlaySvg(title, panelSize, styleName) {
  const lines = splitTitleForCover(title).slice(0, 2);
  const longestLine = Math.max(...lines.map((line) => line.length), 1);
  const availableWidth = panelSize * 0.82;
  const estimatedFont = Math.floor(Math.min(panelSize * 0.12, availableWidth / Math.max(longestLine * 0.72, 1)));
  const fontSize = Math.max(36, estimatedFont);
  const lineHeight = Math.floor(fontSize * 1.08);
  const topPadding = Math.floor(panelSize * 0.1);
  const titleHeight = lines.length * lineHeight;
  const startY = topPadding + fontSize;
  const palette = styleName === 'Claymation / Stop Motion Style'
    ? ['#f15a24', '#ffd54f', '#65c466', '#5ac8fa']
    : ['#57b8ff', '#62d26f', '#ffd44d', '#ff6b6b'];
  const textSpans = lines.map((line, index) => {
    const fill = palette[index % palette.length];
    const y = startY + index * lineHeight;
    const safeLine = escapeXml(line);
    return `
      <text x="50%" y="${y + 8}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext"
        font-family="Arial, 'Noto Sans Hebrew', sans-serif" font-size="${fontSize}" font-weight="900"
        fill="#183b72" opacity="0.9">${safeLine}</text>
      <text x="50%" y="${y + 4}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext"
        font-family="Arial, 'Noto Sans Hebrew', sans-serif" font-size="${fontSize}" font-weight="900"
        fill="#264f95">${safeLine}</text>
      <text x="50%" y="${y}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext"
        font-family="Arial, 'Noto Sans Hebrew', sans-serif" font-size="${fontSize}" font-weight="900"
        stroke="#ffffff" stroke-width="5" paint-order="stroke fill" fill="${fill}">${safeLine}</text>`;
  }).join('\n');

  return `
    <svg width="${panelSize}" height="${panelSize}" viewBox="0 0 ${panelSize} ${panelSize}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${Math.floor(panelSize * 0.06)}" y="${Math.floor(topPadding * 0.35)}" width="${Math.floor(panelSize * 0.88)}" height="${Math.max(titleHeight + 26, Math.floor(panelSize * 0.22))}" rx="${Math.floor(panelSize * 0.05)}" fill="rgba(255,255,255,0.14)"/>
      ${textSpans}
    </svg>`;
}

function extractTitleFromPrompt(prompt, explicitTitle = '') {
  const direct = String(explicitTitle || '').trim();
  if (direct) return direct;
  const text = String(prompt || '');
  const patterns = [
    /Hebrew title "([^"]+)"/i,
    /title "([^"]+)"/i,
    /The confirmed book title is: "([^"]+)"/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

// ============ ENCRYPTION (for image prompt tokens) ============

function getEncryptionKey() {
  const secret = process.env.PROMPT_ENCRYPTION_KEY || process.env.GEMINI_API_KEY || 'fallback-key-32chars-minimum!!!!';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptPrompt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decryptPrompt(token) {
  const [ivBase64, encrypted] = token.split(':');
  const iv = Buffer.from(ivBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============ GEMINI HELPERS ============

function extractText(response) {
  if (typeof response?.text === 'string') return response.text;
  if (typeof response?.text === 'function') return response.text();
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.find(p => typeof p?.text === 'string')?.text || '';
}

function extractImageData(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  return parts.find(p => p?.inlineData?.data)?.inlineData?.data;
}

function parseJsonObject(text, fallback = {}) {
  if (typeof text !== 'string' || !text.trim()) return fallback;
  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try { return JSON.parse(match[0]); } catch { return fallback; }
  }
}

async function callGemini(apiKey, model, contents, config) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({ model, contents, config });
  const usage = response?.usageMetadata || {};
  const inputTokens = usage?.promptTokenCount || 0;
  const outputTokens = usage?.candidatesTokenCount || 0;
  const imageData = extractImageData(response);
  const isImage = Boolean(imageData) || model.includes('image');
  const headers = response?.sdkHttpResponse?.headers || {};
  const rawModel = typeof response?.modelVersion === 'string' ? response.modelVersion.trim() : '';
  const providerResponseId = typeof response?.responseId === 'string' ? response.responseId.trim() : '';
  const providerRequestId =
    (typeof headers?.['x-goog-request-id'] === 'string' && headers['x-goog-request-id'].trim()) ||
    (typeof headers?.['x-request-id'] === 'string' && headers['x-request-id'].trim()) ||
    '';
  const providerModelSource = rawModel ? 'provider_model_version' : 'requested_model_fallback';

  addDailyCost(model, inputTokens, outputTokens, isImage);
  return {
    text: extractText(response),
    imageData,
    inputTokens,
    outputTokens,
    requestedModel: model,
    rawModel,
    providerModel: rawModel || model,
    providerModelSource,
    providerResponseId,
    providerRequestId
  };
}

function modelSupportsThinkingBudget(modelName) {
  const normalized = String(modelName || '').toLowerCase();
  if (!normalized) return false;
  if (!normalized.startsWith('gemini-3')) return false;
  if (normalized.includes('image')) return false;
  return true;
}

function appendThinkingBudget(modelName, config = {}, budgetValue = 0) {
  const budget = Number(budgetValue);
  if (!modelSupportsThinkingBudget(modelName) || !Number.isFinite(budget) || budget <= 0) {
    return config;
  }
  return {
    ...config,
    thinkingConfig: { thinkingBudget: Math.floor(budget) }
  };
}

function computeStoryboardCropBox(imageWidth, imageHeight) {
  const safeWidth = Math.max(1, Math.floor(Number(imageWidth) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(imageHeight) || 1));
  const panelSize = Math.max(1, Math.floor(Math.min(safeWidth / STORYBOARD_COLUMNS, safeHeight / STORYBOARD_ROWS)));
  const targetWidth = panelSize * STORYBOARD_COLUMNS;
  const targetHeight = panelSize * STORYBOARD_ROWS;
  const left = Math.max(0, Math.floor((safeWidth - targetWidth) / 2));
  const top = Math.max(0, Math.floor((safeHeight - targetHeight) / 2));

  return {
    sourceWidth: safeWidth,
    sourceHeight: safeHeight,
    targetWidth,
    targetHeight,
    panelSize,
    left,
    top,
    columns: STORYBOARD_COLUMNS,
    rows: STORYBOARD_ROWS
  };
}

async function normalizeStoryboardImageBase64(imageData) {
  const sourceBuffer = Buffer.from(String(imageData || ''), 'base64');
  const sourceImage = sharp(sourceBuffer, { failOn: 'none' });
  const metadata = await sourceImage.metadata();
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;

  if (!width || !height) {
    return {
      imageData,
      normalizedGrid: null
    };
  }

  const crop = computeStoryboardCropBox(width, height);
  const normalizedBuffer = await sourceImage
    .extract({
      left: crop.left,
      top: crop.top,
      width: crop.targetWidth,
      height: crop.targetHeight
    })
    .png()
    .toBuffer();

  return {
    imageData: normalizedBuffer.toString('base64'),
    normalizedGrid: {
      ...crop,
      wasNormalized: crop.left !== 0 || crop.top !== 0 || crop.targetWidth !== crop.sourceWidth || crop.targetHeight !== crop.sourceHeight
    }
  };
}

async function overlayTitleOnStoryboardBase64(imageData, title, artStyle, normalizedGrid) {
  const safeTitle = String(title || '').trim();
  const panelSize = Number(normalizedGrid?.panelSize) || 0;
  if (!safeTitle || !panelSize) return imageData;

  const sourceBuffer = Buffer.from(String(imageData || ''), 'base64');
  const overlaySvg = buildCoverTitleOverlaySvg(safeTitle, panelSize, artStyle || '');
  const composited = await sharp(sourceBuffer, { failOn: 'none' })
    .composite([
      { input: Buffer.from(overlaySvg), left: 0, top: 0 }
    ])
    .png()
    .toBuffer();

  return composited.toString('base64');
}

// ============ PROMPT BUILDERS (THE SECRET SAUCE - NEVER SENT TO CLIENT) ============

function buildExtractEntityPrompt() {
  return `You are "The Director" of a book creation app.
Your goal is to extract structured data from natural conversation.

*** CRITICAL RULE: NAME EXTRACTION ***
When the user provides a name, you must CLEAN it. Remove any introductory phrases.
Examples:
- Input: "הגיבור הוא שמעון" -> Name: "שמעון", Gender: "male" (NOT "הגיבור הוא שמעון")
- Input: "הגיבור הוא דוד" -> Name: "דוד", Gender: "male"
- Input: "קוראים לו דניאל" -> Name: "דניאל", Gender: "male"
- Input: "הבת שלי נועה" -> Name: "נועה", Gender: "female"
- Input: "איתי" -> Name: "איתי", Gender: "male"
- Input: "מיכל בת 5" -> Name: "מיכל", Gender: "female", Age: 5

*** GENDER INFERENCE (SMART CONTEXT) ***
Look for gendered verbs or adjectives in the input to infer gender:
- "הלכה", "אמרה", "מתחתנת", "יפה", "קטנה" -> Gender: "female"
- "הלך", "אמר", "מתחתן", "יפה", "קטן" -> Gender: "male"

Rules:
- Hebrew male names (שמעון, דוד, דניאל, איתי, יוסי, etc.) -> Gender: "male"
- Hebrew female names (נועה, מיכל, יעל, רוני, etc.) -> Gender: "female"
- "הגיבור הוא..." or "הבן שלי" -> Gender: "male"
- "הגיבורה היא..." or "הבת שלי" -> Gender: "female"
- Ambiguous names (נועם, שי, טל) -> Gender: null (ask), UNLESS there is a gendered verb (e.g. "שי הלכה" -> "female").

*** OUTPUT FORMAT (JSON ONLY) ***
{
  "hero_name": "Extracted Name ONLY (Cleaned)",
  "hero_gender": "male" | "female" | null,
  "hero_age": number | null,
  "reply_text": "Hebrew response using ONLY the cleaned name",
  "next_step": "ask_age" | "ask_photo" | "confirm_name" | "ask_gender"
}

*** RESPONSE LOGIC ***
- If got name + gender: reply_text should ask for age. next_step="ask_age"
- If got name + gender + age: reply_text should ask for photo. next_step="ask_photo"
- If got name but ambiguous gender: reply_text should ask for gender. next_step="ask_gender"
- If input looks unusual (random letters, gibberish): STILL ACCEPT IT but ask for confirmation. next_step="confirm_name"
  IMPORTANT: Never dismiss a name! Even unusual strings could be real names. Just ask "האם אתה בטוח שזה השם?"`;
}

function buildRefineConceptPrompt(currentTopic, newDetails, age) {
  let context = "";
  if (age && age >= 18) {
    context = `Context: The hero is an ADULT (${age} years old). Refer to them as Man/Woman (גבר/אישה), NOT boy/girl (ילד/ילדה).`;
  }
  return `You are a professional Hebrew editor.
Task: Merge two story descriptions into ONE cohesive, natural Hebrew sentence.
${context}

Current Concept: "${currentTopic}"
New Details to Add: "${newDetails}"

Rules:
1. Output ONLY the merged sentence in Hebrew.
2. Do NOT just concatenate. Fix grammar and flow.
3. If new details contradict, favor the NEW details.
4. Remove any conversational filler like "Yes", "No", "Okay" from the inputs.
5. Keep it concise (max 20 words).`;
}

function buildValidatePhotoPrompt(characterType, age, name) {
  const isAdult = age >= 18;
  const subjectRef = name ? `של ${name}` : (isAdult ? "שלך" : "של הילד/ה");
  const cartoonError = `אני צריך תמונה אמיתית ${subjectRef}, לא ציור או דמות מצוירת. יש לך תמונה רגילה?`;
  const multiFaceError = `אני רואה כאן כמה פנים. אפשר תמונה רק ${subjectRef}?`;
  const notPetError = `זה לא נראה כמו ${characterType === 'pet' ? 'חיה' : 'בובה'}. אפשר תמונה ברורה יותר?`;

  if (characterType === 'human') {
    return `Analyze this image for a book character generator.
You must be extremely strict suitable for an automated system.

Step 1: Count EVERY clearly visible HUMAN face. Be strict.
Step 2: Check if the image is a REAL PHOTO (not a drawing/cartoon/AI).
Step 3: Check for obstructions or quality issues.

Validation Rules (Fail if ANY are violated):
1. FACE COUNT MUST BE EXACTLY 1. (If 0 or >1, Set isValid=false).
2. MUST BE A REAL PHOTO.
3. FACE MUST BE VISIBLE.

Return JSON:
{ "isValid": boolean, "faceCount": number, "reason": "Hebrew error message if invalid." }

Error messages (in Hebrew) - Choose the MOST relevant:
- If faceCount > 1: "${multiFaceError}"
- If faceCount == 0: "אני לא מצליח לראות פנים בתמונה. נסה תמונה אחרת?"
- If not real photo: "${cartoonError}"
- If blurry/dark: "התמונה קצת חשוכה או מטושטשת. יש לך אחת ברורה יותר?"`;
  }

  return `Analyze this image. The user claims this is a ${characterType} (Pet/Animal or Toy/Doll).

Step 1: Verify if the MAIN SUBJECT is a ${characterType === 'pet' ? 'REAL ANIMAL' : 'TOY/DOLL'}.
Step 2: Check if it is a REAL PHOTO.
Step 3: Ignore human face count.

Validation Rules:
1. MUST contain a clearly visible ${characterType}.
2. MUST be a REAL PHOTO.

Return JSON:
{ "isValid": boolean, "faceCount": 0, "reason": "Hebrew error message if invalid." }

Error messages:
- If not a ${characterType}: "${notPetError}"
- If not real photo: "${cartoonError}"
- If blurry/dark: "התמונה לא ברורה. יש לך אחרת?"`;
}

function buildAnalyzeFeaturesPrompt(characterType) {
  const safeType = clampText(characterType || 'child', 20);
  return `Analyze this reference photo of a ${safeType} for strict illustration matching.

Return STRICT JSON only:
{
  "subject_type": "${safeType}",
  "hair": "short visible hair summary",
  "face": "visible face traits",
  "skin_tone": "visible skin tone / complexion",
  "glasses": "present|absent|unclear",
  "facial_hair": "visible facial hair or empty string",
  "accessories": ["wearable identity accessories only"],
  "identity_anchors": ["3-6 must-keep traits from the photo"],
  "summary": "one short artist-friendly summary"
}

Rules:
- Mention glasses explicitly, even if absent.
- Ignore temporary props like books, phones, toys, or background objects.
- Focus on identity traits that must survive stylization.
- If a helmet/hat could later be added by the story, keep the underlying identity traits visible in identity_anchors.
- Keep summary under 28 words.
- Output JSON only.`;
}

function buildTitleSuggestionsPrompt(childName, topic) {
  return `You are a CREATIVE children's book title generator. Generate 3 UNIQUE Hebrew titles.

STORY CONTEXT:
- Child's Name: ${childName}
- Story Theme: "${topic}"

RULES:
1. BANNED: "הסיפור של [שם]", "ההרפתקה של [שם]", "יום מיוחד של [שם]", "[שם] והסיפור/הקסום/המופלא"
2. Title MUST reference the SPECIFIC theme "${topic}"
3. Title should CREATE CURIOSITY
4. 2-5 Hebrew words only, NO NIKUD
5. Use creative patterns: Action verbs, Mystery, Object focus, Questions

Return ONLY 3 creative titles, one per line. NO explanations.`;
}

function buildAlternativeTitlesPrompt(storyTitle, storyPreview, childName, topic) {
  return `You are a creative Hebrew children's book title writer. 

EXISTING STORY DETAILS:
- Current Title: "${storyTitle}"
- Story Beginning: "${storyPreview}"
- Main Character: ${childName}
- Theme: ${topic}

Generate 3 alternative Hebrew titles that:
1. Are MORE creative and catchy than the current title
2. DIRECTLY reflect the actual story content
3. Are SHORT (3-6 words maximum)
4. Include the child's name if possible

Return ONLY 3 titles in Hebrew, one per line. No numbers, no quotes, no explanations.`;
}

function getAgeGroup(age) {
  const safeAge = age || 4;
  if (safeAge <= 3) return { group: 'TODDLER', label: 'Toddler', ratio: '1:3 (Head to body)', keywords: 'Cute, innocent, rounded features, big eyes' };
  if (safeAge <= 9) return { group: 'KID', label: 'Child', ratio: '1:5 (Head to body)', keywords: 'Energetic, expressive, child proportions' };
  if (safeAge <= 17) return { group: 'TEEN', label: 'Teenager', ratio: '1:6 (Head to body)', keywords: 'Cool, stylized, youthful but maturing' };
  return { group: 'ADULT', label: 'Adult', ratio: '1:8 (REALISTIC ADULT PROPORTIONS)', keywords: 'Sophisticated, mature, realistic anatomy. DO NOT MAKE THEM LOOK LIKE A CHILD.' };
}

function getContextTone(topic, ageGroup) {
  const t = topic.toLowerCase();
  if (ageGroup === 'ADULT') {
    return `WITTY & LIGHTHEARTED. Fun, engaging, smiling, positive. Relatable Adult Hebrew. NO heavy metaphors.
${t.includes('army') || t.includes('miluim') ? '- ARMY/MILUIM: Funny army slang, brotherhood, roast style.' : ''}
${t.includes('love') || t.includes('wedding') ? '- ROMANCE: Cute, funny quirks, happy vibe.' : ''}
${t.includes('work') || t.includes('office') ? '- OFFICE: Office jokes, coffee breaks.' : ''}`;
  }
  return 'Sweet, adventurous, magical, rhyming (optional), simple vocabulary. Suitable for children.';
}

function includesAny(text, terms = []) {
  const haystack = String(text || '').toLowerCase();
  return terms.some((term) => haystack.includes(String(term).toLowerCase()));
}

function inferNarrativeProfile(inputs = {}) {
  const safeAge = Math.max(0, Number(inputs?.age) || 4);
  const topic = String(inputs?.topic || '');
  const parentRole = String(inputs?.parentCharacterRole || inputs?.parentCharacter || '').toLowerCase();
  const thirdRole = String(inputs?.thirdCharacterRole || inputs?.thirdCharacter || '').toLowerCase();
  const hasPartnerRole = [parentRole, thirdRole].some((value) => /partner|spouse|husband|wife|girlfriend|boyfriend|fiance|fiancé|בת זוג|בן זוג/.test(value));

  if (includesAny(topic, ['army', 'miluim', 'idf', 'soldier', 'unit', 'מילואים', 'צבא', 'חייל', 'גדוד', 'פלוגה'])) {
    return {
      label: 'Adult military / service story',
      subjectLabel: 'adult',
      wordRange: '14-28 Hebrew words',
      voice: 'mature, grounded, witty, with camaraderie and smart light humor',
      flavor: 'dry humor, brotherhood, earned warmth, zero childish phrasing',
      maturity: 'Use adult language and mature emotional beats. Never sound like a toddler book.'
    };
  }

  if ((hasPartnerRole || includesAny(topic, ['honeymoon', 'romance', 'romantic', 'wedding', 'love', 'date', 'proposal', 'ירח דבש', 'אהבה', 'רומנטי', 'חתונה', 'דייט', 'זוג'])) && safeAge >= 18) {
    return {
      label: 'Adult romantic story',
      subjectLabel: 'adult or couple',
      wordRange: '14-28 Hebrew words',
      voice: 'warm, romantic, playful, emotionally mature, with intimate details',
      flavor: 'gentle humor, tenderness, chemistry, and a small emotional turn',
      maturity: 'Write for adults in a romantic register, not like a generic kids adventure.'
    };
  }

  if (includesAny(topic, ['retired', 'retirement', 'pension', 'pensioner', 'פנסיה', 'פנסיונר', 'יצא לפנסיה', 'פרש', 'retire'])) {
    return {
      label: 'Mature retirement story',
      subjectLabel: 'adult',
      wordRange: '14-30 Hebrew words',
      voice: 'mature, warm, reflective, lightly witty, life-experienced',
      flavor: 'smart humor, nostalgia where relevant, and satisfying personal meaning',
      maturity: 'Treat the hero as an adult with life history, not as a child in disguise.'
    };
  }

  if (safeAge <= 2) {
    return {
      label: 'Toddler storybook',
      subjectLabel: 'toddler',
      wordRange: '12-22 Hebrew words',
      voice: 'simple, musical, vivid, playful, concrete, and easy to follow',
      flavor: 'gentle humor, sensory details, and a clear warm emotional journey',
      maturity: 'Use toddler-friendly Hebrew, but still write a real story instead of dry captions.'
    };
  }

  if (safeAge <= 5) {
    return {
      label: 'Preschool storybook',
      subjectLabel: 'young child',
      wordRange: '14-24 Hebrew words',
      voice: 'playful, visual, funny, heartwarming, and easy to read aloud',
      flavor: 'cause-and-effect storytelling with one clear fun surprise in the middle',
      maturity: 'Keep the wording accessible for little kids while making every page feel like story prose.'
    };
  }

  if (safeAge <= 12) {
    return {
      label: 'Children’s adventure story',
      subjectLabel: 'child',
      wordRange: '14-28 Hebrew words',
      voice: 'energetic, visual, playful, and emotionally clear',
      flavor: 'funny discoveries, memorable beats, and a satisfying payoff',
      maturity: 'Write for children, not babies, with richer verbs and stronger scene transitions.'
    };
  }

  if (safeAge <= 17) {
    return {
      label: 'Teen / YA-lite story',
      subjectLabel: 'teen',
      wordRange: '14-28 Hebrew words',
      voice: 'youthful, sharp, expressive, and emotionally direct',
      flavor: 'smart humor, momentum, and an authentic small transformation',
      maturity: 'Avoid babyish language; the hero should sound teen, not childish.'
    };
  }

  return {
    label: 'Adult personal story',
    subjectLabel: 'adult',
    wordRange: '14-30 Hebrew words',
    voice: 'mature, witty, human, and emotionally readable',
    flavor: 'light humor or warmth, specific details, and a clean narrative payoff',
    maturity: 'Use adult framing and life-stage appropriate language throughout.'
  };
}

function buildNarrativeRichnessContract(inputs) {
  const profile = inferNarrativeProfile(inputs);
  return `NARRATIVE WRITING CONTRACT:
- Story mode: ${profile.label}.
- The ${STORYBOARD_STORY_SEGMENTS} Hebrew segments must read like real book prose, not captions and not image labels.
- Each segment should feel like about 3 printed lines on the page: usually ${profile.wordRange}, with one rich sentence or two short flowing sentences.
- Voice: ${profile.voice}.
- Emotional / humor flavor: ${profile.flavor}.
- Always write clear cause-and-effect between segments. One thing should lead to the next.
- Segment 1 must open with a desire, mood, plan, or reason to begin.
- Segments 2-4 must build movement and curiosity.
- Segments 5-7 must introduce a funny surprise, obstacle, twist, or meaningful new encounter.
- Segments 8-9 must show a choice, realization, or emotional shift.
- Segment 10 must land on a satisfying ending where the hero finishes a little changed, wiser, closer, calmer, braver, or happier than at the start.
- Even if the user topic is simple, enrich it into a full beginning-middle-end story. Do NOT return a list of separate situations.
- Avoid dry lines like "the child wears a helmet" unless that fact is part of a larger narrative beat.
- The text must fit the hero's life stage: ${profile.maturity}`;
}

function buildTopicSpecificStoryGuardrails(inputs = {}) {
  const topic = String(inputs?.topic || '');
  if (includesAny(topic, ['חיתול', 'גמילה', 'סיר', 'potty', 'diaper', 'toilet'])) {
    return `TOPIC-SPECIFIC STORY GUARDRAILS:
- This is a warm potty-training / diaper-farewell story, not gross-out humor.
- Do NOT show feces, toilet contents, dirty close-ups, or disgusting visual jokes in the text or in the image plan.
- Before the success / turning-point beat, the child should still read as being in a diaper / pull-up or a neutral at-home outfit. Do NOT start the story with triumphant new underwear before it is earned.
- Underwear may be introduced only after the encouraging turning point or success beat, as a reward / next step.
- Bathroom moments should feel cute, reassuring, and family-friendly, never graphic or embarrassing.`;
  }
  return '';
}

function buildIdentityContinuityContract() {
  return `IDENTITY CONTINUITY CONTRACT:
- Every referenced character has immutable identity anchors that must stay recognizable in every panel, including wide shots, group shots, and small background appearances.
- Preserve the same hair silhouette / tied-up hairstyle / curls / facial hair / glasses / hairline / face shape from panel to panel unless the story explicitly introduces a change.
- Never simplify a referenced face into a generic parent, child, grandparent, or partner archetype in later panels.
- If a character is identifiable by a specific hairstyle or facial-hair silhouette, that silhouette must remain readable in every panel.
- Group shots are NOT allowed to weaken likeness. Shared scenes must still preserve each character's recognizable face and identity anchors.
- When in doubt between style and likeness, keep the likeness.`;
}

function buildStateContinuityContract() {
  return `STORY STATE CONTINUITY CONTRACT:
- Every recurring wearable item, accessory, hairstyle state, prop, costume, vehicle, gift, or transformation must obey chronological continuity.
- A visual state must NOT appear before the story introduces it.
- Once a state changes, later panels must follow the new state until another explicit change happens.
- Do not let future-state items leak backward into earlier panels.
- Keep track of what each main character is wearing / holding / using in each panel so the sequence reads as one continuous story.
- Panel-to-panel changes must feel earned, not random.
- Each story-panel plan should make the current visible state clear enough that an illustrator cannot accidentally jump ahead or backwards.`;
}

function buildPremiumArtDirectionContract() {
  return `PREMIUM ART DIRECTION CONTRACT:
- Aim for premium picture-book cinematography, not safe generic family CGI.
- Use expressive but tasteful lighting, strong depth, intentional staging, and memorable silhouette design.
- Prefer one bold visual idea per panel with clear focal hierarchy.
- Let camera choices feel authored: elegant close-ups, intentional low / high angles, environmental depth, and emotionally readable staging.
- Avoid bland front-facing catalog compositions unless the story beat truly requires them.
- Keep the images warm, beautiful, and art-directed, with visual richness that feels worthy of a printed book.
- Even while preserving continuity, do not flatten the direction into repetitive, over-safe coverage.`;
}

function buildStyleLock(styleName) {
  const normalized = clampText(styleName || 'storybook illustration', 80);
  const styleMap = {
    '3D Pixar Style': [
      'STYLE LOCK: 3D CGI animated feature-film look only.',
      '- Fully three-dimensional characters, environments, and props.',
      '- Use cinematic depth, soft global illumination, volumetric lighting, modeled geometry, and smooth shading.',
      '- Do NOT render as flat 2D illustration, cel animation, watercolor, sketch, or paper-cut look.'
    ],
    'Claymation / Stop Motion Style': [
      'STYLE LOCK: handmade clay stop-motion look only.',
      '- Every character and prop must look sculpted from plasticine or clay, with tactile handmade texture.',
      '- Use miniature set photography / stop-motion studio feeling, soft practical lighting, slight handcrafted imperfections.',
      '- Do NOT render as flat 2D cartoon, glossy CGI, watercolor, anime, or digital cel illustration.'
    ],
    'Watercolor Illustration': [
      'STYLE LOCK: watercolor illustration only.',
      '- Painted paper texture, soft edges, pigment bloom, gentle storybook washes.',
      '- Do NOT render as 3D CGI, clay, cel-shaded cartoon, or comic ink.'
    ],
    'Comic Book': [
      'STYLE LOCK: comic-book illustration only.',
      '- Bold outlines, graphic shapes, readable stylized rendering, comic color treatment.',
      '- Do NOT render as watercolor, clay, or cinematic 3D CGI.'
    ]
  };

  const lines = styleMap[normalized] || [
    `STYLE LOCK: ${normalized}.`,
    `- Every panel must clearly read as ${normalized}.`,
    '- Do NOT drift into a generic flat children\'s illustration style.'
  ];

  return lines.join('\n');
}

function buildCoverTitleDesignContract(styleName, title = '') {
  const normalized = clampText(styleName || 'storybook illustration', 80);
  const safeTitle = clampText(title || 'Hebrew title', 80);
  const sharedRules = [
    'COVER TITLE DESIGN CONTRACT:',
    '- Panel 1 must include the Hebrew title inside the illustration itself as real dimensional style-matched lettering, not as a pasted overlay.',
    '- Panel 2 must be the exact same cover composition as Panel 1, but with all title text removed.',
    '- Keep the title in a clean TOP SAFE AREA above the characters, centered, compact, and easy to read.',
    '- All title words should feel balanced and similarly sized. Do NOT make one word huge and the others tiny.',
    '- Do NOT place the title on the side. Do NOT cover faces. Do NOT use banners, stickers, pasted labels, or fake UI overlays.'
  ];

  const styleSpecificRules = {
    '3D Pixar Style': [
      `- Render the title "${safeTitle}" as colorful 3D animated letters integrated naturally into the same lighting and material world as the cover art.`,
      '- Keep the 3D title compact, premium, and neatly centered near the top, with all letters roughly the same overall visual size.'
    ],
    'Claymation / Stop Motion Style': [
      `- Render the title "${safeTitle}" as handmade clay letters integrated into the scene itself, compact and balanced, not oversized.`
    ],
    'Watercolor Illustration': [
      `- Paint the title "${safeTitle}" softly inside the upper cover area in the same watercolor style, keeping it compact and balanced.`
    ],
    'Comic Book': [
      `- Draw the title "${safeTitle}" inside the upper cover area as bold comic lettering, compact and balanced, not oversized.`
    ]
  };

  const defaultRules = [
    `- Render the title "${safeTitle}" inside the top cover area in a style-matched way, compact and balanced.`,
    '- Keep the title noticeable but not huge or dominant.'
  ];

  return [...sharedRules, ...(styleSpecificRules[normalized] || defaultRules)].join('\n');
}

function buildVisualDiversityContract() {
  return `VISUAL DIVERSITY CONTRACT:
- Treat Panels 3-${STORYBOARD_LAST_STORY_PANEL} as ${STORYBOARD_STORY_SEGMENTS} DISTINCT visual beats, not minor variations of the same moment.
- Consecutive story panels must NOT repeat the same camera distance, same pose, same framing, and same background layout.
- Every story panel must contrast clearly with the panel before it in at least TWO visual axes: shot scale, camera angle, subject size, location/background, dominant prop/secondary subject, motion direction, emotional beat, or lighting / time of day.
- Deliberately vary shot scale across the sequence: use a mix of wide shot, medium shot, full-body action shot, close-up reaction shot, and environmental shot.
- Deliberately vary camera angle across the sequence: front, 3/4 view, side view, over-the-shoulder, slightly high angle, slightly low angle when appropriate.
- Deliberately vary staging: moving left-to-right, right-to-left, centered stop moment, foreground/background depth, and character distance from camera.
- Deliberately vary backgrounds and color mood across the sequence so the book does not feel like the same scene repeated. Use clear location changes and mood changes when the story moves from city to bakery to park to sunset/home.
- "Same composition plus one new prop / animal" is NOT enough. If a dog, cat, pigeon, duck, squirrel, fountain, or ice cream appears, the next panel must pivot to a truly different visual idea unless the action transforms dramatically.
- Never place the child in two consecutive medium street-level riding shots that only differ by a tiny added element.
- Reuse the same exact location at most TWICE in the whole story, and if reused it must change angle, scale, mood, or story goal dramatically.
- Across the ${STORYBOARD_STORY_SEGMENTS} story panels, force a mix that includes at least one overhead / bird's-eye view, one strong establishing wide shot, one side/profile action shot, one close reaction/detail shot, one environment-dominant shot, and one surprise encounter shot.
- If an animal, object, or surprise appears, show it ONCE unless the second appearance adds a NEW story action or a clearly different emotional beat.
- Never spend two panels in a row on nearly the same micro-event.
- At least 6 of the ${STORYBOARD_STORY_SEGMENTS} story panels must have noticeably different framing from the panel immediately before them.
- At least 4 story panels must clearly show more environment around the character, and at least 2 story panels should be tighter emotional/reaction moments.
- Each panel should be readable without the text: the picture alone must communicate a new beat in the story.
- Each story panel should have one clear visual headline that is not reused by the adjacent panels.`;
}

function buildSquarePanelCompositionContract() {
  return `SQUARE PANEL COMPOSITION CONTRACT:
- Treat every panel as a standalone square book illustration, not a cinematic landscape frame.
- Compose every panel so the key action reads clearly inside a 1:1 square with breathing room on the left, right, top, and bottom.
- Any wide shot or establishing shot must still feel square-native: keep the focal action compact, balanced, and fully legible inside the square panel.
- Do NOT spread the main subjects in a thin horizontal strip from edge to edge.
- Avoid panoramic street, alley, horizon, or skyline compositions that make the panel feel wider than tall.
- When two characters share a panel, prefer diagonal staging, depth layering, overlap, different heights, or one-foreground/one-background placement instead of flat side-by-side spacing across the full width.
- Keep heads, hands, and important props away from the extreme left and right edges so the composition survives an exact square crop naturally.
- Build vertical balance into the frame: use foreground/background depth, top/bottom layering, or stacked props so the panel feels designed for a square page.
- Environment is welcome, but it must support the square panel instead of turning the image into a rectangular movie still.
- If a panel is described as "wide", interpret it as "wide within a square book panel", never as a panorama.`;
}

function buildExplicitGridOrderContract() {
  return `EXPLICIT GRID ORDER CONTRACT:
- The storyboard is LANDSCAPE overall: wider than tall.
- The internal layout is EXACTLY 4 COLUMNS ACROSS and 3 ROWS DOWN.
- NEVER transpose the grid into 3 columns by 4 rows.
- Row 1 (top row), left to right: Panel 1, Panel 2, Panel 3, Panel 4.
- Row 2 (middle row), left to right: Panel 5, Panel 6, Panel 7, Panel 8.
- Row 3 (bottom row), left to right: Panel 9, Panel 10, Panel 11, Panel 12.
- Panel 4 must sit at the TOP RIGHT corner, not the right side of a portrait grid.
- Panel 9 must start the BOTTOM LEFT corner, not a fourth row.
- Think "four square panels across each row" at all times.`;
}

function buildStoryPrompt(inputs, variationKey = '') {
  const mainCharacter = inputs.childName;
  const hasUserTitle = inputs.title && inputs.title.trim().length > 0;
  const bookTitle = hasUserTitle ? inputs.title : null;
  const additionalCharacters = [];
  const knownRoles = ['father', 'mother', 'grandmother'];
  const parentRoleKey = String(inputs.parentCharacterRole || inputs.parentCharacter || '').toLowerCase();
  const thirdRoleKey = String(inputs.thirdCharacterRole || inputs.thirdCharacter || '').toLowerCase();
  const narrativeContract = buildNarrativeRichnessContract(inputs);

  if (inputs.parentImage && inputs.parentCharacter) {
    if (knownRoles.includes(parentRoleKey)) {
      additionalCharacters.push(`their ${inputs.parentCharacter}`);
    } else {
      const companionAge = inputs.parentAge ? `, age ${inputs.parentAge}` : '';
      additionalCharacters.push(`${inputs.parentCharacter}${companionAge} (companion)`);
    }
  }
  if (inputs.thirdCharacterImage && inputs.thirdCharacter) {
    if (thirdRoleKey === 'pet' || inputs.thirdCharacter === 'pet') {
      additionalCharacters.push('their pet');
    } else if (knownRoles.includes(thirdRoleKey)) {
      const thirdName = inputs.thirdCharacter === 'father' ? 'father' :
        inputs.thirdCharacter === 'mother' ? 'mother' : 'grandmother';
      additionalCharacters.push(`their ${thirdName}`);
    } else {
      additionalCharacters.push(inputs.thirdCharacter);
    }
  }

  const characterText = additionalCharacters.length > 0 ? ` and ${additionalCharacters.join(' and ')}` : '';
  const safeStyle = inputs.artStyle ? inputs.artStyle.replace(/["']/g, '') : 'Pixar/3D';
  const styleLock = buildStyleLock(safeStyle);
  const visualDiversityContract = buildVisualDiversityContract();
  const squarePanelCompositionContract = buildSquarePanelCompositionContract();
  const explicitGridOrderContract = buildExplicitGridOrderContract();
  const coverTitleDesignContract = buildCoverTitleDesignContract(safeStyle, bookTitle || 'generated title');
  const topicSpecificGuardrails = buildTopicSpecificStoryGuardrails(inputs);
  const identityContinuityContract = buildIdentityContinuityContract();
  const stateContinuityContract = buildStateContinuityContract();
  const premiumArtDirectionContract = buildPremiumArtDirectionContract();

  return `Create a complete Hebrew storybook for the main character "${mainCharacter}".
The theme: "${inputs.topic}".
${bookTitle ? `The confirmed book title is: "${bookTitle}"` : 'No title has been chosen yet – you must create one.'}
${inputs.parentImage && inputs.parentCharacter ? (() => {
      if (knownRoles.includes(parentRoleKey)) {
        return `Include a ${inputs.parentCharacter} character in the story.${inputs.topic.includes('הורים') || inputs.topic.includes('תינוק') || inputs.topic.includes('אחות') || inputs.topic.includes('אח') ? ' If the story is about a new baby being born, the mother must be visibly pregnant in early panels until the baby arrives.' : ''}`;
      } else {
        const companionAge = inputs.parentAge ? ` (age ${inputs.parentAge})` : '';
        const companionGender = inputs.parentGender === 'female' ? 'girl/woman' : 'boy/man';
        return `Include a companion character: ${inputs.parentCharacter}${companionAge}, a ${companionGender}. Respect their role exactly: ${inputs.parentCharacterRole || 'companion'}.`;
      }
    })() : ''}
${inputs.thirdCharacterImage && inputs.thirdCharacter ? `Include an additional character (${inputs.thirdCharacter}) in the story.` : ''}

IMPORTANT RULES:
1. Generate exactly ${STORYBOARD_STORY_SEGMENTS} Hebrew page-text segments that tell one complete sequential story matching the theme "${inputs.topic}" precisely.
2. ${bookTitle ? `The "title" field must be EXACTLY: "${bookTitle}" (already confirmed by user).` : `Generate a CREATIVE Hebrew title for the book. The title MUST relate to the specific story theme "${inputs.topic}". BANNED generic titles: "הסיפור של [שם]", "ההרפתקה של [שם]", "יום מיוחד של [שם]". Use 2-5 words, NO NIKUD.`}
3. The "segments" MUST be in Hebrew and must feel like real storybook text, not dry captions. They must tell the exact story described in the topic while enriching it into a stronger narrative.
4. WRITING QUALITY REQUIREMENTS:
${narrativeContract}
${topicSpecificGuardrails ? `5. TOPIC-SPECIFIC STORY GUARDRAILS:\n${topicSpecificGuardrails}` : ''}
${topicSpecificGuardrails ? '6' : '5'}. Return a "panel_plan" array with exactly ${STORYBOARD_TOTAL_PANELS} items. Panel 1 = cover with title, Panel 2 = cover without text, Panels 3-${STORYBOARD_TOTAL_PANELS} = story segments 1-${STORYBOARD_STORY_SEGMENTS}. Each item must explicitly mention the panel number, its row/column position in the 4-columns-by-3-rows grid, and what happens there.
${topicSpecificGuardrails ? '7' : '6'}. Every story-panel item in "panel_plan" MUST include: action beat, shot type / framing, camera angle or viewpoint, a distinctive environmental/background note, an explicit square-composition note explaining how the beat fits naturally inside a square panel, an explicit row/column placement note, an explicit contrast note explaining what makes this panel visually different from the PREVIOUS story panel, and a short visible-state continuity note that makes clear what the recurring characters are wearing / holding / using in this panel.
${topicSpecificGuardrails ? '8' : '7'}. Every segment must correspond to a NEW visual beat. Do not waste a segment on filler like "he put on a helmet" unless that moment creates story tension, comedy, or a clear transition.
${topicSpecificGuardrails ? '9' : '8'}. Return a "segment_visual_map" array with exactly ${STORYBOARD_STORY_SEGMENTS} items mapping each Hebrew segment to its panel number (Segment 1 -> Panel ${STORYBOARD_FIRST_STORY_PANEL}, ..., Segment ${STORYBOARD_STORY_SEGMENTS} -> Panel ${STORYBOARD_LAST_STORY_PANEL}).
${topicSpecificGuardrails ? '10' : '9'}. Return a "panel_cast_map" array with exactly ${STORYBOARD_STORY_SEGMENTS} items for Panels ${STORYBOARD_FIRST_STORY_PANEL}-${STORYBOARD_LAST_STORY_PANEL}. Each item must list ONLY the named characters allowed in that panel foreground. Do NOT add unnamed siblings, duplicate children, or substitute characters.
${topicSpecificGuardrails ? '11' : '10'}. The sequence must feel visually rich and non-repetitive. If two adjacent panels feel like the same moment from almost the same angle, your plan is wrong and must be rewritten.
${topicSpecificGuardrails ? '12' : '11'}. CHARACTER IDENTITY CONTINUITY:
${identityContinuityContract}
${topicSpecificGuardrails ? '13' : '12'}. STORY STATE CONTINUITY:
${stateContinuityContract}
${topicSpecificGuardrails ? '14' : '13'}. PREMIUM VISUAL DIRECTION:
${premiumArtDirectionContract}
${topicSpecificGuardrails ? '15' : '14'}. Combine everything into ONE detailed "image_prompt" in English describing ALL ${STORYBOARD_TOTAL_PANELS} panels of a ${STORYBOARD_COLUMNS}x${STORYBOARD_ROWS} grid. Plan the mapping: Panel 1 = cover with title, Panel 2 = cover without text, Panels 3-${STORYBOARD_TOTAL_PANELS} = segments 1-${STORYBOARD_STORY_SEGMENTS} in chronological order.
${topicSpecificGuardrails ? '16' : '15'}. CRITICAL IMAGE PROMPT STRUCTURE:
   Start with: "A precise ${STORYBOARD_COLUMNS}x${STORYBOARD_ROWS} grid matrix containing exactly ${STORYBOARD_TOTAL_PANELS} equal-sized square panels in ${STORYBOARD_ROWS} rows × ${STORYBOARD_COLUMNS} columns. Contact sheet layout. No gutters, no borders, no speech bubbles. Style: ${safeStyle}. IMPORTANT: ALL ${STORYBOARD_TOTAL_PANELS} panels MUST be in the SAME art style: ${safeStyle} – do NOT mix 2D and 3D."
   
   Then describe EACH panel explicitly:
   - Panel 1 (top-left): "Full illustration of ${mainCharacter}${characterText}. The Hebrew title must be rendered as dimensional, colorful, style-matched physical lettering inside the scene. The title must sit in a TOP SAFE AREA across the upper part of the cover, above the characters' heads, with a clean background behind it. Keep the title compact, centered, and balanced, with all words reading at roughly the same visual size."
   - Panel 2: "EXACT SAME cover composition and art as Panel 1, same poses, same background, but with ALL text removed."
   - Panel 3-${STORYBOARD_TOTAL_PANELS}: Describe each of the ${STORYBOARD_STORY_SEGMENTS} story scenes in chronological order. Be extremely specific about:
     * What actions are happening to match the timeline
     * Character positions and expressions
     * Setting details
     * How the composition fits a square book panel without feeling panoramic or horizontally stretched
     * If it's a pregnancy story, specify "mother visibly pregnant" in relevant panels
      
${topicSpecificGuardrails ? '17' : '16'}. CRITICAL CHARACTER DETAILS for image_prompt:
   - Main character (${mainCharacter}): Reference uploaded photo for exact appearance
   - Companion/parent character: Reference uploaded photo - match age, gender, and role exactly
   - If a character has an uploaded reference image, do NOT guess or invent hair length, glasses, facial hair, clothing colors, face shape, or accessories inside image_prompt prose. Let the uploaded reference define those details.
   - Do NOT add parenthetical appearance descriptions after the names of referenced characters. Use their names / roles only and let the photos define how they look.
   ${inputs.topic.includes('הורים') || inputs.topic.includes('תינוק') || inputs.topic.includes('אחות') || inputs.topic.includes('אח') ? '- Mother character: Must be VISIBLY PREGNANT in panels before baby arrives' : ''}
${topicSpecificGuardrails ? '18' : '17'}. STYLE CONSISTENCY: Every single panel (1-${STORYBOARD_TOTAL_PANELS}) must be rendered in ${safeStyle}. Never switch art style mid-grid.
${topicSpecificGuardrails ? '19' : '18'}. ACCESSORY CONSISTENCY: If a character wears an accessory (helmet, hat, glasses, cape, etc.) in one panel, they MUST wear it in ALL panels unless the story explicitly says they removed it.
${topicSpecificGuardrails ? '20' : '19'}. If a reference photo includes identity-defining details like glasses, curls, freckles, facial hair, or a specific hairstyle, the image_prompt must preserve them in every panel even when the character also wears a helmet, hat, costume, or new story prop.
${topicSpecificGuardrails ? '21' : '20'}. If there are two child characters, they must remain clearly different from each other in every panel. Never turn them into twins unless the user explicitly asked for twins.
${topicSpecificGuardrails ? '22' : '21'}. VISUAL VARIETY REQUIREMENTS:
${visualDiversityContract}
${topicSpecificGuardrails ? '23' : '22'}. SQUARE PANEL COMPOSITION REQUIREMENTS:
${squarePanelCompositionContract}
${topicSpecificGuardrails ? '24' : '23'}. EXPLICIT GRID ORDER REQUIREMENTS:
${explicitGridOrderContract}
${topicSpecificGuardrails ? '25' : '24'}. COVER TITLE DESIGN REQUIREMENTS:
${coverTitleDesignContract}
${topicSpecificGuardrails ? '26' : '25'}. STYLE MEDIUM LOCK:
${styleLock}
${topicSpecificGuardrails ? '27' : '26'}. The image_prompt must describe the actual chronological story, not chaotic, not repetitive, and not padded with duplicate beats.
24. variation_key (internal, may be ignored by model): "${variationKey || 'default'}".`;
}

function buildImageEnhancement(characterFeatures, parentFeatures, thirdFeatures, age) {
  const ageGroup = getAgeGroup(age);
  const descriptions = [];

  if (characterFeatures !== undefined) {
    descriptions.push(`MAIN CHARACTER - Image #1 above: This character appears in ALL ${STORYBOARD_TOTAL_PANELS} panels.CRITICAL MATCHING:
• FEATURES FROM PHOTO: ${characterFeatures || "Follow reference photo EXACTLY"}
• Hair: EXACT style from photo, exact color
• Face: Match eyes, eyebrows, nose shape, mouth, cheeks, face shape
• Skin tone: Exact match
• Age / build: ${ageGroup.ratio}. ${ageGroup.keywords}
This character must be IDENTICAL in every panel - same hairstyle, same face.`);
  }

  if (parentFeatures !== undefined) {
    descriptions.push(`PARENT - Image #2 above: CRITICAL MATCHING:
• FEATURES FROM PHOTO: ${parentFeatures || "Follow reference photo EXACTLY"}
• Glasses: Match photo EXACTLY
• Hair: Exact style / color / length, facial hair exact match
• Face: Match all features, skin tone
• Age / build: Match photo`);
  }

  if (thirdFeatures !== undefined) {
    descriptions.push(`THIRD CHARACTER - Image #3 above: Match photo exactly - all physical features, hair / fur color and texture, distinctive markings.`);
  }

  return descriptions.join('\n\n');
}

function buildImagePreflightPrompt(basePrompt, characterContext, age) {
  const ageGroup = getAgeGroup(age);
  return `You are a strict "Visual Continuity QA Director" for multi - panel storybook generation.

    TASK:
    1) Analyze the IMAGE PROMPT below.
2) Detect continuity risks(character drift, inconsistent age / anatomy, extra random people, panel confusion, style drift).
3) Produce a refined prompt that is safer and more deterministic for a single - pass ${STORYBOARD_TOTAL_PANELS} -panel result.

IMAGE PROMPT:
${basePrompt}

CHARACTER CONTEXT FROM REFERENCE ANALYSIS:
${characterContext || 'No additional character context was provided.'}

AGE PROFILE:
${ageGroup.group} | ${ageGroup.ratio} | ${ageGroup.keywords}

Return STRICT JSON:
  {
    "risk_flags": ["..."],
      "hard_constraints": ["..."],
        "failure_preventions": ["..."],
          "revised_prompt": "A single revised English prompt, compact but strict.",
            "notes": "Short summary"
  }

  Rules:
  - Keep revised_prompt in English.
- Keep hard_constraints concise and actionable.
- Focus on continuity and anatomy correctness.
- Do not mention policy text.
- Output JSON only.`;
}

function buildImmutableStoryboardLayoutContract() {
  return `IMMUTABLE STORYBOARD LAYOUT CONTRACT(DO NOT OVERRIDE):
  - Grid is EXACTLY ${STORYBOARD_COLUMNS} columns x ${STORYBOARD_ROWS} rows(${STORYBOARD_TOTAL_PANELS} panels total).
- Every panel is a PERFECT SQUARE with identical size.
- No visible dividers or gutters between panels.
- No outer frame, no thick border, no poster - like margin around the grid.
- Full canvas is used by the storyboard itself(edge - to - edge composition).
- Compose content for square book panels, not panoramic movie frames.
- Wide shots must still read naturally inside a square panel with balanced top/bottom space.
- When two characters share a panel, do not spread them flat across the full width edge-to-edge.
- Internal panel order is fixed: top row Panels 1-4, middle row Panels 5-8, bottom row Panels 9-12.
- Never transpose the storyboard into 3 columns and 4 rows.
- Panel 1 and Panel 2 must be the same cover composition; Panel 1 has title text, Panel 2 is the same art without text only.
- Story panels are ${STORYBOARD_FIRST_STORY_PANEL} -${STORYBOARD_LAST_STORY_PANEL}.
  - Never switch to 4x4 or any layout other than ${STORYBOARD_COLUMNS}x${STORYBOARD_ROWS}.`;
}

function promptKeepsStoryboardContract(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (!text) return false;
  const hasGrid =
    text.includes(`${STORYBOARD_COLUMNS}x${STORYBOARD_ROWS} `) ||
    text.includes(`${STORYBOARD_COLUMNS} x ${STORYBOARD_ROWS} `) ||
    text.includes(`${STORYBOARD_COLUMNS}:${STORYBOARD_ROWS} `);
  const hasSquare = /\bsquare\b/.test(text);
  const hasDividerRule =
    text.includes('no visible dividers') ||
    text.includes('no dividers') ||
    text.includes('without dividers');
  const hasNoFrameRule =
    text.includes('no outer frame') ||
    text.includes('no thick border') ||
    text.includes('no border') ||
    text.includes('no poster-like margin');

  return hasGrid && hasSquare && hasDividerRule && hasNoFrameRule;
}

function clampText(value, maxLength = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function normalizeStringArray(value, maxItems = 32, maxChars = 220) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clampText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeFixedStringArray(value, exactLength, maxChars, fallbackItems = []) {
  const normalized = normalizeStringArray(value, exactLength, maxChars);
  if (normalized.length >= exactLength) return normalized.slice(0, exactLength);

  const fallback = normalizeStringArray(fallbackItems, exactLength, maxChars);
  const merged = [...normalized];
  for (const item of fallback) {
    if (merged.length >= exactLength) break;
    merged.push(item);
  }
  return merged.slice(0, exactLength);
}

function buildFallbackSegments(inputs) {
  const heroName = clampText(inputs?.childName || 'הגיבור', 40);
  const topic = clampText(inputs?.topic || 'הרפתקה מיוחדת', 120);
  const beats = [
    `${heroName} פותח את היום עם סקרנות גדולה סביב ${topic}, ומחליט שהפעם הוא לא רק יסתכל מרחוק אלא באמת יצא לגלות מה מחכה לו.`,
    `כבר בצעדים הראשונים ${heroName} מרגיש שהיום הזה שונה, כי כל פינה בדרך רומזת לו שמשהו מצחיק או מפתיע עוד רגע יקרה.`,
    `המפגש הראשון בדרך לא רק מצחיק את ${heroName}, אלא גם דוחף אותו להמשיך קדימה ולבדוק מה עוד מסתתר מעבר לפינה הבאה.`,
    `${heroName} מתחיל ליהנות מהקצב של ההרפתקה, אבל גם מבין שכדי להמשיך הוא צריך לשים לב לפרטים הקטנים ולא לפספס שום רמז.`,
    `באמצע הדרך מופיעה הפתעה חדשה שמשנה את הכיוון, וגורמת ל${heroName} לעצור לרגע, לצחוק, ולתהות מה הכי נכון לעשות עכשיו.`,
    `במקום לוותר, ${heroName} בוחר להגיב באומץ ובסקרנות, והבחירה הזאת פותחת בפניו רגע עוד יותר מעניין ומלא אופי.`,
    `כשהדרך נהיית קצת יותר מסובכת, ${heroName} מגלה שלא תמיד צריך למהר; לפעמים דווקא עצירה קטנה עוזרת להבין מה באמת חשוב.`,
    `עם רעיון חדש בראש ולב בטוח יותר, ${heroName} חוזר לנוע קדימה, והכול סביבו כבר מרגיש שונה, כמעט כאילו גם העולם משתף איתו פעולה.`,
    `הפתרון מגיע מתוך מה ש${heroName} למד בדרך, והוא הופך את כל הרצף של הרגעים המצחיקים והמשונים לסיפור שיש בו משמעות אמיתית.`,
    `${heroName} מסיים את היום עם חיוך גדול, לב רגוע יותר, וזיכרון מתוק שמזכיר לו שגם הרפתקה קטנה יכולה לשנות משהו מבפנים.`,
  ];
  return beats.slice(0, STORYBOARD_STORY_SEGMENTS);
}

function normalizeStorySegments(value, inputs) {
  return normalizeFixedStringArray(
    value,
    STORYBOARD_STORY_SEGMENTS,
    320,
    buildFallbackSegments(inputs)
  );
}

function buildFallbackImagePrompt(inputs, title, segments) {
  const childName = clampText(inputs?.childName || 'Main character', 60);
  const topic = clampText(inputs?.topic || 'adventure', 160);
  const style = clampText(inputs?.artStyle || 'storybook illustration', 80);
  const visualDiversityContract = buildVisualDiversityContract();
  const squarePanelCompositionContract = buildSquarePanelCompositionContract();
  const explicitGridOrderContract = buildExplicitGridOrderContract();
  const coverTitleDesignContract = buildCoverTitleDesignContract(style, title);
  const segmentPreview = normalizeStringArray(segments, STORYBOARD_STORY_SEGMENTS, 120)
    .map((segment, index) => `Panel ${index + STORYBOARD_FIRST_STORY_PANEL}: ${segment} `)
    .join('\n');

  return `Create a seamless ${STORYBOARD_COLUMNS}x${STORYBOARD_ROWS} storyboard in ${style}.
All ${STORYBOARD_TOTAL_PANELS} panels must be equal squares.
The internal panel order is EXACTLY 4 columns across and 3 rows down: Row 1 = Panels 1-4, Row 2 = Panels 5-8, Row 3 = Panels 9-12. Never transpose to 3 columns by 4 rows.
Panel 1: Clean cover art with NO text inside the image. Reserve a clean TOP title area above the character for an external Hebrew title overlay "${title}".
Panel 2: Same clean cover without text, preserving the same clean top area.
Main character: ${childName}. Keep visual consistency across all panels.
Allowed cast: main character and explicitly supplied companions only. No extra foreground people.
Theme: ${topic}.
${coverTitleDesignContract}
${visualDiversityContract}
${squarePanelCompositionContract}
${explicitGridOrderContract}
Story progression:
${segmentPreview} `;
}

function buildFallbackPanelPlan(segments) {
  const plan = [
    'Panel 1: Cover art with title text.',
    'Panel 2: Same cover art without title text.',
  ];
  normalizeStringArray(segments, STORYBOARD_STORY_SEGMENTS, 140).forEach((segment, index) => {
    plan.push(`Panel ${index + STORYBOARD_FIRST_STORY_PANEL}: ${segment} `);
  });
  while (plan.length < STORYBOARD_TOTAL_PANELS) {
    plan.push(`Panel ${plan.length + 1}: Continue story progression with consistent characters.`);
  }
  return plan.slice(0, STORYBOARD_TOTAL_PANELS);
}

function normalizePanelPlan(value, segments) {
  const fallback = buildFallbackPanelPlan(segments);
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((item) => {
      if (typeof item === 'string') return clampText(item, 220);
      if (!item || typeof item !== 'object') return '';
      const panel = Number(item.panel || item.panel_index || 0);
      const stage = clampText(item.stage, 40);
      const summary = clampText(item.summary || item.text || item.description, 180);
      const segmentIndex = Number(item.segment_index || item.story_segment_index || 0);
      const visualFocus = clampText(item.visual_focus, 80);
      const parts = [];
      if (Number.isFinite(panel) && panel > 0) parts.push(`Panel ${panel} `);
      if (stage) parts.push(stage);
      if (summary) parts.push(summary);
      if (Number.isFinite(segmentIndex) && segmentIndex > 0) parts.push(`segment ${segmentIndex} `);
      if (visualFocus) parts.push(`visual: ${visualFocus} `);
      return parts.join(' | ');
    })
    .filter(Boolean)
    .slice(0, STORYBOARD_TOTAL_PANELS);

  if (normalized.length === STORYBOARD_TOTAL_PANELS) return normalized;
  return normalizeFixedStringArray(normalized, STORYBOARD_TOTAL_PANELS, 220, fallback);
}

function normalizeSegmentVisualMap(value, segments) {
  const fallback = normalizeStringArray(segments, STORYBOARD_STORY_SEGMENTS, 140).map((segment, index) => (
    `Segment ${index + 1} -> Panel ${index + STORYBOARD_FIRST_STORY_PANEL}: ${segment} `
  ));
  return normalizeFixedStringArray(value, STORYBOARD_STORY_SEGMENTS, 220, fallback);
}

function buildFallbackPanelCastMap(inputs) {
  const cast = [
    clampText(inputs?.childName || 'Main character', 80),
    inputs?.parentCharacter ? clampText(String(inputs.parentCharacter), 80) : '',
    inputs?.thirdCharacter ? clampText(String(inputs.thirdCharacter), 80) : ''
  ].filter(Boolean);
  const castLine = cast.join(', ');
  return Array.from({ length: STORYBOARD_STORY_SEGMENTS }, (_, index) => (
    `Panel ${index + STORYBOARD_FIRST_STORY_PANEL}: ${castLine} (ONLY)`
  ));
}

function normalizePanelCastMap(value, inputs) {
  return normalizeFixedStringArray(
    value,
    STORYBOARD_STORY_SEGMENTS,
    220,
    buildFallbackPanelCastMap(inputs)
  );
}

function parseReferenceFeatureProfile(text, fallbackType = 'child') {
  const raw = parseJsonObject(text, {});
  const normalizeStatus = (value) => {
    const lower = clampText(value, 20).toLowerCase();
    if (['present', 'yes', 'true', 'with', 'wearing'].includes(lower)) return 'present';
    if (['absent', 'no', 'false', 'none', 'without'].includes(lower)) return 'absent';
    return 'unclear';
  };

  const profile = {
    subjectType: clampText(raw.subject_type || raw.subjectType || fallbackType, 24) || fallbackType,
    hair: clampText(raw.hair || '', 120),
    face: clampText(raw.face || '', 120),
    skinTone: clampText(raw.skin_tone || raw.skinTone || '', 80),
    glasses: normalizeStatus(raw.glasses),
    facialHair: clampText(raw.facial_hair || raw.facialHair || '', 80),
    accessories: normalizeStringArray(raw.accessories, 6, 60),
    identityAnchors: normalizeStringArray(raw.identity_anchors || raw.identityAnchors || raw.mustKeep, 6, 80),
    summary: clampText(raw.summary || '', 180)
  };

  if (profile.glasses === 'unclear') {
    const probe = [profile.face, profile.summary, ...profile.identityAnchors].join(' ').toLowerCase();
    if (/\bglasses\b|משקפ/.test(probe)) profile.glasses = 'present';
  }

  return profile;
}

async function analyzeReferenceImage(apiKey, dataUrl, characterType = 'child') {
  const [mimeTypePart, base64Data] = String(dataUrl || '').split(',');
  const mimeType = mimeTypePart?.split(':')[1]?.split(';')[0] || 'image/jpeg';
  const model = 'gemini-2.0-flash';
  const result = await callGemini(apiKey, model, {
    parts: [
      { inlineData: { data: base64Data, mimeType } },
      { text: buildAnalyzeFeaturesPrompt(characterType) }
    ]
  }, {
    temperature: 0,
    maxOutputTokens: 300,
    responseMimeType: 'application/json'
  });

  return {
    profile: parseReferenceFeatureProfile(result.text, characterType),
    usage: { input: result.inputTokens, output: result.outputTokens },
    requestedModel: result.requestedModel || model,
    providerModel: result.providerModel,
    providerModelSource: result.providerModelSource,
    providerResponseId: result.providerResponseId,
    providerRequestId: result.providerRequestId
  };
}

function buildReferenceMatchInstructions(label, profile, extraRules = []) {
  const lines = [
    `${label}: PHOTO MATCH RULES:`,
    '• The uploaded photo is the PRIMARY source of truth for this character’s face and identity. If any later prose conflicts with the photo, follow the photo.',
    '• Face likeness matters more than generic storybook archetypes. Do NOT turn this character into a generic mom, dad, toddler, or partner.'
  ];

  if (profile.identityAnchors.length > 0) lines.push(`• Must-keep identity anchors: ${profile.identityAnchors.join('; ')}`);
  if (profile.hair) lines.push(`• Hair: ${profile.hair}`);
  if (profile.face) lines.push(`• Face: ${profile.face}`);
  if (profile.skinTone) lines.push(`• Skin tone / complexion: ${profile.skinTone}`);
  if (profile.facialHair) lines.push(`• Facial hair: ${profile.facialHair}`);
  if (profile.glasses === 'present') {
    lines.push('• Glasses: PRESENT in photo. Draw the glasses in EVERY panel. If the story adds a helmet, hat, or costume, the character must keep the glasses as well.');
  } else if (profile.glasses === 'absent') {
    lines.push('• Glasses: ABSENT in photo. Do NOT invent glasses in the illustrations.');
  }
  if (profile.accessories.length > 0) {
    lines.push(`• Wearable identity accessories: ${profile.accessories.join(', ')}`);
  }
  lines.push('• Preserve the same recognizable eyes, eyebrows, nose, mouth, jawline, and hairline from the photo across all panels.');
  lines.push('• If the crop includes a background person, partial second face, shoulder, hand, or kiss, ignore that accidental crop noise and match only the named subject.');
  lines.push('• Do NOT genericize this person into a stock parent / child / partner. Match the uploaded face first.');
  lines.push('• Keep these identity traits stable in every panel. New story props may be added, but they must not replace the reference identity.');
  extraRules.forEach((rule) => {
    if (rule) lines.push(`• ${rule}`);
  });

  return lines.join('\n');
}

function buildIdentityContinuityPromptBlock(referenceFeatures = {}) {
  const sections = [];
  const entries = [
    ['main', 'MAIN CHARACTER'],
    ['parent', 'SECOND CHARACTER'],
    ['third', 'THIRD CHARACTER']
  ];

  entries.forEach(([key, label]) => {
    const profile = referenceFeatures?.[key];
    if (!profile) return;
    const anchors = Array.isArray(profile.identityAnchors) ? profile.identityAnchors.filter(Boolean) : [];
    const details = [];
    if (anchors.length > 0) details.push(`anchors: ${anchors.join(', ')}`);
    if (profile.hair) details.push(`hair silhouette: ${profile.hair}`);
    if (profile.face) details.push(`face: ${profile.face}`);
    if (profile.facialHair) details.push(`facial hair: ${profile.facialHair}`);
    if (profile.glasses === 'present') details.push('glasses: present');
    if (profile.glasses === 'absent') details.push('glasses: absent');
    sections.push(`- ${label}: ${details.join(' | ')}`);
  });

  if (sections.length === 0) return '';

  return `IMMUTABLE CHARACTER IDENTITY STATE:
${sections.join('\n')}
- These identity states are persistent across ALL panels and must not disappear in group shots, wide shots, or emotionally busy scenes.`;
}

function sanitizeReferenceProfile(profile, { roleKey = '', gender = '', expectedType = '' } = {}) {
  if (!profile || typeof profile !== 'object') return profile;
  const sanitized = {
    ...profile,
    identityAnchors: Array.isArray(profile.identityAnchors) ? [...profile.identityAnchors] : [],
    accessories: Array.isArray(profile.accessories) ? [...profile.accessories] : []
  };

  if (expectedType) sanitized.subjectType = expectedType;

  const normalizedRole = String(roleKey || '').toLowerCase();
  const normalizedGender = String(gender || '').toLowerCase();
  const shouldBeFemale = normalizedRole === 'mother' || normalizedGender === 'female';
  const shouldBeChild = expectedType === 'child';
  const stripFacialHair = shouldBeFemale || shouldBeChild;

  if (stripFacialHair) {
    const facialHairPattern = /(beard|mustache|goatee|facial hair)/i;
    if (facialHairPattern.test(String(sanitized.facialHair || ''))) sanitized.facialHair = '';
    sanitized.identityAnchors = sanitized.identityAnchors.filter((item) => !facialHairPattern.test(String(item || '')));
    sanitized.accessories = sanitized.accessories.filter((item) => !facialHairPattern.test(String(item || '')));
  }

  return sanitized;
}

function buildStructuredImagePrompt(basePrompt, inputs, title, panelPlan, segmentVisualMap, panelCastMap) {
  const safeBasePrompt = typeof basePrompt === 'string' ? basePrompt.trim() : '';
  const styleLock = buildStyleLock(inputs?.artStyle || '');
  const visualDiversityContract = buildVisualDiversityContract();
  const squarePanelCompositionContract = buildSquarePanelCompositionContract();
  const explicitGridOrderContract = buildExplicitGridOrderContract();
  const coverTitleDesignContract = buildCoverTitleDesignContract(inputs?.artStyle || '', title);
  const allowedCast = [
    clampText(inputs?.childName || 'Main character', 80),
    inputs?.parentCharacter ? clampText(String(inputs.parentCharacter), 80) : '',
    inputs?.thirdCharacter ? clampText(String(inputs.thirdCharacter), 80) : ''
  ].filter(Boolean);

  const multiCharacterDiscipline = allowedCast.length > 1
    ? [
      '- Keep every referenced character visually distinct from the others in every panel.',
      '- Never merge two referenced characters into one hybrid face or hairstyle.',
      '- Never duplicate a referenced character inside the same panel unless the plan explicitly says there are separate people present.',
      '- If a panel requires multiple referenced characters, show exactly those named characters and no extra foreground people.'
    ]
    : [
      '- Keep the main character identical in every panel.',
      '- Do not invent extra foreground children or substitute another child for the reference.'
    ];

  const sections = [
    safeBasePrompt,
    promptKeepsStoryboardContract(safeBasePrompt) ? '' : buildImmutableStoryboardLayoutContract(),
    styleLock,
    visualDiversityContract,
    buildIdentityContinuityContract(),
    buildStateContinuityContract(),
    buildPremiumArtDirectionContract(),
    squarePanelCompositionContract,
    explicitGridOrderContract,
    'STRICT CAST AND CONTINUITY RULES:',
    `- Allowed named foreground cast only: ${allowedCast.join(', ') || 'Main character only'}.`,
    '- No extra foreground people, no lookalike substitutes, no random siblings or duplicate copies.',
    '- Keep the same identity, face, hair, body proportions, and clothes/accessories continuity for each referenced character.',
    ...multiCharacterDiscipline,
    `- Uploaded reference photos override generic appearance wording. If any prose conflicts with the photos, follow the photos.`,
    `- Panel 1 must contain the Hebrew title "${title}" inside the illustration as compact style-matched lettering in the top safe area.`,
    '- Panel 2 must remain the exact same cover composition as Panel 1 with all text removed.',
    '',
    'STRICT COVER TITLE DESIGN:',
    ...coverTitleDesignContract.split('\n').map((line) => `- ${line.replace(/^- /, '')}`),
    '',
    'STRICT PANEL PLAN:',
    ...panelPlan.map((line) => `- ${line}`),
    '',
    'STRICT SEGMENT VISUAL MAP:',
    ...segmentVisualMap.map((line) => `- ${line}`),
    '',
    'STRICT PANEL CAST MAP:',
    ...panelCastMap.map((line) => `- ${line}`)
  ];

  return sections.filter(Boolean).join('\n');
}

// ============ ACTION HANDLERS ============

async function handleExtractEntity(apiKey, body) {
  const { text } = body;
  if (!text) return { status: 400, data: { error: 'Missing text' } };

  const buildExtractEntityConfig = (modelName) => {
    const config = {
      systemInstruction: buildExtractEntityPrompt(),
      temperature: 0,
      maxOutputTokens: 300
    };
    if (modelName.startsWith('gemini-3') && /^(low|medium|high)$/i.test(CHAT_ENTITY_THINKING_LEVEL)) {
      config.thinkingConfig = { thinkingLevel: CHAT_ENTITY_THINKING_LEVEL.toLowerCase() };
    }
    return config;
  };

  let model = CHAT_ENTITY_MODEL;
  let fallbackFromModel = null;
  let result;

  try {
    result = await callGemini(apiKey, model, `User input: "${text}"`, buildExtractEntityConfig(model));
  } catch (error) {
    const canFallback = CHAT_ENTITY_MODEL_FALLBACK && CHAT_ENTITY_MODEL_FALLBACK !== model;
    if (!canFallback) throw error;
    fallbackFromModel = model;
    model = CHAT_ENTITY_MODEL_FALLBACK;
    result = await callGemini(apiKey, model, `User input: "${text}"`, buildExtractEntityConfig(model));
  }

  return {
    status: 200,
    data: {
      text: result.text,
      usage: { input: result.inputTokens, output: result.outputTokens },
      requestedModel: result.requestedModel || model,
      rawModel: result.rawModel,
      providerModel: result.providerModel,
      providerModelSource: result.providerModelSource,
      providerResponseId: result.providerResponseId,
      providerRequestId: result.providerRequestId,
      fallbackFromModel
    }
  };
}

async function handleRefineConcept(apiKey, body) {
  const { currentTopic, newDetails, age } = body;
  if (!currentTopic || !newDetails) return { status: 400, data: { error: 'Missing fields' } };

  const prompt = buildRefineConceptPrompt(currentTopic, newDetails, age);
  const model = 'gemini-2.0-flash';
  const result = await callGemini(apiKey, model, prompt, { temperature: 0.3, maxOutputTokens: 60 });
  return {
    status: 200,
    data: {
      text: result.text,
      requestedModel: model,
      rawModel: result.rawModel,
      providerModel: result.providerModel,
      providerModelSource: result.providerModelSource,
      providerResponseId: result.providerResponseId,
      providerRequestId: result.providerRequestId
    }
  };
}

async function handleValidatePhoto(apiKey, body) {
  const { image, characterType, age, name } = body;
  if (!image) return { status: 400, data: { error: 'Missing image' } };

  const [mimeTypePart, base64Data] = image.split(',');
  const mimeType = mimeTypePart?.split(':')[1]?.split(';')[0] || 'image/jpeg';
  const prompt = buildValidatePhotoPrompt(characterType || 'human', age || 25, name || '');

  const model = 'gemini-2.0-flash';
  const result = await callGemini(apiKey, model, {
    parts: [
      { inlineData: { data: base64Data, mimeType } },
      { text: prompt }
    ]
  }, { temperature: 0, maxOutputTokens: 100, responseMimeType: "application/json" });

  return {
    status: 200,
    data: {
      text: result.text,
      requestedModel: model,
      rawModel: result.rawModel,
      providerModel: result.providerModel,
      providerModelSource: result.providerModelSource,
      providerResponseId: result.providerResponseId,
      providerRequestId: result.providerRequestId
    }
  };
}

async function handleAnalyzeFeatures(apiKey, body) {
  const { image, characterType } = body;
  if (!image) return { status: 400, data: { error: 'Missing image' } };

  const [mimeTypePart, base64Data] = image.split(',');
  const mimeType = mimeTypePart?.split(':')[1]?.split(';')[0] || 'image/jpeg';
  const prompt = buildAnalyzeFeaturesPrompt(characterType || 'child');

  const model = 'gemini-2.0-flash';
  const result = await callGemini(apiKey, model, {
    parts: [
      { inlineData: { data: base64Data, mimeType } },
      { text: prompt }
    ]
  }, { temperature: 0.1, maxOutputTokens: 100 });

  return {
    status: 200,
    data: {
      text: result.text,
      requestedModel: model,
      rawModel: result.rawModel,
      providerModel: result.providerModel,
      providerModelSource: result.providerModelSource,
      providerResponseId: result.providerResponseId,
      providerRequestId: result.providerRequestId
    }
  };
}

async function handleGenerateTitles(apiKey, body) {
  const { childName, topic } = body;
  if (!childName || !topic) return { status: 400, data: { error: 'Missing fields' } };

  const prompt = buildTitleSuggestionsPrompt(childName, topic);
  const model = TITLE_MODEL;
  const result = await callGemini(apiKey, model, prompt, appendThinkingBudget(model, {}, 128));

  return {
    status: 200,
    data: {
      text: result.text,
      usage: { input: result.inputTokens, output: result.outputTokens },
      requestedModel: model,
      rawModel: result.rawModel,
      providerModel: result.providerModel,
      providerModelSource: result.providerModelSource,
      providerResponseId: result.providerResponseId,
      providerRequestId: result.providerRequestId
    }
  };
}

async function handleAlternativeTitles(apiKey, body) {
  const { storyTitle, storySegments, childName, topic } = body;
  if (!storyTitle) return { status: 400, data: { error: 'Missing storyTitle' } };

  const preview = (storySegments || []).slice(0, 3).join(' ');
  const prompt = buildAlternativeTitlesPrompt(storyTitle, preview, childName, topic);
  const model = ALTERNATIVE_TITLE_MODEL;
  const result = await callGemini(apiKey, model, prompt, appendThinkingBudget(model, {}, 128));

  return {
    status: 200,
    data: {
      text: result.text,
      usage: { input: result.inputTokens, output: result.outputTokens },
      requestedModel: model,
      rawModel: result.rawModel,
      providerModel: result.providerModel,
      providerModelSource: result.providerModelSource,
      providerResponseId: result.providerResponseId,
      providerRequestId: result.providerRequestId
    }
  };
}

async function handleGenerateStory(apiKey, body, ip) {
  const { inputs } = body;
  if (!inputs || !inputs.childName || !inputs.topic) return { status: 400, data: { error: 'Missing inputs' } };

  // Check generation limit for expensive operations
  if (!checkGenerationLimit(ip)) {
    return { status: 429, data: { error: 'הגעת למגבלת היצירות היומית. נסה שוב מחר.', code: 'GENERATION_LIMIT' } };
  }

  const prompt = buildStoryPrompt(inputs);
  const result = await callGemini(apiKey, STORY_MODEL, prompt, appendThinkingBudget(STORY_MODEL, {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        segments: { type: "ARRAY", items: { type: "STRING" }, description: `Exactly ${STORYBOARD_STORY_SEGMENTS} rich Hebrew page-text segments with real story prose.` },
        panel_plan: { type: "ARRAY", items: { type: "STRING" }, description: `Exactly ${STORYBOARD_TOTAL_PANELS} storyboard plan items, one per panel.` },
        segment_visual_map: { type: "ARRAY", items: { type: "STRING" }, description: `Exactly ${STORYBOARD_STORY_SEGMENTS} items mapping Segment 1-${STORYBOARD_STORY_SEGMENTS} to Panels ${STORYBOARD_FIRST_STORY_PANEL}-${STORYBOARD_LAST_STORY_PANEL}.` },
        panel_cast_map: { type: "ARRAY", items: { type: "STRING" }, description: `Exactly ${STORYBOARD_STORY_SEGMENTS} items listing the allowed named cast per story panel.` },
        image_prompt: { type: "STRING", description: `Detailed English prompt for visual storyboard with Panel 1 through Panel ${STORYBOARD_TOTAL_PANELS} described chronologically.` }
      },
      required: ["title", "segments", "panel_plan", "segment_visual_map", "panel_cast_map", "image_prompt"]
    }
  }, STORY_THINKING_BUDGET || 10000));

  let rawText = result.text || '{}';
  rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const data = JSON.parse(rawText);

  const title = data.title ? data.title.replace(/[\u0591-\u05C7]/g, '') : 'ספר מיוחד';
  const segments = normalizeStorySegments(data.segments, inputs);
  const panelPlan = normalizePanelPlan(data.panel_plan, segments);
  const segmentVisualMap = normalizeSegmentVisualMap(data.segment_visual_map, segments);
  const panelCastMap = normalizePanelCastMap(data.panel_cast_map, inputs);
  const imagePrompt = buildStructuredImagePrompt(
    data.image_prompt,
    inputs,
    title,
    panelPlan,
    segmentVisualMap,
    panelCastMap
  );

  // Encrypt the image prompt so client can't read it
  const promptToken = encryptPrompt(imagePrompt);

  return {
    status: 200,
    data: {
      title,
      segments,
      panelPlan,
      segmentVisualMap,
      panelCastMap,
      promptToken, // Encrypted - client can't read this
      model: STORY_MODEL,
      requestedModel: result.requestedModel || STORY_MODEL,
      providerModel: result.providerModel,
      providerModelSource: result.providerModelSource,
      providerResponseId: result.providerResponseId,
      providerRequestId: result.providerRequestId,
      usage: { input: result.inputTokens, output: result.outputTokens }
    }
  };
}

async function handleDebugDecryptPrompt(_apiKey, body) {
  const requiredKey = readEnv('DEV_DASHBOARD_PROMPT_KEY');
  if (!requiredKey) return { status: 403, data: { error: 'DEBUG_PROMPT_ACCESS_DISABLED' } };

  const providedKey = typeof body?.adminKey === 'string' ? body.adminKey.trim() : '';
  if (!providedKey || providedKey !== requiredKey) {
    return { status: 403, data: { error: 'UNAUTHORIZED_DEBUG_KEY' } };
  }

  const promptToken = typeof body?.promptToken === 'string' ? body.promptToken.trim() : '';
  if (!promptToken) return { status: 400, data: { error: 'Missing promptToken' } };

  try {
    const imagePrompt = decryptPrompt(promptToken);
    return { status: 200, data: { imagePrompt } };
  } catch {
    return { status: 400, data: { error: 'Invalid promptToken' } };
  }
}

async function handleGenerateImage(apiKey, body, ip) {
  const {
    promptToken,
    characterImage,
    parentImage,
    thirdCharacterImage,
    age,
    artStyle,
    parentCharacter,
    parentAge,
    parentGender,
    parentCharacterRole,
    thirdCharacter,
    thirdCharacterRole,
    title
  } = body;
  if (!promptToken) return { status: 400, data: { error: 'Missing promptToken' } };

  // Check generation limit
  if (!checkGenerationLimit(ip)) {
    return { status: 429, data: { error: 'הגעת למגבלת היצירות היומית.', code: 'GENERATION_LIMIT' } };
  }

  // Decrypt the image prompt
  let imagePrompt;
  try {
    imagePrompt = decryptPrompt(promptToken);
  } catch {
    return { status: 400, data: { error: 'Invalid prompt token' } };
  }

  const parts = [];
  const referenceCharacterCount = [characterImage, parentImage, thirdCharacterImage].filter(Boolean).length;
  const isComplexCast = referenceCharacterCount > 1;
  const styleLock = buildStyleLock(artStyle || '');
  const visualDiversityContract = buildVisualDiversityContract();
  const identityContinuityContract = buildIdentityContinuityContract();
  const stateContinuityContract = buildStateContinuityContract();
  const premiumArtDirectionContract = buildPremiumArtDirectionContract();
  const squarePanelCompositionContract = buildSquarePanelCompositionContract();
  const explicitGridOrderContract = buildExplicitGridOrderContract();
  const coverTitleDesignContract = buildCoverTitleDesignContract(artStyle || '', title || 'Hebrew title from Panel 1');
  const knownParentRoles = ['father', 'mother', 'grandmother'];
  const parentRoleKey = String(parentCharacterRole || parentCharacter || '').toLowerCase();
  const thirdRoleKey = String(thirdCharacterRole || thirdCharacter || '').toLowerCase();
  const referenceFeatures = {};
  const referenceAnalysis = [];

  const safeAnalyze = async (slot, imageDataUrl, characterType) => {
    if (!imageDataUrl) return null;
    try {
      const analysis = await analyzeReferenceImage(apiKey, imageDataUrl, characterType);
      referenceAnalysis.push({
        slot,
        characterType,
        profile: analysis.profile,
        usage: analysis.usage,
        requestedModel: analysis.requestedModel,
        providerModel: analysis.providerModel,
        providerModelSource: analysis.providerModelSource,
        providerResponseId: analysis.providerResponseId,
        providerRequestId: analysis.providerRequestId
      });
      return analysis.profile;
    } catch (error) {
      referenceAnalysis.push({
        slot,
        characterType,
        error: String(error?.message || error || 'reference analysis failed')
      });
      return null;
    }
  };

  const [mainProfile, parentProfile, thirdProfile] = await Promise.all([
    safeAnalyze('main', characterImage, Number(age) >= 18 ? 'adult' : 'child'),
    safeAnalyze('parent', parentImage, knownParentRoles.includes(parentRoleKey) || parentRoleKey === 'partner' || Number(parentAge) >= 18 ? 'adult' : 'child'),
    safeAnalyze('third', thirdCharacterImage, thirdRoleKey === 'pet' ? 'pet' : (thirdRoleKey === 'toy' ? 'toy' : ((knownParentRoles.includes(thirdRoleKey) || thirdRoleKey === 'partner') ? 'adult' : 'child')))
  ]);

  // Add character images and strings exactly as Jan 28
  if (characterImage) {
    const [mp, bd] = characterImage.split(',');
    const mt = mp?.split(':')[1]?.split(';')[0] || 'image/jpeg';

    // CRITICAL: Add all reference images FIRST before any text
    parts.push({ inlineData: { data: bd, mimeType: mt } });

    if (mainProfile) {
      const effectiveMainProfile = sanitizeReferenceProfile(mainProfile, { expectedType: Number(age) >= 18 ? 'adult' : 'child' });
      referenceFeatures.main = effectiveMainProfile;
      parts.push({ text: buildReferenceMatchInstructions(
        `MAIN CHARACTER - Image #1 above. This ${Number(age) >= 18 ? 'adult' : 'hero'} appears in ALL ${STORYBOARD_TOTAL_PANELS} panels`,
        effectiveMainProfile,
        [
          `Age/build must stay consistent with the reference (${getAgeGroup(age).ratio}; ${getAgeGroup(age).keywords}).`,
          'Do NOT merge this character with any companion or create duplicate copies in the same panel.'
        ]
      ) });
    } else {
      parts.push({ text: `MAIN CHARACTER - Image #1 above: This character appears in ALL ${STORYBOARD_TOTAL_PANELS} panels. Match the reference photo exactly: face, hair, skin tone, and any glasses or identity accessories. The photo is the primary source of truth. Do NOT merge this character with any companion or create duplicate copies.` });
    }
  }

  if (parentImage) {
    const [mp, bd] = parentImage.split(',');
    const mt = mp?.split(':')[1]?.split(';')[0] || 'image/jpeg';
    parts.push({ inlineData: { data: bd, mimeType: mt } });

    const isActualParent = knownParentRoles.includes(parentRoleKey);
    const isAdultCompanion = isActualParent || parentRoleKey === 'partner' || Number(parentAge) >= 18;
    const companionLabel = isActualParent
      ? `PARENT (${parentCharacter})`
      : `COMPANION: ${parentCharacter || 'friend'}${parentAge ? `, age ${parentAge}` : ''}${parentGender ? ` (${parentGender === 'female' ? (isAdultCompanion ? 'woman' : 'girl') : (isAdultCompanion ? 'man' : 'boy')})` : ''}`;

    if (parentProfile) {
      const effectiveParentProfile = sanitizeReferenceProfile(parentProfile, {
        roleKey: parentRoleKey,
        gender: parentGender,
        expectedType: (isActualParent || isAdultCompanion) ? 'adult' : 'child'
      });
      referenceFeatures.parent = effectiveParentProfile;
      if (isActualParent || isAdultCompanion) {
        parts.push({ text: buildReferenceMatchInstructions(
          `${companionLabel} - Image #2 above`,
          effectiveParentProfile,
          [
            'Use adult body proportions and keep this adult visually distinct from the main hero.',
            parentRoleKey === 'mother' && (String(body?.topic || '').includes('תינוק') || String(body?.topic || '').includes('הורים'))
              ? 'If the story is about a new baby, show this mother visibly pregnant before the baby arrives and not pregnant after.'
              : '',
            'Never replace the main child with this adult in shared scenes.'
          ]
        ) });
      } else {
        parts.push({ text: buildReferenceMatchInstructions(
          `${companionLabel} - Image #2 above`,
          effectiveParentProfile,
          [
            `This companion is a CHILD around age ${parentAge || 'similar to the main hero'} with child body proportions, not an adult.`,
            'Keep this child visually distinct from the main child in every shared panel. Never turn them into twins or copies.'
          ]
        ) });
      }
    } else {
      parts.push({ text: `${companionLabel} - Image #2 above: Match the photo exactly, including glasses status, hair, face, and age/body proportions. The photo is the primary source of truth. Keep this character distinct from the main hero and never substitute one for the other.` });
    }
  }

  if (thirdCharacterImage) {
    const [mp, bd] = thirdCharacterImage.split(',');
    const mt = mp?.split(':')[1]?.split(';')[0] || 'image/jpeg';
    parts.push({ inlineData: { data: bd, mimeType: mt } });
    if (thirdProfile) {
      const isThirdAdult = knownParentRoles.includes(thirdRoleKey) || thirdRoleKey === 'partner';
      const effectiveThirdProfile = sanitizeReferenceProfile(thirdProfile, {
        roleKey: thirdRoleKey,
        expectedType: isThirdAdult ? 'adult' : (thirdRoleKey === 'pet' ? 'pet' : (thirdRoleKey === 'toy' ? 'toy' : 'child'))
      });
      referenceFeatures.third = effectiveThirdProfile;
      parts.push({ text: buildReferenceMatchInstructions(
        `${isThirdAdult ? `ADDITIONAL ADULT (${thirdCharacter || 'third character'})` : 'THIRD CHARACTER'} - Image #3 above`,
        effectiveThirdProfile,
        [isThirdAdult
          ? 'Use adult body proportions and keep this adult visually distinct from the main hero and the other adult.'
          : 'Keep this character distinct from all others and never invent additional lookalikes.']
      ) });
    } else {
      parts.push({ text: 'THIRD CHARACTER - Image #3 above: Match photo exactly - all physical features, hair/fur color and texture, distinctive markings, size/proportions, and color patterns. The photo is the primary source of truth. Keep this character distinct from all others and never invent additional lookalikes.' });
    }
  }

  if (styleLock) {
    parts.push({ text: styleLock });
  }
  parts.push({ text: visualDiversityContract });
  parts.push({ text: identityContinuityContract });
  parts.push({ text: stateContinuityContract });
  parts.push({ text: premiumArtDirectionContract });
  parts.push({ text: squarePanelCompositionContract });
  parts.push({ text: explicitGridOrderContract });
  parts.push({ text: coverTitleDesignContract });

  // Add the enhanced prompt with exact Jan 28 quality requirements
  const identityStateBlock = buildIdentityContinuityPromptBlock(referenceFeatures);
  const enhancedPrompt = `${imagePrompt}

STYLE LOCK:
${styleLock}

VISUAL DIVERSITY CONTRACT:
${visualDiversityContract}

IDENTITY CONTINUITY CONTRACT:
${identityContinuityContract}

STORY STATE CONTINUITY CONTRACT:
${stateContinuityContract}

PREMIUM ART DIRECTION CONTRACT:
${premiumArtDirectionContract}

SQUARE PANEL COMPOSITION CONTRACT:
${squarePanelCompositionContract}

EXPLICIT GRID ORDER CONTRACT:
${explicitGridOrderContract}

COVER TITLE DESIGN CONTRACT:
${coverTitleDesignContract}

QUALITY REQUIREMENTS:
• High resolution, sharp details, professional illustration
• Clear character features, no blurriness

REFERENCE PRIORITY:
• Image #1 is the main character.
${parentImage ? `• Image #2 is ${parentCharacter || 'the companion / parent'}.` : ''}${thirdCharacterImage ? `\n• Image #3 is ${thirdCharacter || 'the third character'}.` : ''}
• Match the uploaded faces first. If the story wording sounds generic, the photos still win.
• When referenced adults appear, keep their actual face likeness stronger than the generic "storybook parent" archetype.

${identityStateBlock ? `${identityStateBlock}\n` : ''}VISUAL STORY STATE:
• Keep wearable and prop states consistent from panel to panel.
• Do not introduce a future-state costume, item, or transformation before the story earns it.
• Once a new state is introduced, keep it consistent in the later panels until another explicit change happens.

CHARACTER CONSISTENCY RULES:
• ALL characters must be IDENTICAL in every panel - same hairstyle, same facial features
• Main character: SAME hairstyle and identity anchors in all ${STORYBOARD_TOTAL_PANELS} panels
• Match glasses status from each reference photo exactly. If glasses are present in a reference image, keep them visible in every panel even together with a helmet or hat.
• Only show characters from reference photos above
• NO random background people unless part of story

ACCESSORY CONSISTENCY:
• If a character wears a helmet, hat, glasses, or any accessory in one panel, they MUST wear it in ALL panels unless the story explicitly describes them removing it
• Story accessories are additive. Do not remove glasses, curls, facial hair, or other reference identity traits just because a helmet, costume, or new prop was added

STYLE CONSISTENCY:
• ALL ${STORYBOARD_TOTAL_PANELS} panels must be rendered in the EXACT SAME art style – do NOT switch between 2D and 3D or change the visual style mid-grid

CAST DISCIPLINE:
• Use ONLY the referenced characters above as named foreground characters
• Never replace one child with the other child
• Never create extra foreground children, twin copies, or hybrid faces
${isComplexCast ? '• In shared scenes, keep each referenced character clearly identifiable and visually separate in the same panel' : '• Keep the single referenced child as the only foreground child unless the story explicitly introduces another character'}

SHOT VARIETY:
• Consecutive story panels must not look like near-duplicates
• Vary framing, camera distance, viewpoint, and background composition from one panel to the next
• If a dog, bird, duck, squirrel, or other surprise appears, do not spend two panels on it unless the second panel clearly changes the action or emotion
• Prefer one strong panel per story beat over two weakly different panels for the same beat
• Adjacent story panels must differ in at least two visible ways, not just one small added element

SQUARE FRAMING:
• Every panel must feel designed for a square page, not a rectangular movie still
• Any wide shot must stay square-native with compact focal action and comfortable top/bottom space
• Do not place two characters as a flat left-right lineup across the whole width of the panel
• In shared panels, prefer depth, diagonal staging, overlap, or different heights so the composition still reads as a square
• Keep the important action safely inside the square, away from extreme side edges

GRID ORDER:
• The storyboard is 4 columns across and 3 rows down, never 3 columns across and 4 rows down
• Top row must contain Panels 1, 2, 3, 4 from left to right
• Middle row must contain Panels 5, 6, 7, 8 from left to right
• Bottom row must contain Panels 9, 10, 11, 12 from left to right
• Keep the whole storyboard landscape overall, wider than tall

TITLE COMPOSITION:
• Panel 1 must include the Hebrew title inside the illustration as compact, centered, style-matched lettering
• Panel 2 must be the same cover composition with all title text removed
• Keep the title smaller, centered, and with one consistent overall letter size across the whole title`;

  parts.push({ text: enhancedPrompt });

  const baseImageConfig = { aspectRatio: "4:3" };
  const preferredImageConfig = IMAGE_OUTPUT_RESOLUTION
    ? { ...baseImageConfig, imageSize: IMAGE_OUTPUT_RESOLUTION }
    : baseImageConfig;
  const requestConfig = { thinkingConfig: { thinkingBudget: 8192 }, imageConfig: preferredImageConfig };

  const isModelNotFoundError = (message) =>
    /Requested entity was not found|model.*not found|not found|unknown model/i.test(message || '');
  const isInvalidImageConfigError = (message) =>
    /Unknown name \"imageSize\"|Invalid JSON payload|imageSize/i.test(message || '');

  let usedModel = isComplexCast ? IMAGE_MODEL_COMPLEX : IMAGE_MODEL_PRIMARY;
  const fallbackModel = (isComplexCast
    ? [IMAGE_MODEL_FALLBACK, IMAGE_MODEL_PRIMARY]
    : [IMAGE_MODEL_FALLBACK, IMAGE_MODEL_COMPLEX]
  ).find((candidate) => candidate && candidate !== usedModel);
  let usedConfig = requestConfig;
  let result;

  try {
    result = await callGemini(apiKey, usedModel, { parts }, usedConfig);
  } catch (error) {
    const message = String(error?.message || '');

    if (isInvalidImageConfigError(message)) {
      usedConfig = { thinkingConfig: { thinkingBudget: 65535 }, imageConfig: baseImageConfig };
      try {
        result = await callGemini(apiKey, usedModel, { parts }, usedConfig);
      } catch (retryError) {
        const retryMessage = String(retryError?.message || '');
        if (isModelNotFoundError(retryMessage) && fallbackModel) {
          usedModel = fallbackModel;
          usedConfig = { thinkingConfig: { thinkingBudget: 65535 }, imageConfig: baseImageConfig };
          result = await callGemini(apiKey, usedModel, { parts }, usedConfig);
        } else {
          throw retryError;
        }
      }
    } else if (isModelNotFoundError(message) && fallbackModel) {
      usedModel = fallbackModel;
      usedConfig = { thinkingConfig: { thinkingBudget: 65535 }, imageConfig: baseImageConfig };
      result = await callGemini(apiKey, usedModel, { parts }, usedConfig);
    } else {
      throw error;
    }
  }

  if (result.imageData) {
    let normalizedImage = { imageData: result.imageData, normalizedGrid: null };
    try {
      normalizedImage = await normalizeStoryboardImageBase64(result.imageData);
    } catch (error) {
      normalizedImage = {
        imageData: result.imageData,
        normalizedGrid: {
          error: String(error?.message || error || 'normalization_failed')
        }
      };
    }

    return {
      status: 200,
      data: {
        imageData: normalizedImage.imageData,
        rawImageData: result.imageData,
        usage: { input: result.inputTokens, output: result.outputTokens },
        model: usedModel,
        requestedModel: result.requestedModel || usedModel,
        providerModel: result.providerModel,
        providerModelSource: result.providerModelSource,
        providerResponseId: result.providerResponseId,
        providerRequestId: result.providerRequestId,
        imageResolution: usedConfig?.imageConfig?.imageSize || null,
        normalizedGrid: normalizedImage.normalizedGrid,
        estimatedCostUsd: estimateModelCost(usedModel, result.inputTokens, result.outputTokens, true),
        referenceFeatures,
        referenceAnalysis
      }
    };
  }

  return { status: 500, data: { error: 'No image generated' } };
}

// ============ MAIN HANDLER ============

// ... (imports remain the same)
import {
  MOCK_STORY_RESPONSE,
  MOCK_STORY_STAGES,
  MOCK_IMAGE_DATA,
  buildMockExtractEntity,
  buildMockRefineConcept,
  buildMockValidatePhoto,
  buildMockAnalyzeFeatures,
  buildMockGenerateTitles,
  buildMockAlternativeTitles,
  buildMockGenerateStory
} from '../mockData.js';

// ... (existing helper functions remain the same)

// ============ MOCK HANDLER ============

function isGlobalMockMode(req) {
  const cookie = req.headers?.cookie || '';
  const forceMockEnv = /^(1|true|yes|on)$/i.test(readEnv('AI_FORCE_MOCK'));
  return forceMockEnv || hasCookieFlag(cookie, 'mock_mode') || req.headers?.['x-mock-mode'] === '1';
}

function getImageOnlyMockReason(req) {
  const cookie = req.headers?.cookie || '';
  const truthyRegex = /^(1|true|yes|on)$/i;
  const forceImageMockEnv =
    truthyRegex.test(readEnv('AI_IMAGE_FORCE_MOCK')) ||
    truthyRegex.test(readEnv('AI_FORCE_IMAGE_MOCK'));

  if (forceImageMockEnv) return 'env';
  if (hasCookieFlag(cookie, 'image_mock_mode')) return 'cookie';
  if (req.headers?.['x-mock-image'] === '1') return 'header';
  return null;
}

function isImageOnlyMockMode(req) {
  return Boolean(getImageOnlyMockReason(req));
}

function hasCookieFlag(cookieHeader, key) {
  if (!cookieHeader) return false;
  const truthy = /^(1|true|yes|on)$/i;
  return String(cookieHeader)
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      const [cookieKey, ...valueParts] = entry.split('=');
      const value = valueParts.join('=').trim();
      return cookieKey?.trim() === key && truthy.test(value);
    });
}

function readEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string') return '';
  return value.replace(/\\n|\\r/g, '').replace(/\r?\n/g, '').trim();
}

async function handleMockRequest(action, body) {
  await new Promise(resolve => setTimeout(resolve, 300));

  const usage = { input: 0, output: 0 };

  switch (action) {
    case 'extractEntity': {
      const r = buildMockExtractEntity(body.text);
      return { status: 200, data: { text: r.text, usage: r.usage } };
    }
    case 'refineConcept': {
      const r = buildMockRefineConcept(body.currentTopic, body.newDetails);
      return { status: 200, data: { text: r.text } };
    }
    case 'validatePhoto':
      return { status: 200, data: buildMockValidatePhoto() };
    case 'analyzeFeatures':
      return { status: 200, data: buildMockAnalyzeFeatures() };
    case 'generateTitles': {
      const r = buildMockGenerateTitles(body.childName, body.topic);
      return { status: 200, data: r };
    }
    case 'alternativeTitles': {
      const r = buildMockAlternativeTitles(body.storyTitle);
      return { status: 200, data: r };
    }
    case 'generateStory': {
      const r = buildMockGenerateStory(body.inputs);
      return { status: 200, data: r };
    }
    case 'generateImage':
      // Use real demo grid image instead of placeholder
      return {
        status: 200,
        data: {
          imageUrl: '/Books/Book1/grid.jpg',
          usage,
          mock: true,
          mockType: 'image-only',
          model: 'gemini-3.1-flash-image-preview-mock',
          imageResolution: '2K'
        }
      };
    default:
      return { status: 200, data: { text: 'Mock', usage } };
  }
}


// ============ MAIN HANDLER ============

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

  const { action } = body;

  // *** GLOBAL MOCK MODE (cookie x-mock-mode or ?mock=1) ***
  if (isGlobalMockMode(req)) {
    // console.debug(`[AI] Global mock mode: ${action}`);
    const result = await handleMockRequest(action, body);
    return res.status(result.status).json(result.data);
  }

  // *** IMAGE-ONLY MOCK MODE (cookie image_mock_mode=1 or x-mock-image=1) ***
  // Useful for live E2E tests: keep story/text real, skip expensive image generation.
  if (action === 'generateImage' && isImageOnlyMockMode(req)) {
    const reason = getImageOnlyMockReason(req) || 'unknown';
    // console.debug(`[AI] Image-only mock mode: generateImage (reason=${reason})`);
    const result = await handleMockRequest(action, body);
    return res.status(result.status).json({ ...result.data, mockReason: reason });
  }

  // *** LEGACY MOCK MODE (body triggers: MockMode, קמומיל) ***
  let isMock = false;

  // Case 1: Early stages where we send text
  if (body.text && (body.text.includes('MockMode') || body.text.includes('קמומיל'))) {
    isMock = true;
  }

  // Case 2: Structured inputs (generateStory)
  if (body.inputs) {
    const { childName, topic } = body.inputs;
    if (
      childName === 'MockMode' || childName === 'קמומיל' ||
      topic === 'MockMode' || topic === 'קמומיל'
    ) {
      isMock = true;
    }
  }

  // Case 3: Image generation mock-bypass token.
  if (typeof body.promptToken === 'string' && body.promptToken.trim() === 'MOCK_TOKEN_SECRET_BYPASS') {
    isMock = true;
  }

  if (isMock) {
    // console.debug(`[AI] Intercepting ${action} with MOCK MODE`);
    const result = await handleMockRequest(action, body);
    return res.status(result.status).json(result.data);
  }
  // *** END MOCK MODE ***

  // Kill switch
  if (process.env.AI_KILL_SWITCH === 'true' || process.env.AI_KILL_SWITCH === '1') {
    return res.status(503).json({ error: 'AI service temporarily disabled.' });
  }

  // Honeypot
  if (body._hp) return res.status(403).json({ error: 'Request rejected.' });

  // Budget
  if (isDailyBudgetExceeded()) return res.status(429).json({ error: 'Daily AI budget exceeded.' });

  // Rate limit
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests. Try again shortly.' });

  const requiresApiKey = action !== 'debugDecryptPrompt';
  // API key
  const apiKey = readEnv('GEMINI_API_KEY') || readEnv('API_KEY');
  if (requiresApiKey && !apiKey) return res.status(500).json({ error: 'API key not configured.' });

  try {
    let result;
    switch (action) {
      case 'extractEntity': result = await handleExtractEntity(apiKey, body); break;
      case 'refineConcept': result = await handleRefineConcept(apiKey, body); break;
      case 'validatePhoto': result = await handleValidatePhoto(apiKey, body); break;
      case 'analyzeFeatures': result = await handleAnalyzeFeatures(apiKey, body); break;
      case 'generateTitles': result = await handleGenerateTitles(apiKey, body); break;
      case 'alternativeTitles': result = await handleAlternativeTitles(apiKey, body); break;
      case 'generateStory': result = await handleGenerateStory(apiKey, body, ip); break;
      case 'generateImage': result = await handleGenerateImage(apiKey, body, ip); break;
      case 'debugDecryptPrompt': result = await handleDebugDecryptPrompt(apiKey, body); break;
      default: return res.status(400).json({ error: 'Unknown action' });
    }
    return res.status(result.status).json(result.data);
  } catch (error) {
    const message = error?.message || 'Unknown error';
    console.error(`[AI] ${action} error:`, message);

    if (message.includes('API key not valid') || message.includes('INVALID_ARGUMENT')) {
      return res.status(500).json({ error: 'API_KEY_ERROR' });
    }
    if (message.includes('billing') || message.includes('quota')) {
      return res.status(500).json({ error: 'BILLING_REQUIRED' });
    }

    return res.status(500).json({ error: message });
  }
}
