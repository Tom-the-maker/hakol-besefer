import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import en from './locales/en.json';
import he from './locales/he.json';

const resources = {
  en: {
    translation: en
  },
  he: {
    translation: he
  }
};

// Initialize i18n - always start with Hebrew to match server-side rendering
// Language will be updated after hydration to match localStorage
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'he', // Always start with Hebrew to match server
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

// Client-side: Update language from localStorage after initialization
if (typeof window !== 'undefined') {
  // Set document direction based on language
  const setDocumentDirection = (lng: string) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr';
      document.documentElement.lang = lng;
    }
  };

  // Set direction on initialization (will be Hebrew initially)
  setDocumentDirection(i18n.language);

  // Update language from localStorage after a short delay to allow hydration
  // This prevents hydration mismatch while still applying saved preference
  setTimeout(() => {
    const savedLanguage = localStorage.getItem('i18nextLng');
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'he')) {
      if (savedLanguage !== i18n.language) {
        i18n.changeLanguage(savedLanguage);
      }
    } else {
      // No saved preference, save current (Hebrew) to localStorage
      localStorage.setItem('i18nextLng', i18n.language);
    }
  }, 0);

  // Listen for language changes and save to localStorage
  i18n.on('languageChanged', (lng: string) => {
    setDocumentDirection(lng);
    // Explicitly save to localStorage
    localStorage.setItem('i18nextLng', lng);
  });
}

export default i18n;