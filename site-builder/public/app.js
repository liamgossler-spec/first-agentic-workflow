/* Bildy front-end: hash router with two views (dashboard / editor). */

const $ = (sel) => document.querySelector(sel);

const state = {
  health: { demoMode: true, model: '', ghl: false },
  project: null,
  generating: false,
  device: 'desktop',
  viewedVersion: null, // version shown in the iframe (defaults to head)
};

// ---------- utilities ----------

async function api(url, opts = {}) {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `שגיאה (${resp.status})`);
  return data;
}

/* Read an SSE stream from a POST response. */
async function streamPost(url, body, onEvent) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ctype = resp.headers.get('content-type') || '';
  if (!ctype.includes('text/event-stream')) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `שגיאה (${resp.status})`);
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) {
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        onEvent(ev); // may throw (e.g. server 'error' event) — must propagate to the caller
      }
    }
  }
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4200);
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function esc(s) {
  // Escapes quotes too, so values are safe inside attributes (e.g. title="...").
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ---------- router ----------

window.addEventListener('hashchange', route);

function route() {
  const m = location.hash.match(/^#\/p\/([a-f0-9-]+)(\?gen=1)?$/i);
  if (m) {
    showEditor(m[1], Boolean(m[2]));
  } else {
    showDashboard();
  }
}

// ---------- dashboard ----------

async function showDashboard() {
  state.project = null;
  $('#view-editor').classList.add('hidden');
  $('#view-dashboard').classList.remove('hidden');
  const projects = await api('/api/projects').catch(() => []);
  const grid = $('#projectGrid');
  $('#emptyState').classList.toggle('hidden', projects.length > 0);
  grid.innerHTML = '';
  for (const p of projects) {
    const hasSite = p.versions.length > 0;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb" data-open="${p.id}">
        ${hasSite
          ? `<iframe loading="lazy" sandbox="allow-same-origin" src="/preview/${p.id}"></iframe>`
          : `<div class="thumb-empty">עדיין לא נוצר — לחץ לפתיחה</div>`}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(p.name)}</div>
        <div class="card-sub">עודכן ${fmtDate(p.updatedAt)} · ${p.versions.length} גרסאות</div>
        <div class="card-actions">
          <button class="btn btn-primary" data-open="${p.id}">פתח</button>
          ${hasSite ? `<a class="btn btn-ghost" href="/api/projects/${p.id}/export">ZIP</a>` : ''}
          <button class="btn btn-danger" data-del="${p.id}">מחק</button>
        </div>
      </div>`;
    grid.appendChild(card);
  }
  grid.onclick = async (e) => {
    const open = e.target.closest('[data-open]');
    const del = e.target.closest('[data-del]');
    if (open) location.hash = `#/p/${open.dataset.open}`;
    if (del) {
      if (!confirm('למחוק את הפרויקט לצמיתות?')) return;
      await api(`/api/projects/${del.dataset.del}`, { method: 'DELETE' }).catch((err) => toast(err.message, true));
      showDashboard();
    }
  };
}

// ---------- new project ----------

const newModal = $('#newModal');
window.openNewModal = () => newModal.showModal();
$('#btnNew').onclick = () => newModal.showModal();

$('#newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const meta = await api('/api/projects', {
      method: 'POST',
      body: {
        name: $('#npName').value.trim(),
        prompt: $('#npPrompt').value.trim(),
        style: $('#npStyle').value,
        language: $('#npLang').value,
      },
    });
    newModal.close();
    e.target.reset();
    location.hash = `#/p/${meta.id}?gen=1`;
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- editor ----------

