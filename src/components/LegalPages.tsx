import React, { useState } from 'react';
import { Send, MessageCircle, Mail, CheckCircle, ArrowRight, User, FileText, HelpCircle } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { siteConfig, getWhatsAppLink } from '../lib/siteConfig';

/* ═══════════════════════════════════════════════════════════
   Shared wrapper for legal pages — branded card design
   ═══════════════════════════════════════════════════════════ */
const LegalShell: React.FC<{ onBack: () => void; title: string; children: React.ReactNode }> = ({ onBack, title, children }) => (
  <div className="max-w-3xl mx-auto pt-24 md:pt-28 pb-10 md:pb-16 px-4 sm:px-6" dir="rtl">
    {/* Back button — large touch target, cleared below fixed navbar */}
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-base text-black/70 hover:text-black mb-6 font-bold py-2.5 px-4 -mr-3 rounded-xl hover:bg-black/5 transition-all"
    >
      <ArrowRight size={18} />
      חזרה
    </button>

    {/* Card container */}
    <div className="bg-[#F4F5F7] rounded-3xl border border-gray-200 overflow-hidden">
      {/* Yellow accent bar */}
      <div className="h-1.5 bg-gradient-to-l from-[#f6c85b] to-[#f6c85b]/40" />

      <div className="p-6 sm:p-8 md:p-10">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold text-black mb-8" style={{ color: '#000000' }}>
          {title}
        </h1>
        <div className="space-y-6 leading-relaxed text-black text-base font-normal" style={{ color: '#000000' }}>
          {children}
        </div>
      </div>
    </div>
  </div>
);

/* Styled section heading for legal pages */
const LegalH2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-xl md:text-2xl font-heading font-bold text-black flex items-center gap-3 pt-4" style={{ color: '#000000' }}>
    <span className="w-1 h-7 bg-[#3c70b2] rounded-full inline-block shrink-0" />
    {children}
  </h2>
);

interface LegalPageProps {
  onBack: () => void;
}

export const TermsOfService: React.FC<LegalPageProps> = ({ onBack }) => (
  <LegalShell onBack={onBack} title="תנאי שימוש">
    <p><strong>עדכון אחרון:</strong> פברואר 2026</p>

    <LegalH2>1. כללי</LegalH2>
    <p>
      ברוכים הבאים להכל בספר ("השירות"). השירות מאפשר יצירת ספרים מאוירים מותאמים אישית באמצעות בינה מלאכותית.
      השימוש בשירות מהווה הסכמה לתנאים אלה.
    </p>

    <LegalH2>2. השירות</LegalH2>
    <p>
      הכל בספר משתמש בטכנולוגיית AI חיצונית ליצירת טקסט ואיורים. התוצאות נוצרות באופן אוטומטי ועשויות להשתנות.
      איננו מתחייבים לתוצאה מסוימת או לדמיון מדויק לתמונות שהועלו.
    </p>

    <LegalH2>3. תמונות ותוכן</LegalH2>
    <p>
      המשתמש אחראי על התמונות שהוא מעלה למערכת. אין להעלות תמונות של אנשים ללא הסכמתם.
      התמונות משמשות אך ורק ליצירת הספר ואינן נשמרות לאחר מכן לשום מטרה אחרת.
    </p>

    <LegalH2>4. תשלומים והחזרים</LegalH2>
    <p>
      מחירי המוצרים מוצגים בשקלים חדשים (₪) וכוללים מע"מ.
      ניתן לבקש החזר כספי תוך 14 ימים מרגע הרכישה, בהתאם לחוק הגנת הצרכן.
      לבקשת החזר, פנו אלינו במייל.
    </p>

    <LegalH2>5. קניין רוחני</LegalH2>
    <p>
      הספר שנוצר שייך ללקוח לשימוש אישי. אין לשכפל, להפיץ או למכור את הספר מחדש ללא אישור.
      הטכנולוגיה, העיצוב והמותג שייכים להכל בספר.
    </p>

    <LegalH2>6. הגבלת אחריות</LegalH2>
    <p>
      השירות ניתן "כמות שהוא" (AS IS). איננו אחראים לנזקים עקיפים או תוצאתיים הנובעים מהשימוש בשירות.
    </p>

    <LegalH2>7. יצירת קשר</LegalH2>
    <p>
      לכל שאלה או בעיה, ניתן לפנות אלינו במייל: {siteConfig.supportEmail}
    </p>
  </LegalShell>
);

