import React, { useRef, useState } from 'react';
import FlipbookView from './FlipbookView';
import MobileBookView from './MobileBookView';
import BookEditorView from './BookEditorView';
import { Story, UserInputs } from '../types';
import { Shield, Lock, ArrowLeft, X, Share2, Copy, Check } from 'lucide-react';
import { trackEvent } from '../lib/analytics';

interface BookSalesPageProps {
    story: Story;
    inputs: UserInputs;
    onUnlock: () => void;
    onSave: () => void;
}

/* ─── Share Row (bottom, subtle) ─── */
const ShareRow: React.FC<{ heroName: string }> = ({ heroName }) => {
    const [copied, setCopied] = React.useState(false);
    const shareUrl = window.location.href;
    const shareText = `ראו את הספר שיצרתי ל${heroName}!`;

    const handleWhatsApp = () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`, '_blank');
    };

    const handleFacebook = () => {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`, '_blank');
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="flex items-center justify-center gap-2">
            <button
                onClick={handleWhatsApp}
                className="w-10 h-10 rounded-full bg-[#4b947d] hover:bg-[#3d7d69] text-white flex items-center justify-center transition-colors"
                title="שתפו בוואטסאפ"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
            </button>
            <button
                onClick={handleFacebook}
                className="w-10 h-10 rounded-full bg-[#3c70b2] hover:bg-[#325e96] text-white flex items-center justify-center transition-colors"
                title="שתפו בפייסבוק"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
            </button>
            <button
                onClick={handleCopy}
                className="w-10 h-10 rounded-full bg-surfaceLight hover:bg-gray-200 text-black flex items-center justify-center transition-colors"
                title="העתק קישור"
            >
                {copied ? <CheckCircle size={18} className="text-[#4b947d]" /> : <Copy size={18} />}
            </button>
        </div>
    );
};

/* ─── Main Component ─── */
const BookSalesPage: React.FC<BookSalesPageProps> = ({ story, inputs, onUnlock, onSave }) => {
    // Post-purchase: show editor view
    if (story.is_unlocked) {
        return <BookEditorView story={story} inputs={inputs} />;
    }

    return <BookSalesPageInner story={story} inputs={inputs} onUnlock={onUnlock} onSave={onSave} />;
};

