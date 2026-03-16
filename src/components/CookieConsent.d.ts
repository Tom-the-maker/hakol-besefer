import React from 'react';
type ConsentState = {
    essential: true;
    analytics: boolean;
    marketing: boolean;
};
export declare function getCookieConsent(): ConsentState | null;
export declare function hasAnalyticsConsent(): boolean;
export declare function hasMarketingConsent(): boolean;
export declare const CookieConsent: React.FC;
export {};
