import React, { useRef, useState } from 'react';
import { Story, UserInputs } from '../types';
import FlipbookView from './FlipbookView';
import MobileBookView from './MobileBookView';
import BookEditorView from './BookEditorView';
import { ArrowLeft, Check, Copy, Lock, Share2, Shield, Sparkles, Truck, X } from 'lucide-react';

interface BookSalesPageOptionProps {
  story: Story;
  inputs: UserInputs;
  onUnlock: () => void;
  onSave: () => void;
}

const ShareRow: React.FC<{ heroName: string }> = ({ heroName }) => {
  const [copied, setCopied] = useState(false);
  const shareUrl = window.location.href;
  const shareText = `ראו את הספר שיצרתי ל${heroName}!`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`, '_blank')}
        className="h-10 px-3 rounded-full bg-[#4b947d] text-white text-sm font-bold"
      >
        WhatsApp
      </button>
      <button
        onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank')}
        className="h-10 px-3 rounded-full bg-[#3c70b2] text-white text-sm font-bold"
      >
        Facebook
      </button>
      <button
        onClick={handleCopy}
        className="h-10 px-3 rounded-full bg-white border border-gray-200 text-black text-sm font-bold inline-flex items-center gap-1"
      >
        <Copy size={14} />
        {copied ? 'הועתק' : 'העתקה'}
      </button>
    </div>
  );
};

const BookSalesPageOptionA: React.FC<BookSalesPageOptionProps> = ({ story, inputs, onUnlock, onSave }) => {
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_15%,#f6c85b33_0%,transparent_42%),radial-gradient(circle_at_80%_4%,#3c70b226_0%,transparent_34%),#fff]" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-10">
        <div className="mb-5 bg-white/75 backdrop-blur border border-white rounded-[28px] p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-[0_14px_40px_rgba(0,0,0,0.06)]">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold bg-[#f6c85b]/20 text-black rounded-full px-3 py-1 mb-2">
              <Sparkles size={13} /> גרסת טרום רכישה
            </p>
            <h1 className="font-heading font-black text-black text-2xl md:text-4xl">הספר של {heroName} מחכה לפתיחה מלאה</h1>
            <p className="text-black text-sm md:text-base font-normal mt-1">דפדפו, תתרשמו, ופתחו את כל 12 העמודים בלחיצה אחת.</p>
          </div>

          <button
            onClick={onSave}
            className="self-start md:self-auto h-11 px-5 rounded-full bg-white border border-gray-200 text-black text-sm font-bold hover:border-[#f6c85b] inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} /> שמירה לגלריה
          </button>
        </div>

        <section className="rounded-[34px] border border-gray-200 bg-[#F4F5F7] p-3 md:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.07)] overflow-hidden">
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

        <section ref={salesRef} className="mt-10">
          <div className="grid md:grid-cols-2 gap-5">
            <article className={`rounded-[30px] p-6 md:p-8 border-2 bg-white transition-all ${isPulsing ? 'border-[#f6c85b] ring-4 ring-[#f6c85b]/30' : 'border-[#f6c85b]'}`}>
              <div className="flex items-end justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-black/60">Digital</p>
                  <h3 className="font-heading font-black text-black text-2xl">מהדורה דיגיטלית</h3>
                </div>
                <div className="text-left">
                  <div className="text-3xl font-black text-black">₪39</div>
                  <div className="text-black/35 text-sm line-through">₪89</div>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6">
                {['פתיחה מיידית של כל עמודי הספר', 'כולל עריכת טקסט וצבעים', 'שיתוף מהיר למשפחה וחברים'].map((item) => (
                  <li key={item} className="text-sm text-black font-normal flex items-center gap-2">
                    <Check size={15} className="text-[#4b947d]" /> {item}
                  </li>
                ))}
              </ul>

              <button onClick={onUnlock} className="w-full h-12 rounded-full bg-[#f6c85b] text-black font-black inline-flex items-center justify-center gap-2 hover:bg-[#e6b84b]">
                <Lock size={16} /> רכישה ופתיחה
              </button>
              <p className="mt-3 text-xs text-black/60 font-normal inline-flex items-center gap-1"><Shield size={12} /> תשלום מאובטח</p>
            </article>

            <article className="rounded-[30px] p-6 md:p-8 border border-gray-200 bg-white">
              <div className="flex items-end justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-black/60">Print</p>
                  <h3 className="font-heading font-black text-black text-2xl">מהדורה מודפסת</h3>
                </div>
                <div className="text-left">
                  <div className="text-3xl font-black text-black">₪149</div>
                  <div className="text-black/35 text-sm line-through">₪249</div>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6">
                {['כריכה קשה איכותית', '12 עמודים בצבע מלא', 'משלוח עד הבית תוך 7-10 ימים'].map((item) => (
                  <li key={item} className="text-sm text-black font-normal flex items-center gap-2">
                    <Check size={15} className="text-[#4b947d]" /> {item}
                  </li>
                ))}
              </ul>

              <button onClick={onUnlock} className="w-full h-12 rounded-full bg-[#3c70b2] text-white font-black inline-flex items-center justify-center gap-2 hover:bg-[#325e96]">
                <Truck size={16} /> רכישת ספר מודפס
              </button>
              <p className="mt-3 text-xs text-black/60 font-normal">כולל גרסה דיגיטלית</p>
            </article>
          </div>

          <div className="mt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white/70 rounded-2xl p-4 border border-white">
            <div className="text-black/70 text-sm font-normal inline-flex items-center gap-1"><Share2 size={14} /> שתפו תצוגה עם המשפחה</div>
            <ShareRow heroName={heroName} />
          </div>
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

export default BookSalesPageOptionA;
