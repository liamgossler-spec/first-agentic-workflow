// מתאם ל-Altegio (alteg.io) — מערכת ה-CRM וזימון התורים של תעשיית היופי.
// זה בדיוק המודל של המתחרים (כמו ai-beauty.bot): הסוכן הוא שכבת ה-AI,
// ו-Altegio הוא "מקור האמת" לשירותים, יומן, זמינות, תורים ולקוחות.
// השיחות/האינבוקס נשמרים אצלנו (זה לא מה ש-Altegio מנהל); התורים — ב-Altegio.
//
// הפעלה: CRM_PROVIDER=altegio  +  הגדרת הטוקנים ב-.env (ראו .env.example).
//
// ⚠️ סקלד אינטגרציה: ה-endpoints ומבנה התשובות מבוססים על ה-Booking API
//    הסטנדרטי של Altegio. יש לאמת מול תיעוד ה-API העדכני ומול חשבון/טוקנים
//    אמיתיים לפני שימוש בפרודקשן (וייתכנו שינויים קלים בשמות שדות).

const BASE = process.env.ALTEGIO_BASE || 'https://api.alteg.io/api/v1';
const PARTNER = process.env.ALTEGIO_PARTNER_TOKEN;
const USER = process.env.ALTEGIO_USER_TOKEN;
const COMPANY = process.env.ALTEGIO_COMPANY_ID;
const STAFF = process.env.ALTEGIO_STAFF_ID || '0'; // '0' = כל מטפל זמין
const DEFAULT_SERVICE = process.env.ALTEGIO_SERVICE_ID || null;

/** האם להשתמש ב-Altegio (לפי משתנה הסביבה CRM_PROVIDER). */
export function enabled() {
  return (process.env.CRM_PROVIDER || 'local').toLowerCase() === 'altegio';
}

function assertConfigured() {
  if (!PARTNER || !USER || !COMPANY) {
    throw new Error(
      'Altegio לא מוגדר: חסרים ALTEGIO_PARTNER_TOKEN / ALTEGIO_USER_TOKEN / ALTEGIO_COMPANY_ID ב-.env'
    );
  }
}

function headers() {
  return {
    Accept: 'application/vnd.api.v2+json',
    'Content-Type': 'application/json',
    // אימות Altegio: טוקן שותף + טוקן משתמש.
    Authorization: `Bearer ${PARTNER}, User ${USER}`,
  };
}

async function api(path, opts = {}) {
  assertConfigured();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`Altegio API ${res.status} ${path}: ${JSON.stringify(json.meta || json).slice(0, 200)}`);
  }
  return json.data ?? json;
}

/** רשימת שירותים פעילים לזימון. */
export async function getServices() {
  return api(`/book_services/${COMPANY}`);
}

/** רשימת מטפלים. */
export async function getStaff() {
  return api(`/book_staff/${COMPANY}`);
}

/**
 * שעות פנויות אמיתיות: מאחד תאריכים פנויים + שעות פנויות לכל תאריך,
 * לכמה ימים קדימה, לרשימת מחרוזות "YYYY-MM-DD HH:mm".
 */
export async function getAvailableSlots({ serviceId = DEFAULT_SERVICE, staffId = STAFF, maxDays = 7 } = {}) {
  const sp = serviceId ? `?service_ids[]=${serviceId}` : '';
  const datesResp = await api(`/book_dates/${COMPANY}/${staffId}${sp}`);
  const dates = (datesResp.booking_dates || datesResp.dates || []).slice(0, maxDays);
  const slots = [];
  for (const date of dates) {
    const timesResp = await api(`/book_times/${COMPANY}/${staffId}/${date}${sp}`);
    const times = Array.isArray(timesResp) ? timesResp : timesResp.times || [];
    for (const t of times) {
      const time = typeof t === 'string' ? t : t.time || t.datetime;
      if (time) slots.push(`${date} ${time}`);
    }
  }
  return slots;
}

/** קביעת תור בפועל ב-Altegio (יומן הקליניקה האמיתי). */
export async function createBooking({ clientName, phone, service = DEFAULT_SERVICE, datetime, staffId = STAFF }) {
  const body = {
    phone: phone || '',
    fullname: clientName || '',
    email: '',
    comment: 'נקבע ע"י סוכנת Aura',
    appointments: [
      {
        id: 1,
        services: service ? [Number(service)] : [],
        staff_id: Number(staffId) || 0,
        datetime, // פורמט לפי דרישת ה-API (בד"כ "YYYY-MM-DD HH:mm" או ISO)
      },
    ],
  };
  return api(`/book_record/${COMPANY}`, { method: 'POST', body: JSON.stringify(body) });
}
