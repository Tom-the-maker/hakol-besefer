'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Testimonials = () => {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Default Hebrew testimonials to match server render
  const defaultTestimonials = [
    { name: "שרה י.", text: "הבת שלי הייתה בהתלהבות מוחלטת לראות את עצמה כדמות בסיפור! איכות הספר עלתה על הציפיות שלי. בהחלט אזמין שוב לימי הולדת." },
    { name: "מיכאל ת.", text: "הבן שלי נושא את הספר האישי שלו איתו בכל מקום עכשיו. זה הפך לסיפור השינה האהוב עליו. האיורים פנטסטיים והסיפור מרתק." },
    { name: "אמה ק.", text: "הזמנתי ספר ליום ההולדת של האחיין שלי ונדהמתי ממנו. התהליך היה כל כך קל והמוצר הסופי מדהים. ממליץ בחום!" }
  ];

  const testimonials = mounted ? (t('testimonials.testimonials', { returnObjects: true }) as Array<{
    name: string;
    text: string;
  }>) : defaultTestimonials;

  // Add colors to testimonials for display
  const testimonialsWithColors = testimonials.map((testimonial, index) => {
    const colors = ["yellow", "grey", "peach"];
    return {
      ...testimonial,
      color: colors[index % colors.length]
    };
  });

  return (
    <section className="pt-12 md:pt-16 pb-12 md:pb-16 mobile-gutter">
      <h2 className="text-center mb-6 md:mb-12 font-heading font-extrabold text-2xl sm:text-3xl md:text-5xl text-black px-2" suppressHydrationWarning>
        {mounted ? t('testimonials.title') : 'מה הורים אומרים'}
      </h2>

      {/* Desktop: hero-card wrapper - simplified structure */}
      <div className="hidden md:block">
        <div className="testimonials-desktop-carousel">
          <div className="testimonials-desktop-container">
            <div className="testimonials-desktop-track">
              {testimonialsWithColors.map((testimonial, index) => (
                <article key={index} className={`testimonial-card bg-${testimonial.color}`}>
                  <span className="avatar-dot" />
                  <h3>{testimonial.name}</h3>
                  <p>{testimonial.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Carousel restored with wider cards - Tailwind Layout */}
      <div className="md:hidden -mx-4">
        <div className="w-full overflow-hidden">
          <div className="overflow-x-auto pb-0 px-4 scrollbar-hide snap-x snap-mandatory">
            <div className="flex gap-4 w-max">
              {testimonialsWithColors.map((testimonial, index) => (
                <article key={index} className={`testimonial-card bg-${testimonial.color} w-[70vw] max-w-[320px] flex-shrink-0 snap-start`}>
                  <span className="avatar-dot" />
                  <h3>{testimonial.name}</h3>
                  <p>{testimonial.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
