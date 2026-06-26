// צ'אט בטרמינל — עכשיו עובר דרך ה-CRM והסוכן עם הכלים (קובע תורים אמיתיים).
// הרצה:  npm run cli
import 'dotenv/config';
import readline from 'node:readline';
import * as crm from './crm.js';
import { runAgent, agentSystem } from './agent.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n⛔ חסר ANTHROPIC_API_KEY. צרו קובץ .env (העתיקו מ-.env.example).\n');
  process.exit(1);
}

const config = crm.config;
const SYSTEM = agentSystem(config);
const name = config.assistantName || 'העוזרת';
const business = config.businessName || 'הקליניקה';

// פותחים לקוח ושיחה ב-CRM (יופיעו בדשבורד /admin).
const contact = crm.getOrCreateContact({ channel: 'cli' });
const conv = crm.createConversation({ contactId: contact.id, channel: 'cli' });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`\n💬 צ'אט עם ${name} מ${business}  (כתבו "יציאה" לסיום)`);
console.log(`   השיחה נשמרת ב-CRM · ${conv.id}\n`);
console.log(`${name}: שלום וברוכה הבאה ל${business}! 💕 אני ${name}. איך אפשר לפנק אותך היום?\n`);

function prompt() {
  rl.question('את/ה: ', async (input) => {
    const text = input.trim();
    if (!text) return prompt();
    if (['יציאה', 'exit', 'quit'].includes(text.toLowerCase())) {
      console.log(`\n${name}: שיהיה לך יום מקסים! ✨\n`);
      rl.close();
      return;
    }

    crm.appendMessage(conv.id, 'user', text);
    process.stdout.write(`\n${name} מקלידה…\r`);

    try {
      const { reply, actions } = await runAgent({
        system: SYSTEM,
        history: conv.messages,
        ctx: { conversationId: conv.id, contactId: contact.id },
      });
      crm.appendMessage(conv.id, 'assistant', reply);
      for (const a of actions) {
        if (a.name === 'book_appointment' || a.name === 'escalate_to_human') {
          console.log(`   ⚙️  [${a.name}] ${a.result}`);
        }
      }
      console.log(`${name}: ${reply}\n`);
    } catch (err) {
      console.error(`\n⚠️  שגיאה: ${err?.message || err}\n`);
    }
    prompt();
  });
}

prompt();
