import React, { useEffect, useRef, useState } from 'react';
import FlipbookView from './FlipbookView';
import MobileBookView from './MobileBookView';
import BookEditorView from './BookEditorView';
import { Story, UserInputs } from '../types';
import { Lock, X, Truck, Check } from 'lucide-react';
import { trackEvent } from '../lib/analytics';

interface BookSalesPageProps {
    story: Story;
    inputs: UserInputs;
    devPopup?: string | null;
    onUnlock: (productType: 'digital' | 'print') => void;
    onSave: () => void;
}

/* ─── Main Component ─── */
const BookSalesPage: React.FC<BookSalesPageProps> = ({ story, inputs, devPopup, onUnlock, onSave }) => {
    // Post-purchase: show editor view
    if (story.is_unlocked) {
        return <BookEditorView story={story} inputs={inputs} devPopup={devPopup} />;
    }

    return <BookSalesPageInner story={story} inputs={inputs} devPopup={devPopup} onUnlock={onUnlock} onSave={onSave} />;
};

const BookSalesPageInner: React.FC<BookSalesPageProps> = ({ story, inputs, devPopup, onUnlock, onSave }) => {
    const [showNotifyModal, setShowNotifyModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [notifyEmail, setNotifyEmail] = useState('');
    const [notifySubmitted, setNotifySubmitted] = useState(false);
    const [isPulsing, setIsPulsing] = useState(false);
    const [showMobileFlipbookModal, setShowMobileFlipbookModal] = useState(false);

    const salesSectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        switch (devPopup) {
            case 'before-save-modal':
                setShowSaveModal(true);
                break;
            case 'before-notify-modal':
                setShowNotifyModal(true);
                break;
            case 'before-mobile-fullscreen':
                setShowMobileFlipbookModal(true);
                break;
            default:
                break;
        }
    }, [devPopup]);

    const handlePrintNotify = async () => {
        if (!notifyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) return;
        try {
            trackEvent('print_notify_signup', { email: notifyEmail, bookSlug: story?.title }, '/book');
        } catch { /* silent */ }
        setNotifySubmitted(true);
    };

    const handleLockedPageClick = () => {
        setIsPulsing(true);
        salesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setIsPulsing(false), 2000);
    };

    const heroName = story.heroName || inputs.childName || "הילד/ה";

    return (
        <div className="min-h-screen bg-white font-sans flex flex-col" dir="rtl">

            {/* ══════ PART 1: Book Preview ══════ */}
            <div className="pb-6 relative overflow-visible pt-20 md:pt-28">

                {/* Header */}
                <header className="flex flex-col md:flex-row items-center justify-between px-4 md:px-8 relative z-10 animate-in slide-in-from-top-4 fade-in duration-700 pb-4 w-full max-w-[1300px] mx-auto">

                    <div className="hidden md:block w-1/3"></div>

                    {/* Title (Center) */}
                    <div className="text-center md:w-1/3">
                        <h1 className="font-heading font-extrabold text-black text-2xl sm:text-3xl md:text-5xl leading-tight mb-1">
                            הספר של {heroName} מוכן
                        </h1>
                        <p className="font-heading font-normal text-black text-lg sm:text-xl md:text-xl leading-relaxed">
                            דפדפו כדי לראות את התוצאה
                        </p>
                    </div>

                    {/* Empty Spacer (Right) for centering */}
                    <div className="hidden md:block w-1/3"></div>
                </header>

                {/* Desktop Flipbook */}
                <div className="hidden md:block w-full z-20 relative">
                    <div className="w-full max-w-[1300px] mx-auto px-4 md:px-8">
                        <div className="bg-surfaceLight rounded-card border border-gray-200 py-6 md:py-8 px-2 md:px-4 overflow-visible">
                            <div className="flex justify-center transform scale-100 transition-transform duration-500 origin-top">
                        <FlipbookView
                            story={story}
                            onUnlock={() => onUnlock('digital')}
                            onSave={() => setShowSaveModal(true)}
                            devPopup={devPopup}
                            isPreview={false}
                            transparentBackground={true}
                            showToolbar={true}
                            onLockedPageClick={handleLockedPageClick}
                        />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Book View */}
                <div className="md:hidden w-full relative">
                    <div className="w-full max-w-[1300px] mx-auto px-4">
                        <MobileBookView
                            story={story}
                            onUnlock={() => onUnlock('digital')}
                            onSave={() => setShowSaveModal(true)}
                            cleanMode={true}
                            devPopup={devPopup}
                            onRequestFlipbook={() => setShowMobileFlipbookModal(true)}
                            heroName={heroName}
                        />
                    </div>
                </div>
            </div>

            {/* Mobile Fullscreen Flipbook Modal */}
            {showMobileFlipbookModal && (
                <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in">
                    <button
                        onClick={() => setShowMobileFlipbookModal(false)}
                        className="absolute top-4 right-4 z-50 w-11 h-11 rounded-full border border-white/30 bg-black/40 text-white inline-flex items-center justify-center hover:border-[#f6c85b] transition-colors"
                        aria-label="סגירה"
                    >
                        <X size={24} />
                    </button>
                    <div className="block landscape:hidden text-center px-6 animate-pulse">
                        <div className="text-6xl mb-4 text-white"><img src="https://api.iconify.design/lucide:rotate-ccw.svg" alt="rotate" className="w-16 h-16 mx-auto invert" /></div>
                        <h3 className="text-white text-xl font-bold mb-2">נא לסובב את המכשיר</h3>
                        <p className="text-white/70">כדי לראות את הספר המלא,<br />יש להחזיק את הטלפון לרוחב.</p>
                    </div>
                    <div className="hidden landscape:flex w-full h-full items-center justify-center scale-[0.65] sm:scale-[0.85]">
                        <FlipbookView
                            story={story}
                            onUnlock={() => onUnlock('digital')}
                            onSave={() => setShowSaveModal(true)}
                            devPopup={devPopup}
                            isPreview={false}
                            transparentBackground={true}
                            showToolbar={false}
                        />
                    </div>
                </div>
            )}

            {/* ══════ PART 2: Purchase Section ══════ */}
            <div ref={salesSectionRef} className="flex-grow w-full pt-4 pb-12 px-0 md:px-8 z-30">
                <div className="w-full max-w-[1300px] mx-auto px-4 md:px-8">
                    {/* ── Cards Row: side-by-side on desktop ── */}
                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

                        {/* ── Digital Edition (Primary CTA) ── */}
                        <div className={`w-full h-full bg-[#f3f4f6] md:bg-white rounded-card p-6 md:p-8 border border-gray-200 transition-all duration-300 flex flex-col ${isPulsing ? 'ring-4 ring-[#f6c85b]/30 scale-[1.01]' : ''}`}>

                        {/* Price row */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-heading font-black text-black text-xl md:text-2xl">מהדורה דיגיטלית</h3>
                                <p className="font-normal text-black text-sm">קובץ PDF מלא · 12 עמודים מאוירים</p>
                            </div>
                            <div className="text-left">
                                <div className="text-2xl md:text-3xl font-black text-black">₪39</div>
                                <div className="text-sm text-black/40 line-through font-normal">₪89</div>
                            </div>
                        </div>

                        {/* Benefits checklist - flex-1 to push button down */}
                        <ul className="space-y-2.5 mb-6 flex-1">
                            {[
                                'פתיחה מיידית של כל העמודים',
                                'נשאר שלכם לתמיד',
                                'מושלם לשיתוף בוואטסאפ',
                                'כולל עריכת טקסט וצבעים',
                            ].map((item, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm font-normal text-black">
                                    <Check size={16} className="text-[#4b947d] flex-shrink-0" />
                                    {item}
                                </li>
                            ))}
                        </ul>

                        {/* CTA Button */}
                        <button
                            onClick={() => onUnlock('digital')}
                            className="w-full bg-[#f6c85b] hover:bg-[#e6b84b] active:scale-[0.98] rounded-full flex items-center justify-center gap-2 transition-all font-bold text-black text-base py-3.5"
                        >
                            <span>רכישה ופתיחה</span>
                            <Lock size={16} />
                        </button>

                    </div>

                        {/* ── Print Edition ── */}
                    <div className="w-full h-full bg-[#f3f4f6] md:bg-white rounded-card p-6 md:p-8 border border-gray-200 flex flex-col">

                        {/* Price row */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-heading font-black text-black text-xl md:text-2xl">מהדורה מודפסת</h3>
                                <p className="font-normal text-black text-sm">כריכה קשה · 12 עמודים · משלוח עד הבית</p>
                            </div>
                            <div className="text-left">
                                <div className="text-2xl md:text-3xl font-black text-black">₪149</div>
                                <div className="text-sm text-black/40 line-through font-normal">₪249</div>
                            </div>
                        </div>

                        {/* Benefits checklist - flex-1 to push button down */}
                        <ul className="space-y-2.5 mb-6 flex-1">
                            {[
                                'ספר מודפס איכותי למזכרת',
                                'כריכה קשה עמידה לשנים',
                                'משלוח עד הבית תוך 7-10 ימים',
                                'מתנה מושלמת ליום הולדת',
                            ].map((item, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm font-normal text-black">
                                    <Check size={16} className="text-[#4b947d] flex-shrink-0" />
                                    {item}
                                </li>
                            ))}
                        </ul>

                        {/* CTA — Purchase Now (Enabled) */}
                        <button
                            onClick={() => onUnlock('print')}
                            className="w-full bg-[#f6c85b] hover:bg-[#e6b84b] active:scale-[0.98] rounded-full flex items-center justify-center gap-2 transition-all font-bold text-black text-base py-3.5"
                        >
                            <Truck size={16} />
                            <span>רכישת ספר מודפס</span>
                        </button>

                        </div>

                    </div>

                </div>
            </div>

            {/* ══════ MODAL: Print Notify ══════ */}
            {showSaveModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 animate-in fade-in duration-200" dir="rtl">
                    <div className="bg-white rounded-card p-8 md:p-10 max-w-[520px] w-full text-center relative animate-in zoom-in-95 duration-200 border-4 border-[#f6c85b]">
                        <button
                            onClick={() => setShowSaveModal(false)}
                            className="absolute top-4 left-4 w-11 h-11 inline-flex items-center justify-center rounded-full border-2 border-gray-200 bg-white text-black hover:border-[#f6c85b] transition-colors"
                            aria-label="סגירה"
                        >
                            <X size={22} />
                        </button>
                        <h3 className="text-2xl md:text-3xl font-heading font-black text-black mb-2" style={{ color: '#000000' }}>
                            נשמר לגלריה
                        </h3>
                        <p className="text-black text-base leading-relaxed mb-6" style={{ color: '#000000' }}>
                            הספר נשמר אצלכם באתר. אפשר להמשיך כאן בלי לצאת מהעמוד.
                        </p>
                        <button
                            onClick={() => setShowSaveModal(false)}
                            className="w-full py-4 bg-[#f6c85b] hover:bg-[#e6b84b] text-black text-lg font-bold rounded-full transition-all"
                        >
                            הבנתי
                        </button>
                    </div>
                </div>
            )}

            {/* ══════ MODAL: Print Notify ══════ */}
            {showNotifyModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 animate-in fade-in duration-200" dir="rtl">
                    <div className="bg-white rounded-card p-8 md:p-10 max-w-[520px] w-full text-center relative animate-in zoom-in-95 duration-200 border-4 border-[#f6c85b]">
                        <button
                            onClick={() => { setShowNotifyModal(false); setNotifySubmitted(false); setNotifyEmail(''); }}
                            className="absolute top-4 left-4 w-11 h-11 inline-flex items-center justify-center rounded-full border-2 border-gray-200 bg-white text-black hover:border-[#f6c85b] transition-colors"
                            aria-label="סגירה"
                        >
                            <X size={22} />
                        </button>

                        {!notifySubmitted ? (
                            <div className="space-y-5">
                                <h3 className="text-2xl md:text-3xl font-heading font-black text-black">
                                    ספר מודפס בדרך!
                                </h3>
                                <p className="text-black font-normal leading-relaxed text-base">
                                    אנחנו עובדים על חיבור לבית דפוס איכותי. השאירו מייל ונעדכן ברגע שזה מוכן.
                                </p>
                                <div className="space-y-3">
                                    <input
                                        type="email"
                                        value={notifyEmail}
                                        onChange={e => setNotifyEmail(e.target.value)}
                                        placeholder="your@email.com"
                                        dir="ltr"
                                        className="w-full px-6 py-4 rounded-2xl bg-white border-2 border-[#f6c85b] focus:border-[#f6c85b] outline-none text-lg font-normal text-left transition-all"
                                    />
                                    <button
                                        onClick={handlePrintNotify}
                                        disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)}
                                        className="w-full py-4 bg-[#f6c85b] hover:bg-[#e6b84b] text-black text-lg font-bold rounded-full transition-all disabled:opacity-50"
                                    >
                                        עדכנו אותי
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-5 py-4">
                                <h3 className="text-2xl md:text-3xl font-heading font-black text-black">
                                    נרשמת!
                                </h3>
                                <p className="text-black font-normal text-base">
                                    נעדכן אותך ברגע שהספר המודפס יהיה זמין.
                                </p>
                                <button
                                    onClick={() => { setShowNotifyModal(false); setNotifySubmitted(false); }}
                                    className="w-full py-4 bg-[#f6c85b] hover:bg-[#e6b84b] text-black text-lg font-bold rounded-full transition-all"
                                >
                                    סגור
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default BookSalesPage;
