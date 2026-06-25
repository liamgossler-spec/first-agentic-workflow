// שרת מקומי לסוכנת Aura.
// מגיש דף נחיתה (/), ממשק צ'אט דמו (/chat), ו-API לשיחה עם הסוכן (/api/chat).
// המודל, הזיכרון וה-system prompt מחוברים כאן. אין מפתחות בקוד — נטענים מ-.env.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { buildSystemPrompt } from './systemPrompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// --- הגדרות מודל ---
// המודל נבחר במפורש: claude-sonnet-4-6. max_tokens קטן כי תשובות בסגנון וואטסאפ קצרות.
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n⛔ חסר ANTHROPIC_API_KEY.');
  console.error('   צרו קובץ .env (אפשר להעתיק מ-.env.example) והכניסו את המפתח שלכם.\n');
  process.exit(1);
}

// קונפיגורציה ו-system prompt נבנים פעם אחת בעליית השרת (סטטיים לכל התהליך).
const config = loadConfig();
const SYSTEM_PROMPT = buildSystemPrompt(config);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * לב הסוכן: מקבל את היסטוריית השיחה המלאה ומחזיר את תשובת הסוכנת.
 * ה-API של Anthropic חסר-מצב, ולכן שולחים את כל ההיסטוריה בכל קריאה —
 * כך הסוכנת "זוכרת" את כל השיחה ולא חוזרת על עצמה.
 *
 * פונקציה זו משותפת ל-/api/chat ולחיבור ה-WhatsApp העתידי (ראו הערה בתחתית הקובץ).
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} history
 * @returns {Promise<string>} טקסט התשובה של הסוכנת
 */
export async function generateReply(history) {
  // ניקוי וניתוב: רק הודעות תקינות, וההיסטוריה חייבת להתחיל בהודעת משתמש.
  let messages = (Array.isArray(history) ? history : [])
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim()
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  while (messages.length && messages[0].role === 'assistant') messages.shift();
  if (messages.length === 0) {
    throw Object.assign(new Error('אין הודעת משתמש בהיסטוריה'), { status: 400 });
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
  });

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

const app = express();
app.use(express.json());
// index:false — כך שהנתיב "/" לא יוגש אוטומטית כ-index.html (הצ'אט),
// אלא יעבור ל-handler שמגיש את דף הנחיתה. שאר הקבצים הסטטיים מוגשים כרגיל.
app.use(express.static(PUBLIC_DIR, { index: false }));

// דף הנחיתה השיווקי
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'landing.html')));

// ממשק הצ'אט (דמו)
app.get('/chat', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// הודעת פתיחה דטרמיניסטית (מהירה, בלי קריאת מודל) — נבנית מתוך הקונפיג.
app.get('/api/greeting', (_req, res) => {
  const name = config.assistantName || 'העוזרת האישית';
  const business = config.businessName || 'הקליניקה';
  res.json({
    greeting: `שלום וברוכה הבאה ל${business}! 💕 אני ${name}, העוזרת האישית כאן. איך אפשר לפנק אותך היום?`,
    businessName: business,
    assistantName: name,
  });
});

// נקודת הקצה הראשית לשיחה.
// הלקוח שולח את כל היסטוריית השיחה; השרת מוסיף את ה-system prompt ומחזיר תשובה.
app.post('/api/chat', async (req, res) => {
  try {
    const reply = await generateReply(req.body?.messages);
    res.json({ reply });
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error('שגיאת צ\'אט:', err?.message || err);
    res.status(status).json({
      error:
        status === 400
          ? 'לא התקבלה הודעה תקינה.'
          : 'אופס, משהו השתבש. נסו שוב בעוד רגע 🙏',
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n✨ ${config.businessName} — סוכנת Aura פעילה (מודל: ${MODEL})`);
  console.log(`   דף נחיתה:  http://localhost:${PORT}/`);
  console.log(`   צ'אט דמו:  http://localhost:${PORT}/chat\n`);
});

/* =======================================================================
   שלב 2 — חיבור עתידי ל-WhatsApp Business API  (לא ממומש בשלב זה)
   -----------------------------------------------------------------------
   כשנגיע לחיבור הוואטסאפ, נשתמש בספק רשמי (Twilio / 360dialog / Meta Cloud API).
   הרעיון: הספק שולח webhook לכל הודעה נכנסת; אנחנו מזהים את הלקוח, שולפים את
   היסטוריית השיחה שלו (מ-DB), קוראים ל-generateReply(), ושולחים את התשובה חזרה
   דרך ה-API של הספק. כל הלוגיקה של הסוכן כבר מוכנה ב-generateReply — החיבור פשוט:

   import { generateReply } from './server.js';

   // אימות ה-webhook של מטא (handshake חד-פעמי):
   // app.get('/webhook/whatsapp', (req, res) => {
   //   const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
   //   if (req.query['hub.mode'] === 'subscribe' &&
   //       req.query['hub.verify_token'] === VERIFY_TOKEN) {
   //     return res.status(200).send(req.query['hub.challenge']);
   //   }
   //   res.sendStatus(403);
   // });

   // קבלת הודעות נכנסות:
   // app.post('/webhook/whatsapp', async (req, res) => {
   //   res.sendStatus(200); // לאשר מיד לספק
   //   const incoming = parseProviderPayload(req.body); // { from, text }
   //   if (!incoming?.text) return;
   //
   //   // 1) טוענים את היסטוריית השיחה של הלקוח לפי מספר הטלפון (DB / Redis):
   //   const history = await loadConversation(incoming.from);
   //   history.push({ role: 'user', content: incoming.text });
   //
   //   // 2) מפעילים את אותו מנוע סוכן בדיוק:
   //   const reply = await generateReply(history);
   //
   //   // 3) שומרים את התשובה ושולחים חזרה ללקוח דרך ה-API של הספק:
   //   history.push({ role: 'assistant', content: reply });
   //   await saveConversation(incoming.from, history);
   //   await sendWhatsAppMessage(incoming.from, reply); // Twilio / 360dialog / Meta
   // });
   //
   // מה צריך להוסיף כשנגיע לשם:
   //   - אחסון שיחות מתמשך (DB) במקום זיכרון לקוח.
   //   - אימות חתימת ה-webhook (signature verification) של הספק.
   //   - parseProviderPayload + sendWhatsAppMessage לפי הספק שנבחר.
   //   - תור/דהבאונס להודעות רצופות מאותו לקוח.
   ======================================================================= */
