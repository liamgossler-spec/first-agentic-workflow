// Demo mode: used when ANTHROPIC_API_KEY is not set, so the whole flow
// (create → preview → leads → versions → export) can be exercised without
// spending API credits. Real generation/editing requires the API key.

function esc(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function demoSite(meta, onText) {
  const rtl = meta.language !== 'en';
  const name = esc(meta.name);
  const desc = esc(String(meta.prompt || '').slice(0, 220)) || (rtl ? 'עסק מקומי עם שירות מנצח' : 'A local business with winning service');
  const t = rtl
    ? {
        cta: 'דברו איתנו', features: 'למה אנחנו', f1: 'מקצועיות', f1d: 'צוות מנוסה שמלווה אתכם מהצעד הראשון ועד התוצאה.',
        f2: 'זמינות', f2d: 'מענה מהיר בכל ערוץ — טלפון, ווטסאפ או מייל.', f3: 'תוצאות', f3d: 'לקוחות מרוצים שממליצים עלינו הלאה.',
        contact: 'צרו קשר', nm: 'שם מלא', ph: 'טלפון', em: 'אימייל', msg: 'איך נוכל לעזור?', send: 'שליחה',
        ok: 'תודה! נחזור אליכם בהקדם.', err: 'משהו השתבש, נסו שוב.', demo: 'אתר דמו — הגדירו ANTHROPIC_API_KEY ליצירת אתר אמיתי עם Claude',
      }
    : {
        cta: 'Talk to us', features: 'Why us', f1: 'Expertise', f1d: 'An experienced team guiding you from day one to results.',
        f2: 'Availability', f2d: 'Fast response on every channel — phone, WhatsApp or email.', f3: 'Results', f3d: 'Happy clients who refer us forward.',
        contact: 'Contact us', nm: 'Full name', ph: 'Phone', em: 'Email', msg: 'How can we help?', send: 'Send',
        ok: 'Thanks! We will get back to you shortly.', err: 'Something went wrong, please try again.', demo: 'Demo site — set ANTHROPIC_API_KEY to generate a real site with Claude',
      };

  const html = `<!DOCTYPE html>
<html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0f1115;--panel:#171b23;--ink:#eceae4;--muted:#9aa3b2;--accent:#ffb547;--accent2:#4fd1c5}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:'Heebo','Space Grotesk',sans-serif;line-height:1.6}
header{position:sticky;top:0;background:rgba(15,17,21,.85);backdrop-filter:blur(10px);border-bottom:1px solid #232936;z-index:10}
.nav{max-width:1080px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;padding:16px 24px}
.logo{font-weight:800;font-size:1.3rem;color:var(--accent)}
.hero{max-width:1080px;margin:0 auto;padding:96px 24px 72px;text-align:center}
.hero h1{font-size:clamp(2.2rem,6vw,4rem);font-weight:800;letter-spacing:-.02em}
.hero p{color:var(--muted);max-width:620px;margin:20px auto 36px;font-size:1.15rem}
.btn{display:inline-block;background:var(--accent);color:#141414;font-weight:700;padding:14px 34px;border-radius:999px;text-decoration:none;border:0;font-size:1rem;cursor:pointer;transition:transform .15s}
.btn:hover{transform:translateY(-2px)}
section{max-width:1080px;margin:0 auto;padding:64px 24px}
h2{font-size:2rem;margin-bottom:32px;color:var(--accent2)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.card{background:var(--panel);border:1px solid #232936;border-radius:16px;padding:28px}
.card h3{margin-bottom:10px}
.card p{color:var(--muted)}
form{display:grid;gap:14px;max-width:520px}
input,textarea{background:var(--panel);border:1px solid #2b3242;border-radius:10px;padding:13px 15px;color:var(--ink);font:inherit}
input:focus,textarea:focus{outline:2px solid var(--accent)}
.note{margin-top:12px;font-weight:600}
footer{border-top:1px solid #232936;color:var(--muted);text-align:center;padding:28px;font-size:.9rem}
.demo-ribbon{background:#2b3242;color:#cfd6e4;text-align:center;font-size:.8rem;padding:6px}
</style>
</head>
<body>
<div class="demo-ribbon">${t.demo}</div>
<header><nav class="nav"><span class="logo">${name}</span><a class="btn" href="#contact">${t.cta}</a></nav></header>
<main>
<section class="hero"><h1>${name}</h1><p>${desc}</p><a class="btn" href="#contact">${t.cta}</a></section>
<section><h2>${t.features}</h2><div class="cards">
<div class="card"><h3>${t.f1}</h3><p>${t.f1d}</p></div>
<div class="card"><h3>${t.f2}</h3><p>${t.f2d}</p></div>
<div class="card"><h3>${t.f3}</h3><p>${t.f3d}</p></div>
</div></section>
<section id="contact"><h2>${t.contact}</h2>
<form id="leadForm">
<input name="name" placeholder="${t.nm}" required>
<input name="phone" placeholder="${t.ph}">
<input name="email" type="email" placeholder="${t.em}">
<textarea name="message" rows="4" placeholder="${t.msg}"></textarea>
<button class="btn" type="submit">${t.send}</button>
<div class="note" id="leadNote"></div>
</form></section>
</main>
<footer>${name} · Bildy</footer>
<script>
const LEAD_ENDPOINT = "/api/lead/${meta.id}";
document.getElementById('leadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button'), note = document.getElementById('leadNote');
  const data = Object.fromEntries(new FormData(f).entries());
  btn.disabled = true;
  try {
    const r = await fetch(LEAD_ENDPOINT, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if (!r.ok) throw new Error();
    note.textContent = "${t.ok}"; note.style.color = '#7ee2b8'; f.reset();
  } catch { note.textContent = "${t.err}"; note.style.color = '#ff8b7e'; }
  btn.disabled = false;
});
</script>
</body>
</html>`;

  // Simulate a short streaming build so the UI progress flow is exercised.
  const chunk = Math.ceil(html.length / 6);
  for (let i = 0; i < html.length; i += chunk) {
    onText?.(html.slice(i, i + chunk));
    await sleep(250);
  }
  return html;
}

export async function demoEdit(html, instruction, onText) {
  const note = `<div style="background:#2b3242;color:#cfd6e4;text-align:center;font-size:.8rem;padding:6px">מצב דמו — הבקשה "${esc(instruction)}" תיושם באמת כשיוגדר ANTHROPIC_API_KEY</div>`;
  const updated = html.includes('<body>')
    ? html.replace('<body>', `<body>\n${note}`)
    : note + html;
  onText?.(updated.slice(0, 2000));
  await sleep(400);
  return updated;
}
