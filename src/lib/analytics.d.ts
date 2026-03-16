export type EventName = 'page_view' | 'hero_input_start' | 'chat_start' | 'chat_step' | 'chat_input' | 'chat_parse' | 'photo_uploaded' | 'style_selected' | 'confirmed' | 'book_generated' | 'book_viewed' | 'register_start' | 'register_complete' | 'payment_start' | 'payment_complete' | 'book_shared' | 'pdf_downloaded' | 'ui_click' | 'ui_scroll' | 'ui_input';
export declare function trackEvent(eventName: EventName, eventData?: Record<string, unknown>, page?: string): void;
export declare function trackPageView(page: string): void;
export declare function initExternalAnalytics(): void;
export declare function initUiJourneyTelemetry(): () => void;
export {};
