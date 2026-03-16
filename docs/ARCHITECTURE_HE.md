# ארכיטקטורת בסיס: הכל בספר

## עקרון על

המערכת החדשה נבנית כך שהארכיטקטורה עצמה תחסום את דפוסי הבזבוז מהמערכת הישנה:

- אין גישה ישירה של הלקוח לטבלאות.
- מסכי list מקבלים payload קטן בלבד.
- `thumb` הוא הנכס היחיד שמותר לכרטיסים.
- `display` הוא הנכס למסך הספר.
- `source` ו־`pdf` פרטיים ונשלפים רק דרך שרת.
- אין fallback שקט בין רמות נכסים.

## שכבות מערכת

### מוצר

- `books` הוא מקור האמת היחיד של המוצר.
- `story_segments` נשמרים בתוך `books` כי זה תוכן המוצר עצמו.
- `preview_excerpt` נשמר בנפרד כדי לאלץ list קל.

### תחקור

- `system_logs` מיועדת רק לתחקור עמוק לפי `session_id`.
- לוגים לא נטענים בטעינה ראשונית של dashboard.

### טלמטריה

- `analytics_events` מחזיקה payload קטן בלבד.
- אירועים נטענים רק ב־session drill-down.

### תפעול

- `coupons` מבודדת משאר שכבות הדאטה.

## חוזי API

### `GET /api/books?scope=library`

מחזיר רק:

- `slug`
- `title`
- `heroName`
- `topic`
- `artStyle`
- `previewExcerpt`
- `paymentStatus`
- `isUnlocked`
- `updatedAt`
- `thumbImagePath`
- `thumbImageUrl`

לא מחזיר:

- `storySegments`
- `sourceImagePath`
- `sourceImageUrl`
- `latestPdf`
- `metadata`

### `GET /api/books?slug=<slug>`

מחזיר ספר יחיד.

- אם אין הרשאת בעלות, מוחזרים `display`, `thumb`, `previewExcerpt`, ו־`storySegments: []`.
- אם יש הרשאת בעלות, מוחזרים גם `source` ו־`latestPdf` כ־signed URLs קצרים.

### `GET /api/dashboard-books`

מחזיר רק תקציר dashboard קל לפי `updated_at desc`.

### `GET /api/dashboard-session?sessionId=<session-id>`

מחזיר drill-down בלבד:

- book summary
- `system_logs`
- `analytics_events`

`prompt_token` נטען רק אם `includePrompts=1`.

## בעלות והרשאה

מודל הבעלות החדש:

1. `user_id` אם הספר כבר קושר למשתמש.
2. `email` כגשר קישור בלבד.
3. `access_token_hash` עבור ספר חדש שעדיין לא שויך.

הטוקן הגולמי לא נשמר במסד. השרת משווה רק hash.

## Storage

### `book-public-assets`

ציבורי, מיועד רק ל:

- `display`
- `thumb`

### `book-private-assets`

פרטי, מיועד רק ל:

- `source`
- `pdf`

## תשלום

- ה־frontend מתחיל checkout רק דרך `POST /api/checkout`.
- השרת מחזיר `paymentUrl` או `iframeUrl`; הלקוח לא משנה `payment_status` בעצמו.
- חזרה מהדפדפן (`return`) לא פותחת ספר לבד. היא רק מחזירה את המשתמש ל־`/book/<slug>?checkout=...`.
- פתיחת ספר אחרי תשלום נעשית רק אחרי אימות שרת ב־`verify_payment`, או דרך `payment-webhook`.
- לצורכי בדיקה יש `stub_redirect` שמדמה ספק hosted בלי לעקוף את כללי השרת־בלבד.

## מה לא נבנה כרגע

- טבלאות גרסאות
- asset registry נפרד
- fallback בין `thumb` ל־`source`
- שמירת `PDF` אוטומטית
- גישה ישירה של frontend ל־Supabase tables
