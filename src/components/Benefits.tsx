'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Benefits = () => {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const benefitItems = mounted ? [
    {
      icon: '/heart.png',
      title: t('benefits.perfectGift.title'),
      description: t('benefits.perfectGift.description')
    },
    {
      icon: '/star.png',
      title: t('benefits.personalizedStory.title'),
      description: t('benefits.personalizedStory.description')
    },
    {
      icon: '/square.png',
      title: t('benefits.educational.title'),
      description: t('benefits.educational.description')
    },
    {
      icon: '/kite.png',
      title: t('benefits.qualityBooks.title'),
      description: t('benefits.qualityBooks.description')
    }
  ] : [
    {
      icon: '/heart.png',
      title: 'מתנה מושלמת',
      description: 'צור מתנה בלתי נשכחת שתישמר לשנים הבאות.'
    },
    {
      icon: '/star.png',
      title: 'סיפור אישי',
      description: 'הילד שלך הופך לגיבור ההרפתקה שלו.'
    },
    {
      icon: '/square.png',
      title: 'חינוכי',
      description: 'מעודד קריאה ומעורר דמיון.'
    },
    {
      icon: '/kite.png',
      title: 'ספרים איכותיים',
      description: 'הדפסה איכותית וכריכה עמידה שנבנתה להחזיק מעמד.'
    }
  ];

  return (
    <section className="pt-16 md:pt-24 pb-16 md:pb-24">
      {/* Light grey card container - Mobile optimized */}
      <div
        className="bg-surfaceLight rounded-card border border-gray-200 py-8 md:py-12 px-4 md:px-8"
      >
        {/* Heading - Mobile optimized */}
        <h2 className="font-heading text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold mb-6 md:mb-8 lg:mb-12 text-center text-black px-2" suppressHydrationWarning>
          {mounted ? t('benefits.title') : 'למה זו מתנה מושלמת'}
        </h2>

        {/* Desktop Grid layout - 4 columns */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-12 xl:gap-16">
          {benefitItems.map((item, index) => (
            <div key={index} className="flex flex-col items-center text-center">
              <img
                src={item.icon}
                alt={`${item.title} icon`}
                className="w-28 h-28 mb-6"
              />
              <h3 className="font-heading text-xl md:text-2xl font-black mb-3 text-black">
                {item.title}
              </h3>
              <p className="text-black font-normal leading-relaxed text-sm md:text-base max-w-[220px]" style={{ color: '#000000' }}>
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* Mobile layout - horizontal with small icons and text on right */}
        <div className="md:hidden space-y-8 px-2">
          {benefitItems.map((item, index) => (
            <div key={index} className="flex items-start gap-4">
              <img
                src={item.icon}
                alt={`${item.title} icon`}
                className="w-14 h-14 flex-shrink-0 -mt-1"
              />
              <div className="text-left flex-1">
                <h3 className="font-heading text-lg font-black mb-3 text-black">
                  {item.title}
                </h3>
                <p
                  className="text-black font-normal leading-relaxed text-sm md:text-base"
                  style={{ color: '#000000' }}
                  dangerouslySetInnerHTML={{ __html: item.description }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
