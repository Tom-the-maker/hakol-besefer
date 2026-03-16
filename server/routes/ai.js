import sharp from 'sharp';
import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';

const GRID_COLUMNS = 4;
const GRID_ROWS = 3;
const CELL_SIZE = 400;

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function encodePromptToken(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePromptToken(token) {
  try {
    return JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function inferGender(text) {
  const normalized = getString(text);
  if (!normalized) {
    return null;
  }

  if (/(היא|בת|שמה|קוראים לה|הגיבורה)/.test(normalized)) {
    return 'female';
  }

  if (/(הוא|בן|שמו|קוראים לו|הגיבור)/.test(normalized)) {
    return 'male';
  }

  return null;
}

function extractName(text) {
  const normalized = getString(text)
    .replace(/^[^א-תA-Za-z0-9]+/, '')
    .replace(/(הגיבור(?:ה)? היא?|קוראים (?:לו|לה)|שמו|שמה|הבן שלי|הבת שלי)\s+/g, '')
    .replace(/\bבן\b.*$/g, '')
    .replace(/\bבת\b.*$/g, '')
    .replace(/[0-9]+/g, '')
    .replace(/[.,!?]+/g, '')
    .trim();

  return normalized.split(/\s+/).slice(0, 2).join(' ').trim() || null;
}

function extractAge(text) {
  const match = getString(text).match(/\b([1-9][0-9]?)\b/);
  if (!match) {
    return null;
  }

  const age = Number(match[1]);
  return age >= 1 && age <= 120 ? age : null;
}

function createUsage(inputText, outputText) {
  return {
    input: Math.max(24, Math.ceil(String(inputText || '').length / 2)),
    output: Math.max(24, Math.ceil(String(outputText || '').length / 2)),
  };
}

function buildTextResponse(payload, inputText = '') {
  return {
    ...payload,
    requestedModel: 'mock-ai-text',
    providerModel: 'mock-ai-text',
    providerModelSource: 'mock',
    usage: createUsage(inputText, JSON.stringify(payload)),
    mock: true,
    mockReason: 'local-fallback',
  };
}

function generateTitles(heroName, topic) {
  const safeHero = getString(heroName) || 'הגיבור';
  const safeTopic = getString(topic) || 'המסע המיוחד';
  const topicLead = safeTopic.split(/[\s,.-]+/).slice(0, 3).join(' ');

  return [
    `${safeHero} מגלה את ${topicLead}`,
    `היום שבו ${safeHero} יצא לדרך`,
    `${safeHero} והסוד של ${topicLead}`,
  ];
}

function buildStoryTitle(inputs) {
  const provided = getString(inputs.title);
  if (provided) {
    return provided;
  }

  return generateTitles(inputs.childName, inputs.topic)[0];
}

function buildStorySegments(inputs) {
  const hero = getString(inputs.childName) || 'הגיבור';
  const topic = getString(inputs.topic) || 'יום מלא הפתעות';
  const parentName = getString(inputs.parentName) || '';
  const parentLabel = parentName || getString(inputs.parentCharacter) || '';
  const companionText = parentLabel ? ` יחד עם ${parentLabel}` : '';

  return [
    `בוקר אחד ${hero} התעורר עם רעיון גדול סביב ${topic}, והרגיש שהיום הזה עומד להיות מיוחד.`,
    `${hero}${companionText} יצא לדרך בסקרנות, ובכל צעד הרגיש שהסיפור מתחיל להיפתח באמת.`,
    `בהתחלה הכול נראה פשוט, אבל רמז קטן בדרך גרם ל${hero} לעצור, לחשוב ולחייך.`,
    `${hero} החליט לא לוותר, אסף אומץ, והמשיך הלאה עם לב פתוח ועיניים בורקות.`,
    `בדיוק אז הופיעה הפתעה משמחת ששינתה את הקצב והפכה את המשימה להרבה יותר מסקרנת.`,
    `${hero} למד להקשיב למה שקורה מסביב, ולגלות שגם טעות קטנה יכולה להפוך להזדמנות.`,
    `ככל שהדרך נמשכה, ${hero} הבין ש${topic} הוא לא רק מטרה אלא גם חוויה שממלאת את הלב.`,
    `ברגע הכי חשוב ${hero} בחר באומץ, עשה את הצעד הנכון, וגילה כמה כוח יש לו בפנים.`,
    `הכול התחבר יחד: הרמזים, ההפתעה, והאנשים שבדרך הפכו למשמעות חדשה עבור ${hero}.`,
    `בסוף היום ${hero} חזר עם חיוך גדול, סיפור שלם בלב, וזיכרון שיישאר איתו עוד הרבה זמן.`,
  ];
}

function buildPanelPlan(title, segments) {
  const plan = [
    `Panel 1, row 1 column 1: cover with the Hebrew title "${title}" in the top safe area.`,
    'Panel 2, row 1 column 2: same cover composition without title text.',
  ];

  for (let index = 0; index < segments.length; index += 1) {
    const panelNumber = index + 3;
    const row = Math.floor((panelNumber - 1) / GRID_COLUMNS) + 1;
    const column = ((panelNumber - 1) % GRID_COLUMNS) + 1;
    plan.push(`Panel ${panelNumber}, row ${row} column ${column}: ${segments[index]}`);
  }

  return plan;
}

function buildSegmentVisualMap(segments) {
  return segments.map((segment, index) => ({
    segmentNumber: index + 1,
    panelNumber: index + 3,
    summary: segment,
  }));
}

function buildPanelCastMap(heroName, inputs) {
  const cast = [getString(heroName) || 'הגיבור'];
  const parentName = getString(inputs.parentName) || getString(inputs.parentCharacter);
  const thirdName = getString(inputs.thirdCharacter);

  if (parentName) {
    cast.push(parentName);
  }
  if (thirdName) {
    cast.push(thirdName);
  }

  return Array.from({ length: 10 }, (_, index) => ({
    panelNumber: index + 3,
    cast,
  }));
}

function getPalette(artStyle) {
  const normalized = getString(artStyle).toLowerCase();
  if (normalized.includes('watercolor')) {
    return {
      background: '#f6efe4',
      panel: '#fffaf1',
      accent: '#e07a5f',
      accentAlt: '#81b29a',
      text: '#2f2a24',
    };
  }
  if (normalized.includes('comic')) {
    return {
      background: '#111827',
      panel: '#f8fafc',
      accent: '#ef4444',
      accentAlt: '#3b82f6',
      text: '#111827',
    };
  }
  if (normalized.includes('clay')) {
    return {
      background: '#f4dfc8',
      panel: '#fff7ed',
      accent: '#d97706',
      accentAlt: '#65a30d',
      text: '#3f2d17',
    };
  }
  return {
    background: '#f5efe4',
    panel: '#fffaf2',
    accent: '#f59e0b',
    accentAlt: '#4b947d',
    text: '#1f2937',
  };
}

function wrapText(value, lineLength, maxLines = 3) {
  const words = getString(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= lineLength) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === 0) {
    lines.push(value);
  }

  const remainingWords = words.join(' ').slice(lines.join(' ').length).trim();
  if (remainingWords && lines.length === maxLines) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(0, lineLength - 3))}...`;
  }

  return lines;
}

function buildStoryboardSvg(payload) {
  const title = getString(payload.title) || 'הכל בספר';
  const heroName = getString(payload.heroName) || 'הגיבור';
  const topic = getString(payload.topic) || 'סיפור חדש';
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  const palette = getPalette(payload.artStyle);
  const width = GRID_COLUMNS * CELL_SIZE;
  const height = GRID_ROWS * CELL_SIZE;
  const cells = [];

  for (let index = 0; index < GRID_COLUMNS * GRID_ROWS; index += 1) {
    const x = (index % GRID_COLUMNS) * CELL_SIZE;
    const y = Math.floor(index / GRID_COLUMNS) * CELL_SIZE;
    const panelNumber = index + 1;
    const accent = panelNumber % 2 === 0 ? palette.accentAlt : palette.accent;
    const textLines = panelNumber === 1
      ? wrapText(title, 16, 3)
      : panelNumber === 2
        ? wrapText(`${heroName} יוצא למסע`, 18, 3)
        : wrapText(segments[panelNumber - 3] || '', 18, 4);
    const topicLine = panelNumber === 1 ? wrapText(topic, 18, 2) : [];

    const textSvg = [...textLines, ...topicLine].map((line, lineIndex) => `
      <text x="${x + CELL_SIZE - 34}" y="${y + 98 + lineIndex * 34}" text-anchor="end"
        direction="rtl" unicode-bidi="plaintext"
        font-family="Arial, 'Noto Sans Hebrew', sans-serif" font-size="${panelNumber === 1 ? 34 : 26}"
        font-weight="${panelNumber === 1 ? 900 : 700}" fill="${escapeXml(palette.text)}">${escapeXml(line)}</text>
    `).join('');

    cells.push(`
      <g>
        <rect x="${x + 12}" y="${y + 12}" width="${CELL_SIZE - 24}" height="${CELL_SIZE - 24}" rx="28" fill="${escapeXml(palette.panel)}" />
        <rect x="${x + 24}" y="${y + 24}" width="${CELL_SIZE - 48}" height="18" rx="9" fill="${escapeXml(accent)}" opacity="0.9" />
        <circle cx="${x + 90}" cy="${y + 280}" r="74" fill="${escapeXml(accent)}" opacity="0.14" />
        <circle cx="${x + 260}" cy="${y + 252}" r="52" fill="${escapeXml(palette.accentAlt)}" opacity="0.12" />
        <text x="${x + 40}" y="${y + 58}" font-family="Arial, 'Noto Sans Hebrew', sans-serif"
          font-size="20" font-weight="900" fill="${escapeXml(palette.text)}">#${panelNumber}</text>
        ${textSvg}
      </g>
    `);
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="${escapeXml(palette.background)}" />
      ${cells.join('\n')}
    </svg>
  `;
}

