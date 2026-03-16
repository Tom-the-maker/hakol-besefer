import React from 'react';
import FlipbookView from '@/components/FlipbookView';
import { Story } from '@/types';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import MainContainer from '@/components/MainContainer';
import I18nProvider from '@/components/I18nProvider';

// Demo story with sample data - no API needed!
const demoStory: Story = {
  title: "ההרפתקה של נועם הקטן",
  segments: [
    "נועם התעורר בבוקר עם חיוך גדול. היום היה יום מיוחד!",
    "הוא רץ למטבח ומצא הפתעה - עוגיות שוקולד טריות!",
    "אמא חיבקה אותו ואמרה: 'יום הולדת שמח, נועם!'",
    "נועם קיבל מתנה מיוחדת - אופניים אדומות חדשות!",
    "הוא יצא לחצר לרכב על האופניים בפעם הראשונה.",
    "בהתחלה היה קצת קשה, אבל נועם לא ויתר.",
    "אבא עזר לו להתאזן ולמה להתחיל.",
    "אחרי כמה נסיונות, נועם הצליח לרכב לבד!",
    "הוא רכב סביב הבית עם רוח בשיער.",
    "החברים באו לראות את האופניים החדשות.",
    "כולם התרשמו מכמה נועם רוכב טוב.",
    "הם שיחקו יחד בחצר עד הערב.",
    "כשהשמש שקעה, נועם נכנס הביתה מאושר.",
    "אמא הכינה לו ארוחת ערב טעימה.",
    "נועם הלך לישון עם חיוך, חולם על הרפתקאות חדשות."
  ],
  composite_image_url: "/Books/Book1/grid.jpg", // Using local sample image
  is_unlocked: true
};

export default function BookPreviewDemo() {
  return (
    <I18nProvider>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#333333' }}>
        <MainContainer>
          <Navbar onStartCoCreation={() => { }} onLogoClick={() => window.location.href = '/'} />
        </MainContainer>

        <main id="main-content" className="flex-grow">
          <MainContainer>
            <section className="pt-16 md:pt-24 pb-16 md:pb-24">
              <FlipbookView
                story={demoStory}
                onUnlock={() => {}}
                isPreview={true}
              />
            </section>
          </MainContainer>
        </main>

        <Footer />
      </div>
    </I18nProvider>
  );
}
