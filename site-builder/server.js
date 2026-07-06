import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import * as store from './lib/store.js';
import { hasApiKey, MODEL, generateSite, editSite } from './lib/anthropic.js';
import { demoSite, demoEdit } from './lib/demo.js';
import { forwardLeadToGHL, ghlConfigured } from './lib/ghl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------

function sseInit(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function progressReporter(res) {
  let chars = 0;
  let lastSent = 0;
  return (text) => {
    chars += text.length;
    if (chars - lastSent >= 2000) {
      lastSent = chars;
      sseSend(res, { type: 'progress', chars });
    }
  };
}

const LEAD_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ---------- API ----------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, demoMode: !hasApiKey, model: MODEL, ghl: ghlConfigured() });
});

app.get('/api/projects', (req, res) => {
  res.json(store.listProjects());
});

app.post('/api/projects', (req, res) => {
  const { name, prompt, style, language } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'חסר תיאור של האתר' });
  }
  const meta = store.createProject({ name, prompt, style, language });
  res.status(201).json(meta);
});

app.get('/api/projects/:id', (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).json({ error: 'הפרויקט לא נמצא' });
  res.json(meta);
});

app.patch('/api/projects/:id', (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).json({ error: 'הפרויקט לא נמצא' });
  const { name, ghl } = req.body || {};
  if (typeof name === 'string' && name.trim()) meta.name = name.trim().slice(0, 120);
  if (ghl && typeof ghl === 'object') {
    meta.ghl = {
      locationId: String(ghl.locationId || '').trim().slice(0, 100),
      tags: Array.isArray(ghl.tags)
        ? ghl.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
        : meta.ghl?.tags || [],
    };
  }
  store.saveMeta(meta);
  res.json(meta);
});

app.delete('/api/projects/:id', (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).json({ error: 'הפרויקט לא נמצא' });
  store.deleteProject(req.params.id);
  res.json({ ok: true });
});

