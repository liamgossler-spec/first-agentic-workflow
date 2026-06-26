// מסד נתונים מתמשך פשוט (JSON-file) — ה"דיסק" של ה-CRM.
// מאוחסן ב-data/crm.json. אפס תלויות, נטען לזיכרון בעלייה ונכתב בכל שינוי.
// מבנה כך שאפשר בעתיד להחליף ל-Postgres/SQLite בלי לגעת בלוגיקה (crm.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.CRM_DB_PATH
  ? path.resolve(process.cwd(), process.env.CRM_DB_PATH)
  : path.join(DATA_DIR, 'crm.json');

const EMPTY = { contacts: [], conversations: [], appointments: [], seq: 0 };

export let db;

function load() {
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    db = JSON.parse(JSON.stringify(EMPTY));
  }
  for (const k of Object.keys(EMPTY)) {
    if (db[k] === undefined) db[k] = JSON.parse(JSON.stringify(EMPTY[k]));
  }
}

export function persist() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function id(prefix) {
  db.seq += 1;
  return `${prefix}_${db.seq}`;
}

load();
