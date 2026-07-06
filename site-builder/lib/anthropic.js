import Anthropic from '@anthropic-ai/sdk';
import { generationSystem, generationUser, editSystem, editUser } from './prompts.js';

export const MODEL = process.env.SITE_BUILDER_MODEL || 'claude-opus-4-8';
export const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

const client = hasApiKey ? new Anthropic() : null;

async function run(system, userContent, onText) {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: userContent }],
  });
  if (onText) stream.on('text', onText);
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    throw new Error('הבקשה נדחתה על ידי המודל. נסה לנסח את תיאור האתר מחדש.');
  }
  if (final.stop_reason === 'max_tokens') {
    throw new Error('האתר שנוצר ארוך מדי ונחתך. נסה תיאור ממוקד יותר.');
  }
  const text = final.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractHtml(text);
}

export function generateSite(meta, onText) {
  return run(generationSystem(), generationUser(meta), onText);
}

export function editSite(meta, html, instruction, onText) {
  return run(editSystem(), editUser(meta, html, instruction), onText);
}

export function extractHtml(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence && /<html[\s>]/i.test(fence[1])) t = fence[1].trim();
  let start = t.search(/<!doctype\s+html/i);
  if (start === -1) start = t.search(/<html[\s>]/i);
  const closes = [...t.matchAll(/<\/html\s*>/gi)];
  const last = closes[closes.length - 1];
  if (start === -1 || !last || last.index < start) {
    throw new Error('המודל לא החזיר מסמך HTML שלם. נסה שוב.');
  }
  return t.slice(start, last.index + last[0].length);
}
