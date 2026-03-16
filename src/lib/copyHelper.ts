import { UserInputs } from '../types';

export const getSalesCopy = (inputs: UserInputs) => {
    const isAdult = inputs.vibe === 'ADULTS' || (inputs.age && inputs.age > 13);
    const name = inputs.childName || 'הגיבור';

    if (isAdult) {
        return {
            headline: `הסיפור שלכם מוכן לקריאה ✨`,
            subhead: `מתנה יחידה מסוגה. הסתכלו פנימה.`,
            digitalCardTitle: `הגרסה הדיגיטלית המלאה`,
            benefits: [
                { icon: '❤️', text: 'מתנה עם משמעות אישית' },
                { icon: '🎁', text: 'מזכרת מרגשת שנשארת לנצח' },
                { icon: '🎨', text: 'יצירת אמנות אישית וחד פעמית' },
            ],
            editorHeadline: `סטודיו העריכה`,
            editorSubhead: `זה הזמן לדיוקים אחרונים. הכל ניתן לשינוי!`,
            approveButton: `✅ סיימתי לערוך - להפקת הספר`,
            softLockOverlay: `המשך הסיפור מחכה בפנים...`
        };
    } else {
        return {
            headline: `האגדה על ${name} מוכנה לקריאה ✨`,
            subhead: `הביטו פנימה וגלו את הקסם שיצרתם יחד.`,
            digitalCardTitle: `הגרסה הדיגיטלית המלאה`,
            benefits: [
                { icon: '💪', text: 'מחזק ביטחון עצמי' },
                { icon: '🌙', text: 'סיפור לפני שינה שילדך יבקש שוב ושוב' },
                { icon: '🎨', text: 'איורים מרהיבים ששמים את הילד במרכז' },
            ],
            editorHeadline: `סטודיו העריכה של ${name}`,
            editorSubhead: `זה הזמן ללטש את האגדה. הכל ניתן לשינוי!`,
            approveButton: `✅ סיימתי לערוך - להפקת הספר`,
            softLockOverlay: `המשך ההרפתקה מחכה בפנים...`
        };
    }
};
