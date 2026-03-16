import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

interface HeroProps {
    onStart: (initialTopic?: string) => void;
    inputValue: string;
    onInputChange: (value: string) => void;
}

const Hero: React.FC<HeroProps> = ({ onStart, inputValue, onInputChange }) => {
    const { t } = useTranslation();
    const [mounted, setMounted] = useState(false);
    const showHeroPrompt = false;
    // Removed local inputValue state in favor of props
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Mobile hero images rotation - loading existing JPGs (optimized)
    const mobileHeroImages = [
        '/mobilehero/BM_HERO_mobile_couple_02.jpg',
        '/mobilehero/BM_HERO_mobile_grand_02.jpg',
        '/mobilehero/BM_HERO_mobile_kid_02.jpg',
        '/mobilehero/BM_HERO_mobile_office_02.jpg'
    ];
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Static placeholder text for mobile
    const staticPlaceholder = "את מי אנחנו הופכים היום לאגדה?";

    useEffect(() => {
        setMounted(true);
    }, []);

    // Rotate mobile hero images every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentImageIndex((prevIndex) => (prevIndex + 1) % mobileHeroImages.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [mobileHeroImages.length]);

    // Force textarea alignment to right on mobile - match placeholder position
    useEffect(() => {
        if (!showHeroPrompt) return;
        if (textareaRef.current) {
            // Force right alignment
            textareaRef.current.style.setProperty('text-align', 'right', 'important');
            textareaRef.current.style.setProperty('direction', 'rtl', 'important');
            // Scroll to right to show text from the right side (match placeholder position)
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.scrollLeft = textareaRef.current.scrollWidth;
                }
            }, 10);
        }
    }, [inputValue]);

    // Also set on mount
    useEffect(() => {
        if (!showHeroPrompt) return;
        if (textareaRef.current) {
            textareaRef.current.style.setProperty('text-align', 'right', 'important');
            textareaRef.current.style.setProperty('direction', 'rtl', 'important');
        }
    }, [showHeroPrompt]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onStart(inputValue.trim() || undefined);
    };

    return (
        <section className="pt-2 md:pt-24 pb-12 md:pb-16 section-hero">
            <div className="bg-surfaceLight rounded-card border border-gray-200 pt-6 pb-0 md:py-12 px-4 md:px-16 text-center overflow-hidden">

                {/* Main Headings - Only one h1 for SEO, h2 for sub */}
                <h1 className="font-heading font-extrabold text-black mb-1 md:mb-4 text-2xl sm:text-3xl md:text-5xl lg:text-6xl leading-tight px-2" suppressHydrationWarning>
                    {mounted ? t('hero.title') : 'החיים שלכם הם חומר לספר'}
                </h1>
                <h2 className="font-heading font-normal text-black mb-6 md:mb-8 text-lg sm:text-xl md:text-xl leading-relaxed px-1 md:px-4 max-w-4xl mx-auto hero-subtitle-mobile" suppressHydrationWarning>
                    <span className="md:hidden block">
                        <span className="hero-subtitle-line1">הפכו רגעים מהחיים או המצאות מהדמיון</span><br />
                        <span className="hero-subtitle-line2">לספר מאויר, אישי ובלתי נשכח</span>
                    </span>
                    <span className="hidden md:block">
                        {mounted ? t('hero.subtitle') : 'הפכו רגעים אמיתיים מהחיים או המצאות פרועות מהדמיון לספר מאויר, אישי ובלתי נשכח'}
                    </span>
                </h2>

                {/* Hero prompt is temporarily hidden, but the full input UI stays here behind a flag so it can be restored quickly later. */}
                <div className="max-w-3xl mx-auto mb-10 relative z-20">
                    {showHeroPrompt ? (
                        <>
                            <style>
                                {`
                                @keyframes blink {
                                    0%, 100% { opacity: 1; }
                                    50% { opacity: 0; }
                                }
                                .animate-cursor-blink {
                                    animation: blink 1s step-end infinite;
                                }
                                @media (max-width: 767px) {
                                    .hero-textarea-mobile {
                                        text-align: right !important;
                                        direction: rtl !important;
                                        unicode-bidi: embed !important;
                                        caret-color: #FFC72C !important;
                                    }
                                    .hero-textarea-mobile::placeholder {
                                        text-align: right !important;
                                        direction: rtl !important;
                                    }
                                    .hero-textarea-mobile::selection {
                                        background-color: rgba(255, 199, 44, 0.2);
                                    }
                                }
                                `}
                            </style>
                            <form onSubmit={handleSubmit} className="relative group">
                                {/* Mobile: textarea with button at bottom */}
                                <div className="relative md:hidden">
                                    <textarea
                                        ref={textareaRef}
                                        value={inputValue}
                                        onChange={(e) => {
                                            onInputChange(e.target.value);
                                        }}
                                        rows={2}
                                        className="w-full min-h-[70px] px-4 pb-12 pr-3 rounded-[2rem] border-2 border-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:shadow-lg focus:border-[#FFC72C] focus:ring-4 focus:ring-[#FFC72C]/20 outline-none transition-all text-lg font-medium resize-none overflow-hidden hero-textarea-mobile"
                                        placeholder=""
                                        dir="rtl"
                                        style={{
                                            backgroundColor: '#fff',
                                            textAlign: 'right',
                                            direction: 'rtl',
                                            paddingTop: '0.875rem',
                                            paddingRight: '0.75rem',
                                            paddingLeft: '4rem',
                                            unicodeBidi: 'embed',
                                            textIndent: '0',
                                            caretColor: '#FFC72C'
                                        }}
                                        onInput={(e) => {
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                            target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                                            setTimeout(() => {
                                                target.scrollLeft = target.scrollWidth;
                                            }, 0);
                                        }}
                                        onFocus={(e) => {
                                            setTimeout(() => {
                                                e.target.scrollLeft = e.target.scrollWidth;
                                            }, 0);
                                        }}
                                    />

                                    {!inputValue && (
                                        <div className="absolute inset-0 right-0 flex items-start justify-end pt-4 pr-3 pointer-events-none" dir="rtl" style={{ textAlign: 'right' }}>
                                            <span className="text-gray-400 font-normal text-lg leading-relaxed" style={{ textAlign: 'right', width: '100%', paddingRight: '0.75rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                                <span className="whitespace-pre-wrap text-right inline" style={{ textAlign: 'right', direction: 'rtl', wordBreak: 'break-word' }}>{staticPlaceholder}</span>
                                                <span className="inline-block w-[2px] h-[1.1em] bg-[#FFC72C] mr-1 animate-cursor-blink" style={{ verticalAlign: 'baseline', display: 'inline-block' }}></span>
                                            </span>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        className="absolute left-2 bottom-3 px-4 h-12 bg-[#F9C922] hover:bg-[#F9C922]/90 rounded-pill flex items-center justify-center gap-1.5 transition-all hover:scale-105 shadow-md font-bold text-black text-base whitespace-nowrap"
                                        aria-label={mounted ? t('hero.cta') : 'בואו ניצור ספר'}
                                    >
                                        <span className="text-black">{mounted ? t('hero.cta') : 'בואו ניצור ספר'}</span>
                                        <ArrowLeft className="w-4 h-4 text-black" strokeWidth={3} />
                                    </button>
                                </div>

                                {/* Desktop: input with button centered (original) */}
                                <div className="relative hidden md:block">
                                    <input
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => onInputChange(e.target.value)}
                                        className="w-full h-20 px-6 pl-40 pr-8 rounded-[2rem] border-2 border-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:shadow-lg focus:border-[#FFC72C] focus:ring-4 focus:ring-[#FFC72C]/20 outline-none transition-all text-right text-xl font-medium"
                                        dir="rtl"
                                        style={{ backgroundColor: '#fff' }}
                                    />

                                    {!inputValue && (
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-8 pointer-events-none" dir="rtl">
                                            <span className="text-gray-400 font-normal text-xl flex items-center">
                                                {staticPlaceholder}
                                                <span className="inline-block w-[2px] h-[1.1em] bg-[#FFC72C] mr-1 align-middle animate-cursor-blink"></span>
                                            </span>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        className="absolute left-2 top-2 bottom-2 px-8 bg-[#F9C922] hover:bg-[#F9C922]/90 rounded-pill flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-md font-bold text-black text-base whitespace-nowrap"
                                        aria-label={mounted ? t('hero.cta') : 'בואו ניצור ספר'}
                                    >
                                        <span className="text-black">{mounted ? t('hero.cta') : 'בואו ניצור ספר'}</span>
                                        <ArrowLeft className="w-5 h-5 text-black" strokeWidth={3} />
                                    </button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <div className="flex justify-center md:mt-0 -mt-2">
                            <button
                                type="button"
                                onClick={() => onStart(inputValue.trim() || undefined)}
                                className="h-12 md:h-14 px-8 md:px-10 bg-[#F9C922] hover:bg-[#F9C922]/90 rounded-pill inline-flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-md font-bold text-black text-lg md:text-xl whitespace-nowrap"
                                aria-label={mounted ? t('hero.cta') : 'בואו ניצור ספר'}
                            >
                                <span className="text-black">{mounted ? t('hero.cta') : 'בואו ניצור ספר'}</span>
                                <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 text-black" strokeWidth={3} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Image - Mobile: rotating images, Desktop: static */}
                <div className="flex justify-center mb-0 md:-mb-12 md:px-4 pointer-events-none relative -mt-6 md:mt-0 -mx-4 md:mx-0">
                    {/* Mobile: Rotating images */}
                    <div className="md:hidden relative w-full overflow-hidden" style={{ height: '340px' }}>
                        {mobileHeroImages.map((img, index) => (
                            <img
                                key={img}
                                src={`${img}?v=2`}
                                alt={mounted ? t('hero.imageAlt') : 'ילדים מחזיקים ספרים אישיים עם שמם על הכריכה'}
                                className={`absolute top-0 left-0 right-0 w-full h-auto rounded-b-lg shadow-sm object-cover transition-opacity duration-1000 mix-blend-multiply ${index === currentImageIndex ? 'opacity-100 z-30' : 'opacity-0 z-30 pointer-events-none'
                                    }`}
                                style={{ objectPosition: 'top center', height: '340px', maxHeight: '340px' }}
                                suppressHydrationWarning
                                loading="eager"
                                fetchPriority="high"
                            />
                        ))}
                    </div>
                    {/* Desktop: Static image */}
                    <img
                        src={`/BM_HERO_01.png?t=${new Date().getTime()}`}
                        alt={mounted ? t('hero.imageAlt') : 'ילדים מחזיקים ספרים אישיים עם שמם על הכריכה'}
                        className="hidden md:block max-w-full h-auto max-h-[400px] w-auto rounded-lg shadow-sm object-contain"
                        suppressHydrationWarning
                    />
                </div>
            </div>
        </section>
    );
};

export default Hero;