async function handleExtractEntity(body) {
  const text = getString(body.text);
  const heroName = extractName(text);
  const heroGender = inferGender(text);
  const heroAge = extractAge(text);

  const payload = {
    text: JSON.stringify({
      hero_name: heroName,
      hero_gender: heroGender,
      hero_age: heroAge,
      reply_text: heroName
        ? heroGender
          ? heroAge
            ? `מעולה, ${heroName} כבר מוכן. אפשר להעלות תמונה כדי שנמשיך לספר?`
            : `מעולה, ${heroName} כבר איתנו. בן כמה או בת כמה הוא או היא?`
          : `${heroName} שם יפה. מדובר בבן או בבת?`
        : 'איך קוראים לגיבור או לגיבורה של הספר?',
      next_step: heroName
        ? heroGender
          ? heroAge
            ? 'ask_photo'
            : 'ask_age'
          : 'ask_gender'
        : 'confirm_name',
    }),
  };

  return buildTextResponse(payload, text);
}

async function handleRefineConcept(body) {
  const currentTopic = getString(body.currentTopic);
  const newDetails = getString(body.newDetails);
  const text = [currentTopic, newDetails].filter(Boolean).join('. ');
  return buildTextResponse({ text }, text);
}

async function handleValidatePhoto(body) {
  const payload = {
    text: JSON.stringify({
      isValid: true,
      faceCount: 1,
      reason: '',
    }),
  };

  return buildTextResponse(payload, getString(body.characterType));
}

