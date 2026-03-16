/**
 * Client helper for "book ready" email notification.
 */
export declare const sendReadyEmail: (email: string, bookSlug: string, bookTitle: string) => Promise<boolean>;