export const PrivacyPolicy: React.FC<LegalPageProps> = ({ onBack }) => (
  <LegalShell onBack={onBack} title="מדיניות פרטיות">
    <p><strong>עדכון אחרון:</strong> פברואר 2026</p>

    <LegalH2>1. מידע שאנחנו אוספים</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li><strong>תמונות:</strong> תמונות שמעלים למערכת נשלחות לשירות AI חיצוני לצורך יצירת האיורים. התמונות המקוריות <strong>אינן נשמרות בשרתים שלנו</strong>. לאחר סיום היצירה, הן נמחקות מזיכרון הדפדפן.</li>
      <li><strong>איורים שנוצרו:</strong> תמונות שה-AI יוצר (לא התמונות המקוריות) נשמרות כחלק מהספר ב-Supabase Storage.</li>
      <li><strong>פרטי הזמנה:</strong> שם, גיל ונושא הספר נשמרים לצורך יצירת הספר ושירות לקוחות.</li>
      <li><strong>כתובת אימייל:</strong> נשמרת לצורך שליחת הספר, כניסה לאזור האישי, ותקשורת הקשורה להזמנה.</li>
      <li><strong>נתוני שימוש:</strong> נתוני ניווט אנונימיים לשיפור השירות (באמצעות Google Analytics ו/או Facebook Pixel, כפוף להסכמתכם).</li>
    </ul>

    <LegalH2>2. תמונות של קטינים</LegalH2>
    <p>
      השירות שלנו מיועד ליצירת ספרי ילדים ועשוי לכלול תמונות של קטינים. אנחנו מתייחסים לכך ברצינות מרבית:
    </p>
    <ul className="list-disc pr-6 space-y-2">
      <li>העלאת תמונה מותנית <strong>באישור מפורש</strong> של המשתמש כי יש לו הרשאה חוקית להעלאת התמונה (הורה, אפוטרופוס).</li>
      <li>התמונות המקוריות <strong>לא נשמרות בשום שרת שלנו</strong>. הן קיימות בזיכרון הדפדפן בלבד במהלך היצירה.</li>
      <li><strong>חשוב לדעת:</strong> התמונות נשלחות לשירות AI חיצוני לצורך עיבוד ויצירת האיורים, בהתאם לתנאי השירות של הספק.</li>
      <li>משתמשים יכולים <strong>למחוק את הספר והאיורים שנוצרו</strong> בכל עת דרך "הספרים שלי". מחיקה זו היא סופית ומוחקת גם את הקבצים מהאחסון.</li>
      <li>לא ניתן למחוק תמונות שכבר עובדו על-ידי ספק ה-AI, מכיוון שלא שמרנו אותן מלכתחילה.</li>
    </ul>

    <LegalH2>3. כיצד אנחנו משתמשים במידע</LegalH2>
    <p>
      המידע משמש אך ורק ליצירת הספר המבוקש, עיבוד תשלומים, ושיפור השירות.
      איננו מוכרים או משתפים מידע אישי עם צדדים שלישיים, למעט ספקי שירות חיוניים הרשומים בסעיף 4.
    </p>

    <LegalH2>4. ספקי שירות חיצוניים (צדדים שלישיים)</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li><strong>ספק AI חיצוני:</strong> יצירת סיפור ואיורים. <strong>תמונות המשתמשים נשלחות לשירות זה</strong> לצורך עיבוד.</li>
      <li><strong>Supabase:</strong> אחסון נתוני הספר והאיורים שנוצרו. שרתים באירופה/ארה"ב. אימות משתמשים (Magic Link).</li>
      <li><strong>Vercel:</strong> אירוח האתר וביצוע הפונקציות בצד השרת.</li>
      <li><strong>PayPlus / Stripe:</strong> עיבוד תשלומים. פרטי כרטיס אשראי מעובדים ישירות דרכם ולא נשמרים אצלנו.</li>
      <li><strong>Google Analytics / Facebook Pixel:</strong> ניתוח שימוש אנונימי (כפוף להסכמת העוגיות).</li>
    </ul>

    <LegalH2>5. אבטחת מידע</LegalH2>
    <p>
      אנחנו משתמשים באמצעי אבטחה מקובלים להגנה על המידע שלכם, כולל הצפנה (AES-256) ואחסון מאובטח.
      כל הפרומפטים ולוגיקת ה-AI רצים בצד השרת בלבד ואינם חשופים לדפדפן.
    </p>

    <LegalH2>6. עוגיות ואחסון מקומי</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li><strong>עוגיות הכרחיות:</strong> האתר משתמש ב-localStorage לשמירת מצב הסשן (כגון מזהה סשן וספרים שנוצרו). עוגיות אלה הכרחיות לתפקוד האתר.</li>
      <li><strong>עוגיות אנליטיקה:</strong> Google Analytics - לניתוח שימוש אנונימי. מופעל רק לאחר הסכמה.</li>
      <li><strong>עוגיות שיווק:</strong> Facebook Pixel - למעקב המרות. מופעל רק לאחר הסכמה.</li>
    </ul>
    <p>ניתן לשנות את העדפות העוגיות בכל עת דרך באנר העוגיות בתחתית האתר.</p>

    <LegalH2>7. זכויות המשתמש</LegalH2>
    <p>בהתאם לחוק הגנת הפרטיות, התשמ"א-1981, עומדות לכם הזכויות הבאות:</p>
    <ul className="list-disc pr-6 space-y-2">
      <li><strong>צפייה:</strong> ניתן לצפות בכל הספרים שלכם דרך "הספרים שלי".</li>
      <li><strong>מחיקה:</strong> ניתן למחוק כל ספר ואת כל האיורים הקשורות אליו בלחיצת כפתור.</li>
      <li><strong>תיקון:</strong> לבקשות תיקון מידע, פנו אלינו במייל: {siteConfig.supportEmail}</li>
      <li><strong>מחיקה מלאה:</strong> ניתן לבקש מחיקה מלאה של כל המידע שלכם. נטפל בבקשה תוך 30 ימי עסקים.</li>
    </ul>

    <LegalH2>8. שינויים במדיניות</LegalH2>
    <p>
      אנחנו עשויים לעדכן מדיניות זו מעת לעת. שינויים משמעותיים יפורסמו באתר.
      המשך השימוש בשירות לאחר עדכון מהווה הסכמה למדיניות המעודכנת.
    </p>
  </LegalShell>
);