async function handleAnalyzeFeatures(body) {
  const characterType = getString(body.characterType) || 'child';
  const payload = {
    text: JSON.stringify({
      subject_type: characterType,
      hair: 'מראה כללי נקי ומאוזן',
      face: 'תווי פנים ברורים וחיוך נעים',
      skin_tone: 'בהתאם לתמונת המקור',
      glasses: 'absent',
      facial_hair: '',
      accessories: [],
      identity_anchors: ['חיוך מוכר', 'מבט פתוח', 'נוכחות רגועה'],
      summary: `דמות ${characterType} ברורה, חמה וקלה לזיהוי`,
    }),
  };

  return buildTextResponse(payload, characterType);
}

async function handleGenerateTitles(body) {
  const titles = generateTitles(body.childName, body.topic);
  return buildTextResponse({ text: titles.join('\n') }, `${body.childName || ''} ${body.topic || ''}`);
}

async function handleAlternativeTitles(body) {
  const titles = generateTitles(body.childName, body.topic).map((title, index) => {
    if (index === 0) return title;
    return `${title} ${index + 1}`;
  });

  return buildTextResponse({ text: titles.join('\n') }, `${body.storyTitle || ''} ${body.topic || ''}`);
}

async function handleGenerateStory(body) {
  const inputs = body.inputs && typeof body.inputs === 'object' ? body.inputs : {};
  const title = buildStoryTitle(inputs);
  const segments = buildStorySegments(inputs);
  const panelPlan = buildPanelPlan(title, segments);
  const segmentVisualMap = buildSegmentVisualMap(segments);
  const panelCastMap = buildPanelCastMap(inputs.childName, inputs);
  const promptToken = encodePromptToken({
    title,
    heroName: getString(inputs.childName),
    topic: getString(inputs.topic),
    artStyle: getString(inputs.artStyle),
    segments,
  });

  return {
    title,
    segments,
    panelPlan,
    segmentVisualMap,
    panelCastMap,
    promptToken,
    requestedModel: 'mock-ai-story',
    providerModel: 'mock-ai-story',
    providerModelSource: 'mock',
    usage: createUsage(JSON.stringify(inputs), JSON.stringify({ title, segments })),
    mock: true,
    mockReason: 'local-fallback',
    variationKey: 'mock-default',
  };
}

