/**
 * Global mock mode - when active, all /api/ai calls return mock data (no external AI costs).
 * Activated via ?mock=1 in URL (sets cookie) or manually.
 */
export declare function isMockMode(): boolean;
export declare function logAiMode(source?: string): void;
export declare function setMockMode(): void;
export declare function clearMockMode(): void;
/** Call on app init - activates mock if ?mock=1 in URL */
export declare function initMockModeFromUrl(): boolean;