export const ContactPage: React.FC<LegalPageProps> = ({ onBack }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('general');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const isValid = name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && message.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSending(true);

    try {
      trackEvent('contact_form', { name, email, subject, message }, '/contact');
      setSubmitted(true);
    } catch {
      // Even if DB fails, show success (we don't want to lose the user)
      setSubmitted(true);
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto pt-24 md:pt-28 pb-16 px-4 sm:px-6 text-center" dir="rtl">
        <div className="bg-[#F4F5F7] rounded-3xl border border-gray-200 p-8 md:p-10 space-y-6">
          <div className="w-20 h-20 bg-[#4b947d]/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={40} className="text-[#4b947d]" />
          </div>
          <h2 className="text-2xl font-heading font-black text-black" style={{ color: '#000000' }}>ההודעה נשלחה!</h2>
          <p className="text-black font-normal leading-relaxed" style={{ color: '#000000' }}>
            תודה שפנית אלינו. נחזור אליך תוך 24 שעות.
          </p>
          <button
            onClick={onBack}
            className="btn-primary px-8 py-3 text-black font-bold rounded-full"
          >
            חזרה לדף הבית
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pt-24 md:pt-28 pb-10 md:pb-16 px-4 sm:px-6" dir="rtl">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-base text-black/70 hover:text-black mb-6 font-bold py-2.5 px-4 -mr-3 rounded-xl hover:bg-black/5 transition-all"
      >
        <ArrowRight size={18} />
        חזרה
      </button>

      <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold text-black mb-2" style={{ color: '#000000' }}>צור קשר</h1>
      <p className="text-black font-normal mb-8 text-base" style={{ color: '#000000' }}>יש שאלה, בעיה או רעיון? נשמח לשמוע!</p>

      <div className="grid md:grid-cols-5 gap-6 md:gap-8">
        {/* Contact Form inside card */}
        <div className="md:col-span-3 bg-[#F4F5F7] rounded-3xl border border-gray-200 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-[#f6c85b] to-[#f6c85b]/40" />
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
            <div>
              <label className="block text-base font-bold text-black mb-2" style={{ color: '#000000' }}>
                שם מלא
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="השם שלך"
                className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-gray-200 focus:border-[#f6c85b] outline-none text-base transition-all"
              />
            </div>

            <div>
              <label className="block text-base font-bold text-black mb-2" style={{ color: '#000000' }}>
                אימייל
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                dir="ltr"
                className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-gray-200 focus:border-[#f6c85b] outline-none text-base transition-all text-left"
              />
            </div>

            <div>
              <label className="block text-base font-bold text-black mb-2" style={{ color: '#000000' }}>
                נושא
              </label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-gray-200 focus:border-[#f6c85b] outline-none text-base transition-all text-black"
                style={{ color: '#000000' }}
              >
                <option value="general">שאלה כללית</option>
                <option value="order">בנוגע להזמנה</option>
                <option value="refund">בקשת החזר</option>
                <option value="bug">בעיה טכנית</option>
                <option value="idea">רעיון לשיפור</option>
              </select>
            </div>

            <div>
              <label className="block text-base font-bold text-black mb-2" style={{ color: '#000000' }}>
                הודעה
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="ספרו לנו במה נוכל לעזור..."
                rows={5}
                className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-gray-200 focus:border-[#f6c85b] outline-none text-base transition-all resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={!isValid || sending}
              className="btn-primary w-full py-4 text-black font-bold text-lg rounded-full flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} />
                  שליחה
                </>
              )}
            </button>
          </form>
        </div>

        {/* Sidebar info */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-[#F4F5F7] rounded-2xl p-5 border border-gray-200 space-y-4">
            <h3 className="font-heading font-black text-black text-sm" style={{ color: '#000000' }}>דרכים נוספות ליצור קשר</h3>

            <a
              href={getWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-200 hover:border-[#4b947d] hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 bg-[#4b947d] rounded-full flex items-center justify-center shrink-0">
                <MessageCircle size={20} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-black" style={{ color: '#000000' }}>WhatsApp</p>
                <p className="text-xs text-black/50 font-normal">תגובה תוך שעה</p>
              </div>
            </a>

            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-200 hover:border-[#3c70b2] hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 bg-[#3c70b2] rounded-full flex items-center justify-center shrink-0">
                <Mail size={20} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-black" style={{ color: '#000000' }}>אימייל</p>
                <p className="text-xs text-black/50 font-normal">{siteConfig.supportEmail}</p>
              </div>
            </a>
          </div>

          <div className="bg-[#f6c85b]/10 rounded-2xl p-5 border border-[#f6c85b]/20">
            <p className="text-sm font-bold text-black" style={{ color: '#000000' }}>שעות מענה</p>
            <p className="text-sm text-black font-normal mt-1" style={{ color: '#000000' }}>ימים א'-ה', 9:00-18:00</p>
            <p className="text-xs text-black/50 font-normal mt-2">זמן תגובה ממוצע: עד 24 שעות</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   הצהרת נגישות - נדרש בחוק שוויון זכויות לאנשים עם מוגבלות
   ═══════════════════════════════════════════════════════════ */
export const AccessibilityStatement: React.FC<LegalPageProps> = ({ onBack }) => (
  <LegalShell onBack={onBack} title="הצהרת נגישות">
    <p><strong>עדכון אחרון:</strong> פברואר 2026</p>

    <LegalH2>1. מחויבות לנגישות</LegalH2>
    <p>
      הכל בספר מחויבת להנגיש את האתר והשירותים שלה לכלל האוכלוסייה, לרבות אנשים עם מוגבלות,
      בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998, ותקנות הנגישות שהותקנו מכוחו.
    </p>

    <LegalH2>2. תקן הנגישות</LegalH2>
    <p>
      אנו פועלים להתאים את האתר לתקן הישראלי (ת"י 5568) ולהנחיות WCAG 2.1 ברמת AA.
      האתר נבנה עם תמיכה בסמנטיקת HTML, ניווט מקלדת, וניגודיות צבעים.
    </p>

    <LegalH2>3. התאמות שבוצעו</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li>שימוש בסמנטיקת HTML תקנית (כותרות, רשימות, טפסים עם תוויות)</li>
      <li>תמיכה בניווט מלא באמצעות מקלדת (Tab, Enter, Escape)</li>
      <li>ניגודיות צבעים מספקת בין טקסט לרקע</li>
      <li>טקסט חלופי (alt) לתמונות</li>
      <li>תמיכה בכיוון RTL (ימין לשמאל) לעברית</li>
      <li>גופנים קריאים בגדלים נאותים</li>
      <li>אתר רספונסיבי המותאם למובייל, טאבלט ומחשב</li>
    </ul>

    <LegalH2>4. מגבלות ידועות</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li>תצוגת Flipbook (ספר דיגיטלי עם דפדוף) עשויה שלא להיות נגישה באופן מלא לקוראי מסך. אנו עובדים על שיפור.</li>
      <li>חלק מהתמונות שנוצרות על-ידי AI עשויות להיות חסרות תיאור טקסטואלי מפורט.</li>
    </ul>

    <LegalH2>5. יצירת קשר בנושא נגישות</LegalH2>
    <p>
      נתקלתם בבעיית נגישות? אנא פנו אלינו ונטפל בכך בהקדם:
    </p>
    <ul className="list-disc pr-6 space-y-2">
      <li><strong>אימייל:</strong> {siteConfig.supportEmail}</li>
      <li><strong>טלפון/WhatsApp:</strong> {siteConfig.whatsappNumber}</li>
    </ul>
    <p>
      אנו מתחייבים לטפל בכל פנייה בנושא נגישות תוך 14 ימי עסקים.
    </p>
  </LegalShell>
);

/* ═══════════════════════════════════════════════════════════
   מדיניות ביטולים והחזרים - נדרש בחוק הגנת הצרכן
   ═══════════════════════════════════════════════════════════ */
export const CancellationPolicy: React.FC<LegalPageProps> = ({ onBack }) => (
  <LegalShell onBack={onBack} title="מדיניות ביטולים והחזרים">
    <p><strong>עדכון אחרון:</strong> פברואר 2026</p>

    <LegalH2>1. כללי</LegalH2>
    <p>
      מדיניות זו חלה על כל רכישה באתר הכל בספר ומתבססת על חוק הגנת הצרכן, התשמ"א-1981,
      וחוק הגנת הצרכן (ביטול עסקה), התשע"ד-2014.
    </p>

    <LegalH2>2. ספר דיגיטלי (PDF / צפייה מקוונת)</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li>ניתן לבטל את העסקה <strong>תוך 14 ימים</strong> מיום הרכישה או מיום קבלת אישור העסקה, לפי המאוחר.</li>
      <li>מכיוון שמדובר <strong>במוצר דיגיטלי מותאם אישית</strong> שנוצר במיוחד עבור הלקוח, ייתכן שייגבו <strong>דמי ביטול בסך 5%</strong> ממחיר הרכישה או 100 ש"ח, הנמוך מביניהם, בהתאם לחוק.</li>
      <li>אם הספר הדיגיטלי כבר הורד או נצפה, הביטול כפוף לשיקול דעתנו.</li>
    </ul>

    <LegalH2>3. ספר מודפס (כריכה קשה)</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li>ניתן לבטל את העסקה <strong>תוך 14 ימים</strong> מיום הרכישה, כל עוד הספר <strong>טרם נשלח להדפסה</strong>.</li>
      <li>לאחר שהספר נשלח להדפסה, לא ניתן לבטל את העסקה מכיוון שמדובר <strong>במוצר מותאם אישית</strong> שאינו ניתן להחזרה (סעיף 14ג(ד)(4) לחוק הגנת הצרכן).</li>
      <li>אם התקבל ספר פגום או שונה מהותית ממה שהוזמן, נשלח ספר חדש ללא עלות נוספת.</li>
    </ul>

    <LegalH2>4. אופן הביטול</LegalH2>
    <p>
      ניתן להגיש בקשת ביטול באחת מהדרכים הבאות:
    </p>
    <ul className="list-disc pr-6 space-y-2">
      <li>אימייל: <strong>{siteConfig.supportEmail}</strong></li>
      <li>WhatsApp: <strong>{siteConfig.whatsappNumber}</strong></li>
      <li>דרך <a href="/contact" className="underline text-[#3c70b2]">טופס יצירת קשר</a> באתר (בחירת נושא "בקשת החזר")</li>
    </ul>

    <LegalH2>5. החזר כספי</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li>החזר כספי יינתן <strong>תוך 14 ימי עסקים</strong> מרגע אישור הביטול.</li>
      <li>ההחזר יבוצע <strong>באותו אמצעי תשלום</strong> שבו בוצעה הרכישה.</li>
      <li>דמי ביטול (אם חלים) יקוזזו מסכום ההחזר.</li>
    </ul>

    <LegalH2>6. מקרים מיוחדים</LegalH2>
    <ul className="list-disc pr-6 space-y-2">
      <li><strong>תקלה טכנית:</strong> אם הספר לא נוצר כראוי בגלל תקלה במערכת, נפעל לתיקון או החזר מלא.</li>
      <li><strong>אי שביעות רצון מאיכות ה-AI:</strong> מכיוון שתוצאות ה-AI משתנות מיצירה ליצירה, אנו ממליצים לבדוק את התצוגה המקדימה לפני הרכישה. עם זאת, נבחן כל מקרה לגופו.</li>
      <li><strong>לקוח עם מוגבלות:</strong> בהתאם לחוק, לקוחות עם מוגבלות זכאים לביטול תוך ארבעה חודשים מיום הרכישה.</li>
    </ul>

    <LegalH2>7. מידע נוסף</LegalH2>
    <p>
      לשאלות נוספות בנושא ביטולים והחזרים, ניתן לפנות אלינו בכל אחת מדרכי ההתקשרות המפורטות לעיל.
      אנו מחויבים לטפל בכל פנייה באופן הוגן ובהתאם לחוק.
    </p>
  </LegalShell>
);
