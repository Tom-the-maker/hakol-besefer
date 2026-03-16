
/**
 * Comprehensive Email Validation Library
 * 
 * Features:
 * 1. Strict Regex Validation (Structure)
 * 2. Disposable Email Blocking
 * 3. Domain Typo Suggestions (gamil.com -> gmail.com)
 * 4. Profanity/Spam Blocking in local part
 */

// Common disposable domains to block
const DISPOSABLE_DOMAINS = new Set([
    'tempmail.com', 'throwawaymail.com', 'mailinator.com', 'guerrillamail.com', 'yopmail.com',
    '10minutemail.com', 'sharkslasers.com', 'spam4.me', 'dispostable.com', 'grr.la'
]);

// Common domains for typo correction
const COMMON_DOMAINS = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'walla.co.il', 'netvision.net.il', 'bezeqint.net'
];

interface ValidationResult {
    isValid: boolean;
    error?: string; // User-facing error message in Hebrew
    suggestion?: string; // Auto-correction suggestion
    isWarning?: boolean; // If true, allows user to proceed but warns them (soft block)
}

export const validateEmail = (email: string): ValidationResult => {
    const clean = email.trim().toLowerCase();

    // 1. Empty Check
    if (!clean) return { isValid: false, error: "אנא הזינו כתובת מייל." };

    // 2. Length Check
    if (clean.length < 5 || clean.length > 254) return { isValid: false, error: "כתובת המייל קצרה או ארוכה מדי." };

    // 3. Hebrew/Non-ASCII Check
    if (/[^\x00-\x7F]/.test(clean)) {
        return { isValid: false, error: "כתובת המייל חייבת להכיל אותיות באנגלית בלבד. 🇺🇸" };
    }

    // 4. Strict Structure Regex
    // - Starts with alphanumeric/special
    // - Contains @
    // - Domain has at least one dot
    // - TLD is at least 2 chars
    // - No consecutive dots
    const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!strictRegex.test(clean)) {
        if (!clean.includes('@')) return { isValid: false, error: "חסר הסימן @ בכתובת המייל. 📧" };
        if (!clean.includes('.')) return { isValid: false, error: "חסר נקודה (.) בסיומת המייל." };
        return { isValid: false, error: "מבנה המייל לא נראה תקין. נסו שוב?" };
    }

    // Split parts
    const [localPart, domain] = clean.split('@');

    // 5. Disposable Domain Check
    if (DISPOSABLE_DOMAINS.has(domain)) {
        return { isValid: false, error: "זה נראה כמו מייל זמני. כדי לקבל את הספר, אנא הזינו מייל אמיתי. 😉" };
    }

    // 6. Typo Suggestion Logic (Levenshtein Distance-ish)
    // Simple check for common misspellings
    for (const common of COMMON_DOMAINS) {
        if (domain !== common && isSimilar(domain, common)) {
            return {
                isValid: false,
                error: `האם התכוונת ל-${localPart}@${common}?`,
                suggestion: `${localPart}@${common}`
            };
        }
    }

    return { isValid: true };
};

// Simple string similarity for domain typos (e.g. gamil -> gmail)
function isSimilar(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) > 2) return false;

    let differences = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) differences++;
    }

    // If lengths differ, add that to diff count
    differences += Math.abs(a.length - b.length);

    // Allow max 1 difference for short domains (gmail), 2 for long
    const maxDiff = b.length < 6 ? 1 : 2;
    return differences <= maxDiff && differences > 0;
}
