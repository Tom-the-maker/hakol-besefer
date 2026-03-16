'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState('he'); // Default to match server

  // Only update after hydration to prevent mismatch
  useEffect(() => {
    setMounted(true);
    setCurrentLanguage(i18n.language);
    
    // Listen for language changes
    const handleLanguageChange = (lng: string) => {
      setCurrentLanguage(lng);
    };
    
    i18n.on('languageChanged', handleLanguageChange);
    
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  const toggleLanguage = () => {
    const newLanguage = currentLanguage === 'en' ? 'he' : 'en';
    i18n.changeLanguage(newLanguage);
    
    // Explicitly save to localStorage to ensure persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('i18nextLng', newLanguage);
      document.documentElement.dir = newLanguage === 'he' ? 'rtl' : 'ltr';
      document.documentElement.lang = newLanguage;
    }
  };

  // Use currentLanguage state to prevent hydration mismatch
  const targetLanguage = currentLanguage === 'he' ? 'EN' : 'HEB';

  return (
    <button
      onClick={toggleLanguage}
      className="text-[#8B572A] hover:text-[#5F3E20] transition-colors font-semibold"
      suppressHydrationWarning
    >
      {targetLanguage}
    </button>
  );
};

export default LanguageSwitcher; 