// GoHighLevel (LeadConnector) integration.
// Leads captured by generated sites are forwarded to a GHL sub-account (Location)
// as contacts, so each client site feeds the GHL CRM directly.
//
// Auth: the v2 API (services.leadconnectorhq.com) requires a Private Integration
// Token — GHL: Settings → Private Integrations → Create, scope: contacts.write.
// Old v1 agency API keys will NOT work here. Set the token as GHL_API_KEY in .env.
// The default Location comes from GHL_LOCATION_ID; each project can override it
// (per-client sub-account) in the project settings.

const GHL_API_BASE = process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = process.env.GHL_API_VERSION || '2021-07-28';
const GHL_TIMEOUT_MS = 15000;

export function ghlConfigured() {
  return Boolean(process.env.GHL_API_KEY);
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    Version: GHL_API_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function forwardLeadToGHL(lead, projectGhl = {}) {
  if (!ghlConfigured()) {
    return { forwarded: false, reason: 'GHL_API_KEY לא מוגדר ב-.env' };
  }
  const locationId = projectGhl.locationId || process.env.GHL_LOCATION_ID;
  if (!locationId) {
    return { forwarded: false, reason: 'לא הוגדר Location ID (לא בפרויקט ולא ב-.env)' };
  }
  if (!lead.email && !lead.phone) {
    return { forwarded: false, reason: 'אין אימייל או טלפון — לא נשלח ל-GHL' };
  }

  const nameParts = String(lead.name || '').trim().split(/\s+/).filter(Boolean);
  const body = {
    locationId,
    firstName: nameParts[0] || undefined,
    lastName: nameParts.slice(1).join(' ') || undefined,
    email: lead.email || undefined,
    phone: lead.phone || undefined,
    source: lead.source || 'Bildy',
    tags: Array.isArray(projectGhl.tags) && projectGhl.tags.length ? projectGhl.tags : undefined,
  };

  try {
    // Upsert (not plain create) so a returning lead with the same email/phone
    // updates the existing contact instead of failing as a duplicate.
    const resp = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GHL_TIMEOUT_MS),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { forwarded: false, reason: `GHL החזיר ${resp.status}`, detail: data?.message || data };
    }
    const contactId = data?.contact?.id || data?.id || null;
    const result = { forwarded: true, contactId };

    // Attach the free-text message as a note on the contact (best effort).
    if (contactId && lead.message) {
      try {
        const noteResp = await fetch(`${GHL_API_BASE}/contacts/${contactId}/notes`, {
          method: 'POST',
          headers: ghlHeaders(),
          body: JSON.stringify({ body: lead.message }),
          signal: AbortSignal.timeout(GHL_TIMEOUT_MS),
        });
        result.noteAdded = noteResp.ok;
      } catch {
        result.noteAdded = false;
      }
    }
    return result;
  } catch (err) {
    return { forwarded: false, reason: `שגיאת רשת מול GHL: ${err.message}` };
  }
}
