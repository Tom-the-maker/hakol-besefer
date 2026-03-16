import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

type ConsentState = {
  essential: true; // Always true
  analytics: boolean;
  marketing: boolean;
};

const CONSENT_KEY = 'cookie_consent';

export function getCookieConsent(): ConsentState | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  const consent = getCookieConsent();
  return consent?.analytics ?? false;
}

export function hasMarketingConsent(): boolean {
  const consent = getCookieConsent();
  return consent?.marketing ?? false;
}

export const CookieConsent: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const devPopup = params.get('devPopup');
    if (devPopup === 'cookie' || devPopup === 'cookie-details') {
      setVisible(true);
      setShowDetails(devPopup === 'cookie-details');
      return;
    }

    const existing = getCookieConsent();
    if (!existing) {
      // Show banner after a short delay
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const saveConsent = (consent: ConsentState) => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    setVisible(false);

    // Dispatch custom event so analytics module can react
    window.dispatchEvent(new CustomEvent('cookie_consent_updated', { detail: consent }));
  };

  const acceptAll = () => {
    saveConsent({ essential: true, analytics: true, marketing: true });
  };

  const acceptSelected = () => {
    saveConsent({ essential: true, analytics, marketing });
  };

  const rejectNonEssential = () => {
    saveConsent({ essential: true, analytics: false, marketing: false });
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[9999] p-4 sm:p-6" dir="rtl">
      <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={18} className="text-[#4b947d]" />
            <span className="font-heading font-bold text-base text-black" style={{ color: '#000000' }}>
              פרטיות ועוגיות
            </span>
          </div>
          <p className="text-sm text-black/70 leading-relaxed font-normal">
            אנחנו משתמשים בעוגיות כדי להבטיח את תפקוד האתר ולשפר את חוויית המשתמש.
            ניתן לבחור אילו סוגי עוגיות להפעיל.{' '}
            <a href="/privacy" className="underline text-black/80 hover:text-black">מדיניות פרטיות</a>
          </p>
        </div>

        {/* Details toggle */}
        {showDetails && (
          <div className="px-5 pb-3 space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
              <div>
                <p className="text-sm font-bold text-black" style={{ color: '#000000' }}>הכרחיות</p>
                <p className="text-xs text-black/50 font-normal">נדרשות לתפקוד האתר</p>
              </div>
              <div className="w-10 h-6 bg-[#4b947d] rounded-full relative">
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full" />
              </div>
            </div>

            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl cursor-pointer">
              <div>
                <p className="text-sm font-bold text-black" style={{ color: '#000000' }}>אנליטיקה (Google Analytics)</p>
                <p className="text-xs text-black/50 font-normal">ניתוח שימוש אנונימי</p>
              </div>
              <button
                onClick={() => setAnalytics(!analytics)}
                className={`w-10 h-6 rounded-full relative transition-colors ${analytics ? 'bg-[#4b947d]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${analytics ? 'left-0.5' : 'right-0.5'}`} />
              </button>
            </label>

            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl cursor-pointer">
              <div>
                <p className="text-sm font-bold text-black" style={{ color: '#000000' }}>שיווק (Facebook Pixel)</p>
                <p className="text-xs text-black/50 font-normal">מעקב המרות ופרסום</p>
              </div>
              <button
                onClick={() => setMarketing(!marketing)}
                className={`w-10 h-6 rounded-full relative transition-colors ${marketing ? 'bg-[#4b947d]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${marketing ? 'left-0.5' : 'right-0.5'}`} />
              </button>
            </label>
          </div>
        )}

        {/* Action buttons */}
        <div className="p-5 pt-2 flex flex-wrap gap-2">
          <button
            onClick={acceptAll}
            className="flex-1 min-w-[120px] py-2.5 bg-[#F9C922] hover:bg-[#e6b61f] text-black font-bold text-sm rounded-full transition-all"
          >
            קבל הכל
          </button>
          {showDetails ? (
            <button
              onClick={acceptSelected}
              className="flex-1 min-w-[120px] py-2.5 bg-gray-100 hover:bg-gray-200 text-black font-bold text-sm rounded-full transition-all"
            >
              שמור בחירה
            </button>
          ) : (
            <button
              onClick={() => setShowDetails(true)}
              className="flex-1 min-w-[120px] py-2.5 bg-gray-100 hover:bg-gray-200 text-black font-bold text-sm rounded-full transition-all"
            >
              העדפות
            </button>
          )}
          <button
            onClick={rejectNonEssential}
            className="flex-1 min-w-[120px] py-2.5 bg-white hover:bg-gray-50 text-black/60 font-bold text-sm rounded-full transition-all border border-gray-200"
          >
            הכרחיות בלבד
          </button>
        </div>
      </div>
    </div>
  );
};
