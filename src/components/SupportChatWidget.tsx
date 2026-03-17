import React, { useMemo, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

const quickPrompts = [
  'איך מתחילים ליצור ספר?',
  'כמה עולה ספר דיגיטלי?',
  'מה כולל ספר מודפס?',
  'כמה זמן לוקח עד שהספר מוכן?'
];

const initialMessage: ChatMessage = {
  id: 'intro',
  role: 'assistant',
  text: 'היי, אני העוזר של הכל בספר. אפשר לשאול אותי על תהליך יצירה, מחירים, סגנונות, תשלום והדפסה.'
};

function fallbackReply(message: string): string {
  const q = message.toLowerCase();

  if (q.includes('מחיר') || q.includes('כמה עולה') || q.includes('עלות')) {
    return 'בטח. ספר דיגיטלי עולה 39 ש"ח, וספר מודפס עולה 149 ש"ח.';
  }

  if (q.includes('איך') || q.includes('מתחיל') || q.includes('תהליך')) {
    return 'מתחילים ברעיון, מעלים תמונה, בוחרים סגנון, מקבלים תצוגה מקדימה ואז משלימים רכישה.';
  }

  if (q.includes('כמה זמן') || q.includes('לוקח')) {
    return 'היצירה עצמה מהירה. אחר כך אפשר לערוך טקסטים ועיצוב לפני סגירה סופית.';
  }

  if (q.includes('מה כולל') || q.includes('מודפס') || q.includes('דיגיטלי')) {
    return 'הספר כולל 12 עמודים מאוירים. דיגיטלי: PDF מלא. מודפס: ספר פיזי מודפס.';
  }

  return 'אני כאן לשאלות על יצירת הספר, מחירים, תשלום ועריכה. כתבו שאלה קצרה ואכוון אתכם.';
}

const SupportChatWidget: React.FC<{ forceOpen?: boolean }> = ({ forceOpen = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(forceOpen);
  const [isSending, setIsSending] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [backendAvailable, setBackendAvailable] = useState(!import.meta.env.DEV);
  const listRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
      setHasScrolled(true);
    }
  }, [forceOpen]);

  React.useEffect(() => {
    if (forceOpen) return;

    const handleScroll = () => {
      if (window.scrollY > 40) {
        setHasScrolled(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [forceOpen]);

  React.useEffect(() => {
    const handleToggle = () => {
      setHasScrolled(true);
      setIsOpen((prev) => !prev);
    };

    window.addEventListener('support-chat:toggle', handleToggle);
    return () => window.removeEventListener('support-chat:toggle', handleToggle);
  }, []);

  const canSend = input.trim().length > 0 && !isSending;

  const conversationForApi = useMemo(
    () =>
      messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.text
      })),
    [messages]
  );

  const appendMessage = (role: ChatRole, text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        text
      }
    ]);

    window.setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }, 10);
  };

  const askAssistant = async (question: string) => {
    const clean = question.trim();
    if (!clean || isSending) return;

    appendMessage('user', clean);
    setInput('');
    setIsSending(true);

    if (!backendAvailable) {
      window.setTimeout(() => {
        appendMessage('assistant', fallbackReply(clean));
        setIsSending(false);
      }, 320);
      return;
    }

    try {
      const res = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, history: conversationForApi })
      });

      if (!res.ok) {
        throw new Error(`support-chat non-200: ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      const reply = typeof data?.reply === 'string' && data.reply.trim().length > 0
        ? data.reply.trim()
        : fallbackReply(clean);

      appendMessage('assistant', reply);
    } catch {
      // If backend endpoint is unavailable (common in plain vite dev), switch to local fallback mode.
      setBackendAvailable(false);
      appendMessage('assistant', fallbackReply(clean));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className={`fixed left-5 z-[80] transition-all duration-200 ${hasScrolled ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none'}`}
      dir="rtl"
      style={{ bottom: 'max(128px, calc(20px + env(safe-area-inset-bottom, 0px)))' }}
    >
      {isOpen && (
        <div className="mb-3 w-[min(92vw,380px)] overflow-hidden rounded-3xl border-4 border-[#f6c85b] bg-white shadow-[0_22px_70px_-30px_rgba(0,0,0,0.45)]">
          <div className="border-b border-gray-200 bg-[#F4F5F7] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-black" style={{ color: '#000000' }}>עוזר הכל בספר</p>
                <p className="text-xs font-normal text-black">זמין לענות בכל שלב</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-black hover:border-[#f6c85b]"
                aria-label="סגירת צ'אט"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div ref={listRef} className="max-h-[48vh] space-y-3 overflow-y-auto px-3 py-3 bg-[#FFFEFB]">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#f6c85b] text-black'
                      : 'border border-gray-200 bg-white text-black'
                  }`}
                  style={{ color: '#000000' }}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-end">
                <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-black/60">
                  חושב על תשובה...
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 bg-white px-3 py-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => askAssistant(prompt)}
                  className="rounded-full border border-gray-200 bg-[#F4F5F7] px-3 py-1.5 text-xs font-bold text-black hover:border-[#f6c85b]"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSend) {
                    e.preventDefault();
                    askAssistant(input);
                  }
                }}
                placeholder="שאלו כל דבר על יצירת הספר"
                className="h-11 flex-1 rounded-full border border-gray-200 bg-white px-4 text-sm font-normal text-black outline-none focus:border-[#f6c85b]"
                style={{ color: '#000000' }}
                maxLength={400}
              />
              <button
                type="button"
                onClick={() => askAssistant(input)}
                disabled={!canSend}
                className="h-11 px-4 rounded-full bg-[#f6c85b] text-black text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="שליחת הודעה"
              >
                שלח
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="hidden md:flex h-12 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-black shadow-[0_14px_30px_-22px_rgba(0,0,0,0.6)] hover:border-[#f6c85b]"
        aria-label="פתיחת עוזר תמיכה"
      >
        <MessageCircle size={18} />
        <span className="text-sm font-bold">יש לך שאלה?</span>
      </button>
    </div>
  );
};

export default SupportChatWidget;
