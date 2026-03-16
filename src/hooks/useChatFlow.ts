
import { useState, useCallback, useEffect, useRef } from 'react';
import { UserInputs, ArtStyle, ChatMessage, ChatStep } from '../types';
import { validateHebrewName, refineStoryConcept, validateCharacterPhoto } from '../geminiService';
import { validateEmail } from '../lib/emailValidation';
import { trackEvent } from '../lib/analytics';
import { getStyleDisplayLabel } from '../lib/styleLabels';

const getTerms = (gender: 'boy' | 'girl' | undefined, age: number | undefined) => {
    const isGirl = gender === 'girl';
    const isAdult = age && age >= 18;

    return {
        childInfo: isAdult
            ? (isGirl ? 'אישה' : 'גבר')
            : (isGirl ? 'ילדה' : 'ילד'),
        hero: isGirl ? 'גיבורה' : 'גיבור', // Can stay Hero for everyone, or change to "Main Character"
        pronoun: isGirl ? 'היא' : 'הוא',
        possesive: isGirl ? 'שלה' : 'שלו',
        looksLike: isGirl ? 'כמוה' : 'כמוהו',
        kidLabel: isAdult
            ? (isGirl ? 'אותך' : 'אותך') // "Picture of *you*"
            : (isGirl ? 'את הילדה' : 'את הילד'),
        // For photo error: "Real picture of [him/her/you]"
        photoSubject: isAdult
            ? 'שלך'
            : (isGirl ? 'של הילדה' : 'של הילד')
    };
};

const CHARACTER_LABELS: Record<string, string> = {
    father: 'אבא',
    mother: 'אמא',
    grandmother: 'סבתא',
    grandfather: 'סבא',
    partner: 'בן/בת זוג',
    friend: 'חבר/ה',
    child: 'ילד/ה',
    brother: 'אח',
    sister: 'אחות',
    pet: 'חיית מחמד',
    other: 'דמות נוספת',
};

const FEMALE_ROLES = new Set(['mother', 'grandmother', 'sister']);

const HEBREW_AGE_WORDS: Record<string, number> = {
    'שנה': 1,
    'שנה אחת': 1,
    'שנתיים': 2,
    'שנתים': 2,
    'שלוש': 3,
    'ארבע': 4,
    'חמש': 5,
    'שש': 6,
    'שבע': 7,
    'שמונה': 8,
    'תשע': 9,
    'עשר': 10,
    'אחת עשרה': 11,
    'אחת-עשרה': 11,
    'שתים עשרה': 12,
    'שתיים עשרה': 12,
    'שתים-עשרה': 12,
    'שתיים-עשרה': 12
};

const MALE_VERB_HINTS = [
    'מטייל', 'הולך', 'רץ', 'רוכב', 'משחק', 'אוהב', 'נוסע', 'כותב', 'לומד', 'שר'
];

const FEMALE_VERB_HINTS = [
    'מטיילת', 'הולכת', 'רצה', 'רוכבת', 'משחקת', 'אוהבת', 'נוסעת', 'כותבת', 'לומדת', 'שרה'
];

type NameExtractionResult = Awaited<ReturnType<typeof validateHebrewName>>;

function normalizeCharacterLabel(role: string, customName?: string): string {
    const trimmed = typeof customName === 'string' ? customName.trim() : '';
    if (trimmed) return trimmed;
    return CHARACTER_LABELS[role] || role;
}

function normalizeHeroName(value: string): string {
    if (!value) return '';
    let cleaned = value.trim().replace(/[.,!?;:]+$/g, '');
    cleaned = cleaned.replace(/^(?:הגיבור(?:ה)?(?: שלנו)?(?: הוא| היא)?|הבן שלי|הבת שלי|קוראים לו|קוראים לה|שמו|שמה)\s+/u, '').trim();
    // Support forms like "בן 2", "בן ה-2", "בת ה2"
    cleaned = cleaned.replace(/\s+(?:בן|בת)\s*(?:ה\s*[-־]?\s*)?\d{1,2}\b.*$/u, '').trim();
    return cleaned;
}

function extractInlineGenderHint(value: string): 'male' | 'female' | null {
    const normalized = ` ${value.replace(/[.,!?;:()]/g, ' ')} `.toLowerCase();
    if (/\sבת(?=\s|$)/u.test(normalized) || /\sgirl(?=\s|$)/.test(normalized) || /\sfemale(?=\s|$)/.test(normalized)) {
        return 'female';
    }
    if (/\sבן(?=\s|$)/u.test(normalized) || /\sboy(?=\s|$)/.test(normalized) || /\smale(?=\s|$)/.test(normalized)) {
        return 'male';
    }
    if (FEMALE_VERB_HINTS.some((hint) => new RegExp(`\\s${hint}(?=\\s|$)`, 'u').test(normalized))) {
        return 'female';
    }
    if (MALE_VERB_HINTS.some((hint) => new RegExp(`\\s${hint}(?=\\s|$)`, 'u').test(normalized))) {
        return 'male';
    }
    return null;
}

