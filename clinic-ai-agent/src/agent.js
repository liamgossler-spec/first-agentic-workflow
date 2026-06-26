// הסוכן עם כלים (Tool Use) — לא רק מדבר, אלא פועל מול ה-CRM:
// בודק זמינות, קובע תורים, שומר פרטי לקוחה, ומעביר למטפלת.
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import * as crm from './crm.js';
import { buildSystemPrompt } from './systemPrompt.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const MAX_TOOL_HOPS = 5;

// בנייה עצלה — כדי שטעינת המודול לא תיכשל לפני בדיקת המפתח הידידותית בשרת.
let _client;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// הגדרות הכלים שהמודל יכול לקרוא להן.
export const TOOLS = [
  {
    name: 'check_availability',
    description: 'בדיקת השעות הפנויות האמיתיות לקביעת תור. חובה להשתמש בכלי הזה לפני שמציעים ללקוחה שעה — אל תמציאי שעות.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'book_appointment',
    description: 'קביעת תור בפועל ללקוחה, לאחר שאישרה שירות ושעה. יש להעביר שעה מדויקת מתוך הרשימה שהוחזרה מ-check_availability.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string', description: 'שם הלקוחה' },
        service: { type: 'string', description: 'שם השירות' },
        datetime: { type: 'string', description: 'שעה פנויה מדויקת כפי שהוחזרה מ-check_availability' },
      },
      required: ['client_name', 'service', 'datetime'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_contact',
    description: 'שמירת פרטי הלקוחה (שם ו/או טלפון) במערכת כשהיא מוסרת אותם.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, phone: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'escalate_to_human',
    description: 'העברת השיחה למטפלת אנושית — בשאלה רפואית/רגישה, או כשאינך יכולה לעזור.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'סיבת ההעברה בקצרה' } },
      required: ['reason'],
      additionalProperties: false,
    },
  },
];

const TOOLS_NOTE = `

## כלים זמינים לך (מערכת הקליניקה / CRM)
יש לך גישה ישירה למערכת הקליניקה דרך כלים. השתמשי בהם — אל תמציאי מידע:
- **check_availability** — לראות שעות פנויות אמיתיות. השתמשי בו לפני שאת מציעה שעה.
- **book_appointment** — לסגור תור אחרי שהלקוחה אישרה שירות ושעה. סגרי תור רק דרך הכלי, עם שעה מתוך הרשימה הפנויה.
- **update_contact** — לשמור שם/טלפון של הלקוחה כשהיא מוסרת.
- **escalate_to_human** — בשאלה רפואית/רגישה, או כשאינך יכולה לעזור.
לעולם אל תמציאי תור או שעה — תמיד בדקי זמינות וקבעי דרך הכלים.`;

export function agentSystem(config) {
  return buildSystemPrompt(config) + TOOLS_NOTE;
}

// הרצת כלי בפועל מול ה-CRM. מחזיר טקסט תוצאה שחוזר למודל.
async function execTool(name, input, ctx) {
  try {
    if (name === 'check_availability') {
      const slots = await crm.getAvailableSlots();
      return slots.length ? `שעות פנויות: ${slots.join(' | ')}` : 'אין כרגע שעות פנויות במערכת.';
    }
    if (name === 'book_appointment') {
      const avail = await crm.getAvailableSlots();
      if (!avail.includes(input.datetime)) {
        return `השעה "${input.datetime}" אינה פנויה. השעות הפנויות כעת: ${avail.join(' | ') || 'אין'}.`;
      }
      if (input.client_name) crm.updateContact(ctx.contactId, { name: input.client_name });
      const appt = await crm.bookAppointment({
        conversationId: ctx.conversationId, contactId: ctx.contactId,
        contactName: input.client_name, service: input.service, datetime: input.datetime,
      });
      return `✅ נקבע תור: ${input.service} עבור ${input.client_name} ב-${input.datetime} (אסמכתא ${appt.id}).`;
    }
    if (name === 'update_contact') {
      crm.updateContact(ctx.contactId, { name: input.name, phone: input.phone });
      return 'פרטי הלקוחה נשמרו במערכת.';
    }
    if (name === 'escalate_to_human') {
      crm.setStatus(ctx.conversationId, 'needs_human', input.reason);
      return 'השיחה סומנה להעברה למטפלת. אשרי ללקוחה בעדינות שניצור איתה קשר.';
    }
    return `כלי לא מוכר: ${name}`;
  } catch (e) {
    return `שגיאה בהרצת הכלי ${name}: ${e.message}`;
  }
}

/**
 * מריץ את הסוכן על היסטוריית שיחה, כולל לולאת כלים.
 * @param {{system:string, history:Array<{role,content}>, ctx:{conversationId,contactId}}} p
 * @returns {Promise<{reply:string, actions:Array}>}
 */
export async function runAgent({ system, history, ctx }) {
  let messages = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  while (messages.length && messages[0].role === 'assistant') messages.shift();
  if (messages.length === 0) throw Object.assign(new Error('אין הודעת משתמש'), { status: 400 });

  const actions = [];
  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const resp = await client().messages.create({
      model: MODEL, max_tokens: MAX_TOKENS, system, messages, tools: TOOLS,
    });

    if (resp.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: resp.content });
      const results = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          const out = await execTool(block.name, block.input || {}, ctx);
          actions.push({ name: block.name, input: block.input, result: out });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: out });
        }
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return { reply: text, actions };
  }
  return { reply: 'סליחה, נתקלתי בבעיה רגעית. אפשר לנסות שוב בעוד רגע 🙏', actions };
}
