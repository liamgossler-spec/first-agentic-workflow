import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'projects');

fs.mkdirSync(DATA_DIR, { recursive: true });

const ID_RE = /^[a-f0-9-]{10,64}$/i;

function projectDir(id) {
  if (!ID_RE.test(id)) throw new Error('מזהה פרויקט לא תקין');
  return path.join(DATA_DIR, id);
}

function metaPath(id) {
  return path.join(projectDir(id), 'meta.json');
}

export function createProject({ name, prompt, style, language }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const meta = {
    id,
    name: String(name || 'אתר חדש').slice(0, 120),
    prompt: String(prompt || '').slice(0, 8000),
    style: String(style || 'modern'),
    language: String(language || 'he'),
    createdAt: now,
    updatedAt: now,
    head: 0,
    versions: [],
    ghl: { locationId: '', tags: [] },
  };
  fs.mkdirSync(path.join(projectDir(id), 'versions'), { recursive: true });
  saveMeta(meta);
  return meta;
}

export function saveMeta(meta) {
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2));
}

export function getProject(id) {
  try {
    return JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
  } catch {
    return null;
  }
}

export function listProjects() {
  const out = [];
  for (const id of fs.readdirSync(DATA_DIR)) {
    const meta = ID_RE.test(id) ? getProject(id) : null;
    if (meta) out.push(meta);
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

export function addVersion(id, html, instruction) {
  const meta = getProject(id);
  if (!meta) throw new Error('הפרויקט לא נמצא');
  const v = meta.versions.length + 1;
  fs.writeFileSync(path.join(projectDir(id), 'versions', `v${v}.html`), html);
  meta.versions.push({ v, instruction: String(instruction || '').slice(0, 2000), createdAt: new Date().toISOString() });
  meta.head = v;
  saveMeta(meta);
  return v;
}

export function readVersion(id, v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) return null;
  try {
    return fs.readFileSync(path.join(projectDir(id), 'versions', `v${n}.html`), 'utf8');
  } catch {
    return null;
  }
}

export function setHead(id, v) {
  const meta = getProject(id);
  if (!meta) throw new Error('הפרויקט לא נמצא');
  const n = Number(v);
  if (!meta.versions.some((x) => x.v === n)) throw new Error('גרסה לא קיימת');
  meta.head = n;
  saveMeta(meta);
  return meta;
}

export function deleteProject(id) {
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}

export function addLead(id, lead) {
  const leads = listLeads(id);
  leads.push(lead);
  fs.writeFileSync(path.join(projectDir(id), 'leads.json'), JSON.stringify(leads, null, 2));
  return lead;
}

export function listLeads(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir(id), 'leads.json'), 'utf8'));
  } catch {
    return [];
  }
}
