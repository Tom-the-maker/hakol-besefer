import React from 'react';
import { ChevronRight } from 'lucide-react';

interface NotFoundPageProps {
  path?: string;
  onBack: () => void;
}

const NotFoundPage: React.FC<NotFoundPageProps> = ({ path, onBack }) => {
  return (
    <div className="w-full" dir="rtl">
      <div className="w-full max-w-[1300px] mx-auto px-4 md:px-8 pt-24 md:pt-32 pb-12 md:pb-16">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-gray-200 bg-white text-black font-bold hover:border-[#f6c85b] transition-colors"
          style={{ color: '#000000' }}
          type="button"
        >
          <ChevronRight className="w-4 h-4" />
          חזרה לדף הבית
        </button>

        <div className="text-center mt-6 md:mt-8">
          <p className="font-heading font-black text-[#f6c85b] text-2xl md:text-3xl leading-tight mb-2">404</p>
          <h1 className="font-heading font-extrabold text-black text-2xl sm:text-3xl md:text-5xl leading-tight px-2 mb-3" style={{ color: '#000000' }}>
            הדף שחיפשתם לא קיים
          </h1>
          <p className="font-normal text-black text-sm md:text-base leading-relaxed max-w-2xl mx-auto px-2" style={{ color: '#000000' }}>
            יכול להיות שהקישור לא תקין או שהעמוד הוסר.
          </p>
        </div>

        <section className="max-w-[780px] mx-auto mt-8 bg-white rounded-card border border-gray-200 p-6 md:p-8 text-center">
          <p className="font-heading font-black text-black text-xl md:text-2xl" style={{ color: '#000000' }}>
            בואו נמשיך משם
          </p>
          <p className="font-normal text-black text-sm md:text-base mt-2" style={{ color: '#000000' }}>
            תוכלו לחזור לדף הבית, להיכנס לספרים שלכם או להתחיל יצירה חדשה.
          </p>

          {path && (
            <div className="mt-4 p-3 bg-[#F4F5F7] rounded-2xl border border-gray-200" dir="ltr">
              <p className="text-xs md:text-sm text-black/70 break-all">{path}</p>
            </div>
          )}

          <button
            onClick={onBack}
            className="mt-6 inline-flex items-center justify-center px-8 py-3 bg-[#f6c85b] hover:bg-[#e8bc54] text-black text-sm md:text-base font-heading font-black rounded-full transition-all"
            type="button"
          >
            חזרה לדף הבית
          </button>
        </section>
      </div>
    </div>
  );
};

export default NotFoundPage;
