import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { UserMenu } from './AuthModal';

interface NavbarProps {
  onStartCoCreation?: () => void;
  onLogoClick?: () => void;
  onMyBooks?: () => void;
  onLoginClick?: () => void;
}

const Navbar = ({ onStartCoCreation, onLogoClick, onMyBooks, onLoginClick }: NavbarProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
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

  useEffect(() => {
    const handleScroll = () => {
      // Only apply hide-on-scroll behavior on mobile (≤767px)
      if (window.innerWidth > 767) {
        setIsNavbarVisible(true);
        return;
      }

      const currentScrollY = window.scrollY;

      // Show navbar when scrolling up or at the top
      if (currentScrollY < lastScrollY || currentScrollY < 10) {
        setIsNavbarVisible(true);
      }
      // Hide navbar when scrolling down (and not at the very top)
      else if (currentScrollY > lastScrollY && currentScrollY > 80) {
        setIsNavbarVisible(false);
        setIsMobileMenuOpen(false); // Close mobile menu when hiding navbar
      }

      setLastScrollY(currentScrollY);
    };

    const handleResize = () => {
      // Always show navbar on desktop when resizing
      if (window.innerWidth > 767) {
        setIsNavbarVisible(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [lastScrollY]);

  const handleLogoClick = () => {
    if (onLogoClick) {
      onLogoClick();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <header className={`navbar fixed top-0 left-0 right-0 z-50 py-2 md:py-2 bg-white backdrop-blur-sm shadow-sm transition-transform duration-300 ease-in-out ${isNavbarVisible ? 'translate-y-0' : '-translate-y-full'
      }`}>
      {/* Desktop navbar with same width as MainContainer */}
      <div className="hidden md:flex mx-auto max-w-[1300px] px-4 md:px-8 justify-between items-center pt-1">
        {/* Desktop Navigation */}
        <nav className="flex items-center gap-8">
          <div onClick={onStartCoCreation} style={{ cursor: 'pointer' }}>
            <Button
              className="font-semibold"
              style={{
                backgroundColor: '#FFC735',
                color: '#1D1D1F',
                height: '38px',
                padding: '0 20px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '19px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 120ms ease-out'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.08)';
              }}
              suppressHydrationWarning
            >
              {mounted ? t('nav.createBook') : 'צור ספר'}
            </Button>
          </div>
          {user ? (
            <UserMenu onMyBooks={onMyBooks || (() => { })} />
          ) : (
            <button onClick={onLoginClick} className="font-medium hover:text-[#FFC72C] transition-colors" style={{ color: '#1D1D1F' }} suppressHydrationWarning>
              כניסה / הספרים שלי
            </button>
          )}
        </nav>

        <Logo onClick={handleLogoClick} imageClassName="h-5 md:h-9" />
      </div>

      {/* Mobile navbar with same width as MainContainer */}
      <div className="flex md:hidden h-10 mx-auto max-w-[1300px] px-4 items-center justify-between pt-0">
        {/* Mobile Hamburger Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="h-8 w-8 p-0"
        >
          {isMobileMenuOpen ? (
            <X className="h-5 w-5" strokeWidth={2.75} style={{ color: '#1D1D1F' }} />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={2.75} style={{ color: '#1D1D1F' }} />
          )}
        </Button>

        <button
          type="button"
          onClick={handleLogoClick}
          className="inline-flex items-center"
          aria-label="סוףסיפור"
        >
          <img
            src="/logo/Logo_Wide.png"
            alt="סוףסיפור"
            className="h-[19px] w-auto object-contain block shrink-0"
          />
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-[1300px] px-4 py-5">
            <nav className="flex flex-col gap-3">
              <div onClick={() => { setIsMobileMenuOpen(false); onStartCoCreation?.(); }} style={{ cursor: 'pointer' }}>
                <Button
                  className="font-semibold w-full"
                  style={{
                    backgroundColor: '#FFC735',
                    color: '#1D1D1F',
                    height: '38px',
                    padding: '0 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: '19px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  suppressHydrationWarning
                >
                  {mounted ? t('nav.createBook') : 'צור ספר'}
                </Button>
              </div>
              {user ? (
                <button
                  className="w-full h-[38px] flex items-center justify-center px-5 rounded-full border-2 border-gray-200 bg-[#F4F5F7] text-[14px] font-semibold text-black hover:border-[#f6c85b] hover:bg-[#f6c85b]/10 transition-all"
                  style={{ color: '#000000' }}
                  onClick={() => { setIsMobileMenuOpen(false); onMyBooks?.(); }}
                  suppressHydrationWarning
                >
                  הספרים שלי
                </button>
              ) : (
                <button
                  className="w-full h-[38px] flex items-center justify-center px-5 rounded-full border-2 border-gray-200 bg-[#F4F5F7] text-[14px] font-semibold text-black hover:border-[#f6c85b] hover:bg-[#f6c85b]/10 transition-all"
                  style={{ color: '#000000' }}
                  onClick={() => { setIsMobileMenuOpen(false); onLoginClick?.(); }}
                  suppressHydrationWarning
                >
                  כניסה / הספרים שלי
                </button>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
