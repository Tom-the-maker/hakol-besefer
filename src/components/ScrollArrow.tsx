'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

const ScrollArrow = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(true);

  const scrollToNextSection = () => {
    const nextSection = document.getElementById('how-it-works');
    if (nextSection) {
      nextSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      // Hide the arrow after scrolling
      setTimeout(() => {
        setIsVisible(false);
      }, 800);
    }
  };

  // Hide arrow when user scrolls manually
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 200;
      if (scrolled) {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="flex justify-center items-center cursor-pointer scroll-arrow-container"
      onClick={scrollToNextSection}
      style={{
        paddingTop: '16px',
        paddingBottom: '32px', // Smaller gap between hero and bestseller
        backgroundColor: 'transparent'
      }}
    >
      <div
        className="scroll-arrow-wrapper"
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          animation: 'bounce 2s infinite',
          gap: '12px'
        }}
      >
        <div
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#666666',
            textAlign: 'center'
          }}
        >
          {t('scroll.scroll')}
        </div>
        <div
          className="arrow-circle"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#FFC735',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 120ms ease-out'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
          }}
        >
          <ChevronDown
            size={24}
            style={{ color: '#1D1D1F' }}
          />
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#666666',
            textAlign: 'center'
          }}
        >
          {t('scroll.down')}
        </div>
      </div>
    </div>
  );
};

export default ScrollArrow; 