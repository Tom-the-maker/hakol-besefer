
import { Story, UserInputs } from "./types";
import { logActivity, calculateCost, resolveBillingModel, MODEL_PRICING } from "./lib/supabaseClient";
import { getCurrentSessionId, addLogEntry } from "./lib/sessionManager";

// console.debug('🚀 GEMINI SERVICE LOADED: VER_03_SECURE');

const LOG_MODEL_TEXT = 'gemini-2.0-flash';
const LOG_MODEL_NARRATIVE = 'gemini-2.0-flash';
const LOG_MODEL_IMAGE = 'gemini-3.1-flash-image-preview';
const LOG_MODEL_IMAGE_MOCK = 'gemini-3.1-flash-image-preview-mock';

function normalizeModelForAdmin(model: unknown, fallback: string): string {
  const raw = typeof model === 'string' ? model.trim() : '';
  if (!raw) return fallback;

  const lower = raw.toLowerCase();
  if (lower === 'text-core-v1') return 'gemini-2.0-flash';
  if (lower === 'story-crafter-v1') return 'gemini-2.0-flash';
  if (lower === 'scene-render-v1') return 'gemini-3.1-flash-image-preview';
  if (lower === 'scene-render-mock-v1') return 'gemini-3.1-flash-image-preview-mock';
  return raw;
}

interface UsageSnapshot {
  input?: number;
  output?: number;
}

export interface StoryGenerationMeta {
  model: string;
  usage?: UsageSnapshot;
  request_json: Record<string, unknown>;
  response_json: Record<string, unknown>;
}

export interface ImageGenerationMeta {
  model: string;
  usage?: UsageSnapshot;
  image_resolution?: string | null;
  request_json: Record<string, unknown>;
  response_json: Record<string, unknown>;
  mock?: boolean;
  mock_reason?: string;
}

// ============ IMAGE PROCESSING (stays client-side - uses Canvas) ============

const processImageForAPI = async (dataUrl: string, maxDimension: number = 2048): Promise<string> => {
  const mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
  const currentMime = mimeMatch?.[1] || 'image/jpeg';
  const providerSupported = ['image/jpeg', 'image/png', 'image/webp'];
  const needsConversion = !providerSupported.includes(currentMime);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      const needsResize = width > maxDimension || height > maxDimension;

      if (!needsConversion && !needsResize) {
        resolve(dataUrl);
        return;
      }

      if (needsResize) {
        const scaleFactor = Math.min(maxDimension / width, maxDimension / height);
        width = Math.floor(width * scaleFactor);
        height = Math.floor(height * scaleFactor);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { imageSmoothingEnabled: true, imageSmoothingQuality: 'high' }) as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0, width, height);

      const outputMime = currentMime === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = outputMime === 'image/jpeg' ? 0.85 : 0.95;
      resolve(canvas.toDataURL(outputMime, quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.crossOrigin = 'anonymous';
    img.src = dataUrl;
  });
};

// Backward-compatible alias
const convertImageToPNG = processImageForAPI;

const isSupportedMimeType = (mimeType: string): boolean => {
  const supported = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  return supported.includes(mimeType.toLowerCase());
};

// ============ SERVER API CALL (all prompts are server-side) ============

const AI_BACKEND_URL = '/api/ai';

const callAI = async (action: string, payload: Record<string, unknown>): Promise<any> => {
  // Check for Mock Mode trigger in payload for developer feedback
  const inputs = payload.inputs as any;
  const text = payload.text as string;
  if (
    (inputs && (inputs.topic === 'קמומיל' || inputs.topic === 'MockMode' || inputs.childName === 'קמומיל' || inputs.childName === 'MockMode')) ||
    (text && (text.includes('קמומיל') || text.includes('MockMode')))
  ) {
    // console.debug('%c 🧪 MOCK MODE ACTIVE: Request will be intercepted by server ', 'background: #222; color: #bada55; font-size: 12px; padding: 4px; border-radius: 4px;');
  }

  const response = await fetch(AI_BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action, ...payload })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `AI call failed (${response.status})`);
  }
  return data;
};

