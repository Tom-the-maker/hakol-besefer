import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildReply(message) {
  const text = getString(message);
  if (!text) {
    return 'אני כאן כדי לעזור. אפשר לשאול על יצירת הספר, תשלום, שמירה או הורדה.';
  }

  if (/(תשלום|לשלם|מחיר|קופון)/.test(text)) {
    return 'אם התשלום עדיין לא הושלם, אפשר לבדוק שוב את הקופון או לנסות מחדש מתוך מסך התשלום. אם הספר כבר שולם, הוא ייפתח אוטומטית.';
  }

  if (/(מייל|אימייל|קסם|התחברות)/.test(text)) {
    return 'אפשר להתחבר עם מייל כדי לראות את הספרים מכל מכשיר. אחרי הכניסה הספרים הקשורים למייל אמורים להופיע ב"הספרים שלי".';
  }

  if (/(pdf|הורדה|להוריד|להדפיס)/i.test(text)) {
    return 'הורדת PDF זמינה רק כשיש ספר מוכן לפתיחה. במוצר החדש PDF לא נשמר אוטומטית כברירת מחדל.';
  }

  return 'אפשר לעזור ביצירת הספר, בכניסה לחשבון, בתשלום או באיתור ספר קיים. כתבו לי במה נתקעתם.';
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  return sendJson(res, 200, {
    reply: buildReply(parsed.body.message),
  });
}
