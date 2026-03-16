// Mock data for testing without incurring API costs (global mock mode)

const MOCK_USAGE = { input: 0, output: 0 };

export const MOCK_STORY_RESPONSE = {
    title: "ההרפתקה הקסומה של בדיקה",
    segments: [
        "בדיקה היה ילד סקרן שאהב לחקור את העולם.",
        "יום אחד, הוא מצא מפה עתיקה בתוך ספר ישן בספרייה.",
        "המפה הובילה ליער קסום בקצה העיר.",
        "בדיקה ארז תיק עם תפוח, פנס וזכוכית מגדלת.",
        "ביער, העצים לחשו סודות והרוח ניגנה מנגינות.",
        "פתאום, הוא פגש שועל מדבר עם משקפיים.",
        "בדיקה חשב וחשב, ולבסוף ענה נכון!",
        "השועל חייך והוביל אותו למערה נסתרת.",
        "בתוך המערה זוהרו קריסטלים, ובדיקה גילה אומץ חדש.",
        "הוא חזר הביתה שמח, וידע שהקסם נמצא גם בתוכו."
    ],
    promptToken: "MOCK_TOKEN_SECRET_BYPASS",
    usage: { input: 0, output: 0 }
};

export const MOCK_STORY_STAGES = {
    extractEntity: {
        text: JSON.stringify({
            hero_name: "בדיקה",
            hero_gender: "male",
            hero_age: 6,
            reply_text: "וואו, בדיקה זה שם מצוין לגיבור!",
            next_step: "ask_topic"
        }),
        usage: MOCK_USAGE
    }
};

/** Build dynamic mock response based on request body (for global mock mode) */
export function buildMockExtractEntity(text) {
    const name = (text || '').trim() || 'ילד';
    return {
        text: JSON.stringify({
            hero_name: name,
            hero_gender: null,
            hero_age: null,
            reply_text: `${name} שם מהמם! בן או בת?`,
            next_step: 'ask_gender'
        }),
        usage: MOCK_USAGE
    };
}

export function buildMockRefineConcept(currentTopic, newDetails) {
    return { text: `${currentTopic || ''}. ${newDetails || ''}`.trim(), usage: MOCK_USAGE };
}

export function buildMockValidatePhoto() {
    return { text: JSON.stringify({ isValid: true, faceCount: 1 }), usage: MOCK_USAGE };
}

export function buildMockAnalyzeFeatures() {
    return { text: 'Hair: brown, short. Face: round. Distinctive: none.', usage: MOCK_USAGE };
}

export function buildMockGenerateTitles(childName, topic) {
    const c = childName || 'ילד';
    const t = topic || 'נושא';
    return { text: `${c} וגן החלומות\nההרפתקה של ${c}\n${c} ו${t}`, usage: MOCK_USAGE };
}

export function buildMockAlternativeTitles(storyTitle) {
    const t = storyTitle || 'סיפור';
    return { text: `${t} (חלופה 1)\n${t} (חלופה 2)\n${t} (חלופה 3)`, usage: MOCK_USAGE };
}

export function buildMockGenerateStory(inputs) {
    const name = inputs?.childName || 'בדיקה';
    const title = `ההרפתקה הקסומה של ${name}`;
    const segments = Array(10).fill(`פסקה על ${name}.`);
    return {
        title,
        segments,
        promptToken: 'MOCK_TOKEN_SECRET_BYPASS',
        usage: MOCK_USAGE
    };
}

// Tiny placeholder image for mock generation flow.
export const MOCK_IMAGE_DATA = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4gYCFg4x71491QAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAAMklEQVQI12P8//8/AwMjI5SAieH///+M//8zMgLEEygBZDAxMPz/DwQn/v//j4+RkREAAJmCD/5W74oAAAAASUVORK5CYII=";
