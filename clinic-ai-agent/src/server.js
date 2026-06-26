// שרת Aura — מחבר את כל המודל:
//   /            דף נחיתה
//   /chat        ממשק צ'אט ללקוחה (מדמה וואטסאפ)
//   /admin       דשבורד ניהול (CRM): שיחות, תורים, לקוחות, סטטיסטיקות
//   /api/chat    שיחה: עוברת דרך ה-CRM, הסוכן פועל עם כלים (קובע תורים וכו')
//   /api/admin/* נתונים לדשבורד
// אין מפתחות בקוד — נטענים מ-.env.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as crm from './crm.js';
import { runAgent, agentSystem } from './agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n⛔ חסר ANTHROPIC_API_KEY. צרו קובץ .env (העתיקו מ-.env.example).\n');
  process.exit(1);
}

const config = crm.config;
const SYSTEM = agentSystem(config); // נבנה פעם אחת בעלייה

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR, { index: false }));

/* ---------- דפים ---------- */
app.get('/', (_q, res) => res.sendFile(path.join(PUBLIC_DIR, 'landing.html')));
app.get('/chat', (_q, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/admin', (_q, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

/* ---------- ברכת פתיחה (דטרמיניסטית, ללא קריאת מודל) ---------- */
app.get('/api/greeting', (_q, res) => {
  const name = config.assistantName || 'העוזרת האישית';
  const business = config.businessName || 'הקליניקה';
  res.json({
    greeting: `שלום וברוכה הבאה ל${business}! 💕 אני ${name}, העוזרת האישית כאן. איך אפשר לפנק אותך היום?`,
    businessName: business,
    assistantName: name,
  });
});

/* ---------- שיחה (עוברת דרך ה-CRM) ---------- */
// הלקוח שולח { conversationId?, message }. השרת מנהל את ההיסטוריה ב-CRM,
// מריץ את הסוכן (שיכול לקבוע תורים וכו'), ושומר הכל.
app.post('/api/chat', async (req, res) => {
  try {
    const { conversationId, message } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'הודעה ריקה' });
    }

    let conv = conversationId ? crm.getConversation(conversationId) : null;
    if (!conv) {
      const contact = crm.getOrCreateContact({ channel: 'web' });
      conv = crm.createConversation({ contactId: contact.id, channel: 'web' });
    }

    crm.appendMessage(conv.id, 'user', message.trim());

    const { reply, actions } = await runAgent({
      system: SYSTEM,
      history: conv.messages,
      ctx: { conversationId: conv.id, contactId: conv.contactId },
    });

    crm.appendMessage(conv.id, 'assistant', reply);
    res.json({ conversationId: conv.id, reply, actions });
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error('שגיאת צ\'אט:', err?.message || err);
    res.status(status).json({
      error: status === 400 ? 'קלט לא תקין' : 'אופס, משהו השתבש. נסו שוב בעוד רגע 🙏',
    });
  }
});

/* ---------- API לדשבורד הניהול ---------- */
app.get('/api/admin/overview', async (_q, res) => {
  res.json({
    stats: crm.stats(),
    conversations: crm.listConversations().slice(0, 60).map((c) => {
      const contact = crm.getContact(c.contactId);
      const last = c.messages[c.messages.length - 1];
      return {
        id: c.id, channel: c.channel, status: c.status, note: c.note,
        contactName: contact?.name || null, contactPhone: contact?.phone || null,
        messageCount: c.messages.length, updatedAt: c.updatedAt,
        lastMessage: last ? { role: last.role, content: last.content } : null,
      };
    }),
    appointments: crm.listAppointments(),
    contacts: crm.listContacts().slice(0, 60),
    availableSlots: await crm.getAvailableSlots().catch(() => []),
  });
});

app.get('/api/admin/conversation/:id', (req, res) => {
  const conv = crm.getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: 'שיחה לא נמצאה' });
  const contact = crm.getContact(conv.contactId);
  res.json({ ...conv, contact });
});

app.listen(PORT, () => {
  console.log(`\n✨ ${config.businessName} — מערכת Aura פעילה`);
  console.log(`   דף נחיתה:  http://localhost:${PORT}/`);
  console.log(`   צ'אט דמו:  http://localhost:${PORT}/chat`);
  console.log(`   דשבורד:    http://localhost:${PORT}/admin\n`);
});

/* =======================================================================
   שלב 2 — חיבור WhatsApp Business API (Twilio / 360dialog / Meta Cloud API)
   -----------------------------------------------------------------------
   כל הלוגיקה כבר מוכנה. ערוץ חדש = רק מתאם (adapter) שממפה הודעה נכנסת
   ל-CRM ומריץ את אותו סוכן. כך זה ייראה:

   // app.post('/webhook/whatsapp', async (req, res) => {
   //   res.sendStatus(200); // לאשר מיד לספק
   //   const { from, text } = parseProviderPayload(req.body); // לפי הספק
   //   if (!text) return;
   //
   //   // 1) מאתרים/יוצרים לקוח לפי הטלפון, ומאתרים/פותחים שיחה פתוחה:
   //   const contact = crm.getOrCreateContact({ phone: from, channel: 'whatsapp', externalId: from });
   //   let conv = crm.listConversations().find(c => c.contactId === contact.id && c.status !== 'closed')
   //           || crm.createConversation({ contactId: contact.id, channel: 'whatsapp' });
   //
   //   // 2) אותו מנוע סוכן בדיוק (כולל קביעת תורים אוטומטית ל-CRM):
   //   crm.appendMessage(conv.id, 'user', text);
   //   const { reply } = await runAgent({ system: SYSTEM, history: conv.messages,
   //                                      ctx: { conversationId: conv.id, contactId: contact.id } });
   //   crm.appendMessage(conv.id, 'assistant', reply);
   //
   //   // 3) שולחים את התשובה חזרה דרך ה-API של הספק:
   //   await sendWhatsAppMessage(from, reply);
   // });
   //
   // מה שנשאר להוסיף: אימות חתימת ה-webhook, ומימוש
   // parseProviderPayload + sendWhatsAppMessage לפי הספק שנבחר.
   ======================================================================= */
