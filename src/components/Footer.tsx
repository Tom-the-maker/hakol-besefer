import React from 'react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';

const Footer = () => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  // Official brand yellow from DESIGN_RULES.md
  const brandYellow = '#f6c85b';

  const footerLinks = [
    { href: '/terms', label: 'תנאי שימוש' },
    { href: '/privacy', label: 'מדיניות פרטיות' },
    { href: '/cancellation', label: 'ביטולים והחזרים' },
    { href: '/accessibility', label: 'הצהרת נגישות' },
    { href: '/contact', label: 'צור קשר' },
  ];

  return (
    <footer className="py-16 md:pt-[72px] md:pb-24 mt-16" style={{ backgroundColor: brandYellow, direction: isRTL ? 'rtl' : 'ltr' }}>
      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 md:px-8 flex flex-col space-y-8">

        {/* Top Section: Logo & Description */}
        <div className="flex flex-col items-center text-center space-y-4">
          <Logo
            src="/logo/Logo_Tall_white.png"
            imageClassName="h-[180px] md:h-[240px] w-auto opacity-90"
          />
          <p className="font-heading text-black font-normal text-sm md:text-base" style={{ color: '#000000' }}>
            נבנה באמצעות בינה מלאכותית, נוצר באהבה
            <br className="md:hidden" />
            <span className="hidden md:inline"> </span>
            לאנשים אמיתיים.
          </p>
        </div>

        {/* Bottom Section: Links + Copyright */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm md:text-base pt-6 border-t-2 border-black/10">

          {/* Links — vertical on mobile, horizontal on desktop */}
          <div className="order-2 md:order-1">
            {/* Mobile: vertical stack */}
            <div className="flex flex-col items-center gap-2 md:hidden">
              {footerLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-black hover:underline underline-offset-4 py-1 text-base font-normal"
                  style={{ color: '#000000' }}
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Desktop: horizontal with pipes */}
            <div className="hidden md:flex flex-wrap gap-x-2 gap-y-1 items-center text-black" style={{ color: '#000000' }}>
              {footerLinks.map((link, i) => (
                <React.Fragment key={link.href}>
                  <a href={link.href} className="hover:underline underline-offset-4">{link.label}</a>
                  {i < footerLinks.length - 1 && <span className="opacity-30">|</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Copyright */}
          <div className="text-black font-normal order-1 md:order-2" style={{ color: '#000000' }}>
            סוףסיפור © 2026
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
