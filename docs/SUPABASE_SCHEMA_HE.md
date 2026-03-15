# סכימת Supabase: הכל בספר

## טבלאות גרסה 1

- `books`
- `system_logs`
- `analytics_events`
- `coupons`

לא מוקמות כרגע טבלאות גרסאות, assets או pdf exports.

## `books`

שדות מרכזיים:

- `slug`
- `session_id`
- `title`
- `hero_name`
- `hero_age`
- `hero_gender`
- `topic`
- `art_style`
- `parent_character`
- `parent_name`
- `source_image_path`
- `display_image_path`
- `thumb_image_path`
- `story_segments`
- `preview_excerpt`
- `is_unlocked`
- `payment_status`
- `email`
- `user_id`
- `access_token_hash`
- `latest_pdf_*`
- `metadata`

### Constraints עיקריים

- `story_segments` חייב להכיל בדיוק 10 מחרוזות
- `slug` בפורמט URL-safe
- `email` נשמר lowercase
- כל נתיבי ה־assets יחסיים בלבד
- `source/display/thumb/pdf` חייבים לשבת תחת `slug/`
- `metadata` נשאר object קטן בלי URLים ובלי payload כבד

## `system_logs`

מכילה:

- `session_id`
- `book_slug`
- `action_type`
- `stage`
- `status`
- `model_name`
- `provider_model`
- `input_tokens`
- `output_tokens`
- `estimated_cost_usd`
- `duration_ms`
- `prompt_token`
- `hero_name`
- `topic`
- `art_style`
- `hero_gender`
- `hero_age`
- `book_title`
- `parent_character`
- `parent_name`
- `metadata`

שימוש:

- חקירה עמוקה לפי `session_id`
- לא מקור אמת למוצר

## `analytics_events`

מכילה payload קטן בלבד:

- `session_id`
- `book_slug`
- `event_name`
- `page`
- `device_type`
- `event_data`

נאסר להכניס:

- story מלא
- תמונות
- prompts
- JSON ארוך

## `coupons`

טבלה תפעולית פשוטה:

- `code`
- `discount_percent`
- `is_active`
- `expires_at`
- `max_uses`
- `current_uses`

## דליי Storage

### `book-public-assets`

- ציבורי
- רק `display` ו־`thumb`

### `book-private-assets`

- פרטי
- רק `source` ו־`pdf`

## RLS והרשאות

- כל הטבלאות עם `RLS enabled`
- אין policies ל־anon/authenticated
- השרת פועל עם `service role`

## בדיקות קבלה

1. dashboard list לא טוען `source`
2. dashboard list לא טוען לוגים או events
3. library list מציג רק `thumb`
4. ספר preview מציג `display` בלבד
5. `books` לא מכיל `*_url`
6. `books` לא מכיל request/response של מודלים
7. `PDF` לא נשמר כברירת מחדל

