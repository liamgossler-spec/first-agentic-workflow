// טעינת קובץ ההגדרות של הקליניקה.
// כל הפרטים הספציפיים לעסק חיים ב-clinic-config.json — לקוח חדש = קובץ הגדרות חדש, בלי לגעת בקוד.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ניתן להצביע על קובץ הגדרות אחר דרך משתנה הסביבה CLINIC_CONFIG_PATH.
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'clinic-config.json');

export function configPath() {
  return process.env.CLINIC_CONFIG_PATH
    ? path.resolve(process.cwd(), process.env.CLINIC_CONFIG_PATH)
    : DEFAULT_CONFIG_PATH;
}

export function loadConfig() {
  const p = configPath();
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    throw new Error(`לא נמצא קובץ הגדרות הקליניקה: ${p}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`קובץ ההגדרות אינו JSON תקין (${p}): ${err.message}`);
  }
}
