# Supabase Bootstrap

הקבצים בתיקייה הזו מוכנים לרגע שבו ייפתחו פרויקטי Supabase החדשים.

## מה כבר קיים

- מיגרציית foundation ראשונה
- bucket bootstrap
- constraints ו־helper functions
- helper functions ל־retention

## מה יעשה בהמשך

אחרי פתיחת החשבונות החדשים:

1. `supabase login`
2. `supabase init` אם צריך
3. `supabase link --project-ref <lab-project-ref>`
4. `supabase db push`
5. `supabase secrets set ...`
6. אותו מהלך שוב עבור `prod`, אבל מול פרויקט נפרד לחלוטין

עד אז לא מבצעים link או push.

