# תוכנית חיבור וורסל

## עיקרון

וורסל יתחבר רק אחרי שהזרימות המקומיות על `lab` יציבות.

## מיפוי סביבות

- `Preview` -> `hakol-besefer-lab`
- `Production` -> `hakol-besefer`

## משתני סביבה נדרשים

משותפים:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `DASHBOARD_API_KEY`
- `BOOK_PUBLIC_BUCKET`
- `BOOK_PRIVATE_BUCKET`
- `APP_ENV`
- `VITE_APP_ENV`
- `GEMINI_API_KEY`

תלויי אינטגרציה:

- `PAYMENT_PROVIDER`
- `PAYMENT_STATE_SECRET`
- `PAYMENT_WEBHOOK_SECRET`
- `EMAIL_PROVIDER`

אופציונליים ורק אם צריך:

- `VITE_ENABLE_LOCAL_ANALYTICS=0`
- `VITE_ENABLE_VERBOSE_ANALYTICS=0`
- `VITE_GA_ID`
- `VITE_FB_PIXEL_ID`
- `VITE_SITE_URL`

## כללי חיבור

- `Preview` לא מדבר עם `prod`.
- `Production` לא מדבר עם `lab`.
- לא מעתיקים secrets ידנית בין סביבות בלי בדיקה כפולה של project ref.
- `PAYMENT_STATE_SECRET` ו־`DASHBOARD_API_KEY` חייבים להיות שונים בין `lab` ל־`prod`.

## בדיקות לפני חיבור

- `npm run build`
- `npm run smoke:contracts`
- `npm run smoke:auth` ב־`lab`
- `npm run smoke:payment` ב־`lab`
- `npm run telemetry:report` ולוודא שאין שאריות בדיקה

## מה לא עושים

- לא מחברים וורסל לפני ספק תשלום בסיסי.
- לא מחברים דומיין סופי לפני smoke flow אמיתי.
- לא משתמשים בפרויקט Supabase הישן בשום env.
