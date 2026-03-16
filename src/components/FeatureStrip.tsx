import React from 'react';
import { Sparkles, RefreshCw, Users, Zap } from 'lucide-react';

const FeatureStrip: React.FC = () => {
    // Official brand colors
    const colors = {
        yellow: '#f6c85b',
        blue: '#3c70b2',
        green: '#4b947d',
        peach: '#eea78f'
    };

    const features = [
        {
            icon: <Sparkles />,
            title: "דמיון מוחלט למקור",
            description: "אל תסתפקו ב\"דמות גנרית\". האלגוריתם מנתח את תווי הפנים מתמונת המקור ויוצר איור שמזכיר בול את האדם האמיתי.",
            hexColor: colors.yellow
        },
        {
            icon: <RefreshCw />,
            title: "עקביות בכל העמודים",
            description: "הדמות לא משתנה באמצע הספר. בין אם הוא צוחק, כועס או מופתע – הילד (או הבוס) נשאר אותו אחד לכל אורך 12 העמודים.",
            hexColor: colors.green
        },
        {
            icon: <Users />,
            title: "שילוב מספר דמויות",
            description: "ספר הוא לא תמיד מונולוג. המערכת יודעת לקחת תמונות של כמה אנשים שונים ולשלב אותם לאיור אחד משותף וטבעי.",
            hexColor: colors.peach
        },
        {
            icon: <Zap />,
            title: "מוכן תוך דקות",
            description: "בלי טפסים ארוכים ובלי להמתין למאייר. מעלים תמונה אחת, כותבים משפט, והספר מוכן להדפסה לפני שהקפה שלכם מתקרר.",
            hexColor: colors.blue
        }
    ];

    return (
        <section className="pt-12 md:pt-16 pb-12 md:pb-16">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 md:px-8">

                {/* Heading - Moved outside the card */}
                <div className="text-center mb-6 md:mb-12">
                    <h2 className="font-heading font-extrabold text-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-black px-2" style={{ color: '#000000' }}>
                        הסוד לתוצאה המושלמת
                    </h2>
                </div>

                {/* 
                  DESIGN_RULES COMPLIANCE:
                  - Container: Grey Card (bg-surfaceLight rounded-card border border-gray-200)
                  - Padding: Adjusted for content-only layout
                */}
                <div className="bg-surfaceLight rounded-card border border-gray-200 py-10 md:py-16 px-4 md:px-8">


                    {/* Grid Layout: 1 col mobile, 2 cols tablet, 4 cols desktop */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
                        {features.map((feature, index) => (
                            <div key={index} className="flex flex-col items-center text-center">
                                {/* Icon Circle - Using exact hex colors SOLID for background */}
                                <div
                                    className="mb-6 p-4 rounded-full w-24 h-24 flex items-center justify-center border border-gray-100"
                                    style={{ backgroundColor: feature.hexColor }}
                                >
                                    {React.cloneElement(feature.icon as React.ReactElement, {
                                        className: "w-10 h-10 text-black stroke-[2]" // Keeping icon black for contrast
                                    })}
                                </div>

                                {/* Title - font-black text-xl/2xl */}
                                <h3
                                    className="font-heading font-black text-black text-xl md:text-2xl mb-3"
                                    style={{ color: '#000000' }}
                                >
                                    {feature.title}
                                </h3>

                                {/* Description - font-normal text-black */}
                                <p
                                    className="text-black font-normal text-sm md:text-base leading-relaxed max-w-[280px]"
                                    style={{ color: '#000000' }}
                                >
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>

                </div>
            </div>
        </section>
    );
};

export default FeatureStrip;
