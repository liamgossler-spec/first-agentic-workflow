// צ'אט בטרמינל עם הסוכנת — חלופה מהירה לבדיקה בלי דפדפן.
// הרצה:  npm run cli
import 'dotenv/config';
import readline from 'node:readline';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { buildSystemPrompt } from './systemPrompt.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n⛔ חסר ANTHROPIC_API_KEY. צרו קובץ .env (העתיקו מ-.env.example).\n');
  process.exit(1);
}

const config = loadConfig();
const SYSTEM_PROMPT = buildSystemPrompt(config);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// כל ההיסטוריה נשמרת כאן ונשלחת בכל קריאה — כך הסוכנת זוכרת את השיחה.
const messages = [];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const name = config.assistantName || 'העוזרת';
const business = config.businessName || 'הקליניקה';

console.log(`\n💬 צ'אט עם ${name} מ${business}`);
console.log('   (כתבו "יציאה" או Ctrl+C כדי לסיים)\n');
console.log(`${name}: שלום וברוכה הבאה ל${business}! 💕 אני ${name}. איך אפשר לפנק אותך היום?\n`);

function prompt() {
  rl.question('את/ה: ', async (input) => {
    const text = input.trim();
    if (!text) return prompt();
    if (['יציאה', 'exit', 'quit'].includes(text.toLowerCase())) {
      console.log(`\n${name}: שיהיה לך יום מקסים, נתראה בקרוב! ✨\n`);
      rl.close();
      return;
    }

    messages.push({ role: 'user', content: text });
    process.stdout.write(`\n${name} מקלידה…\r`);

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      });
      const reply = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      messages.push({ role: 'assistant', content: reply });
      console.log(`${name}: ${reply}\n`);
    } catch (err) {
      console.error(`\n⚠️  שגיאה: ${err?.message || err}\n`);
      messages.pop(); // מסירים את ההודעה האחרונה כדי לא להישאר עם היסטוריה שבורה
    }

    prompt();
  });
}

prompt();