async function showEditor(id, autoGenerate) {
  let meta;
  try {
    meta = await api(`/api/projects/${id}`);
  } catch {
    toast('הפרויקט לא נמצא', true);
    location.hash = '';
    return;
  }
  state.project = meta;
  state.viewedVersion = meta.head || null;
  $('#view-dashboard').classList.add('hidden');
  $('#view-editor').classList.remove('hidden');
  $('#edName').textContent = meta.name;
  $('#btnExport').href = `/api/projects/${id}/export`;
  renderVersions();
  renderChat();
  refreshFrame();

  if (autoGenerate && meta.versions.length === 0 && !state.generating) {
    // strip the ?gen=1 so refresh doesn't regenerate
    history.replaceState(null, '', `#/p/${id}`);
    runGeneration(`/api/projects/${id}/generate`);
  }
}

function previewUrl() {
  const { project, viewedVersion } = state;
  if (!project) return 'about:blank';
  if (viewedVersion && viewedVersion !== project.head) {
    return `/preview/${project.id}/v/${viewedVersion}`;
  }
  return `/preview/${project.id}?t=${Date.now()}`;
}

function refreshFrame() {
  $('#previewFrame').src = previewUrl();
  $('#btnOpenTab').href = previewUrl();
}

function renderVersions() {
  const { project, viewedVersion } = state;
  const sel = $('#versionSelect');
  sel.innerHTML = '';
  $('#btnExport').classList.toggle('hidden', !project.versions.length);
  if (!project.versions.length) {
    sel.innerHTML = '<option>אין גרסאות</option>';
    sel.disabled = true;
    $('#btnRevert').classList.add('hidden');
    return;
  }
  sel.disabled = false;
  for (const v of [...project.versions].reverse()) {
    const opt = document.createElement('option');
    opt.value = v.v;
    opt.textContent = `גרסה ${v.v}${v.v === project.head ? ' (נוכחית)' : ''}`;
    if (v.v === viewedVersion) opt.selected = true;
    sel.appendChild(opt);
  }
  $('#btnRevert').classList.toggle('hidden', viewedVersion === project.head);
}

$('#versionSelect').addEventListener('change', (e) => {
  state.viewedVersion = Number(e.target.value);
  renderVersions();
  refreshFrame();
});

$('#btnRevert').onclick = async () => {
  try {
    const meta = await api(`/api/projects/${state.project.id}/revert`, {
      method: 'POST',
      body: { version: state.viewedVersion },
    });
    state.project = meta;
    state.viewedVersion = meta.head;
    renderVersions();
    refreshFrame();
    toast(`שוחזר לגרסה ${meta.head}`);
  } catch (err) {
    toast(err.message, true);
  }
};

function renderChat() {
  const log = $('#chatLog');
  log.innerHTML = '';
  const { project } = state;
  if (!project.versions.length) {
    log.innerHTML = `<div class="msg">ברגע שהאתר ייווצר, תוכל לבקש כאן כל שינוי בשפה חופשית — צבעים, טקסטים, סקשנים, הכל.</div>`;
    return;
  }
  for (const v of project.versions) {
    const div = document.createElement('div');
    div.className = `msg${v.v === project.head ? ' current' : ''}`;
    div.innerHTML = `${esc(v.instruction)}<div class="msg-meta"><span>גרסה ${v.v}</span><span>${fmtDate(v.createdAt)}</span></div>`;
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;
}

function setGenerating(on, statusText = '') {
  state.generating = on;
  $('#genProgress').classList.toggle('hidden', !on);
  $('#genStatus').textContent = statusText;
  $('#genChars').textContent = '';
  $('#chatText').disabled = on;
  $('#chatForm').querySelector('button').disabled = on;
}

async function runGeneration(url, body) {
  const projectId = state.project.id;
  setGenerating(true, 'מתחיל...');
  try {
    let done = false;
    await streamPost(url, body, (ev) => {
      if (ev.type === 'status') $('#genStatus').textContent = ev.message;
      if (ev.type === 'progress') $('#genChars').textContent = `${ev.chars.toLocaleString('he-IL')} תווים נכתבו...`;
      if (ev.type === 'error') throw new Error(ev.message);
      if (ev.type === 'done') done = true;
    });
    if (!done) throw new Error('החיבור נסגר לפני שהיצירה הסתיימה');
    if (state.project?.id !== projectId) return; // user navigated away mid-generation
    const meta = await api(`/api/projects/${projectId}`);
    state.project = meta;
    state.viewedVersion = meta.head;
    renderVersions();
    renderChat();
    refreshFrame();
    toast('האתר עודכן ✦');
  } catch (err) {
    toast(err.message, true);
  } finally {
    setGenerating(false);
  }
}

$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#chatText').value.trim();
  if (!text || state.generating || !state.project) return;
  $('#chatText').value = '';
  if (!state.project.versions.length) {
    runGeneration(`/api/projects/${state.project.id}/generate`);
    return;
  }
  runGeneration(`/api/projects/${state.project.id}/edit`, { instruction: text });
});

