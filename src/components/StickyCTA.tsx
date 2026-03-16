import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface StickyCTAProps {
  onStart?: () => void;
}

export default function StickyCTA({ onStart }: StickyCTAProps) {
  const { t } = useTranslation();
  const stickyCtaRef = useRef<HTMLDivElement>(null);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const hero = document.querySelector('.section-hero');
    const sticky = stickyCtaRef.current;

    if (!hero || !sticky) return;

    const updateVisibility = () => {
      const currentScrollY = window.scrollY;
      const heroRect = hero.getBoundingClientRect();
      const heroHasPassed = heroRect.bottom <= 80;
      const isScrollingDown = currentScrollY > lastScrollYRef.current;

      if (!heroHasPassed || !isScrollingDown) {
        sticky.classList.remove('show');
      } else {
        sticky.classList.add('show');
      }

      lastScrollYRef.current = currentScrollY;
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });

    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  return (
    <div ref={stickyCtaRef} className="mobile-sticky-cta">
      <Button
        className="btn-primary w-full h-14 text-base font-bold"
        onClick={onStart}
      >
        {t('hero.cta')}
      </Button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('support-chat:toggle'))}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white text-base font-bold text-black shadow-[0_10px_24px_-18px_rgba(0,0,0,0.45)]"
        aria-label="פתיחת עוזר תמיכה"
      >
        <span>יש לך שאלה?</span>
      </button>
    </div>
  );
}
