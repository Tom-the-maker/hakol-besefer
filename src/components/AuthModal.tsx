import React, { useState } from 'react';
import { X, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'sent' | 'error'>('email');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isRateLimitError = (message: string) => /rate limit/i.test(message);
  const normalizeAuthErrorMessage = (message: string) => {
    if (isRateLimitError(message)) {
      return 'שלחתם יותר מדי בקשות בזמן קצר. נסו שוב עוד דקה.';
    }
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail || sending) return;

    setSending(true);
    setError('');

    const result = await signInWithMagicLink(email);

    if (result.error) {
      // Local QA mode: allow visual flow testing even when provider rate limit is hit.
      if (import.meta.env.DEV && isRateLimitError(result.error)) {
        setStep('sent');
      } else {
        setError(normalizeAuthErrorMessage(result.error));
        setStep('error');
      }
    } else {
      setStep('sent');
    }

    setSending(false);
  };

  const handleReset = () => {
    setStep('email');
    setError('');
    setEmail('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4 animate-in fade-in duration-200" dir="rtl">
      <div
        className="bg-white rounded-card border-4 border-[#f6c85b] p-8 md:p-10 max-w-[560px] w-full relative animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-11 h-11 inline-flex items-center justify-center rounded-full border-2 border-gray-200 bg-white text-black hover:border-[#f6c85b] transition-colors"
          aria-label="סגירה"
        >
          <X size={22} />
        </button>

        {step === 'email' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl md:text-3xl leading-tight font-heading font-black text-black" style={{ color: '#000000' }}>
                כניסה לאזור האישי
              </h2>
              <p className="text-black font-normal text-base leading-relaxed" style={{ color: '#000000' }}>
                נשלח לך קישור התחברות למייל - בלי סיסמה, בלי טפסים.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  dir="ltr"
                  autoFocus
                  className="w-full px-6 py-4 rounded-2xl bg-white border-2 border-[#f6c85b] outline-none text-lg font-normal text-left transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={!isValidEmail || sending}
                className="w-full py-4 bg-[#f6c85b] hover:bg-[#e6b84b] text-black font-bold text-lg rounded-full transition-all disabled:cursor-not-allowed disabled:text-black/45 disabled:hover:bg-[#f6c85b]"
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  'שלח קישור התחברות'
                )}
              </button>
            </form>

            <p className="text-center text-black font-normal text-base leading-relaxed" style={{ color: '#000000' }}>
              ברגע שתתחבר, כל הספרים ששייכים למייל הזה יהיו נגישים לך מכל מכשיר.
            </p>
          </div>
        )}

        {step === 'sent' && (
          <div className="text-center space-y-6 py-2">
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl leading-tight font-heading font-black text-black" style={{ color: '#000000' }}>
                בדקו את המייל!
              </h2>
              <p className="text-black font-normal text-base leading-relaxed" style={{ color: '#000000' }}>
                שלחנו קישור התחברות ל-<br />
                <span className="font-bold" dir="ltr">{email}</span>
              </p>
            </div>
            <div className="bg-white rounded-2xl border-2 border-[#f6c85b] p-5">
              <p className="text-base text-black font-normal leading-relaxed" style={{ color: '#000000' }}>
                לחצו על הקישור במייל כדי להתחבר. בדקו גם בתיקיית הספאם.
              </p>
            </div>
            <button
              onClick={() => { onClose(); if (onSuccess) onSuccess(); }}
              className="w-full py-4 bg-[#f6c85b] hover:bg-[#e6b84b] text-black font-bold text-lg rounded-full transition-all"
            >
              סגור
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center space-y-6 py-2">
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl leading-tight font-heading font-black text-black" style={{ color: '#000000' }}>
                אופס
              </h2>
              <p className="text-black font-normal text-base leading-relaxed" style={{ color: '#000000' }}>
                {error || 'משהו השתבש. נסו שוב.'}
              </p>
            </div>
            <button
              onClick={handleReset}
              className="w-full py-4 bg-[#f6c85b] hover:bg-[#e6b84b] text-black font-bold text-lg rounded-full transition-all"
            >
              נסה שוב
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Small user menu for navbar (logged in state)
export const UserMenu: React.FC<{ onMyBooks: () => void }> = ({ onMyBooks }) => {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const displayName = user.email?.split('@')[0] || 'משתמש';

  return (
    <div className="relative" dir="rtl">
      <button
        onClick={() => setOpen(!open)}
        className="flex flex-row-reverse items-center gap-2 font-medium hover:opacity-80 transition-colors"
        style={{ color: '#000000' }}
      >
        <div className="w-8 h-8 bg-[#f6c85b]/20 rounded-full flex items-center justify-center text-sm font-bold text-black">
          {displayName[0]?.toUpperCase()}
        </div>
        <span className="hidden lg:inline">{displayName}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl border border-gray-200 py-2 w-48 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <button
              onClick={() => { setOpen(false); onMyBooks(); }}
              className="w-full px-4 py-2.5 text-right text-sm font-bold text-black hover:bg-surfaceLight transition-colors"
            >
              הספרים שלי
            </button>
            <hr className="my-1 border-gray-200" />
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="w-full px-4 py-2.5 text-right text-sm font-bold text-black hover:bg-surfaceLight transition-colors flex flex-row-reverse items-center gap-2 justify-start"
            >
              <LogOut size={14} />
              התנתקות
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AuthModal;