// ============ LOGGING HELPERS ============

function logSuccess(actionType: string, model: string, usage?: { input: number; output: number }, extra?: Record<string, unknown>) {
  const inputTokens = usage?.input || 0;
  const outputTokens = usage?.output || 0;
  const estimatedCost = calculateCost(model, inputTokens, outputTokens);
  const logEntry = {
    session_id: getCurrentSessionId(),
    action_type: actionType,
    model_name: model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    status: 'success' as const,
    metadata: { estimated_cost: estimatedCost, ...extra },
    ...extra
  };
  addLogEntry(logEntry);
  logActivity(logEntry);
}

function logError(actionType: string, model: string, error: any) {
  const logEntry = {
    session_id: getCurrentSessionId(),
    action_type: actionType,
    model_name: model,
    input_tokens: 0,
    output_tokens: 0,
    status: 'error' as const,
    metadata: { error_message: error?.message || 'Unknown error' }
  };
  addLogEntry(logEntry);
  logActivity(logEntry);
}

// ============ NAME CLEANING (client-side backup) ============

const cleanExtractedName = (rawName: string): { name: string; inferredGender: 'male' | 'female' | null } => {
  let name = rawName.trim();
  let inferredGender: 'male' | 'female' | null = null;

  const malePrefixes = ['הגיבור הוא ', 'הגיבור שלנו הוא ', 'קוראים לו ', 'שמו ', 'הבן שלי ', 'הילד שלי '];
  const femalePrefixes = ['הגיבורה היא ', 'הגיבורה שלנו היא ', 'קוראים לה ', 'שמה ', 'הבת שלי ', 'הילדה שלי '];

  for (const prefix of malePrefixes) {
    if (name.startsWith(prefix)) { name = name.slice(prefix.length); inferredGender = 'male'; break; }
  }
  for (const prefix of femalePrefixes) {
    if (name.startsWith(prefix)) { name = name.slice(prefix.length); inferredGender = 'female'; break; }
  }

  name = name.replace(/[.,!?]+$/, '').trim();
  return { name, inferredGender };
};

// ============ PUBLIC API - SAME SIGNATURES AS BEFORE ============

export interface EntityExtractionResult {
  hero_name: string | null;
  hero_gender: 'male' | 'female' | null;
  hero_age: number | null;
  reply_text: string;
  next_step: 'ask_age' | 'ask_photo' | 'confirm_name' | 'ask_gender';
}

