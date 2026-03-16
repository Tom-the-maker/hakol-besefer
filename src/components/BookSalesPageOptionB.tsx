import React, { useRef, useState } from 'react';
import { Story, UserInputs } from '../types';
import FlipbookView from './FlipbookView';
import MobileBookView from './MobileBookView';
import BookEditorView from './BookEditorView';
import { ArrowUpRight, Check, Crown, Lock, Shield, Sparkles, Truck, X } from 'lucide-react';

interface BookSalesPageOptionProps {
  story: Story;
  inputs: UserInputs;
  onUnlock: () => void;
  onSave: () => void;
}

const BookSalesPageOptionB: React.FC<BookSalesPageOptionProps> = ({ story, inputs, onUnlock, onSave }) => {
  if (story.is_unlocked) {
    return <BookEditorView story={story} inputs={inputs} />;
  }

  const [isPulsing, setIsPulsing] = useState(false);
  const [showMobileFlipbookModal, setShowMobileFlipbookModal] = useState(false);
  const salesRef = useRef<HTMLDivElement>(null);

  const heroName = story.heroName || inputs.childName || 'הילד/ה';

  const handleLockedPageClick = () => {
    setIsPulsing(true);
    salesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setIsPulsing(false), 1800);
  };

  return (
    <div className="min-h-screen bg-[#0f1628] text-white" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-12">
        <div className="relative rounded-[30px] border border-white/15 bg-[linear-gradient(130deg,#121b31_0%,#11192a_54%,#17213a_100%)] p-5 md:p-8 overflow-hidden">
          <div className="absolute -top-16 -left-10 w-56 h-56 rounded-full bg-[#3c70b2]/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-8 w-64 h-64 rounded-full bg-[#f6c85b]/15 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold tracking-wider uppercase bg-white/10 border border-white/20 rounded-full px-3 py-1 mb-2">
                <Crown size={13} /> Premium Preview
              </p>
              <h1 className="font-heading font-black text-2xl md:text-5xl leading-tight">לפני רכישה: הספר של {heroName}</h1>
              <p className="text-white/75 text-sm md:text-base mt-2 font-normal">עיצוב קולנועי, תצוגה מלאה, ופתיחה מיידית של כל הפרקים.</p>
            </div>

            <button
              onClick={onSave}
              className="self-start md:self-auto h-11 px-5 rounded-full border border-white/20 bg-white/5 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-white/10"
            >
              שמירה לגלריה <ArrowUpRight size={16} />
            </button>
          </div>
        </div>

        <section className="mt-6 rounded-[32px] border border-white/15 bg-[#0b111e] p-3 md:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
          <div className="hidden md:flex justify-center">
            <FlipbookView
              story={story}
              onUnlock={onUnlock}
              isPreview={false}
              transparentBackground={true}
              showToolbar={true}
              onLockedPageClick={handleLockedPageClick}
            />
          </div>
          <div className="md:hidden">
            <MobileBookView
              story={story}
              onUnlock={onUnlock}
              cleanMode={true}
              onRequestFlipbook={() => setShowMobileFlipbookModal(true)}
              heroName={heroName}
            />
          </div>
        </section>

        <section ref={salesRef} className="mt-10 grid md:grid-cols-2 gap-5">
          <article className={`relative overflow-hidden rounded-[28px] border p-6 md:p-8 transition-all ${isPulsing ? 'border-[#f6c85b] ring-4 ring-[#f6c85b]/30 bg-[#151f34]' : 'border-white/20 bg-[#141d30]'}`}>
            <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-[#f6c85b]/15 blur-2xl" />
            <div className="relative">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-white/60 font-bold">Digital unlock</p>
                  <h3 className="font-heading font-black text-2xl">מהדורה דיגיטלית</h3>
                </div>
                <div className="text-left">
                  <div className="text-3xl font-black">₪39</div>
                  <div className="text-sm text-white/35 line-through">₪89</div>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6">
                {['גישה מיידית לכל 12 העמודים', 'עריכה חופשית של טקסטים וצבעים', 'שיתוף קל מהנייד או מהמחשב'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-white/90 font-normal"><Check size={15} className="text-[#4b947d]" /> {item}</li>
                ))}
              </ul>

              <button onClick={onUnlock} className="w-full h-12 rounded-full bg-[#f6c85b] text-black font-black inline-flex items-center justify-center gap-2 hover:bg-[#e6b84b]">
                <Lock size={16} /> פתיחה מיידית
              </button>
              <p className="mt-3 text-xs text-white/60 font-normal inline-flex items-center gap-1"><Shield size={12} /> הצפנה ותשלום מאובטח</p>
            </div>
          </article>

          <article className="relative overflow-hidden rounded-[28px] border border-[#3c70b2]/45 bg-[#121a2b] p-6 md:p-8">
            <div className="absolute -left-12 -bottom-12 w-44 h-44 rounded-full bg-[#3c70b2]/20 blur-2xl" />
            <div className="relative">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-white/60 font-bold">Collectors edition</p>
                  <h3 className="font-heading font-black text-2xl">מהדורה מודפסת</h3>
                </div>
                <div className="text-left">
                  <div className="text-3xl font-black">₪149</div>
                  <div className="text-sm text-white/35 line-through">₪249</div>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6">
                {['כריכה קשה + נייר איכותי', 'משלוח עד הבית בישראל', 'כולל גם גרסה דיגיטלית מלאה'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-white/90 font-normal"><Check size={15} className="text-[#4b947d]" /> {item}</li>
                ))}
              </ul>

              <button onClick={onUnlock} className="w-full h-12 rounded-full bg-[#3c70b2] text-white font-black inline-flex items-center justify-center gap-2 hover:bg-[#325e96]">
                <Truck size={16} /> רכישת ספר מודפס
              </button>
              <p className="mt-3 text-xs text-white/65 font-normal inline-flex items-center gap-1"><Sparkles size={12} /> אפשרות מתנה למשפחה</p>
            </div>
          </article>
        </section>
      </div>

      {showMobileFlipbookModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center">
          <button
            onClick={() => setShowMobileFlipbookModal(false)}
            className="absolute top-4 right-4 z-50 w-11 h-11 inline-flex items-center justify-center rounded-full border border-white/30 bg-black/35 text-white hover:border-[#f6c85b] transition-colors"
            aria-label="סגירה"
          >
            <X size={22} />
          </button>
          <div className="hidden landscape:flex w-full h-full items-center justify-center scale-[0.68]">
            <FlipbookView story={story} onUnlock={onUnlock} isPreview={false} transparentBackground={true} showToolbar={false} />
          </div>
          <div className="block landscape:hidden text-center text-white px-6">
            סובבו את המכשיר לרוחב כדי לצפות בתצוגה המלאה.
          </div>
        </div>
      )}
    </div>
  );
};

export default BookSalesPageOptionB;
