// שכבת ה-CRM — כל הפעולות העסקיות מעל מסד הנתונים.
// זה ה"מקור האמת" היחיד: לקוחות, שיחות (מכל הערוצים) ותורים — הכל במקום אחד.
import { db, persist, id } from './store.js';
import { loadConfig } from './config.js';
import * as altegio from './altegio.js';

export const config = loadConfig();
const now = () => new Date().toISOString();

/* ---------- לקוחות (Contacts) ---------- */
export function getOrCreateContact({ name = null, phone = null, channel = 'web', externalId = null }) {
  let c = null;
  if (externalId) c = db.contacts.find((x) => x.externalId === externalId && x.channel === channel);
  if (!c && phone) c = db.contacts.find((x) => x.phone === phone);
  if (!c) {
    c = { id: id('contact'), name, phone, channel, externalId, tags: [], createdAt: now() };
    db.contacts.push(c);
    persist();
  }
  return c;
}
export function updateContact(contactId, { name, phone } = {}) {
  const c = db.contacts.find((x) => x.id === contactId);
  if (!c) return null;
  if (name) c.name = name;
  if (phone) c.phone = phone;
  persist();
  return c;
}
export function getContact(contactId) {
  return db.contacts.find((x) => x.id === contactId) || null;
}

/* ---------- שיחות (Conversations) ---------- */
export function createConversation({ contactId, channel = 'web' }) {
  const conv = {
    id: id('conv'), contactId, channel, status: 'open',
    note: null, messages: [], createdAt: now(), updatedAt: now(),
  };
  db.conversations.push(conv);
  persist();
  return conv;
}
export function getConversation(convId) {
  return db.conversations.find((c) => c.id === convId) || null;
}
export function appendMessage(convId, role, content) {
  const c = getConversation(convId);
  if (!c) return;
  c.messages.push({ role, content, at: now() });
  c.updatedAt = now();
  persist();
}
export function setStatus(convId, status, note = null) {
  const c = getConversation(convId);
  if (!c) return;
  c.status = status;
  if (note) c.note = note;
  c.updatedAt = now();
  persist();
}

/* ---------- זמינות ותורים (Availability & Appointments) ---------- */
export function getBookedSlots() {
  return db.appointments.filter((a) => a.status === 'booked').map((a) => a.datetime);
}
export async function getAvailableSlots() {
  // ספק Altegio (אם מופעל) — יומן הקליניקה האמיתי; אחרת המאגר המקומי.
  if (altegio.enabled()) return altegio.getAvailableSlots();
  const booked = new Set(getBookedSlots());
  return (config.availableSlots || []).filter((s) => !booked.has(s));
}
export async function bookAppointment({ conversationId = null, contactId, contactName = null, service, datetime }) {
  let source = 'local';
  if (altegio.enabled()) {
    const contact = getContact(contactId);
    await altegio.createBooking({ clientName: contactName || contact?.name, phone: contact?.phone, service, datetime });
    source = 'altegio';
  }
  // נשמר גם מקומית — כדי שהתור יופיע בדשבורד ובהקשר השיחה.
  const appt = {
    id: id('appt'), conversationId, contactId, contactName,
    service, datetime, status: 'booked', source, createdAt: now(),
  };
  db.appointments.push(appt);
  persist();
  return appt;
}

/* ---------- שאילתות לדשבורד ---------- */
export function listConversations() {
  return [...db.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function listContacts() {
  return [...db.contacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function listAppointments() {
  return [...db.appointments].sort((a, b) => a.datetime.localeCompare(b.datetime));
}
export function stats() {
  return {
    conversations: db.conversations.length,
    appointments: db.appointments.filter((a) => a.status === 'booked').length,
    contacts: db.contacts.length,
    needsHuman: db.conversations.filter((c) => c.status === 'needs_human').length,
  };
}
