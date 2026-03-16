import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UseCasesProps {
    onBookClick?: (id: string) => void;
}

const UseCases = ({ onBookClick }: UseCasesProps) => {
    const { t } = useTranslation();
    const [mounted, setMounted] = useState(false);
    const sectionRef = useRef<HTMLElement | null>(null);
    const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
    const carouselIndexRef = useRef(0);
    const autoplayPauseUntilRef = useRef(0);
    const [isSectionInView, setIsSectionInView] = useState(false);
    const MOBILE_AUTOPLAY_MS = 3000;

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const sectionEl = sectionRef.current;
        if (!sectionEl) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                const inView = entry.isIntersecting && entry.intersectionRatio >= 0.35;
                setIsSectionInView(inView);
            },
            {
                threshold: [0, 0.2, 0.35, 0.5, 0.8],
                root: null,
                rootMargin: '-10% 0px -10% 0px',
            }
        );

        observer.observe(sectionEl);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const isMobile = window.matchMedia('(max-width: 767px)').matches;
        const scroller = mobileCarouselRef.current;
        if (!isMobile || !scroller) return;

        const getCards = () =>
            Array.from(scroller.querySelectorAll<HTMLElement>('[data-usecase-card="true"]'));

        const pauseAutoplay = () => {
            autoplayPauseUntilRef.current = Date.now() + 5000;
        };

        scroller.addEventListener('touchstart', pauseAutoplay, { passive: true });
        scroller.addEventListener('pointerdown', pauseAutoplay, { passive: true });
        scroller.addEventListener('wheel', pauseAutoplay, { passive: true });

        const autoplayId = window.setInterval(() => {
            if (!isSectionInView || document.visibilityState !== 'visible') return;
            if (Date.now() < autoplayPauseUntilRef.current) return;

            const cards = getCards();
            if (cards.length < 2) return;

            carouselIndexRef.current = (carouselIndexRef.current + 1) % cards.length;
            cards[carouselIndexRef.current].scrollIntoView({
                behavior: 'smooth',
                inline: 'start',
                block: 'nearest',
            });
        }, MOBILE_AUTOPLAY_MS);

        return () => {
            window.clearInterval(autoplayId);
            scroller.removeEventListener('touchstart', pauseAutoplay);
            scroller.removeEventListener('pointerdown', pauseAutoplay);
            scroller.removeEventListener('wheel', pauseAutoplay);
        };
    }, [isSectionInView]);

    const cases = [
        {
            id: 'army',
            image: '/Books/Book1/e1.png',
        },
        {
            id: 'couples',
            image: '/Books/Book1/e2.png',
        },
        {
            id: 'kids',
            image: '/Books/Book1/e3.png',
        },
        {
            id: 'farewell',
            image: '/Books/Book1/e4.png',
        }
    ];

    return (
        <section ref={sectionRef} className="pt-12 md:pt-16 pb-12 md:pb-16">
            {/* Heading stays standalone, no enclosing surface */}
            <div className="text-center mb-8 md:mb-12">
                <h2 className="font-heading text-2xl sm:text-3xl md:text-5xl font-black text-black px-2 md:px-4 mb-4" suppressHydrationWarning style={{ color: '#000000' }}>
                    {mounted ? t('useCases.title') : 'תשכחו ממתנות משעממות'}
                </h2>
                <p className="text-center text-base sm:text-lg md:text-xl text-black max-w-3xl mx-auto px-2 md:px-4 leading-relaxed font-normal" suppressHydrationWarning style={{ color: '#000000' }}>
                    {mounted ? t('useCases.description') : 'הפכו את הבדיחות, הפדיחות והרגעים שלכם לספר מאויר, חד פעמי וקורע מצחוק. מתאים לזוגות, מילואימניקים, ילדים וכל השאר.'}
                </p>
            </div>

            {/* Mobile: horizontal swipe gallery like testimonials */}
            <div className="md:hidden -mx-4">
                <div className="w-full overflow-hidden">
                    <div ref={mobileCarouselRef} className="usecases-mobile-scroller overflow-x-auto pb-0 px-4 scroll-px-4 snap-x snap-mandatory">
                        <div className="flex gap-4 w-max">
                            {cases.map((useCase) => (
                                <article
                                    key={useCase.id}
                                    data-usecase-card="true"
                                    className="group w-[70vw] max-w-[320px] flex-shrink-0 snap-start scroll-mx-4 cursor-pointer text-center rounded-[32px] border border-gray-200 bg-white p-3 transition-transform duration-300"
                                    onClick={() => onBookClick?.(useCase.id)}
                                >
                                    <div className="w-full aspect-square mb-4 relative overflow-hidden rounded-[20px]">
                                        <img
                                            src={useCase.image}
                                            alt={useCase.id}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>

                                    <h3 className="text-lg font-black text-black mb-2 font-heading" suppressHydrationWarning style={{ color: '#000000' }}>
                                        {mounted ? t(`useCases.cards.${useCase.id}.title`) : ''}
                                    </h3>

                                    <p
                                        className="text-black font-normal leading-relaxed text-sm min-h-[3.4rem]"
                                        style={{ color: '#000000' }}
                                        suppressHydrationWarning
                                    >
                                        {mounted ? t(`useCases.cards.${useCase.id}.description`) : ''}
                                    </p>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Desktop/Tablet: existing grid */}
            <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-10 w-full">
                {cases.map((useCase) => (
                    <article
                        key={useCase.id}
                        className="group h-full cursor-pointer text-center rounded-card border border-gray-200 bg-white p-3 md:p-4 flex flex-col transition-transform duration-300 hover:-translate-y-1"
                        onClick={() => onBookClick?.(useCase.id)}
                    >
                        <div className="w-full aspect-square mb-4 relative overflow-hidden rounded-[20px]">
                            <img
                                src={useCase.image}
                                alt={useCase.id}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <h3 className="text-xl md:text-2xl font-black text-black mb-2 font-heading" suppressHydrationWarning style={{ color: '#000000' }}>
                            {mounted ? t(`useCases.cards.${useCase.id}.title`) : ''}
                        </h3>

                        <p
                            className="text-black font-normal leading-relaxed text-sm md:text-base"
                            style={{ color: '#000000' }}
                            suppressHydrationWarning
                        >
                            {mounted ? t(`useCases.cards.${useCase.id}.description`) : ''}
                        </p>
                    </article>
                ))}
            </div>
        </section>
    );
};

export default UseCases;