export const validateHebrewName = async (input: string): Promise<EntityExtractionResult> => {
  // console.debug('🔍 Smart Entity Extraction called for:', input);

  try {
    const data = await callAI('extractEntity', { text: input });
    const text = data.text?.trim() || '{}';
    const modelForLog = normalizeModelForAdmin(data?.rawModel || data?.providerModel || data?.model, LOG_MODEL_TEXT);

    logSuccess('validateHebrewName', modelForLog, data.usage, {
      requested_model: data?.requestedModel || null,
      provider_model: data?.rawModel || data?.providerModel || null,
      provider_model_source: data?.providerModelSource || null,
      provider_response_id: data?.providerResponseId || null,
      provider_request_id: data?.providerRequestId || null,
      fallback_from_model: data?.fallbackFromModel || null,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      let heroName = result.hero_name || null;
      let heroGender = result.hero_gender || null;
      const replyText = result.reply_text || '';

      if (heroName) {
        const cleaned = cleanExtractedName(heroName);
        if (cleaned.name !== heroName) {
          heroName = cleaned.name;
          if (!heroGender && cleaned.inferredGender) heroGender = cleaned.inferredGender;
        }
      }

      return {
        hero_name: heroName,
        hero_gender: heroGender,
        hero_age: result.hero_age || null,
        reply_text: replyText || `${heroName} שם יפה, אנחנו מדברים על בן או בת?`,
        next_step: result.next_step || 'ask_gender'
      };
    }

    return { hero_name: input.trim(), hero_gender: null, hero_age: null, reply_text: `${input.trim()} שם יפה, אנחנו מדברים על בן או בת?`, next_step: 'ask_gender' };
  } catch (error: any) {
    console.error("Entity extraction error:", error);
    logError('validateHebrewName', LOG_MODEL_TEXT, error);
    return { hero_name: input.trim(), hero_gender: null, hero_age: null, reply_text: `${input.trim()} שם יפה, אנחנו מדברים על בן או בת?`, next_step: 'ask_gender' };
  }
};

export const refineStoryConcept = async (currentTopic: string, newDetails: string, age?: number, gender?: 'boy' | 'girl'): Promise<string> => {
  // console.debug('✨ refineStoryConcept called');
  try {
    const data = await callAI('refineConcept', { currentTopic, newDetails, age });
    return data.text?.trim() || `${currentTopic}. ${newDetails}`;
  } catch (error) {
    console.error("Refinement error:", error);
    return `${currentTopic}. ${newDetails}`;
  }
};

export interface PhotoValidationResult {
  isValid: boolean;
  reason?: string;
  faceCount?: number;
}

export const validateCharacterPhoto = async (
  base64Image: string,
  age: number = 25,
  name: string = '',
  characterType: 'human' | 'pet' | 'toy' = 'human'
): Promise<PhotoValidationResult> => {
  // console.debug('🛡️ Validating character photo...');

  // Process image client-side (canvas), send processed version to server
  let processedImage = base64Image;
  const [mimeTypePart] = base64Image.split(',');
  const mimeType = mimeTypePart?.split(':')[1]?.split(';')[0] || 'image/jpeg';
  if (!isSupportedMimeType(mimeType)) {
    try { processedImage = await convertImageToPNG(base64Image); } catch { return { isValid: true }; }
  }

  try {
    const data = await callAI('validatePhoto', { image: processedImage, characterType, age, name });
    const text = data.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { isValid: true };

    const result = JSON.parse(jsonMatch[0]);

    // Manual override for strictness
    if (characterType === 'human' && result.faceCount && result.faceCount > 1) {
      result.isValid = false;
    }

    return { isValid: result.isValid, reason: result.reason, faceCount: result.faceCount || 0 };
  } catch (error) {
    console.error("Image validation error:", error);
    return { isValid: true };
  }
};

export const analyzeCharacterFeatures = async (base64Image: string, characterType: string = 'child'): Promise<string> => {
  // console.debug(`🧐 Analyzing features for ${characterType}...`);

  let processedImage = base64Image;
  const [mimeTypePart] = base64Image.split(',');
  const mimeType = mimeTypePart?.split(':')[1]?.split(';')[0] || 'image/jpeg';
  if (!isSupportedMimeType(mimeType)) {
    try { processedImage = await convertImageToPNG(base64Image); } catch { return ''; }
  }

  try {
    const data = await callAI('analyzeFeatures', { image: processedImage, characterType });
    return data.text?.trim() || '';
  } catch (error) {
    console.error(`Failed to analyze ${characterType} features:`, error);
    return '';
  }
};

export const generateTitleSuggestions = async (inputs: UserInputs): Promise<string[]> => {
  // console.debug('📖 generateTitleSuggestions called');

  try {
    const data = await callAI('generateTitles', { childName: inputs.childName, topic: inputs.topic });
    const text = data.text?.trim() || '';
    const titleModelForLog = normalizeModelForAdmin(
      data?.rawModel || data?.providerModel || data?.requestedModel || data?.model,
      LOG_MODEL_NARRATIVE
    );

    logSuccess('generateTitleSuggestions', titleModelForLog, data.usage, {
      requested_model: data?.requestedModel || null,
      provider_model: data?.rawModel || data?.providerModel || null,
      provider_model_source: data?.providerModelSource || null,
      provider_response_id: data?.providerResponseId || null,
      provider_request_id: data?.providerRequestId || null,
    });

    const titles = text
      .split('\n')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0 && t.length < 100)
      .map((t: string) => t.replace(/^["'\d.\-]+|["']$/g, '').trim())
      .slice(0, 3);

    return titles.length === 3 ? titles : [
      `${inputs.childName} גילה סוד`,
      `הדבר המפתיע ש${inputs.childName} מצא`,
      `איך ${inputs.childName} הפך לגיבור`
    ];
  } catch (error: any) {
    console.error("Title generation error:", error);
    logError('generateTitleSuggestions', LOG_MODEL_NARRATIVE, error);
    return [
      `${inputs.childName} גילה סוד`,
      `הדבר המפתיע ש${inputs.childName} מצא`,
      `איך ${inputs.childName} הפך לגיבור`
    ];
  }
};

export const generateAlternativeTitles = async (storyTitle: string, storySegments: string[], inputs: UserInputs): Promise<string[]> => {
  // console.debug('📖 generateAlternativeTitles called');

  try {
    const data = await callAI('alternativeTitles', {
      storyTitle,
      storySegments,
      childName: inputs.childName,
      topic: inputs.topic
    });
    const text = data.text?.trim() || '';
    const altTitleModelForLog = normalizeModelForAdmin(
      data?.rawModel || data?.providerModel || data?.requestedModel || data?.model,
      LOG_MODEL_NARRATIVE
    );

    logSuccess('generateAlternativeTitles', altTitleModelForLog, data.usage, {
      requested_model: data?.requestedModel || null,
      provider_model: data?.rawModel || data?.providerModel || null,
      provider_model_source: data?.providerModelSource || null,
      provider_response_id: data?.providerResponseId || null,
      provider_request_id: data?.providerRequestId || null,
    });

    const titles = text
      .split('\n')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0 && t.length < 100)
      .map((t: string) => t.replace(/^["'\d.\-]+|["']$/g, '').trim())
      .slice(0, 3);

    return titles.length > 0 ? titles : [storyTitle];
  } catch (error: any) {
    console.error("Alternative title generation error:", error);
    logError('generateAlternativeTitles', LOG_MODEL_NARRATIVE, error);
    return [storyTitle];
  }
};

export const generateStoryBlueprint = async (inputs: UserInputs): Promise<{ story: Story, imagePrompt: string, generationMeta: StoryGenerationMeta }> => {
  // console.debug("📚 Generating story for:", inputs.childName);

  // Log the start
  logActivity({
    session_id: getCurrentSessionId(),
    action_type: 'generateStory',
    model_name: LOG_MODEL_NARRATIVE,
    input_tokens: 0,
    output_tokens: 0,
    status: 'pending',
    metadata: {
      inputs: {
        childName: inputs.childName,
        childAge: inputs.age,
        topic: inputs.topic,
        artStyle: inputs.artStyle,
        gender: inputs.gender,
      }
    },
    child_name: inputs.childName,
    topic: inputs.topic,
    art_style: inputs.artStyle,
    hero_gender: inputs.gender,
    hero_age: inputs.age || 4,
    book_title: inputs.title,
    extra_char_1: inputs.parentCharacter,
    extra_char_2: inputs.thirdCharacter
  });

  try {
    // Send clean inputs to server - server builds all prompts internally
    const data = await callAI('generateStory', {
      inputs: {
        childName: inputs.childName,
        age: inputs.age,
        gender: inputs.gender,
        topic: inputs.topic,
        artStyle: inputs.artStyle,
        title: inputs.title,
        parentImage: !!inputs.parentImage, // Boolean only - don't send image data here
        parentCharacter: inputs.parentCharacter,
        parentCharacterRole: inputs.parentCharacterRole,
        parentName: inputs.parentName,
        parentGender: inputs.parentGender,
        parentAge: inputs.parentAge,
        thirdCharacterImage: !!inputs.thirdCharacterImage,
        thirdCharacter: inputs.thirdCharacter,
        thirdCharacterRole: inputs.thirdCharacterRole,
      }
    });

    const storyModelForLog = normalizeModelForAdmin(
      data?.rawModel || data?.providerModel || data?.requestedModel || data?.model,
      LOG_MODEL_NARRATIVE
    );

    logSuccess('generateStory', storyModelForLog, data.usage, {
      story_title: data.title,
      child_name: inputs.childName,
      topic: inputs.topic,
      art_style: inputs.artStyle,
      hero_gender: inputs.gender,
      hero_age: inputs.age,
      book_title: data.title,
      extra_char_1: inputs.parentCharacter,
      extra_char_2: inputs.thirdCharacter,
      requested_model: data?.requestedModel || null,
      provider_model: data?.rawModel || data?.providerModel || null,
      provider_model_source: data?.providerModelSource || null,
      provider_response_id: data?.providerResponseId || null,
      provider_request_id: data?.providerRequestId || null,
      request_json: {
        childName: inputs.childName,
        age: inputs.age,
        gender: inputs.gender,
        topic: inputs.topic,
        artStyle: inputs.artStyle,
        title: inputs.title,
        hasParentImage: !!inputs.parentImage,
        parentCharacter: inputs.parentCharacter,
        parentCharacterRole: inputs.parentCharacterRole,
        parentName: inputs.parentName,
        parentGender: inputs.parentGender,
        parentAge: inputs.parentAge,
        hasThirdCharacterImage: !!inputs.thirdCharacterImage,
        thirdCharacter: inputs.thirdCharacter,
        thirdCharacterRole: inputs.thirdCharacterRole,
      },
      response_json: {
        title: data.title,
        segments: Array.isArray(data.segments) ? data.segments : [],
        segments_count: Array.isArray(data.segments) ? data.segments.length : 0,
        panel_plan: Array.isArray(data.panelPlan) ? data.panelPlan : [],
        segment_visual_map: Array.isArray(data.segmentVisualMap) ? data.segmentVisualMap : [],
        panel_cast_map: Array.isArray(data.panelCastMap) ? data.panelCastMap : [],
        prompt_token: typeof data.promptToken === 'string' ? data.promptToken : null,
        variation_key: data?.variationKey || null,
        requested_model: data?.requestedModel || null,
        provider_model: data?.rawModel || data?.providerModel || null,
        provider_model_source: data?.providerModelSource || null,
        provider_response_id: data?.providerResponseId || null,
        provider_request_id: data?.providerRequestId || null,
      },
    });

    // SAFETY: If we detect the mock story title, FORCE the mock token
    // This prevents accidental costs if the API returned a mock story but the token logic failed
    let promptToken = data.promptToken;
    if (data.title === "ההרפתקה הקסומה של בדיקה") {
      // console.debug("🦄 Mock story detected in client - Forcing mock prompt token safety");
      promptToken = "MOCK_TOKEN_SECRET_BYPASS";
    }

    const generationMeta: StoryGenerationMeta = {
      model: storyModelForLog,
      usage: data.usage,
      request_json: {
        childName: inputs.childName,
        age: inputs.age,
        gender: inputs.gender,
        topic: inputs.topic,
        artStyle: inputs.artStyle,
        title: inputs.title,
        hasParentImage: !!inputs.parentImage,
        parentCharacter: inputs.parentCharacter,
        parentCharacterRole: inputs.parentCharacterRole,
        parentName: inputs.parentName,
        parentGender: inputs.parentGender,
        parentAge: inputs.parentAge,
        hasThirdCharacterImage: !!inputs.thirdCharacterImage,
        thirdCharacter: inputs.thirdCharacter,
        thirdCharacterRole: inputs.thirdCharacterRole,
      },
      response_json: {
        title: data.title,
        segments_count: Array.isArray(data.segments) ? data.segments.length : 0,
        panel_plan: Array.isArray(data.panelPlan) ? data.panelPlan : [],
        segment_visual_map: Array.isArray(data.segmentVisualMap) ? data.segmentVisualMap : [],
        panel_cast_map: Array.isArray(data.panelCastMap) ? data.panelCastMap : [],
        prompt_token: typeof data.promptToken === 'string' ? data.promptToken : null,
        variation_key: data?.variationKey || null,
        requested_model: data?.requestedModel || null,
        provider_model: data?.rawModel || data?.providerModel || null,
        provider_model_source: data?.providerModelSource || null,
        provider_response_id: data?.providerResponseId || null,
        provider_request_id: data?.providerRequestId || null,
      },
    };

    return {
      story: {
        title: data.title,
        heroName: inputs.childName,
        segments: data.segments,
        composite_image_url: '',
        is_unlocked: false
      },
      imagePrompt: promptToken, // This is encrypted - client can't read it
      generationMeta
    };
  } catch (error: any) {
    console.error("Story generation error:", error);
    logError('generateStory', LOG_MODEL_NARRATIVE, error);

    if (error?.message?.includes("API_KEY_ERROR") || error?.message?.includes("INVALID_ARGUMENT")) {
      throw new Error("API_KEY_ERROR");
    }
    if (error?.message?.includes("BILLING_REQUIRED") || error?.message?.includes("billing") || error?.message?.includes("quota")) {
      throw new Error("BILLING_REQUIRED");
    }
    throw error;
  }
};

export const generateCompositeImage = async (
  prompt: string,
  characterImage?: string,
  parentImage?: string,
  thirdCharacterImage?: string,
  age?: number,
  artStyle?: string,
  companionContext?: {
    parentName?: string;
    parentCharacter?: string;
    parentCharacterRole?: string;
    parentGender?: 'male' | 'female';
    parentAge?: number;
  }
): Promise<{ compositeUrl: string; generationMeta: ImageGenerationMeta }> => {
  // console.debug('🎨 Generating composite illustration...');

  try {
    // Process images client-side (canvas conversion if needed), then send to server
    let processedCharacter = characterImage;
    let processedParent = parentImage;
    let processedThird = thirdCharacterImage;

    if (characterImage) {
      const [mp] = characterImage.split(',');
      const mt = mp?.split(':')[1]?.split(';')[0] || 'image/jpeg';
      if (!isSupportedMimeType(mt)) {
        processedCharacter = await convertImageToPNG(characterImage);
      }
    }
    if (parentImage) {
      const [mp] = parentImage.split(',');
      const mt = mp?.split(':')[1]?.split(';')[0] || 'image/jpeg';
      if (!isSupportedMimeType(mt)) {
        processedParent = await convertImageToPNG(parentImage);
      }
    }
    if (thirdCharacterImage) {
      const [mp] = thirdCharacterImage.split(',');
      const mt = mp?.split(':')[1]?.split(';')[0] || 'image/jpeg';
      if (!isSupportedMimeType(mt)) {
        processedThird = await convertImageToPNG(thirdCharacterImage);
      }
    }

    // Send encrypted prompt token + images to server
    const data = await callAI('generateImage', {
      promptToken: prompt, // This is the encrypted token from generateStory
      characterImage: processedCharacter,
      parentImage: processedParent,
      thirdCharacterImage: processedThird,
      age,
      artStyle,
      parentName: companionContext?.parentName,
      parentCharacter: companionContext?.parentCharacter,
      parentCharacterRole: companionContext?.parentCharacterRole,
      parentGender: companionContext?.parentGender,
      parentAge: companionContext?.parentAge
    });

    if (data?.mock) {
      console.warn(
        `[AI] Image returned from mock path (reason=${data?.mockReason || data?.mockType || 'unknown'})`
      );
    }

    const imageLogExtra: Record<string, unknown> = {};
    if (typeof data?.imageUrl === 'string' && data.imageUrl) {
      imageLogExtra.result_data = data.imageUrl;
    } else if (typeof data?.imageData === 'string' && data.imageData.length > 0) {
      imageLogExtra.result_data = '[inline-image]';
    }
    if (data?.mock) {
      imageLogExtra.mock_image_mode = true;
      imageLogExtra.mock_reason = data?.mockReason || data?.mockType || 'unknown';
    }
    imageLogExtra.requested_model = data?.requestedModel || null;
    imageLogExtra.provider_model = data?.rawModel || data?.providerModel || null;
    imageLogExtra.provider_model_source = data?.providerModelSource || null;
    imageLogExtra.provider_response_id = data?.providerResponseId || null;
    imageLogExtra.provider_request_id = data?.providerRequestId || null;
    imageLogExtra.preflight = data?.preflight || null;
    imageLogExtra.normalized_grid = data?.normalizedGrid || null;
    imageLogExtra.reference_features = data?.referenceFeatures || null;
    imageLogExtra.reference_analysis = data?.referenceAnalysis || null;

    const modelForLog = normalizeModelForAdmin(
      data?.rawModel || data?.providerModel || data?.requestedModel || data?.model,
      data?.mock ? LOG_MODEL_IMAGE_MOCK : LOG_MODEL_IMAGE
    );
    const billingModel = resolveBillingModel(modelForLog, true);
    const pricingConfig = billingModel ? MODEL_PRICING[billingModel] : null;
    imageLogExtra.pricing_source = 'MODEL_PRICING';
    imageLogExtra.pricing_model = billingModel || null;
    imageLogExtra.pricing_rule = pricingConfig && 'perImage' in pricingConfig ? 'perImage' : 'tokens';
    imageLogExtra.pricing_per_image_usd = pricingConfig && 'perImage' in pricingConfig ? pricingConfig.perImage : null;
    imageLogExtra.pricing_input_per_million_usd = pricingConfig?.input ?? null;
    imageLogExtra.pricing_output_per_million_usd = pricingConfig?.output ?? null;

    logSuccess(
      'generateCompositeImage',
      modelForLog,
      data.usage,
      imageLogExtra
    );

    const generationMeta: ImageGenerationMeta = {
      model: modelForLog,
      usage: data?.usage,
      image_resolution: data?.imageResolution || null,
      request_json: {
        prompt_token: prompt,
        has_character_image: !!processedCharacter,
        has_parent_image: !!processedParent,
        has_third_character_image: !!processedThird,
        age,
        artStyle,
        parentName: companionContext?.parentName,
        parentCharacter: companionContext?.parentCharacter,
        parentCharacterRole: companionContext?.parentCharacterRole,
        parentGender: companionContext?.parentGender,
        parentAge: companionContext?.parentAge,
      },
      response_json: {
        returned_image_data: !!data?.imageData,
        returned_image_url: !!data?.imageUrl,
        image_resolution: data?.imageResolution || null,
        requested_model: data?.requestedModel || null,
        provider_model: data?.rawModel || data?.providerModel || null,
        provider_model_source: data?.providerModelSource || null,
        provider_response_id: data?.providerResponseId || null,
        provider_request_id: data?.providerRequestId || null,
        preflight: data?.preflight || null,
        normalized_grid: data?.normalizedGrid || null,
        reference_features: data?.referenceFeatures || null,
        reference_analysis: data?.referenceAnalysis || null,
      },
      mock: !!data?.mock,
      mock_reason: data?.mockReason || data?.mockType,
    };

    if (data.imageData) {
      return { compositeUrl: `data:image/png;base64,${data.imageData}`, generationMeta };
    }
    if (data.imageUrl) {
      const resolvedUrl = data.imageUrl.startsWith('http')
        ? data.imageUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${data.imageUrl}`;
      return { compositeUrl: resolvedUrl, generationMeta };
    }
    throw new Error("No image data in response");
  } catch (error: any) {
    console.error("Image generation failed:", error);
    logError('generateCompositeImage', LOG_MODEL_IMAGE, error);

    if (error?.message?.includes("API_KEY_ERROR") || error?.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_ERROR");
    }
    throw error;
  }
};
