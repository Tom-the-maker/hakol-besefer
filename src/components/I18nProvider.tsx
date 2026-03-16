import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/client';

interface I18nProviderProps {
  children: React.ReactNode;
}

export default function I18nProvider({ children }: I18nProviderProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Mark as client-side to prevent hydration mismatch
    setIsClient(true);
    
    // Load saved language preference and apply it after hydration
    // This happens after initial render to prevent hydration mismatch
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem('i18nextLng');
      
      // If there's a saved language and it's different from current, change it
      if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'he')) {
        if (savedLanguage !== i18n.language) {
          // Use requestAnimationFrame to ensure this happens after React hydration
          requestAnimationFrame(() => {
            i18n.changeLanguage(savedLanguage);
            // Update document attributes
            document.documentElement.dir = savedLanguage === 'he' ? 'rtl' : 'ltr';
            document.documentElement.lang = savedLanguage;
          });
        }
      } else {
        // No saved preference, ensure localStorage has current language
        localStorage.setItem('i18nextLng', i18n.language);
      }
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <div suppressHydrationWarning={!isClient}>
        {children}
      </div>
    </I18nextProvider>
  );
}