# הכל בספר

ריפו נקי וחדש עבור `Hakol BeSefer`.

## עקרונות מחייבים

- `books` הוא מקור האמת של המוצר.
- הלקוח מדבר רק עם `API` שרת, לא עם הטבלאות.
- מסכי רשימות טוענים תקציר בלבד, בלי `story_segments`, בלי `source`, ובלי `PDF`.
- אין fallback שקט מ־`thumb` או `display` אל קובץ מקור כבד.
- נשמרים רק נתיבי Storage, לא URLים כפולים במסד.
- `lab` ו־`prod` מופרדים לחלוטין ברמת תיקייה, env, ופרויקט Supabase.

## מה כבר הוכן

- שלד `Vite + React + TypeScript` נקי.
- שכבת `API` שרת מקומית דרך `Vite` לפיתוח.
- חוזי שרת נפרדים ל־library list, book detail, dashboard list ו־session drill-down.
- מיגרציית Supabase ראשונה שתואמת למסמכי היסוד.
- מסמכי ארכיטקטורה, סביבות וסכימה בתוך הריפו החדש.

## פקודות מקומיות

```bash
npm install
npm run check
npm run dev
npm run telemetry:report
npm run lab:reset
```

## בקרת שימוש

- כברירת מחדל, `localhost` לא כותב `analytics_events` לסופבייס. אם צריך בדיקת טלמטריה מכוונת, מדליקים רק זמנית עם `VITE_ENABLE_LOCAL_ANALYTICS=1`.
- `npm run telemetry:report` מציג ספירות של `books`, `system_logs`, `analytics_events`, וגם מצב `Storage` בשני ה־buckets. הוא טוען אוטומטית את `.env.local`.
- `npm run lab:reset` מיועד ל־`lab` בלבד. בלי `--apply` הוא מציג dry-run; עם `--apply` הוא מוחק ספרי בדיקה, לוגים, אנליטיקה ונכסי Storage מהמעבדה בלבד. גם הוא טוען אוטומטית את `.env.local`.
- מאחר ש־`lab` ו־`prod` יושבים על אותו ארגון בסופבייס, צריך לעקוב אחרי usage ברמת הארגון, לא רק ברמת הפרויקט.
- כדי לראות זאת בדשבורד של סופבייס: נכנסים לארגון, ואז `Usage`. כדי לראות מה יושב בכל פרויקט, נכנסים לפרויקט עצמו ואז ל־`Storage`.

## תשלום מקומי

- כרגע יש שני מצבי checkout:
  - `PAYMENT_PROVIDER=demo`: פותח ספר מיידית לצורך בדיקת זרימה בסיסית.
  - `PAYMENT_PROVIDER=stub_redirect`: מדמה ספק redirect חיצוני, עם דף hosted פנימי ופתיחה רק אחרי עדכון שרת.
- מסלולים שהוכנו:
  - `/api/checkout`
  - `/api/payment-hosted-stub`
  - `/api/payment-return`
  - `/api/payment-webhook`
- הלקוח כבר לא אמור להסתמך רק על `?paid=true`. חזרה מהתשלום מסומנת ב־`?checkout=...`, והספר נפתח רק אחרי אימות שרת.
- מחר אפשר לחבר ספק אמיתי לאותו חוזה בלי לשנות את ה־UI.

## מסמכים בריפו

- `docs/ARCHITECTURE_HE.md`
- `docs/ENVIRONMENTS_HE.md`
- `docs/SUPABASE_SCHEMA_HE.md`

## עצירה מודעת

הריפו הזה הוכן כך שאפשר להמשיך מקומית בלי חשבון חדש. יצירת GitHub remote חדש, פתיחת פרויקטי Supabase חדשים, וקישור CLI לפרויקטים החדשים ייעשו רק אחרי פתיחת החשבונות החדשים.
