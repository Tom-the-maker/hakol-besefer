import React, { useEffect, useState } from 'react';
import { Story, UserInputs } from '../types';
import FlipbookView from './FlipbookView';
import MobileBookView from './MobileBookView';
import { X, CheckCircle, Mail, Package, Send, Truck, Check } from 'lucide-react';

interface BookEditorViewProps {
  story: Story;
  inputs: UserInputs;
  devPopup?: string | null;
}

const BookEditorView: React.FC<BookEditorViewProps> = ({ story, inputs, devPopup }) => {
  const heroName = story.heroName || inputs.childName || 'הילד/ה';
  const forceMobileDevPreview = !!devPopup && devPopup.startsWith('mobile-');

  const [showApproveScreen, setShowApproveScreen] = useState(false);
  const [approveEmail, setApproveEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifySubmitted, setNotifySubmitted] = useState(false);
  const [showMobileFlipbookModal, setShowMobileFlipbookModal] = useState(false);

  useEffect(() => {
    switch (devPopup) {
      case 'after-approve-screen':
        setShowApproveScreen(true);
        break;
      case 'after-notify-modal':
        setShowNotifyModal(true);
        break;
      case 'after-mobile-fullscreen':
        setShowMobileFlipbookModal(true);
        break;
      default:
        break;
    }
  }, [devPopup]);

  if (showApproveScreen) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] font-sans flex flex-col items-center justify-center px-4" dir="rtl">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-20 h-20 bg-[#4b947d]/10 rounded-full flex items-center justify-center mx-auto text-4xl">
            🎉
          </div>
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold text-black">
            הספר שלכם אושר!
          </h1>
          <p className="font-normal text-black text-sm">
            איך תרצו לקבל את הספר?
          </p>

          <div className="bg-white rounded-2xl p-6 border-2 border-[#f6c85b] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#f6c85b]/15 rounded-full flex items-center justify-center">
                <Mail size={20} className="text-[#f6c85b]" />
              </div>
              <div className="text-right">
                <h3 className="font-heading font-black text-black text-lg">שלחו לי במייל</h3>
                <p className="font-normal text-black text-xs">מהדורה דיגיטלית · PDF מלא</p>
              </div>
            </div>
            {!emailSent ? (
              <div className="space-y-3">
                <input
                  type="email"
                  value={approveEmail}
                  onChange={e => setApproveEmail(e.target.value)}
                  placeholder="your@email.com"
                  dir="ltr"
                  className="w-full px-4 py-3 rounded-xl bg-[#F4F5F7] border-2 border-transparent focus:border-[#f6c85b] outline-none text-base font-normal text-left transition-all"
                />
                <button
                  onClick={() => setEmailSent(true)}
                  disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approveEmail)}
                  className="w-full py-3 bg-[#f6c85b] hover:bg-[#e6b84b] text-black font-bold rounded-full flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Send size={16} />
                  שלחו את הספר
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[#4b947d] font-bold text-sm py-2">
                <CheckCircle size={18} />
                הספר נשלח! בדקו את תיבת המייל
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#3c70b2]/15 rounded-full flex items-center justify-center">
                <Package size={20} className="text-[#3c70b2]" />
              </div>
              <div className="text-right">
                <h3 className="font-heading font-black text-black text-lg">הזמינו ספר מודפס</h3>
                <p className="font-normal text-black text-xs">כריכה קשה · ₪149 · משלוח עד הבית</p>
              </div>
            </div>
            <button
              onClick={() => setShowNotifyModal(true)}
              className="w-full py-3 bg-[#3c70b2] hover:bg-[#325e96] text-white font-bold rounded-full flex items-center justify-center gap-2 transition-all"
            >
              <Truck size={16} />
              הזמנה בקרוב — עדכנו אותי
            </button>
          </div>

          <button
            onClick={() => setShowApproveScreen(false)}
            className="text-sm font-bold text-black/40 hover:text-black transition-colors"
          >
            חזרה לעריכה
          </button>
        </div>

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
                  <h3 className="text-2xl md:text-3xl font-heading font-black text-black">ספר מודפס בדרך!</h3>
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
                      onClick={() => setNotifySubmitted(true)}
                      disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)}
                      className="w-full py-4 bg-[#f6c85b] hover:bg-[#e6b84b] text-black text-lg font-bold rounded-full transition-all disabled:opacity-50"
                    >
                      עדכנו אותי
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 py-4">
                  <h3 className="text-2xl md:text-3xl font-heading font-black text-black">נרשמת!</h3>
                  <p className="text-black font-normal text-base">נעדכן אותך ברגע שהספר המודפס יהיה זמין.</p>
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
  }

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col" dir="rtl">
      <div className="pb-8 relative overflow-visible pt-20 md:pt-28">
        <header className="flex flex-col md:flex-row items-center justify-between px-4 md:px-8 relative z-10 pb-4 w-full max-w-[1300px] mx-auto">
          <div className="hidden md:block w-1/3"></div>
          <div className="text-center md:w-1/3">
            <h1 className="font-heading font-extrabold text-black text-2xl sm:text-3xl md:text-5xl leading-tight mb-1">
              הספר של {heroName} מוכן
            </h1>
            <p className="font-heading font-normal text-black text-lg sm:text-xl md:text-xl leading-relaxed">
              עריכה ישירה על הספר: טקסט, צבעים ופונטים
            </p>
            <p className="text-xs sm:text-sm text-black/60 mt-1">
              לאחר אישור סופי, הספר נשמר לשליחה/הדפסה
            </p>
          </div>
          <div className="hidden md:block w-1/3"></div>
        </header>

        <div className="w-full max-w-[1300px] mx-auto px-4 md:px-8">
          <div className="bg-surfaceLight rounded-card border border-gray-200 py-6 md:py-8 px-2 md:px-6 overflow-visible">
            {!forceMobileDevPreview && (
            <div className="hidden md:flex justify-center">
              <FlipbookView
                story={story}
                onUnlock={() => { }}
                devPopup={devPopup}
                isPreview={true}
                transparentBackground={true}
                showToolbar={true}
                editorMode={true}
              />
            </div>
            )}
            <div className={forceMobileDevPreview ? 'w-full max-w-[420px] mx-auto' : 'md:hidden w-full'}>
              <MobileBookView
                story={story}
                onUnlock={() => { }}
                onRequestFlipbook={() => setShowMobileFlipbookModal(true)}
                cleanMode={true}
                heroName={heroName}
                editorMode={true}
                devPopup={devPopup}
              />
            </div>
          </div>

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
                  onUnlock={() => { }}
                  devPopup={devPopup}
                  isPreview={true}
                  transparentBackground={true}
                  showToolbar={false}
                  editorMode={false}
                />
              </div>
            </div>
          )}

          <div className="w-full max-w-[820px] mx-auto mt-4 flex justify-center">
            <button
              onClick={() => setShowApproveScreen(true)}
              className="h-11 px-6 rounded-full text-sm font-bold bg-[#4b947d] text-white hover:bg-[#3d7d69] inline-flex items-center gap-2 transition-all"
            >
              <Check size={16} />
              אישור סופי וקבלת הספר
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookEditorView;
