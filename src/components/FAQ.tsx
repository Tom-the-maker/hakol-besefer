'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const FAQ = () => {
  const { t, i18n } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isRTL = i18n.language === 'he';

  const faqItems = t('faq.questions', { returnObjects: true }) as Array<{
    question: string;
    answer: string;
  }>;

  const toggleQuestion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="pt-12 md:pt-16 pb-12 md:pb-16">
      <h2 className="text-center mb-6 md:mb-12 font-heading font-extrabold text-2xl sm:text-3xl md:text-5xl text-black px-2" style={{ color: '#000000' }}>
        {t('faq.title')}
      </h2>

      {/* Light grey card container for questions only - zero horizontal padding on mobile */}
      <div className="max-w-[1300px] mx-auto bg-surfaceLight rounded-card border border-gray-200 py-0 px-0 md:px-8 overflow-hidden">
        <div className="faq-card" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
          {faqItems.map((item, index) => (
            <div key={index} className="faq-item">
              <div
                className={`faq-summary ${openIndex === index ? 'faq-open' : ''}`}
                onClick={() => toggleQuestion(index)}
                style={{
                  textAlign: isRTL ? 'right' : 'left',
                  direction: isRTL ? 'rtl' : 'ltr',
                  color: '#000000'
                }}
              >
                {item.question}
                <span className="faq-chevron" style={{
                  ...(isRTL ? { left: '32px', right: 'auto' } : { right: '32px', left: 'auto' })
                }}>▾</span>
              </div>
              {openIndex === index && (
                <div className="faq-content" style={{
                  textAlign: isRTL ? 'right' : 'left',
                  direction: isRTL ? 'rtl' : 'ltr'
                }}>
                  <p style={{ textAlign: isRTL ? 'right' : 'left', color: '#000000' }}>{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
