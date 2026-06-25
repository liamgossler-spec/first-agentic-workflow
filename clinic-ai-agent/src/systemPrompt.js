// בניית ה-system prompt באופן דינמי מתוך קובץ ההגדרות של הקליניקה.
//
// העיצוב של אישיות הסוכנת (הניסוח בעברית) חי בקובץ הטקסט src/system-prompt.he.txt,
// שמכיל פלייסהולדרים בפורמט {{...}}. כאן אנחנו מחליפים אותם בנתונים מתוך clinic-config.json.
// כך שלקוח חדש = רק עדכון clinic-config.json, בלי לגעת בקוד.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'system-prompt.he.txt');

function formatServices(services = []) {
  if (!Array.isArray(services) || services.length === 0) return '— (לא הוגדרו שירותים)';
  return services
    .map((s) => {
      const head = ['•', s.name].filter(Boolean).join(' ');
      const meta = [s.price, s.duration ? `(${s.duration})` : ''].filter(Boolean).join(' ');
      let line = meta ? `${head} — ${meta}` : head;
      if (s.description) line += `\n   ${s.description}`;
      return line;
    })
    .join('\n');
}

function formatHours(hours = {}) {
  const entries = Object.entries(hours || {});
  if (entries.length === 0) return '— (לא הוגדרו שעות)';
  return entries.map(([day, val]) => `• ${day}: ${val}`).join('\n');
}

function formatSlots(slots = []) {
  if (!Array.isArray(slots) || slots.length === 0) return '— (אין שעות פנויות לדוגמה)';
  return slots.map((s) => `• ${s}`).join('\n');
}

/**
 * בונה את מחרוזת ה-system prompt המלאה עבור קונפיגורציית קליניקה נתונה.
 * @param {object} config - תוכן clinic-config.json
 * @returns {string}
 */
export function buildSystemPrompt(config) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const map = {
    businessName: config.businessName || '',
    assistantName: config.assistantName || '',
    tagline: config.tagline || '',
    tone: config.tone || '',
    servicesList: formatServices(config.services),
    hoursList: formatHours(config.hours),
    slotsList: formatSlots(config.availableSlots),
    location: config.location || '',
    phone: config.phone || '',
    policies: config.policies || '',
  };
  // מחליף {{key}} בערך המתאים. אם פלייסהולדר לא מוכר — משאיר אותו כפי שהוא (כדי להבליט טעות).
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : `{{${key}}}`
  );
}