async function handleGenerateImage(body) {
  const decoded = decodePromptToken(body.promptToken);
  if (!decoded) {
    return null;
  }

  const svg = buildStoryboardSvg(decoded);
  const imageBuffer = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();

  return {
    imageData: imageBuffer.toString('base64'),
    imageResolution: `${GRID_COLUMNS * CELL_SIZE}x${GRID_ROWS * CELL_SIZE}`,
    requestedModel: 'mock-ai-image',
    providerModel: 'mock-ai-image',
    providerModelSource: 'mock',
    usage: createUsage(JSON.stringify(decoded), svg),
    mock: true,
    mockReason: 'local-fallback',
    normalizedGrid: {
      sourceWidth: GRID_COLUMNS * CELL_SIZE,
      sourceHeight: GRID_ROWS * CELL_SIZE,
      targetWidth: GRID_COLUMNS * CELL_SIZE,
      targetHeight: GRID_ROWS * CELL_SIZE,
      panelSize: CELL_SIZE,
      left: 0,
      top: 0,
      columns: GRID_COLUMNS,
      rows: GRID_ROWS,
      wasNormalized: false,
    },
  };
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const action = getString(parsed.body.action);
  let payload;

  switch (action) {
    case 'extractEntity':
      payload = await handleExtractEntity(parsed.body);
      break;
    case 'refineConcept':
      payload = await handleRefineConcept(parsed.body);
      break;
    case 'validatePhoto':
      payload = await handleValidatePhoto(parsed.body);
      break;
    case 'analyzeFeatures':
      payload = await handleAnalyzeFeatures(parsed.body);
      break;
    case 'generateTitles':
      payload = await handleGenerateTitles(parsed.body);
      break;
    case 'alternativeTitles':
      payload = await handleAlternativeTitles(parsed.body);
      break;
    case 'generateStory':
      payload = await handleGenerateStory(parsed.body);
      break;
    case 'generateImage':
      payload = await handleGenerateImage(parsed.body);
      if (!payload) {
        return sendError(res, 400, 'Invalid prompt token');
      }
      break;
    default:
      return sendError(res, 400, 'Unsupported AI action');
  }

  return sendJson(res, 200, payload);
}
