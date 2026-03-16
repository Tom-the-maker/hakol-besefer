import React from 'react';

interface TherapeuticTopicsProps {
  onTopicClick: (topic: string) => void;
}

// Using brand colors from DESIGN_RULES.md
const brandColors = {
  yellow: '#f6c85b',
  blue: '#3c70b2',
  green: '#4b947d',
  peach: '#eea78f',
};

const topics = [
  {
    title: 'מעבר לגן / בית ספר',
    description: 'סיפור שעוזר לילד להתרגש ולהתכונן ליום הראשון',
    prompt: 'סיפור על ילד שמתחיל בגן חדש ומגלה שם חברים חדשים',
    color: brandColors.blue,
  },
  {
    title: 'הגעת אח/ות',
    description: 'ספר שמכין את הילד לקבלת תינוק חדש למשפחה',
    prompt: 'סיפור על ילד שמגלה שעוד מעט הוא הולך להיות אח/ות גדולה ומתרגש מאוד',
    color: brandColors.peach,
  },
  {
    title: 'פחד מהחושך',
    description: 'הרפתקה שהופכת את הלילה למקום בטוח וקסום',
    prompt: 'סיפור על ילד שמגלה שבחושך מסתתרים דברים קסומים ויפים',
    color: brandColors.green,
  },
  {
    title: 'הכנה לבית חולים',
    description: 'ספר שמסביר ומרגיע לפני ביקור או אשפוז',
    prompt: 'סיפור על ילד אמיץ שמבקר בבית חולים ומגלה שהרופאים והאחיות הם גיבורי על',
    color: brandColors.yellow,
  },
  {
    title: 'חברויות וקבלה',
    description: 'סיפור על מציאת חברים וקבלת השונה',
    prompt: 'סיפור על ילד שמגלה שכל ילד הוא מיוחד ושדווקא השונות היא מה שהופך חברויות ליפות',
    color: brandColors.blue,
  },
  {
    title: 'ביטחון עצמי',
    description: 'הרפתקה שמלמדת את הילד להאמין בעצמו',
    prompt: 'סיפור על ילד שמגלה כוח על מיוחד - לעשות דברים שחשב שהוא לא יכול',
    color: brandColors.peach,
  },
];

const TherapeuticTopics: React.FC<TherapeuticTopicsProps> = ({ onTopicClick }) => {
  return (
    <section className="pt-16 md:pt-24 pb-16 md:pb-24" dir="rtl">
      {/* Heading - OUTSIDE the grey card, matching site pattern */}
      <div className="text-center mb-6 md:mb-12">
        <h2
          className="font-heading text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-black px-2"
          style={{ color: '#000000' }}
        >
          ספרים לרגעים מיוחדים
        </h2>
        <p
          className="text-center text-base sm:text-lg md:text-xl text-black max-w-3xl mx-auto px-2 md:px-4 leading-relaxed font-normal mt-4"
          style={{ color: '#000000' }}
        >
          ספרים שעוזרים לילדים להתמודד עם שינויים, פחדים ורגעים גדולים בחיים
        </p>
      </div>

      {/* Grey Card Container - matching site pattern */}
      <div className="bg-surfaceLight rounded-card border border-gray-200 py-10 md:py-16 px-4 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-10 max-w-5xl mx-auto">
          {topics.map((topic) => (
            <div
              key={topic.title}
              className="group flex flex-col items-center text-center cursor-pointer"
              onClick={() => onTopicClick(topic.prompt)}
            >
              {/* Color circle - matching HowItWorks number circles */}
              <div
                className="mb-4 md:mb-6 rounded-full w-16 h-16 md:w-20 md:h-20 flex items-center justify-center border border-gray-100 transition-all duration-300 group-hover:-translate-y-2"
                style={{ backgroundColor: topic.color }}
              >
                <span className="font-heading text-2xl md:text-3xl font-black text-black">
                  {topic.title.charAt(0)}
                </span>
              </div>

              {/* Title */}
              <h3
                className="font-heading text-lg md:text-xl font-black text-black mb-2"
                style={{ color: '#000000' }}
              >
                {topic.title}
              </h3>

              {/* Description */}
              <p
                className="text-black font-normal leading-relaxed text-sm md:text-base max-w-[220px]"
                style={{ color: '#000000' }}
              >
                {topic.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TherapeuticTopics;