const BookSalesPageInner: React.FC<BookSalesPageProps> = ({ story, inputs, onUnlock, onSave }) => {
    const [showNotifyModal, setShowNotifyModal] = useState(false);
    const [notifyEmail, setNotifyEmail] = useState('');
    const [notifySubmitted, setNotifySubmitted] = useState(false);
    const [isPulsing, setIsPulsing] = useState(false);
    const [showMobileFlipbookModal, setShowMobileFlipbookModal] = useState(false);

    const salesSectionRef = useRef<HTMLDivElement>(null);

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
        <div className="min-h-screen bg-[#F4F5F7] font-sans flex flex-col" dir="rtl">

            {/* ══════ PART 1: Book Preview ══════ */}
            <div className="pb-6 relative overflow-hidden pt-20 md:pt-28">

                {/* Header */}
                <header className="flex flex-col md:flex-row items-center justify-between px-4 md:px-8 relative z-10 animate-in slide-in-from-top-4 fade-in duration-700 pb-4 w-full max-w-[1300px] mx-auto">

                    {/* Desktop Save Button (Top Left) */}
                    <div className="hidden md:block w-1/3">
                        <button
                            onClick={onSave}
                            className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors font-medium text-sm border border-gray-200 rounded-full px-4 py-2 hover:border-gray-400 bg-white/80 backdrop-blur-sm"
                        >
                            <span className="text-lg"><img src="https://api.iconify.design/lucide:save.svg" alt="save" className="w-4 h-4" /></span>
                            <span>שמירה לגלריה</span>
                        </button>
                    </div>

                    {/* Title (Center) */}
                    <div className="text-center md:w-1/3">
                        <h1 className="font-heading text-xl sm:text-2xl md:text-3xl font-bold text-black leading-tight mb-1">
                            הספר של {heroName} מוכן
                        </h1>
                        <p className="text-sm md:text-base font-normal text-black" style={{ color: '#000000' }}>
                            דפדפו כדי לראות את התוצאה
                        </p>
                    </div>

                    {/* Empty Spacer (Right) for centering */}
                    <div className="hidden md:block w-1/3"></div>
                </header>

                {/* Desktop Flipbook */}
                <div className="hidden md:block w-full z-20 relative">
                    <div className="w-full max-w-[1300px] mx-auto px-4 md:px-8">
                        <div className="rounded-3xl border border-gray-200 bg-[#F4F5F7] overflow-hidden py-4 md:py-6">
                            <div className="flex justify-center transform scale-100 transition-transform duration-500 origin-top">
                                <FlipbookView
                                    story={story}
                                    onUnlock={onUnlock}
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
                    <MobileBookView
                        story={story}
                        onUnlock={onUnlock}
                        cleanMode={true}
                        onRequestFlipbook={() => setShowMobileFlipbookModal(true)}
                        heroName={heroName}
                    />
                </div>
            </div>

            {/* Mobile Fullscreen Flipbook Modal */}
            {showMobileFlipbookModal && (
                <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in">
                    <button
                        onClick={() => setShowMobileFlipbookModal(false)}
                        className="absolute top-4 right-4 z-50 w-11 h-11 inline-flex items-center justify-center rounded-full border border-white/30 bg-black/35 text-white hover:border-[#f6c85b] transition-colors"
                        aria-label="סגירה"
                    >
                        <X size={24} />
                    </button>
                    <div className="block landscape:hidden text-center px-6">
                        <h3 className="text-white text-xl font-bold mb-2">נא לסובב את המכשיר</h3>
                        <p className="text-white/70">כדי לראות את הספר המלא,<br />יש להחזיק את הטלפון לרוחב.</p>
                    </div>
                    <div className="hidden landscape:flex w-full h-full items-center justify-center scale-[0.65] sm:scale-[0.85]">
                        <FlipbookView
                            story={story}
                            onUnlock={onUnlock}
                            isPreview={false}
                            transparentBackground={true}
                            showToolbar={false}
                        />
                    </div>
                </div>
            )}

            {/* ══════ PART 2: Purchase Section ══════ */}
            <div ref={salesSectionRef} className="flex-grow flex flex-col items-center pt-4 pb-12 px-4 md:px-8 z-30">

                {/* ── Cards Row: side-by-side on desktop ── */}
                <div className="w-full max-w-[1300px] grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

                    {/* ── Digital Edition (Primary CTA) ── */}
                    <div className={`w-full h-full bg-white rounded-2xl p-6 md:p-8 border-2 transition-all duration-300 flex flex-col ${isPulsing ? 'border-[#f6c85b] ring-4 ring-[#f6c85b]/30 scale-[1.01]' : 'border-[#f6c85b]'}`}>

                        {/* Price row */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-heading font-bold text-black text-xl md:text-2xl">מהדורה דיגיטלית</h3>
                                <p className="font-normal text-black text-sm">קובץ PDF מלא · 12 עמודים מאוירים</p>
                            </div>
                            <div className="text-left">
                                <div className="text-2xl md:text-3xl font-bold text-black">₪39</div>
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
                            onClick={onUnlock}
                            className="w-full bg-[#f6c85b] hover:bg-[#e6b84b] active:scale-[0.98] rounded-full flex items-center justify-center gap-2 transition-all font-bold text-black text-base py-3.5"
                        >
                            <span>רכישה ופתיחה</span>
                            <Lock size={16} />
                        </button>

                        {/* Trust badge */}
                        <div className="flex items-center justify-center gap-1.5 mt-3 text-sm font-normal text-black/60">
                            <Shield size={14} />
                            תשלום מאובטח
                        </div>
                    </div>

                    {/* ── Print Edition ── */}
                    <div className="w-full h-full bg-white rounded-2xl p-6 md:p-8 border border-gray-200 flex flex-col">

                        {/* Price row */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-heading font-bold text-black text-xl md:text-2xl">מהדורה מודפסת</h3>
                                <p className="font-normal text-black text-sm">כריכה קשה · 12 עמודים · משלוח עד הבית</p>
                            </div>
                            <div className="text-left">
                                <div className="text-2xl md:text-3xl font-bold text-black">₪149</div>
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
                            onClick={onUnlock}
                            className="w-full bg-[#f6c85b] hover:bg-[#e6b84b] active:scale-[0.98] rounded-full flex items-center justify-center gap-2 transition-all font-bold text-black text-base py-3.5"
                        >
                            <Truck size={16} />
                            <span>רכישת ספר מודפס</span>
                        </button>

                        {/* Spacer to match Digital Card's trust badge height for perfect button alignment */}
                        <div className="flex items-center justify-center gap-1.5 mt-3 text-sm font-normal text-transparent select-none">
                            <Shield size={14} />
                            תשלום מאובטח
                        </div>
                    </div>

                </div>

                {/* ── Footer: Prominent Save & Share ── */}
                <div className="mt-12 w-full max-w-[1300px] flex flex-col items-center justify-center gap-8 opacity-90 hover:opacity-100 transition-opacity pb-8">

                    {/* Share - Minimal */}
                    <div className="flex items-center gap-3 text-gray-500 hover:text-black transition-colors font-medium text-sm">
                        <span>שתפו את הספר:</span>
                        <ShareRow heroName={heroName} />
                    </div>
                </div>

            </div>

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
