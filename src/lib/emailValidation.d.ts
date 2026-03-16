/**
 * Comprehensive Email Validation Library
 *
 * Features:
 * 1. Strict Regex Validation (Structure)
 * 2. Disposable Email Blocking
 * 3. Domain Typo Suggestions (gamil.com -> gmail.com)
 * 4. Profanity/Spam Blocking in local part
 */
interface ValidationResult {
    isValid: boolean;
    error?: string;
    suggestion?: string;
    isWarning?: boolean;
}
export declare const validateEmail: (email: string) => ValidationResult;
export {};
