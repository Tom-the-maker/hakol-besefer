# סביבות עבודה: הכל בספר

## נתיבים מחייבים

- ראשי: `/Users/tomzakai/Desktop/hakol-besefer`
- מעבדה: `/Users/tomzakai/Desktop/hakol-besefer-lab`

## עקרון הפרדה

`lab` ו־`prod` חייבות להיות מופרדות לגמרי ב־4 שכבות:

1. תיקיית עבודה נפרדת
2. קובץ `.env.local` נפרד
3. פרויקט Supabase נפרד
4. מפתחות ו־secrets נפרדים

אסור ששתי הסביבות יפנו לאותו פרויקט Supabase.

## קובצי env בריפו

- `.env.example`
- `.env.lab.example`
- `.env.prod.example`

קובץ `.env.local` לא נכנס ל־git.

## משתנים נדרשים

- `VITE_APP_ENV`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `BOOK_PUBLIC_BUCKET`
- `BOOK_PRIVATE_BUCKET`
- `DASHBOARD_API_KEY`

## כללי הפעלה

### ראשי

- מעתיקים ערכים מ־`.env.prod.example` אל `.env.local`
- מחברים רק ל־Supabase הראשי החדש

### מעבדה

- מעתיקים ערכים מ־`.env.lab.example` אל `.env.local`
- מחברים רק ל־Supabase lab החדש

## מה נעצר כרגע

מאחר שעדיין לא נפתחו חשבונות GitHub ו־Supabase חדשים, עוצרים לפני:

- יצירת remote חדש
- פתיחת פרויקט Supabase חדש
- `supabase link`
- `supabase db push`
- `supabase secrets set`