$('#chatText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#chatForm').requestSubmit();
  }
});

// device toggle
document.querySelectorAll('.dev').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dev').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $('#frameWrap').className = `frame-wrap ${btn.dataset.dev}`;
  });
});

// ---------- settings (GHL) ----------

const settingsModal = $('#settingsModal');
$('#btnSettings').onclick = () => {
  const { project } = state;
  $('#setName').value = project.name;
  $('#setGhlLocation').value = project.ghl?.locationId || '';
  $('#setGhlTags').value = (project.ghl?.tags || []).join(', ');
  $('#ghlStatus').textContent = state.health.ghl
    ? '✓ GHL_API_KEY מוגדר בשרת — לידים יסונכרנו אוטומטית.'
    : '✗ GHL_API_KEY לא מוגדר ב-.env — לידים יישמרו מקומית בלבד.';
  settingsModal.showModal();
};

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const meta = await api(`/api/projects/${state.project.id}`, {
      method: 'PATCH',
      body: {
        name: $('#setName').value.trim(),
        ghl: {
          locationId: $('#setGhlLocation').value.trim(),
          tags: $('#setGhlTags').value.split(',').map((t) => t.trim()).filter(Boolean),
        },
      },
    });
    state.project = meta;
    $('#edName').textContent = meta.name;
    settingsModal.close();
    toast('ההגדרות נשמרו');
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- leads ----------

const leadsModal = $('#leadsModal');
$('#btnLeads').onclick = async () => {
  try {
    const leads = await api(`/api/projects/${state.project.id}/leads`);
    const wrap = $('#leadsTableWrap');
    if (!leads.length) {
      wrap.innerHTML = '<p class="hint">עוד לא נקלטו לידים. כל שליחת טופס באתר תופיע כאן ותסונכרן ל-GoHighLevel.</p>';
    } else {
      wrap.innerHTML = `<table class="leads-table">
        <tr><th>מתי</th><th>שם</th><th>טלפון</th><th>אימייל</th><th>הודעה</th><th>GHL</th></tr>
        ${leads.slice().reverse().map((l) => `<tr>
          <td>${fmtDate(l.createdAt)}</td>
          <td>${esc(l.name)}</td>
          <td dir="ltr">${esc(l.phone)}</td>
          <td dir="ltr">${esc(l.email)}</td>
          <td>${esc(l.message)}</td>
          <td>${l.ghl?.forwarded ? '<span class="lead-ok">✓ סונכרן</span>' : `<span class="lead-fail" title="${esc(l.ghl?.reason || '')}">✗</span>`}</td>
        </tr>`).join('')}
      </table>`;
    }
    leadsModal.showModal();
  } catch (err) {
    toast(err.message, true);
  }
};

// ---------- boot ----------

(async function boot() {
  try {
    state.health = await api('/api/health');
    const pill = $('#statusPill');
    if (state.health.demoMode) {
      pill.textContent = 'מצב דמו — הגדר ANTHROPIC_API_KEY ליצירה אמיתית';
      pill.classList.add('warn');
    } else {
      pill.textContent = `מחובר ל-${state.health.model}${state.health.ghl ? ' · GHL פעיל' : ''}`;
      pill.classList.add('ok');
    }
  } catch {
    $('#statusPill').textContent = 'השרת לא זמין';
  }
  route();
})();