// Generate the site (first time or regenerate). Streams progress as SSE.
app.post('/api/projects/:id/generate', async (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).json({ error: 'הפרויקט לא נמצא' });
  sseInit(res);
  // Comment-frames keep the connection alive through long silent phases
  // (model thinking) so proxies don't kill the stream.
  const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
  try {
    sseSend(res, {
      type: 'status',
      message: hasApiKey ? `Claude (${MODEL}) מעצב את האתר...` : 'מצב דמו — נוצר אתר לדוגמה (אין ANTHROPIC_API_KEY)',
    });
    const onText = progressReporter(res);
    const html = hasApiKey ? await generateSite(meta, onText) : await demoSite(meta, onText);
    const version = store.addVersion(meta.id, html, meta.versions.length ? 'יצירה מחדש של האתר' : 'יצירת האתר');
    sseSend(res, { type: 'done', projectId: meta.id, version });
  } catch (err) {
    sseSend(res, { type: 'error', message: String(err?.message || err) });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// Chat-edit the site. Streams progress as SSE.
app.post('/api/projects/:id/edit', async (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).json({ error: 'הפרויקט לא נמצא' });
  const instruction = String(req.body?.instruction || '').trim();
  if (!instruction) return res.status(400).json({ error: 'חסרה הוראת עריכה' });
  const html = store.readVersion(meta.id, meta.head);
  if (!html) return res.status(400).json({ error: 'אין עדיין גרסה לערוך — צור את האתר קודם' });
  sseInit(res);
  const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
  try {
    sseSend(res, {
      type: 'status',
      message: hasApiKey ? `Claude (${MODEL}) מעדכן את האתר...` : 'מצב דמו — מדמה עריכה (אין ANTHROPIC_API_KEY)',
    });
    const onText = progressReporter(res);
    const updated = hasApiKey
      ? await editSite(meta, html, instruction, onText)
      : await demoEdit(html, instruction, onText);
    const version = store.addVersion(meta.id, updated, instruction);
    sseSend(res, { type: 'done', projectId: meta.id, version });
  } catch (err) {
    sseSend(res, { type: 'error', message: String(err?.message || err) });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.post('/api/projects/:id/revert', (req, res) => {
  try {
    const meta = store.setHead(req.params.id, req.body?.version);
    res.json(meta);
  } catch (err) {
    res.status(400).json({ error: String(err?.message || err) });
  }
});

// ---------- Leads (called by the generated sites' contact forms) ----------

app.options('/api/lead/:id', (req, res) => {
  res.set(LEAD_CORS).sendStatus(204);
});

app.post('/api/lead/:id', async (req, res) => {
  res.set(LEAD_CORS);
  try {
    const meta = store.getProject(req.params.id);
    if (!meta) return res.status(404).json({ error: 'project not found' });
    const { name, email, phone, message } = req.body || {};
    if (!name && !email && !phone && !message) {
      return res.status(400).json({ error: 'empty lead' });
    }
    const lead = {
      name: String(name || '').slice(0, 200),
      email: String(email || '').slice(0, 200),
      phone: String(phone || '').slice(0, 50),
      message: String(message || '').slice(0, 2000),
      createdAt: new Date().toISOString(),
      source: `Bildy: ${meta.name}`,
    };
    // Always stored locally; forwarded to GHL only when there's email/phone to match on.
    const ghl = await forwardLeadToGHL(lead, meta.ghl);
    store.addLead(meta.id, { ...lead, ghl });
    res.json({ ok: true, ghl });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get('/api/projects/:id/leads', (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).json({ error: 'הפרויקט לא נמצא' });
  res.json(store.listLeads(req.params.id));
});

// ---------- Preview & export ----------

function sendHtml(res, html) {
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
}

const NO_VERSION_PAGE = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:sans-serif;background:#0f1115;color:#9aa3b2;display:grid;place-items:center;height:100vh;margin:0}</style></head><body><p>עדיין אין גרסה לאתר הזה</p></body></html>`;

app.get('/preview/:id', (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).send('not found');
  const html = store.readVersion(meta.id, meta.head);
  sendHtml(res, html || NO_VERSION_PAGE);
});

app.get('/preview/:id/v/:v', (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).send('not found');
  const html = store.readVersion(meta.id, req.params.v);
  sendHtml(res, html || NO_VERSION_PAGE);
});

app.get('/api/projects/:id/export', (req, res) => {
  const meta = store.getProject(req.params.id);
  if (!meta) return res.status(404).json({ error: 'הפרויקט לא נמצא' });
  const html = store.readVersion(meta.id, meta.head);
  if (!html) return res.status(400).json({ error: 'אין גרסה לייצוא' });
  const slug = meta.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'site';
  res.attachment(`${slug}.zip`);
  const zip = archiver('zip', { zlib: { level: 9 } });
  zip.on('error', () => res.end());
  zip.pipe(res);
  zip.append(html, { name: 'index.html' });
  zip.append(
    `האתר "${meta.name}" נוצר עם Bildy.\n\n` +
      `הקובץ index.html עצמאי לחלוטין — אפשר להעלות אותו לכל אחסון סטטי (Netlify, Vercel, S3, cPanel).\n` +
      `שימו לב: טופס הלידים שולח אל ${req.protocol}://${req.get('host')}/api/lead/${meta.id} — ` +
      `אם האתר מתארח בדומיין אחר, ודאו שכתובת ה-LEAD_ENDPOINT בקובץ מצביעה לשרת ה-Bildy שלכם (כתובת מלאה כולל https).\n`,
    { name: 'README.txt' },
  );
  zip.finalize();
});

app.listen(PORT, () => {
  console.log(`Bildy running on http://localhost:${PORT}`);
  console.log(`Mode: ${hasApiKey ? `Claude API (${MODEL})` : 'DEMO (set ANTHROPIC_API_KEY in .env)'} | GHL: ${ghlConfigured() ? 'configured' : 'not configured'}`);
});