function extractInlineNameHint(value: string): string | null {
    const normalized = value
        .replace(/[.,!?;:()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return null;

    const narrativeMatch = normalized.match(/^([א-תA-Za-z][א-תA-Za-z"'׳״-]{1,20})\s+(?:מטייל(?:ת)?|הולכ(?:ת|ים)?|רץ|רצה|רוכב(?:ת)?|משחק(?:ת)?|אוהב(?:ת)?|עם)(?=\s|$)/u);
    if (narrativeMatch?.[1]) return normalizeHeroName(narrativeMatch[1]);

    const agePatternMatch = normalized.match(/^([א-תA-Za-z][א-תA-Za-z"'׳״-]{1,20})(?=\s+(?:בן|בת)\s*(?:ה\s*[-־]?\s*)?\d{1,2}(?:\s|$))/u);
    if (agePatternMatch?.[1]) return normalizeHeroName(agePatternMatch[1]);

    return null;
}

function extractInlineAgeHint(value: string): number | null {
    const normalized = value
        .replace(/[.,!?;:()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const explicit = normalized.match(/(?:בן|בת|גיל)\s*(?:ה\s*[-־]?\s*)?(\d{1,2})\b/u);
    const generic = normalized.match(/\b(\d{1,2})\b/u);
    const numericRaw = explicit?.[1] || generic?.[1];
    if (numericRaw) {
        const parsed = Number(numericRaw);
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 99) return parsed;
    }

    for (const [word, age] of Object.entries(HEBREW_AGE_WORDS)) {
        if (normalized.includes(word)) return age;
    }

    return null;
}

function buildGenderPrompt(name: string): string {
    return `${name} שם יפה, אנחנו מדברים על בן או בת?`;
}

function enrichExtractionFromRawInput(rawInput: string, result: NameExtractionResult): NameExtractionResult {
    const normalizedName = normalizeHeroName(result.hero_name || '');
    const fallbackName = extractInlineNameHint(rawInput);
    const normalizedNameWordCount = normalizedName.split(/\s+/).filter(Boolean).length;
    const likelyNameFromModel = normalizedName && normalizedNameWordCount <= 2 ? normalizedName : '';
    const heroName = likelyNameFromModel || fallbackName || normalizedName || null;

    const inlineGender = extractInlineGenderHint(rawInput);
    const inlineAge = extractInlineAgeHint(rawInput);
    const heroGender = result.hero_gender || inlineGender;
    const heroAge = (typeof result.hero_age === 'number' && result.hero_age > 0) ? result.hero_age : inlineAge;

    let nextStep = result.next_step || 'ask_gender';
    if (nextStep !== 'confirm_name') {
        if (heroName && heroGender && heroAge) nextStep = 'ask_photo';
        else if (heroName && heroGender) nextStep = 'ask_age';
        else if (heroName) nextStep = 'ask_gender';
    }

    const defaultReply = heroName ? buildGenderPrompt(heroName) : result.reply_text;
    return {
        ...result,
        hero_name: heroName,
        hero_gender: heroGender,
        hero_age: heroAge,
        reply_text: result.reply_text || defaultReply,
        next_step: nextStep
    };
}

export const useChatFlow = (onComplete: (inputs: UserInputs) => void, initialValues?: Partial<UserInputs>) => {

    const [inputs, setInputs] = useState<UserInputs>({
        childName: '',
        topic: initialValues?.topic || '',
        artStyle: ArtStyle.Pixar,
        ...initialValues
    });

    // Debug logging
    useEffect(() => {
        // console.debug("🔄 Inputs Changed:", inputs);
    }, [inputs]);

    useEffect(() => {
        // console.debug("🚀 useChatFlow initialized with:", initialValues);
    }, []);

    // CRITICAL FIX: Sync topic from initialValues if it arrives "late" (after mount)
    // This handles React batching race conditions where App passes empty inputs first
    useEffect(() => {
        if (initialValues?.topic && (!inputs.topic || inputs.topic === '')) {
            // console.debug("⚡ Syncing early topic from props:", initialValues.topic);
            setInputs(prev => ({ ...prev, topic: initialValues.topic }));

            // Also trigger the "Smart Start" Logic immediately if needed
            // (Only if we haven't started chatting yet)
            if (messages.length <= 2) {
                // We let the existing flow handle it, or we can force it.
                // The easiest is just updating inputs, and letting user click "start" or re-trigger logic.
                // Actually, handleStart might have already run.
            }
        }
    }, [initialValues?.topic]);

    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        return [{
            id: '1',
            sender: 'agent',
            text: "אהלן! 👋 אני הבוט שיעשה מכם אגדה מודפסת. תזרקו לי רעיון, תוסיפו תמונה ואני אדאג להכניס את הכל לספר. מוכנים?",
            type: 'text'
        }];
    });

    const [step, setStep] = useState<ChatStep>('ONBOARDING');

    // Auto-start logic removed as per user request - user must click "Let's Start"
    // useEffect(() => { ... }, []);
    const [isTyping, setIsTyping] = useState(false);
    const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
    const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);

    useEffect(() => {
        trackEvent('chat_step', { step });
    }, [step]);

    const summarizeInputText = useCallback((value: string) => {
        const text = (value || '').trim();
        return {
            text_preview: text.slice(0, 160),
            text_length: text.length,
            has_hebrew: /[\u0590-\u05FF]/.test(text),
            has_digits: /\d/.test(text),
        };
    }, []);

    const trackChatInputEvent = useCallback((phase: string, rawInput: string, extra: Record<string, unknown> = {}) => {
        const text = String(rawInput || '');
        trackEvent('chat_input', {
            step: step,
            phase,
            ...summarizeInputText(text),
            ...extra,
        });
    }, [step, summarizeInputText]);

    const trackChatParseEvent = useCallback((phase: string, payload: Record<string, unknown>) => {
        trackEvent('chat_parse', {
            step: step,
            phase,
            ...payload,
        });
    }, [step]);

    const addAgentMessage = useCallback((text: string, delay = 1000) => {
        setIsTyping(true);
        setTimeout(() => {
            setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'agent', text, type: 'text' }]);
            setIsTyping(false);
        }, delay);
    }, []);

    const addUserMessage = useCallback((text: string) => {
        setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', text, type: 'text' }]);
    }, []);

    const addUserImageMessage = useCallback((imageUrl: string) => {
        setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', text: '', type: 'image', imageUrl }]);
    }, []);

    const isGibberish = (text: string) => {
        const trimmed = text.trim();
        if (trimmed.length < 2) return true;
        // Check for long sequence of same character
        if (/(.)\1{4,}/.test(trimmed)) return true;
        // Check for nonsense Hebrew combinations (simplified)
        if (trimmed.length > 8 && !/[אהוי]/.test(trimmed)) return true; // Most Hebrew names have at least one of these as mothers of reading
        return false;
    };

    const isSuspectName = (text: string) => {
        const t = text.trim();
        // Check for multiple words (more than 2)
        if (t.split(/\s+/).length > 2) return true;

        // Keyboard row mashes (Hebrew)
        const mashes = ['שדגכ', 'יחלך', 'זסדף', 'עכג'];
        if (mashes.some(m => t.includes(m) || m.includes(t) && t.length >= 3)) return true;

        // Check for common non-name words
        const nonNames = ['היי', 'שלום', 'מה קורה', 'מה קרה', 'תודה', 'בבקשה', 'כן', 'לא', 'סבבה', 'אוקיי', 'מתי', 'איך', 'כמה', 'זהו', 'אולי', 'נראה'];
        if (nonNames.some(w => t === w || (t.includes(w) && t.length < 6))) return true;

        // Check for titles or positions
        const titles = ['מנכ"ל', 'מנכל', 'מנהל', 'בוס', 'דוקטור', 'פרופסור', 'תינוק', 'ילד', 'ילדה'];
        if (titles.some(w => t.includes(w))) return true;

        return false;
    }

    const moveToPhotoValidation = (data: UserInputs, intro?: string) => {
        setStep('PHOTO_VALIDATION');
        const terms = getTerms(data.gender, data.age);
        const messagePrefix = intro ? `${intro}\n` : '';
        addAgentMessage(`${messagePrefix}כדי שהדמות של ${data.childName} תיראה בול ${terms.looksLike}, אני צריך תמונה אחת ברורה של הפנים. בלי משקפי שמש, כובע או ידיים שמסתירות.`);
    };

    // --- Handlers ---

    const handleStart = async () => {
        addUserMessage("יאללה, בוא נתחיל!");

        // FIX: If we have a topic from landing page, check if it already contains the Name!
        if (initialValues?.topic) {
            const rawTopic = initialValues.topic.trim();
            trackChatInputEvent('start_topic', rawTopic, { source: 'landing_topic' });
            setInputs(prev => ({ ...prev, topic: rawTopic }));

            setIsTyping(true);
            try {
                const rawResult = await validateHebrewName(rawTopic);
                const result = enrichExtractionFromRawInput(rawTopic, rawResult);
                trackChatParseEvent('extract_from_topic', {
                    extracted_name: result.hero_name || null,
                    extracted_gender: result.hero_gender || null,
                    extracted_age: result.hero_age || null,
                    suggested_next_step: result.next_step || null,
                });
                setIsTyping(false);

                const name = result.hero_name?.trim();
                const rawTopicWords = rawTopic.split(/\s+/).filter(Boolean);
                const nameWords = (name || '').split(/\s+/).filter(Boolean);
                const looksLikeName =
                    Boolean(name) &&
                    nameWords.length > 0 &&
                    nameWords.length <= 2 &&
                    !isSuspectName(name);
                const hasExtractedName = Boolean(name) && looksLikeName;
                const hasStoryContext = rawTopicWords.length >= 4;
                trackChatParseEvent('topic_route_decision', {
                    has_extracted_name: hasExtractedName,
                    looks_like_name: looksLikeName,
                    has_story_context: hasStoryContext,
                });

                if (hasExtractedName && name) {
                    const normalizedGender = result.hero_gender === 'male'
                        ? 'boy'
                        : result.hero_gender === 'female'
                            ? 'girl'
                            : undefined;
                    const normalizedAge = typeof result.hero_age === 'number' && result.hero_age > 0 ? result.hero_age : undefined;
                    const updatedInputs = {
                        ...inputsRef.current,
                        childName: name,
                        topic: rawTopic,
                        ...(normalizedGender && { gender: normalizedGender }),
                        ...(normalizedAge && { age: normalizedAge })
                    };
                    setInputs(updatedInputs);

                    if (normalizedGender && normalizedAge) {
                        trackChatParseEvent('topic_route', { route: 'confirm_full_profile_from_landing' });
                        const genderLabel = normalizedGender === 'girl' ? 'בת' : 'בן';
                        addAgentMessage(`מעולה, קלטתי הכל. אז הסיפור הוא על ${name}, ${genderLabel} ${normalizedAge}, בנושא "${rawTopic}". נכון?`);
                        setStep('NAME_CONFIRM');
                    } else if (normalizedGender) {
                        trackChatParseEvent('topic_route', { route: 'ask_age' });
                        setStep('AGE');
                        const isGirl = normalizedGender === 'girl';
                        addAgentMessage(`מגניב! סיפור על "${rawTopic}". ${isGirl ? 'נשמעת' : 'נשמע'} אחלה גיבור${isGirl ? 'ה' : ''}! ${isGirl ? 'בת' : 'בן'} כמה ${isGirl ? 'היא' : 'הוא'}?`);
                    } else {
                        trackChatParseEvent('topic_route', { route: 'ask_gender' });
                        setStep('GENDER');
                        addAgentMessage(`מגניב! סיפור על "${rawTopic}".\nאז ${name} זה בן או בת?`);
                    }
                    return;
                }
            } catch (e) {
                console.error("Failed to extract name from topic", e);
                trackChatParseEvent('extract_from_topic_error', {
                    error: e instanceof Error ? e.message : String(e),
                });
                setIsTyping(false);

                const fallback = enrichExtractionFromRawInput(rawTopic, {
                    hero_name: null,
                    hero_gender: null,
                    hero_age: null,
                    reply_text: '',
                    next_step: 'ask_gender'
                });
                const fallbackName = fallback.hero_name?.trim();
                if (fallbackName && !isSuspectName(fallbackName)) {
                    const normalizedGender = fallback.hero_gender === 'male'
                        ? 'boy'
                        : fallback.hero_gender === 'female'
                            ? 'girl'
                            : undefined;
                    const normalizedAge = typeof fallback.hero_age === 'number' && fallback.hero_age > 0 ? fallback.hero_age : undefined;
                    const updatedInputs = {
                        ...inputsRef.current,
                        childName: fallbackName,
                        topic: rawTopic,
                        ...(normalizedGender && { gender: normalizedGender }),
                        ...(normalizedAge && { age: normalizedAge })
                    };
                    setInputs(updatedInputs);

                    if (normalizedGender && normalizedAge) {
                        trackChatParseEvent('topic_route_fallback', { route: 'confirm_full_profile_from_landing' });
                        const genderLabel = normalizedGender === 'girl' ? 'בת' : 'בן';
                        addAgentMessage(`מעולה, קלטתי הכל. אז הסיפור הוא על ${fallbackName}, ${genderLabel} ${normalizedAge}, בנושא "${rawTopic}". נכון?`);
                        setStep('NAME_CONFIRM');
                    } else if (normalizedGender) {
                        trackChatParseEvent('topic_route_fallback', { route: 'ask_age' });
                        setStep('AGE');
                        addAgentMessage(`מגניב! סיפור על "${rawTopic}". אז ${fallbackName} זה ${normalizedGender === 'girl' ? 'בת' : 'בן'} כמה?`);
                    } else {
                        trackChatParseEvent('topic_route_fallback', { route: 'ask_gender' });
                        setStep('GENDER');
                        addAgentMessage(`מגניב! סיפור על "${rawTopic}". אז ${fallbackName} זה בן או בת?`);
                    }
                    return;
                }
            }

            setStep('NAME');
            trackChatParseEvent('topic_route', { route: 'ask_name' });
            addAgentMessage(`מגניב! סיפור על "${rawTopic}".\nמעולה. אז על מי אנחנו כותבים את הספר?\nכתבו לי פה: שם פרטי, בן/בת, וגיל.`);
            return;
        }

        setStep('NAME');
        trackChatParseEvent('start_route', { route: 'ask_name_no_topic' });
        addAgentMessage("מעולה. אז על מי אנחנו כותבים את הספר?\nכתבו לי פה: שם פרטי, בן/בת, וגיל.");
    };

    const handleNameSubmit = async (name: string, isAutoStart = false) => {
        trackChatInputEvent('name_submit', name, { auto_start: isAutoStart });
        if (!isAutoStart) {
            addUserMessage(name);
        }
        setIsTyping(true);

        try {
            const rawResult = await validateHebrewName(name);
            const result = enrichExtractionFromRawInput(name, rawResult);
            trackChatParseEvent('name_extraction', {
                extracted_name: result.hero_name || null,
                extracted_gender: result.hero_gender || null,
                extracted_age: result.hero_age || null,
                suggested_next_step: result.next_step || null,
            });
            setIsTyping(false);

            if (result.hero_name) {
                const normalizedGender = result.hero_gender === 'male'
                    ? 'boy'
                    : result.hero_gender === 'female'
                        ? 'girl'
                        : undefined;
                const normalizedAge = typeof result.hero_age === 'number' && result.hero_age > 0 ? result.hero_age : undefined;
                const updatedInputs = {
                    ...inputsRef.current,
                    childName: result.hero_name!,
                    ...(normalizedGender && { gender: normalizedGender }),
                    ...(normalizedAge && { age: normalizedAge })
                };
                setInputs(updatedInputs);

                // If in correction mode, return to confirmation immediately
                if (correctionMode) {
                    addAgentMessage(`שיניתי ל${result.hero_name}! ✅`);
                    setTimeout(() => returnToConfirmation(updatedInputs), 800);
                    return;
                }

                // FIX: Smart Skip. If the user just typed the name, don't ask "Is it [Name]?"
                const inputClean = name.trim();
                const extracted = result.hero_name.trim();
                const shouldSkipNameConfirm = inputClean.length < 20 && (inputClean === extracted || inputClean.includes(extracted));
                const routeByExtractedData = () => {
                    if (result.next_step === 'ask_photo' || (normalizedGender && normalizedAge)) {
                        trackChatParseEvent('name_route', { route: 'ask_photo_direct' });
                        const ageLabel = normalizedGender
                            ? `${normalizedGender === 'girl' ? 'בת' : 'בן'} ${normalizedAge}`
                            : `בגיל ${normalizedAge}`;
                        moveToPhotoValidation(updatedInputs, `${result.hero_name} שם מקסים! קיבלתי ש${result.hero_name} ${ageLabel}.`);
                        return;
                    }

                    if (result.next_step === 'ask_age' || normalizedGender) {
                        trackChatParseEvent('name_route', { route: 'ask_age' });
                        setStep('AGE');
                        const isGirl = normalizedGender === 'girl';
                        addAgentMessage(`${result.hero_name} שם מקסים! ${isGirl ? 'בת' : 'בן'} כמה ${result.hero_name}?`);
                        return;
                    }

                    if (result.next_step === 'confirm_name') {
                        trackChatParseEvent('name_route', { route: 'confirm_name' });
                        setStep('NAME_CONFIRM');
                        addAgentMessage(result.reply_text || `אז הסיפור הוא על ${result.hero_name}, נכון?`);
                        return;
                    }

                    trackChatParseEvent('name_route', { route: 'ask_gender' });
                    setStep('GENDER');
                    addAgentMessage(buildGenderPrompt(result.hero_name));
                };

                if (shouldSkipNameConfirm) {
                    routeByExtractedData();
                    return;
                }

                if (step === 'NAME_CONFIRM') {
                    routeByExtractedData();
                    return;
                }

                if (result.next_step === 'confirm_name') {
                    setStep('NAME_CONFIRM');
                    addAgentMessage(result.reply_text || `אז הסיפור הוא על ${result.hero_name}, נכון?`);
                    return;
                }

                setStep('NAME_CONFIRM');
                addAgentMessage(`אז הסיפור הוא על ${result.hero_name}, נכון?`);

            } else if (result.next_step === 'confirm_name') {
                trackChatParseEvent('name_route', { route: 'confirm_name_no_extracted_name' });
                setInputs(prev => ({ ...prev, childName: name }));
                setStep('NAME_CONFIRM');
                addAgentMessage(result.reply_text);
            } else {
                const fallbackName = normalizeHeroName(name);
                if (fallbackName) {
                    trackChatParseEvent('name_route', { route: 'ask_gender_fallback_name' });
                    setStep('GENDER');
                    addAgentMessage(buildGenderPrompt(fallbackName));
                }
            }

        } catch (error) {
            console.error("Entity extraction error:", error);
            trackChatParseEvent('name_extraction_error', {
                error: error instanceof Error ? error.message : String(error),
            });
            setIsTyping(false);
            const fallbackParsed = enrichExtractionFromRawInput(name, {
                hero_name: name,
                hero_gender: null,
                hero_age: null,
                reply_text: '',
                next_step: 'ask_gender'
            });
            const normalizedGender = fallbackParsed.hero_gender === 'male'
                ? 'boy'
                : fallbackParsed.hero_gender === 'female'
                    ? 'girl'
                    : undefined;
            const normalizedAge = typeof fallbackParsed.hero_age === 'number' && fallbackParsed.hero_age > 0 ? fallbackParsed.hero_age : undefined;
            const updatedInputs = {
                ...inputsRef.current,
                childName: fallbackParsed.hero_name || name,
                ...(normalizedGender && { gender: normalizedGender }),
                ...(normalizedAge && { age: normalizedAge })
            };
            setInputs(updatedInputs);

            if (correctionMode) {
                addAgentMessage(`שיניתי ל${name}! ✅`);
                setTimeout(() => returnToConfirmation(updatedInputs), 800);
                return;
            }

            if (normalizedGender && normalizedAge) {
                trackChatParseEvent('name_route_fallback', { route: 'ask_photo_direct' });
                moveToPhotoValidation(updatedInputs, `${updatedInputs.childName} שם מהמם! קיבלתי כבר את הפרטים הבסיסיים.`);
            } else if (normalizedGender) {
                trackChatParseEvent('name_route_fallback', { route: 'ask_age' });
                setStep('AGE');
                addAgentMessage(`${updatedInputs.childName} שם מהמם! ${normalizedGender === 'girl' ? 'בת' : 'בן'} כמה ${updatedInputs.childName}?`);
            } else {
                trackChatParseEvent('name_route_fallback', { route: 'ask_gender' });
                setStep('GENDER');
                addAgentMessage(buildGenderPrompt(updatedInputs.childName));
            }
        }
    };

    const handleNameConfirm = (isCorrect: boolean) => {
        if (isCorrect) {
            addUserMessage("כן");
            if (inputs.gender && inputs.age && inputs.age > 0) {
                const summary = inputs.topic
                    ? `מעולה! אז הסיפור הוא על ${inputs.childName}, ${inputs.gender === 'girl' ? 'בת' : 'בן'} ${inputs.age}, בנושא "${inputs.topic}".`
                    : `מעולה! אז הסיפור הוא על ${inputs.childName}, ${inputs.gender === 'girl' ? 'בת' : 'בן'} ${inputs.age}.`;
                moveToPhotoValidation(inputs, summary);
            } else if (inputs.gender) {
                setStep('AGE');
                const isGirl = inputs.gender === 'girl';
                addAgentMessage(`${inputs.childName} שם מקסים! ${isGirl ? 'בת' : 'בן'} כמה ${inputs.childName}?`);
            } else {
                setStep('GENDER');
                addAgentMessage(buildGenderPrompt(inputs.childName));
            }
        } else {
            addUserMessage("לא");
            setStep('NAME');
            addAgentMessage("סליחה! בוא נתחיל מחדש - מה השם הפרטי של הגיבור או הגיבורה?");
        }
    };

    const handleGenderSubmit = (input: string) => {
        trackChatInputEvent('gender_submit', input);
        const offTopic = getOffTopicAnswer(input);
        if (offTopic) {
            trackChatParseEvent('gender_route', { route: 'off_topic' });
            addUserMessage(input);
            addAgentMessage(offTopic);
            setTimeout(() => {
                addAgentMessage(`אוקיי, ובחזרה ל${inputs.childName || 'גיבור/ה'} שלנו - בן או בת?`);
            }, 1000);
            return;
        }

        let gender: 'boy' | 'girl' | null = null;
        const normalized = input.trim();

        if (normalized.includes('בת') || normalized.toLowerCase().includes('girl') || normalized.toLowerCase().includes('female')) {
            gender = 'girl';
        } else if (normalized.includes('בן') || normalized.toLowerCase().includes('boy') || normalized.toLowerCase().includes('male')) {
            gender = 'boy';
        }

        // FIX: Account for ambiguity instead of defaulting to boy
        if (!gender) {
            trackChatParseEvent('gender_route', { route: 'ambiguous_reask' });
            addUserMessage(input);
            addAgentMessage(`סליחה, לא לגמרי הבנתי... ${inputs.childName} זה בן או בת?`);
            return;
        }

        addUserMessage(gender === 'boy' ? 'בן' : 'בת');
        const updatedInputs = { ...inputsRef.current, gender: gender as 'boy' | 'girl' };
        setInputs(updatedInputs);

        if (correctionMode) {
            addAgentMessage(`עדכנתי ל${gender === 'boy' ? 'בן' : 'בת'}! ✅`);
            setTimeout(() => returnToConfirmation(updatedInputs), 800);
            return;
        }

        if (updatedInputs.age && updatedInputs.age > 0) {
            trackChatParseEvent('gender_route', { route: 'ask_photo_direct', parsed_gender: gender });
            moveToPhotoValidation(updatedInputs, `מצוין. קיבלתי: ${gender === 'girl' ? 'בת' : 'בן'} ${updatedInputs.age}.`);
            return;
        }

        trackChatParseEvent('gender_route', { route: 'ask_age', parsed_gender: gender });
        setStep('AGE');
        const ageQuestion = gender === 'girl'
            ? `בת כמה ${inputs.childName || 'נעם'}?`
            : `בן כמה ${inputs.childName || 'נעם'}?`;
        addAgentMessage(ageQuestion);
    };

    const handleAgeSubmit = (ageInput: number | string) => {
        const rawAgeInput = typeof ageInput === 'string' ? ageInput : String(ageInput);
        trackChatInputEvent('age_submit', rawAgeInput);
        if (typeof ageInput === 'string') {
            const offTopic = getOffTopicAnswer(ageInput);
            if (offTopic) {
                trackChatParseEvent('age_route', { route: 'off_topic' });
                addUserMessage(ageInput);
                addAgentMessage(offTopic);
                setTimeout(() => {
                    const isGirl = inputs.gender === 'girl';
                    addAgentMessage(`ובחזרה לגיל - ${isGirl ? 'בת' : 'בן'} כמה ${inputs.childName || 'נעם'}?`);
                }, 1000);
                return;
            }
        }

        const age = typeof ageInput === 'string'
            ? extractInlineAgeHint(ageInput)
            : ageInput;
        if (!age || Number.isNaN(age)) {
            trackChatParseEvent('age_route', { route: 'invalid_reask' });
            return;
        }
        trackChatParseEvent('age_route', { route: 'ask_photo', parsed_age: age });

        const vibe = age < 13 ? 'KIDS' : 'ADULTS';
        const updatedInputs = { ...inputsRef.current, age, vibe: vibe as 'KIDS' | 'ADULTS' };
        setInputs(updatedInputs);

        addUserMessage(`גיל ${age}`);

        if (correctionMode) {
            addAgentMessage(`עדכנתי לגיל ${age}! ✅`);
            setTimeout(() => returnToConfirmation(updatedInputs), 800);
            return;
        }

        setStep('PHOTO_VALIDATION');

        const terms = getTerms(inputs.gender, age);
        addAgentMessage(`כדי שהדמות של ${inputs.childName} תיראה בול ${terms.looksLike}, אני צריך תמונה אחת ברורה של הפנים. בלי משקפי שמש, כובע או ידיים שמסתירות.`);
    };

    const handleChildPhotoUpload = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const imageData = reader.result as string;

            // Show image immediately for better UX
            addUserImageMessage(imageData);
            setIsTyping(true);

            // Validate Image with AI
            try {
                const validation = await validateCharacterPhoto(imageData, inputs.age, inputs.childName);

                if (validation.faceCount > 1) {
                    setIsTyping(false);
                    setCropTarget('hero');
                    setImageToCrop(imageData);
                    setIsCropperOpen(true);
                    addAgentMessage("אני רואה כמה אנשים בתמונה. בוא נחתוך אותה כדי לבחור רק את הדמות הראשית. ✂️");
                    return;
                }

                if (!validation.isValid) {
                    if (validation.reason) {
                        setIsTyping(false);
                        addAgentMessage(validation.reason);
                        return;
                    }
                }

                // Success!
                setIsTyping(false);
                setInputs(prev => ({ ...prev, characterImage: imageData }));
            } catch (e) {
                console.error("Validation failed", e);
                // If validation crashes, we fail open (allow image)
            }

            setInputs(prev => ({ ...prev, characterImage: imageData }));
            trackEvent('photo_uploaded', { target: 'hero' });

            const isGirl = inputs.gender === 'girl';
            addAgentMessage(`איזה יופי! תמונה מעולה. 😍`);

            setTimeout(() => {
                // If we already have a topic (from landing page), skip the topic step but REFERENCE it
                if (inputs.topic && inputs.topic.length >= 2) {
                    setStep('TOPIC');
                    addAgentMessage(`אוקיי, הגיע הזמן לכתוב את הסיפור של ${inputs.childName}. אז אמרנו ש"${inputs.topic}", רוצה להרחיב או לשנות? (אם לא, פשוט לחצו "המשך")`);
                    return;
                }

                setStep('TOPIC');
                const isGirl = inputs.gender === 'girl';
                const age = inputs.age || 0;

                let example = "";
                if (age < 13) {
                    example = `"${inputs.childName} מוצאת ביצת דרקון ביער"`;
                } else if (age < 40) {
                    example = `"${inputs.childName} עוברת לדירה ראשונה בתל אביב"`;
                } else if (age < 60) {
                    example = `"${inputs.childName} משיקה סטארט-אפ מצליח"`;
                } else {
                    example = `"${inputs.childName} יוצאת למסע מסביב לעולם אחרי הפרישה"`;
                }

                // Adjust for male
                if (!isGirl) {
                    example = example.replace('מוצאת', 'מוצא').replace('עוברת', 'עובר').replace('משיקה', 'משיק').replace('יוצאת', 'יוצא');
                }

                addAgentMessage(`אוקיי, הגיע הזמן לכתוב את הסיפור של ${inputs.childName}. תנו לי כיוון קליל או מצחיק. למשל: ${example}`);
            }, 1000);
        };
        reader.readAsDataURL(file);
    };

    const handleTopicSubmit = async (topic: string) => {
        trackChatInputEvent('topic_submit', topic, {
            existing_topic_length: inputs.topic ? inputs.topic.length : 0,
        });
        // Special handling for "No" or "Continue" when we already have a topic
        const normalizedTopic = topic.trim().toLowerCase();
        if ((normalizedTopic === 'לא' || normalizedTopic === 'no' || normalizedTopic === 'המשך') && inputs.topic && inputs.topic.length >= 2) {
            trackChatParseEvent('topic_route', { route: 'keep_existing_topic' });
            // User wants to keep the original topic
            addUserMessage("מצוין, נמשיך עם זה");
            setStep('ADDITIONAL_CHARACTERS');

            const response = getHebrewChatResponse(inputs.topic, inputs.age || 0, inputs.childName || '');
            addAgentMessage(`${response} יש עוד מישהו שמצטרף ל${inputs.childName}?`);
            return;
        }

        if (isGibberish(topic) || topic.length < 5) {
            trackChatParseEvent('topic_route', { route: 'reject_short_or_gibberish' });
            addUserMessage(topic);
            addAgentMessage("אני צריך קצת יותר מזה כדי לעבוד... 😉 נסה לכתוב לי מי נמצא שם ומה קורה בגדול.");
            return;
        }

        addUserMessage(topic);
        setIsTyping(true);

        // Smart Refinement: If we already have a topic, merge intelligently.
        let finalTopic = topic;
        if (inputs.topic && inputs.topic.length > 2 && !topic.includes(inputs.topic)) {
            try {
                // Use LLM to merge logically
                finalTopic = await refineStoryConcept(inputs.topic, topic, inputs.age, inputs.gender);
                trackChatParseEvent('topic_merge', { merged_with_previous: true, merge_model: 'refineStoryConcept' });
            } catch (e) {
                // Fallback to simple append
                finalTopic = `${inputs.topic}. ${topic}`;
                trackChatParseEvent('topic_merge', { merged_with_previous: true, merge_model: 'fallback_concat' });
            }
        }

        setIsTyping(false);
        const updatedInputs = { ...inputsRef.current, topic: finalTopic };
        setInputs(updatedInputs);

        if (correctionMode) {
            addAgentMessage(`עדכנתי את הנושא ל: "${finalTopic}" ✅`);
            setTimeout(() => returnToConfirmation(updatedInputs), 800);
            return;
        }

        setStep('ADDITIONAL_CHARACTERS');
        trackChatParseEvent('topic_route', {
            route: 'ask_additional_characters',
            final_topic_preview: finalTopic.slice(0, 180),
        });

        // Echo back the combined topic
        const response = getHebrewChatResponse(finalTopic, inputs.age || 0, inputs.childName || '');

        const isAdult = (inputs.age || 0) >= 16;
        const suggestions = isAdult
            ? "(בן/בת זוג, ילד/ה, חבר/ה, חיית מחמד?)"
            : "(חבר/ה, אח/ות, חיית מחמד?)";
        addAgentMessage(`הבנתי! אז הסיפור הוא: "${finalTopic}" ✍️\n${response} יש עוד מישהו שתרצו להוסיף? ${suggestions}`);
    };

    // Helper to mirror AI service logic for chat responses
    // Helper to identify character type for validation
    const determineCharacterType = (role: string, name?: string): 'human' | 'pet' | 'toy' => {
        const lowerRole = role?.toLowerCase() || '';
        const lowerName = name?.toLowerCase() || '';

        if (lowerRole.includes('pet') || lowerRole.includes('dog') || lowerRole.includes('cat') ||
            lowerRole.includes('חיה') || lowerRole.includes('כלב') || lowerRole.includes('חתול')) {
            return 'pet';
        }
        if (lowerRole.includes('doll') || lowerRole.includes('toy') || lowerRole.includes('teddy') ||
            lowerRole.includes('בובה') || lowerRole.includes('צעצוע') || lowerRole.includes('דובי')) {
            return 'toy';
        }

        // Check name just in case
        if (lowerName.includes('כלב') || lowerName.includes('חתול')) return 'pet';

        return 'human';
    };

    const getHebrewChatResponse = (topic: string, age: number, name: string): string => {
        if (age < 13) return "נשמע כמו סיפור אגדה! 🚀";

        const t = topic.toLowerCase();

        // Army/Miluim
        if (t.includes('army') || t.includes('miluim') || t.includes('צבא') || t.includes('מילואים') || t.includes('חייל')) {
            return "חחח יאללה סיפור צבא! בוא נעשה את זה מצחיק. 😉";
        }

        // Romance/Wedding
        if (t.includes('love') || t.includes('wedding') || t.includes('אהבה') || t.includes('חתונה') || t.includes('זוגיות')) {
            return "אוווו סיפור אהבה! איזה כיף ❤️";
        }

        // Work/Office
        if (t.includes('work') || t.includes('office') || t.includes('עבודה') || t.includes('משרד') || t.includes('ייטק')) {
            return "סיפורי משרד זה תמיד טוב... בוא נכתוב על זה! 💼";
        }

        // General Adult
        return "נשמע כמו אחלה סיפור! 🚀";
    };

    const handleAdditionalCharacterChoice = (choice: 'skip' | 'father' | 'mother' | 'grandmother' | 'pet' | 'other' | 'partner' | 'friend' | 'child', customName?: string) => {
        if (choice === 'skip') {
            addUserMessage(`לא, רק ${inputs.childName} בסיפור`);
            setInputs(prev => ({
                ...prev,
                parentCharacter: undefined,
                parentCharacterRole: undefined,
                parentName: undefined,
                parentGender: undefined,
                parentAge: undefined,
                parentImage: undefined,
            }));
            setStep('STYLE');
            addAgentMessage(`נשאר רק לבחור סגנון לספר:`);
        } else {
            // Check for ambiguous roles that require details
            if (['partner', 'friend', 'child', 'other'].includes(choice)) {
                const prefilledName = choice === 'other' && typeof customName === 'string' && customName.trim()
                    ? customName.trim()
                    : undefined;
                const roleLabel = prefilledName || normalizeCharacterLabel(choice, choice === 'other' ? undefined : customName);

                addUserMessage(roleLabel);

                // Try to extract gender and age from the name text (e.g. "יותקה בן ה-2")
                const inferredGender = prefilledName ? extractInlineGenderHint(prefilledName) : null;
                const inferredAge = prefilledName ? extractInlineAgeHint(prefilledName) : null;

                setInputs(prev => ({
                    ...prev,
                    parentCharacter: roleLabel,
                    parentCharacterRole: choice,
                    parentName: prefilledName,
                    parentGender: inferredGender || undefined,
                    parentAge: inferredAge || undefined,
                    parentImage: undefined,
                }));

                if (prefilledName && inferredGender && inferredAge) {
                    // Have everything – skip straight to photo
                    proceedToParentPhoto(prefilledName, inferredGender);
                } else if (prefilledName && inferredGender && !inferredAge) {
                    setStep('GET_CHAR_DETAILS');
                    addAgentMessage(`${prefilledName} שם מעולה! ${inferredGender === 'female' ? 'בת' : 'בן'} כמה?`);
                } else if (prefilledName) {
                    setStep('GET_CHAR_DETAILS');
                    addAgentMessage(buildGenderPrompt(prefilledName));
                } else {
                    setStep('GET_CHAR_DETAILS');
                    const questionLabel = CHARACTER_LABELS[choice] || roleLabel;
                    addAgentMessage(`איזה כיף! איך קוראים ל${questionLabel}?`);
                }
                return;
            }

            const label = normalizeCharacterLabel(choice, customName);
            const isFemale = FEMALE_ROLES.has(choice) || /אמא|סבתא|אחות|ילדה|בת/.test(label);
            const pronoun = isFemale ? 'שלה' : 'שלו';

            addUserMessage(`כן, ${label}`);
            setInputs(prev => ({
                ...prev,
                parentCharacter: label,
                parentCharacterRole: choice,
                parentName: undefined,
                parentGender: undefined,
                parentAge: undefined,
                parentImage: undefined,
            }));
            setStep('PARENT_PHOTO');
            addAgentMessage(`מעולה, ${label} בפנים. יש לך תמונה טובה ${pronoun}? (אם לא תעלה, אני אצור דמות גנרית שמתאימה לתיאור).`);
        }
    };

    const handleCharDetailsSubmit = async (text: string) => {
        trackChatInputEvent('character_details_submit', text, {
            has_parent_name: !!inputs.parentName,
            has_parent_gender: !!inputs.parentGender,
            has_parent_age: !!inputs.parentAge,
        });
        addUserMessage(text);

        // 1. If Name is missing, treat text as Name (+ maybe gender/age via API)
        if (!inputs.parentName) {
            setIsTyping(true);
            try {
                const rawResult = await validateHebrewName(text);
                const result = enrichExtractionFromRawInput(text, rawResult);
                trackChatParseEvent('character_details_extraction', {
                    extracted_name_raw: rawResult.hero_name || null,
                    extracted_gender_raw: rawResult.hero_gender || null,
                    extracted_age_raw: rawResult.hero_age || null,
                    extracted_name: result.hero_name || null,
                    extracted_gender: result.hero_gender || null,
                    extracted_age: result.hero_age || null,
                });
                setIsTyping(false);

                const newName = result.hero_name || normalizeHeroName(text) || text;
                // Try AI extraction first, then fall back to text hints
                let newGender = result.hero_gender as 'male' | 'female' | undefined;
                if (!newGender) {
                    // Infer gender from raw text: "בן" = male, "בת" = female
                    const inferredGender = extractInlineGenderHint(text);
                    if (inferredGender) newGender = inferredGender;
                }
                let newAge = result.hero_age ? Number(result.hero_age) : undefined;
                if (!newAge) {
                    const inferredAge = extractInlineAgeHint(text);
                    if (inferredAge) newAge = inferredAge;
                }

                setInputs(prev => ({
                    ...prev,
                    parentName: newName,
                    parentGender: newGender,
                    parentAge: newAge
                }));

                // Logic: If gender missing -> Ask. If Age missing -> Ask.
                if (!newGender) {
                    trackChatParseEvent('character_details_route', { route: 'ask_parent_gender' });
                    addAgentMessage(buildGenderPrompt(newName));
                    return;
                }
                if (!newAge) {
                    trackChatParseEvent('character_details_route', { route: 'ask_parent_age' });
                    addAgentMessage(`${newGender === 'female' ? 'בת' : 'בן'} כמה ${newName}?`);
                    return;
                }

                // Have all details
                trackChatParseEvent('character_details_route', { route: 'ask_parent_photo' });
                proceedToParentPhoto(newName, newGender);
            } catch (e) {
                trackChatParseEvent('character_details_extraction_error', {
                    error: e instanceof Error ? e.message : String(e),
                });
                setIsTyping(false);
                // Fallback: still try local parsing from free text
                const fallbackName = extractInlineNameHint(text) || normalizeHeroName(text) || text;
                const fallbackGender = extractInlineGenderHint(text) || undefined;
                const fallbackAge = extractInlineAgeHint(text) || undefined;
                setInputs(prev => ({
                    ...prev,
                    parentName: fallbackName,
                    parentGender: prev.parentGender || fallbackGender,
                    parentAge: prev.parentAge || fallbackAge,
                }));
                if (fallbackGender && fallbackAge) {
                    trackChatParseEvent('character_details_route', { route: 'ask_parent_photo_fallback' });
                    proceedToParentPhoto(fallbackName, fallbackGender);
                    return;
                }
                if (fallbackGender && !fallbackAge) {
                    trackChatParseEvent('character_details_route', { route: 'ask_parent_age_fallback' });
                    addAgentMessage(fallbackGender === 'female' ? "בת כמה?" : "בן כמה?");
                    return;
                }
                trackChatParseEvent('character_details_route', { route: 'ask_parent_gender_fallback' });
                addAgentMessage("בן או בת?");
            }
            return;
        }

        // 2. If Name exists but Gender missing -> treat text as Gender
        if (!inputs.parentGender) {
            const isBoy = text.includes('בן') || text.includes('זכר') || text.includes('boy') || text.includes('male');
            const isGirl = text.includes('בת') || text.includes('נקבה') || text.includes('girl') || text.includes('female');
            const parsedAgeFromSameMessage = parseInt(text.replace(/\D/g, ''), 10);
            const ageFromSameMessage = Number.isFinite(parsedAgeFromSameMessage) && parsedAgeFromSameMessage > 0
                ? parsedAgeFromSameMessage
                : undefined;

            // Don't assume - re-ask if ambiguous
            if (!isBoy && !isGirl) {
                trackChatParseEvent('character_details_route', { route: 'ambiguous_parent_gender' });
                addAgentMessage("לא הצלחתי להבין... בן או בת?");
                return;
            }

            const gender = isGirl ? 'female' : 'male';
            setInputs(prev => ({
                ...prev,
                parentGender: gender,
                parentAge: prev.parentAge || ageFromSameMessage
            }));

            if (!inputs.parentAge && !ageFromSameMessage) {
                trackChatParseEvent('character_details_route', { route: 'ask_parent_age_after_gender' });
                addAgentMessage(gender === 'female' ? "בת כמה?" : "בן כמה?");
                return;
            }
            trackChatParseEvent('character_details_route', {
                route: 'ask_parent_photo_after_gender',
                parsed_age: ageFromSameMessage || inputs.parentAge
            });
            proceedToParentPhoto(inputs.parentName, gender);
            return;
        }

        // 3. If Name & Gender exist but Age missing -> treat text as Age
        if (!inputs.parentAge) {
            const age = parseInt(text.replace(/\D/g, '')) || 30; // Default adult age
            setInputs(prev => ({ ...prev, parentAge: age }));
            trackChatParseEvent('character_details_route', { route: 'ask_parent_photo_after_age', parsed_age: age });
            proceedToParentPhoto(inputs.parentName, inputs.parentGender);
            return;
        }
    };

    const proceedToParentPhoto = (name: string, gender: 'male' | 'female') => {
        setStep('PARENT_PHOTO');
        addAgentMessage(`מעולה! יש לך תמונה של ${name}? (אם לא, אצור דמות גנרית לפי התיאור)`);
    };

    const handleParentPhotoUpload = async (file: File | null) => {
        if (!file) {
            addUserMessage("דלג - צור דמות גנרית");
            setStep('THIRD_CHOICE');
            addAgentMessage(`הבנתי, אני אעצב דמות שתתאים לסיפור. תגיד, יש עוד מישהו שרוצה להצטרף? או שאלו ודי?`);
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const imageData = reader.result as string;
            addUserImageMessage(imageData); // Show temporarily
            setIsTyping(true);

            // Determine type
            const charType = determineCharacterType(
                inputs.parentCharacterRole || inputs.parentCharacter || 'parent',
                inputs.parentName || inputs.parentCharacter
            );

            // Validate!
            try {
                const validation = await validateCharacterPhoto(imageData, inputs.parentAge || 35, inputs.parentName || 'הדמות', charType);

                // 1. Strict Multi-Face Check (Only for humans)
                if (charType === 'human' && validation.faceCount > 1) {
                    setIsTyping(false);
                    setCropTarget('parent');
                    setImageToCrop(imageData);
                    setIsCropperOpen(true);
                    addAgentMessage("אני רואה כמה אנשים בתמונה. בוא נחתוך אותה כדי שנתמקד בדמות שבחרנו! ✂️");
                    return;
                }

                // 2. Invalid Photo Check (No face, cartoon, etc)
                if (!validation.isValid && validation.reason) {
                    setIsTyping(false);
                    addAgentMessage(validation.reason);
                    return;
                }

                // Success
                setInputs(prev => ({ ...prev, parentImage: imageData }));
                trackEvent('photo_uploaded', {
                    target: 'parent',
                    role: inputs.parentCharacterRole || inputs.parentCharacter || 'unknown'
                });
                setStep('THIRD_CHOICE');
                addAgentMessage(`איזה יופי! תמונה מעולה. 😍 יש עוד דמות שתרצו להוסיף? (אח, אחות, חיית מחמד...)`);
            } catch (e) {
                console.error("Parent photo validation failed", e);
                // Fallback success
                setInputs(prev => ({ ...prev, parentImage: imageData }));
                trackEvent('photo_uploaded', {
                    target: 'parent',
                    role: inputs.parentCharacterRole || inputs.parentCharacter || 'unknown'
                });
                setStep('THIRD_CHOICE');
                addAgentMessage(`תמונה מעולה! יש עוד דמות שתרצו להוסיף?`);
            }
            setIsTyping(false);
        };
        reader.readAsDataURL(file);
    };

    const handleThirdCharacterChoice = (
        choice: 'skip' | 'father' | 'mother' | 'grandmother' | 'grandfather' | 'brother' | 'sister' | 'partner' | 'friend' | 'child' | 'pet' | 'other',
        customName?: string
    ) => {
        if (choice === 'skip') {
            addUserMessage(`לא, זה הכל`);
            setInputs(prev => ({
                ...prev,
                thirdCharacter: undefined,
                thirdCharacterRole: undefined,
                thirdCharacterImage: undefined,
            }));
            setStep('STYLE');
            addAgentMessage(`נשאר רק לבחור סגנון לספר:`);
        } else {
            const label = normalizeCharacterLabel(choice, customName);
            setInputs(prev => ({
                ...prev,
                thirdCharacter: label,
                thirdCharacterRole: choice,
                thirdCharacterImage: undefined,
            }));

            addUserMessage(label);
            setStep('THIRD_PHOTO');
            addAgentMessage(`מצוין! תעלו תמונה של ${label}?`);
        }
    };

    const handleThirdPhotoUpload = async (file: File | null) => {
        if (!file) {
            addUserMessage("דלג - צור דמות גנרית");
            setStep('STYLE');
            addAgentMessage(`נשאר רק לבחור סגנון לספר:`);
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const imageData = reader.result as string;
            addUserImageMessage(imageData);
            setIsTyping(true);

            // Determine type
            // inputs.thirdCharacter might be 'pet' directly
            const charType = determineCharacterType(
                inputs.thirdCharacterRole || inputs.thirdCharacter || 'other',
                inputs.thirdCharacter
            );

            // Validate!
            try {
                const validation = await validateCharacterPhoto(imageData, 10, 'הדמות השלישית', charType);

                // 1. Strict Multi-Face Check (Only for humans)
                if (charType === 'human' && validation.faceCount > 1) {
                    setIsTyping(false);
                    setCropTarget('third');
                    setImageToCrop(imageData);
                    setIsCropperOpen(true);
                    addAgentMessage("אני רואה כמה אנשים בתמונה. בוא נחתוך אותה כדי שנתמקד בדמות שבחרנו! ✂️");
                    return;
                }

                // 2. Invalid Photo Check (No face, cartoon, etc)
                if (!validation.isValid && validation.reason) {
                    setIsTyping(false);
                    addAgentMessage(validation.reason);
                    return;
                }

                // Success
                setInputs(prev => ({ ...prev, thirdCharacterImage: imageData }));
                trackEvent('photo_uploaded', {
                    target: 'third',
                    role: inputs.thirdCharacterRole || inputs.thirdCharacter || 'unknown'
                });
                setStep('STYLE');
                addAgentMessage(`נשאר רק לבחור סגנון לספר:`);

            } catch (e) {
                console.error("Third photo validation failed", e);
                setInputs(prev => ({ ...prev, thirdCharacterImage: imageData }));
                trackEvent('photo_uploaded', {
                    target: 'third',
                    role: inputs.thirdCharacterRole || inputs.thirdCharacter || 'unknown'
                });
                setStep('STYLE');
                addAgentMessage(`נשאר רק לבחור סגנון לספר:`);
            }
            setIsTyping(false);
        };
        reader.readAsDataURL(file);
    };

    const addAgentImageMessage = useCallback((imageUrl: string, delay = 500) => {
        setIsTyping(true);
        setTimeout(() => {
            setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'agent', text: '', type: 'image', imageUrl }]);
            setIsTyping(false);
        }, delay);
    }, []);

    const addAgentMultiImageMessage = useCallback((imageUrls: string[], delay = 500) => {
        setIsTyping(true);
        setTimeout(() => {
            setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'agent', text: '', type: 'multi-image', imageUrls }]);
            setIsTyping(false);
        }, delay);
    }, []);

    const getOffTopicAnswer = (text: string): string | null => {
        const t = text.toLowerCase();
        if (t.includes('משלוח') || t.includes('מתי זה מגיע')) return "המשלוח לספר מודפס מגיע תוך 21 ימי עסקים. המהדורה הדיגיטלית נפתחת מיד! 🚚";
        if (t.includes('מחיר') || t.includes('כמה עולה') || t.includes('עלות')) return "המהדורה הדיגיטלית עולה 39 ש\"ח, וספר מודפס בכריכה קשה עולה 149 ש\"ח. ✨";
        if (t.includes('עמודים') || t.includes('כמה דפים')) return "הספר מכיל 12 עמודים מלאים באיורים אישיים וסיפור מרגש. 📖";
        if (t.includes('דומה') || t.includes('נראה כמו') || t.includes('מזהה') || t.includes('דיוק')) return "הבינה המלאכותית שלנו סורקת את תווי הפנים שלכם ויוצרת איור שנראה בול כמוכם, תוך שמירה על הסגנון שבחרתם! 🎨";
        if (t.includes('איפה אתם') || t.includes('מי אתם')) return "אנחנו 'מפעל הספרים הקסום', משתמשים בבינה מלאכותית הכי מתקדמת כדי להפוך אתכם לגיבורים! 🤖";
        return null;
    };

    const generateSummaryMessage = (data: UserInputs) => {
        const isAdult = (data.age || 0) >= 18;
        const topicText = (data.topic || '').trim();
        const heroLine = data.age
            ? `• כוכב: ${data.childName} (${data.age})`
            : `• כוכב: ${data.childName}`;
        const topicLine = topicText ? `• עלילה: ${topicText}` : null;
        const styleLine = `• סגנון: ${getStyleDisplayLabel(data.artStyle)}`;
        const summaryLines = [heroLine, topicLine, styleLine].filter(Boolean).join('\n');

        return `סגור. סיכום זריז לפני שאנחנו הופכים את זה לספר:\n${summaryLines}\nיש אישור לצאת לדרך?`;
    };

    const handleStyleSelect = async (styleInput: ArtStyle | string) => {
        addUserMessage(`סגנון ${getStyleDisplayLabel(String(styleInput))}`);
        const updated = { ...inputsRef.current, artStyle: styleInput as ArtStyle };
        setInputs(updated);
        trackEvent('style_selected', { style: styleInput });

        if (correctionMode) {
            addAgentMessage(`עדכנתי לסגנון ${getStyleDisplayLabel(String(styleInput))}! ✅`);
            setTimeout(() => returnToConfirmation(updated), 800);
            return;
        }

        // Ask for email at the end of the chat flow
        setStep('EMAIL');
        addAgentMessage(`סגנון מצוין! 🎨`);
        setTimeout(() => {
            addAgentMessage(`שאלה אחרונה ודי: לאיזה מייל נשלח לכם את הספר כשהוא יהיה מוכן? 📧`);
        }, 800);
    };

    const handleDedicationSubmit = (text: string) => {
        addUserMessage(text);
        const trimmed = text.trim();
        const isSkip = /^(לא|אין|בלי|דלג|skip|no)$/i.test(trimmed);

        const updated = { ...inputsRef.current };
        if (!isSkip && trimmed.length > 0) {
            updated.dedication = trimmed;
            setInputs(updated);
            addAgentMessage(`הקדשה יפהפייה! 💝 "${trimmed}"`);
        } else {
            addAgentMessage(`בסדר, בלי הקדשה. אפשר תמיד להוסיף אחר כך! 👍`);
        }

        // Now go to email
        setStep('EMAIL');
        addAgentMessage(`שאלה אחרונה ודי! מה המייל שלך? (כדי שאוכל לשלוח לך את הסיפור כשהוא מוכן 📧)`);
    };

    const handleEmailSubmit = (email: string) => {
        // Use robust validation library
        const validation = validateEmail(email);

        if (!validation.isValid) {
            addUserMessage(email);

            // If there's a suggestion (e.g. "Did you mean gmail?"), simplify the UX
            if (validation.suggestion) {
                addAgentMessage(validation.error || "האם התכוונת ל-" + validation.suggestion + "?");
                // We could technically auto-fix, but better to ask.
                // Ideally we'd have a buttons UI here, but for now text is fine.
                return;
            }

            addAgentMessage(validation.error || "המייל לא נראה תקין, נסה שוב? 📧");
            return;
        }

        const validEmail = email.trim(); // Just trim spaces, logic handled validation

        addUserMessage(validEmail);
        const updatedInputs = { ...inputsRef.current, email: validEmail };
        setInputs(updatedInputs);

        addAgentMessage(`מעולה! שמרתי. ועכשיו...`);

        // Now go to confirmation
        setStep('CONFIRMATION');
        setTimeout(() => {
            addAgentMessage(generateSummaryMessage(updatedInputs));

            // Send ALL images side-by-side
            const imagesToReview = [];
            if (updatedInputs.characterImage) imagesToReview.push(updatedInputs.characterImage);
            if (updatedInputs.parentImage) imagesToReview.push(updatedInputs.parentImage);
            if (updatedInputs.thirdCharacterImage) imagesToReview.push(updatedInputs.thirdCharacterImage);

            if (imagesToReview.length > 0) {
                addAgentMultiImageMessage(imagesToReview, 1500);
            }
        }, 800);
    };

    const handleConfirm = () => {
        addUserMessage("תעשו מזה ספר");
        trackEvent('confirmed', {
            hasParent: Boolean(inputs.parentCharacter),
            hasThird: Boolean(inputs.thirdCharacter),
            hasEmail: Boolean(inputs.email),
        });
        setStep('COMPLETED');
        addAgentMessage(`מעולה! הכל מוכן. הספר נכנס לתנור... 🍿`);

        setTimeout(() => {
            onComplete(inputs);
        }, 3000);
    };

    const handleCorrection = (correction: string) => {
        addUserMessage(correction);
        const term = correction.trim().toLowerCase();

        // Check for off-topic questions
        const answer = getOffTopicAnswer(correction);
        if (answer) {
            addAgentMessage(answer);
            setTimeout(() => {
                addAgentMessage("ונחזור לענייננו... נמשיך עם מה שסיכמנו? (לחצו על הכפתור לאישור סופי)");
            }, 1000);
            return;
        }

        // Enter correction mode - after fixing, we return to CONFIRMATION
        setCorrectionMode(true);

        if (term.includes('שם')) {
            addAgentMessage("אין בעיה, בוא נשנה את השם. איך קוראים לגיבור/ה?");
            setStep('NAME');
            return;
        }
        if (term.includes('גיל')) {
            addAgentMessage("אין בעיה, בוא נתקן את הגיל. בן/בת כמה?");
            setStep('AGE');
            return;
        }
        if (term.includes('בן') || term.includes('בת') || term.includes('מגדר')) {
            addAgentMessage("אין בעיה, בוא נתקן. בן או בת?");
            setStep('GENDER');
            return;
        }
        if (term.includes('סיפור') || term.includes('עלילה') || term.includes('נושא')) {
            addAgentMessage("רוצים לשנות את העלילה? אין בעיה. על מה הסיפור?");
            setStep('TOPIC');
            return;
        }
        if (term.includes('סגנון') || term.includes('עיצוב')) {
            addAgentMessage("סבבה, בוא נבחר סגנון אחר.");
            setStep('STYLE');
            return;
        }

        // Check for photo replacement
        if (correction.includes('תמונה') || correction.includes('צילום') || correction.includes('להחליף')) {
            if (inputs.parentCharacter) {
                setStep('PHOTO_REPLACE_CLARIFY');
                addAgentMessage(`איזו תמונה תרצו להחליף? של ${inputs.childName} או של ${inputs.parentCharacter}?`);
                return;
            } else {
                addAgentMessage("אין בעיה, בואו נחליף תמונה! 📸");
                setStep('PHOTO_VALIDATION');
                return;
            }
        }

        // Generic fallback: couldn't determine what to fix
        setCorrectionMode(false); // Not a structured correction
        addAgentMessage("לא הצלחתי להבין מה בדיוק לתקן. נסו לכתוב: \"שם\", \"גיל\", \"סיפור\", \"סגנון\" או \"תמונה\" - ואני אקח אתכם לשלב הנכון.");
    };

    const handlePhotoReplacementClarify = (target: 'hero' | 'companion') => {
        const label = target === 'hero' ? inputs.childName : inputs.parentCharacter;
        addUserMessage(`להחליף את ${label}`);

        if (target === 'hero') {
            addAgentMessage(`מובן, בואו נחליף את התמונה של ${inputs.childName}. מחכה לתמונה החדשה...`);
            setStep('PHOTO_VALIDATION');
        } else {
            addAgentMessage(`מובן, בואו נחליף את התמונה של ${inputs.parentCharacter}. מחכה לתמונה החדשה...`);
            setStep('PARENT_PHOTO');
        }
    };

    // Use Ref to access latest inputs inside async operations/timeouts
    const inputsRef = useRef(inputs);
    useEffect(() => {
        inputsRef.current = inputs;
    }, [inputs]);

    // Helper: after a correction is applied, return to CONFIRMATION with updated summary
    const returnToConfirmation = useCallback((updatedInputs?: UserInputs) => {
        const data = updatedInputs || inputsRef.current;
        setCorrectionMode(false);
        setStep('CONFIRMATION');
        addAgentMessage(generateSummaryMessage(data));
    }, [addAgentMessage]);

    // Cropping State
    // Track if we're in "correction mode" from CONFIRMATION step
    // When set, after the user fixes one field, we jump back to CONFIRMATION
    const [correctionMode, setCorrectionMode] = useState(false);

    const [imageToCrop, setImageToCrop] = useState<string | null>(null);
    const [cropTarget, setCropTarget] = useState<'hero' | 'parent' | 'third'>('hero');
    const [pendingCroppedImage, setPendingCroppedImage] = useState<string | null>(null);
    const [isCropperOpen, setIsCropperOpen] = useState(false);

    // Handler for crop quality/retry decisions
    const handleCropRetryDecision = (decision: 'retry' | 'use_anyway' | 'new_photo') => {
        if (decision === 'retry') {
            setPendingCroppedImage(null);
            setIsCropperOpen(true); // Re-open cropper with same imageToCrop
            addUserMessage("אני רוצה לנסות לחתוך שוב ✂️");
        } else if (decision === 'use_anyway') {
            if (pendingCroppedImage) {
                addUserMessage("זה בסדר, השתמש בתמונה הזו 👍");
                processCroppedImage(pendingCroppedImage);
            }
        } else if (decision === 'new_photo') {
            setImageToCrop(null);
            setPendingCroppedImage(null);

            // Navigate back to correct upload step based on target
            if (cropTarget === 'hero') {
                setStep('PHOTO_VALIDATION');
            } else if (cropTarget === 'parent') {
                setStep('PARENT_PHOTO');
            } else if (cropTarget === 'third') {
                setStep('THIRD_PHOTO');
            }

            addUserMessage("אני אעלה תמונה אחרת 🖼️");
        }
    };

    const handleCropComplete = async (croppedBase64: string, width: number, height: number) => {
        setIsCropperOpen(false);

        // Quality Check
        if (width < 300 || height < 300) {
            setPendingCroppedImage(croppedBase64);
            setStep('CROP_QUALITY_CONFIRM');
            addAgentMessage("התמונה יצאה קצת קטנה. 😕 להשתמש בה בכל זאת או לנסות לחתוך מחדש?");
            return;
        }

        await processCroppedImage(croppedBase64);
    };

    const processCroppedImage = async (croppedBase64: string) => {
        // Clear pending if any
        setPendingCroppedImage(null);

        addUserImageMessage(croppedBase64);
        setIsTyping(true);

        try {
            // Determine who we are validating
            let validationName = inputs.childName;
            let validationAge = inputs.age;
            let charType: 'human' | 'pet' | 'toy' = 'human';

            if (cropTarget === 'parent') {
                validationName = inputs.parentName || 'הדמות'; // 'Parent'
                validationAge = inputs.parentAge || 35;
                charType = determineCharacterType(
                    inputs.parentCharacterRole || inputs.parentCharacter || 'parent',
                    inputs.parentName || inputs.parentCharacter
                );
            } else if (cropTarget === 'third') {
                // Third character might be a pet or friend
                validationName = 'הדמות השלישית';
                validationAge = 10; // Generic
                charType = determineCharacterType(
                    inputs.thirdCharacterRole || inputs.thirdCharacter || 'other',
                    inputs.thirdCharacter
                );
            }

            const validation = await validateCharacterPhoto(croppedBase64, validationAge, validationName, charType);
            if (!validation.isValid && validation.reason) {
                setIsTyping(false);
                setPendingCroppedImage(croppedBase64);

                addAgentMessage(validation.reason + "\nרוצים לנסות לחתוך שוב את התמונה המקורית?");
                setStep('CROP_RETRY_CONFIRM');
                return;
            }

            // Success!
            setImageToCrop(null);
            setIsTyping(false);

            if (cropTarget === 'hero') {
                setInputs(prev => ({ ...prev, characterImage: croppedBase64 }));
                trackEvent('photo_uploaded', { target: 'hero', cropped: true });
                addAgentMessage("איזה יופי! תמונה מעולה. 😍");
                setTimeout(() => {
                    // Smart logic for existing topic - use Ref to get LATEST state
                    const currentInputs = inputsRef.current;

                    if (currentInputs.topic && currentInputs.topic.length >= 2) {
                        setStep('TOPIC');
                        addAgentMessage(`אוקיי, הגיע הזמן לכתוב את הסיפור של ${currentInputs.childName}. אז אמרנו ש"${currentInputs.topic}", רוצה להרחיב או לשנות? (אם לא, פשוט לחצו "המשך")`);
                        return;
                    }

                    setStep('TOPIC');
                    const isGirl = currentInputs.gender === 'girl';
                    const age = currentInputs.age || 0;

                    let example = "";
                    if (age < 13) {
                        example = `"${currentInputs.childName} מוצאת ביצת דרקון ביער"`;
                    } else if (age < 40) {
                        example = `"${currentInputs.childName} עוברת לדירה ראשונה בתל אביב"`;
                    } else if (age < 60) {
                        example = `"${currentInputs.childName} משיקה סטארט-אפ מצליח"`;
                    } else {
                        example = `"${currentInputs.childName} יוצאת למסע מסביב לעולם אחרי הפרישה"`;
                    }

                    // Adjust for male
                    if (!isGirl) {
                        example = example.replace('מוצאת', 'מוצא').replace('עוברת', 'עובר').replace('משיקה', 'משיק').replace('יוצאת', 'יוצא');
                    }

                    addAgentMessage(`אוקיי, הגיע הזמן לכתוב את הסיפור של ${currentInputs.childName}. תנו לי כיוון קליל או מצחיק. למשל: ${example}`);
                }, 1000);

            } else if (cropTarget === 'parent') {
                setInputs(prev => ({ ...prev, parentImage: croppedBase64 }));
                trackEvent('photo_uploaded', {
                    target: 'parent',
                    role: inputs.parentCharacterRole || inputs.parentCharacter || 'unknown',
                    cropped: true,
                });
                setStep('THIRD_CHOICE');
                addAgentMessage(`תמונה מעולה! 😍 יש עוד דמות שתרצו להוסיף? (אח, אחות, חיית מחמד...)`);
            } else if (cropTarget === 'third') {
                setInputs(prev => ({ ...prev, thirdCharacterImage: croppedBase64 }));
                trackEvent('photo_uploaded', {
                    target: 'third',
                    role: inputs.thirdCharacterRole || inputs.thirdCharacter || 'unknown',
                    cropped: true,
                });
                setStep('STYLE');
                addAgentMessage(`נשאר רק לבחור סגנון לספר:`);
            }

        } catch (error) {
            console.error("Crop validation error", error);
            addAgentMessage("משהו השתבש בעיבוד התמונה. נסה שוב?");
        }
    }

    return {
        messages,
        inputs,
        setInputs,
        step,
        isTyping,
        suggestedTitles,
        isGeneratingTitles,
        handlers: {
            handleStart,
            handleNameSubmit,
            handleNameConfirm,
            handleGenderSubmit,
            handleAgeSubmit,
            handleChildPhotoUpload,
            handleTopicSubmit,
            handleAdditionalCharacterChoice,
            handleParentPhotoUpload,
            handleStyleSelect,
            handleDedicationSubmit,
            handleEmailSubmit,
            handleConfirm,
            handleCorrection,
            handlePhotoReplacementClarify,
            handleThirdCharacterChoice,
            handleThirdPhotoUpload,
            handleCharDetailsSubmit,
            handleCropComplete, // Exported
            setIsCropperOpen, // Exported
            handleCropRetryDecision // Exported
        },
        imageToCrop, // Exported
        isCropperOpen // Exported
    };
};
