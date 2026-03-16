import React from 'react';
import { useTranslation } from 'react-i18next';

const HowItWorks: React.FC = () => {
    const { t } = useTranslation();

    // Official brand colors from DESIGN_RULES.md
    const colors = {
        yellow: '#f6c85b',
        blue: '#3c70b2',
        green: '#4b947d',
        peach: '#eea78f'
    };

    const steps = [
        {
            number: 1,
            title: t('howItWorks.step1.title'),
            description: t('howItWorks.step1.description'),
            hexColor: colors.blue
        },
        {
            number: 2,
            title: t('howItWorks.step2.title'),
            description: t('howItWorks.step2.description'),
            hexColor: colors.green
        },
        {
            number: 3,
            title: t('howItWorks.step3.title'),
            description: t('howItWorks.step3.description'),
            hexColor: colors.yellow
        }
    ];

    return (
        <section id="how-it-works" className="pt-12 md:pt-16 pb-12 md:pb-16">

            {/* Heading - Moved outside the card */}
            <div className="text-center mb-6 md:mb-12">
                <h2 className="font-heading text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-black px-2" suppressHydrationWarning style={{ color: '#000000' }}>
                    {t('howItWorks.title')}
                </h2>
            </div>

            {/* Light grey card container for content only */}
            <div className="bg-surfaceLight rounded-card border border-gray-200 py-10 md:py-16 px-4 md:px-8">


                {/* 
                   Unified Grid Layout (Mobile & Desktop):
                   Exactly like FeatureStrip - centered vertical stack on mobile.
                */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12 lg:gap-16 max-w-6xl mx-auto px-4">
                    {steps.map((step, index) => (
                        <div key={index} className="flex flex-col items-center text-center">
                            {/* Number Circle - Using exact hex colors SOLID for background */}
                            <div
                                className="mb-6 rounded-full w-20 h-20 md:w-24 md:h-24 flex items-center justify-center border border-gray-100"
                                style={{ backgroundColor: step.hexColor }}
                            >
                                <span className="font-heading text-3xl md:text-4xl font-black text-black">{step.number}</span>
                            </div>
                            <h3
                                className="font-heading text-xl md:text-2xl font-black text-black mb-3"
                                style={{ color: '#000000' }}
                            >
                                {step.title}
                            </h3>
                            <p className="text-black font-normal leading-relaxed text-sm md:text-base max-w-[280px]" style={{ color: '#000000' }}>
                                {step.description}
                            </p>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
};

export default HowItWorks;
