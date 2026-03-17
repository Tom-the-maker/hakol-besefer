# החלטת אינטגרציית תשלום: הכל בספר

## מטרה

לחבר תשלום אמיתי בלי לשנות את ה־UI, ובלי לאפשר ללקוח לפתוח ספר דרך query param או כתיבה ישירה למסד.

## עקרונות קשיחים

- הלקוח מתחיל תשלום רק דרך `POST /api/checkout`.
- השרת בלבד מחליט אם ספר עבר ל־`paid`.
- חזרה מהספק (`return`) לא פותחת ספר לבד.
- `webhook` או אימות שרת־לשרת הם מקור האמת להשלמת תשלום.
- `books` נשאר מקור האמת של מצב הספר.
- `system_logs` הוא מקום התחקור של ניסיונות תשלום.
- לא שומרים payload גולמי של ספק תשלום בתוך `books`.

## החוזה הנוכחי במערכת

### `POST /api/checkout`

קלט:

- `bookSlug`
- `productType`
- `couponCode` אופציונלי
- `access_token` אופציונלי

פלט אפשרי:

- `paymentUrl` למסלול redirect/hosted
- `iframeUrl` למסלול embedded עתידי
- `checkoutId`
- `amount`
- `currency`

### `GET /api/payment-return`

- מקבל `state` חתום.
- לא משנה `payment_status`.
- מחזיר את המשתמש ל־`/book/<slug>?checkout=<status>`.

### `POST /api/payment-webhook`

- מקבל `state` חתום ו־`status`.
- רק כאן או דרך flow שרת מקביל הספר יכול לעבור ל־`paid`.

## מה חייב לבוא מהספק האמיתי

- דרך ליצור session/link לתשלום
- מזהה חיצוני שנוכל להעביר ולקבל בחזרה
- `return URL`
- `webhook` אמין או callback שרת־לשרת
- סטטוס חד־משמעי של `success / failed / cancelled`

## מה נשמור אצלנו

ב־`books`:

- `payment_status`
- `is_unlocked`

ב־`system_logs`:

- `payment_start`
- `payment_complete`
- `payment_failed`
- `payment_cancelled`
- `provider`
- `checkout_id`
- `provider_reference`
- `amount_ils_agorot`
- `coupon_code`

## מה לא נשמור

- מספרי כרטיס
- payload גולמי גדול מהספק
- HTML של דף תשלום
- query params לא חתומים

## סטטוס נוכחי

- `demo` קיים לבדיקה מהירה בלבד.
- `stub_redirect` קיים לבדיקת hosted flow בלי ספק אמיתי.
- מחר אפשר לחבר `יש חשבונית` או סולק אחר לאותו חוזה בלי לשנות את ה־frontend.
