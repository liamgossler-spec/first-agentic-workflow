/* =====================================================================
   פרגו־פלאן  ·  Pergola project planner
   Vanilla JS · no build step · runs from file:// or any static host
   ===================================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const ce = (t) => Math.round(t); // clean number
  const m = (cm) => cm / 100; // cm -> m
  const fmtM = (cm) => (cm / 100).toFixed(2).replace(/\.00$/, "");
  const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("he-IL");
  const shekel = (n) => "₪" + Math.round(n).toLocaleString("he-IL");
  const linspace = (count, len) =>
    count < 2 ? [len / 2] : Array.from({ length: count }, (_, i) => (i * len) / (count - 1));

  /* ---------- material specs & default prices ---------- */
  const SPEC = {
    wood:     { post: "קורת עץ 10×10 ס״מ", beam: "קורת עץ 5×20 ס״מ", rafter: "לוח עץ 2×10 ס״מ", slat: "שלב עץ 2×4 ס״מ" },
    aluminum: { post: "פרופיל אלומיניום 10×10", beam: "פרופיל אלומיניום 5×15", rafter: "רפפת אלומיניום", slat: "שלב אלומיניום" },
    steel:    { post: "פרופיל פלדה 10×10", beam: "פרופיל פלדה HEA 160", rafter: "פרופיל פלדה 40×80", slat: "פרופיל פלדה" },
  };
  const PRICE = {
    wood:     { post: 55, beam: 48, rafter: 22, slat: 12 },
    aluminum: { post: 130, beam: 110, rafter: 65, slat: 40 },
    steel:    { post: 110, beam: 95, rafter: 55, slat: 45 },
    poly_m2: 95, footing_m3: 550, base_ea: 45, connector_ea: 18, hardware: 250,
  };
  const ROOF_LABEL = { open: "רפפות פתוחות", louver: "רפפות צפופות", slat: "שלבים דחוסים", poly: "פוליקרבונט" };

  /* ---------- app state ---------- */
  const state = {
    structure: "pergola",
    attach: "free",
    view: "top",
    photo: null,
    priceOverrides: {},
  };

  /* =====================================================================
     1. Read inputs
     ===================================================================== */
  function readInputs() {
    return {
      projName: $("projName").value.trim(),
      clientName: $("clientName").value.trim(),
      siteNotes: $("siteNotes").value.trim(),
      structure: state.structure,
      attach: state.attach,
      material: $("material").value,
      roofType: $("roofType").value,
      W: Math.max(50, +$("width").value || 0),
      L: Math.max(50, +$("depth").value || 0),
      H: Math.max(200, +$("height").value || 0),
      rafterSpacing: Math.max(5, +$("rafterSpacing").value || 45),
      maxSpan: Math.max(100, +$("maxSpan").value || 300),
      overhang: Math.max(0, +$("overhang").value || 0),
    };
  }

  /* =====================================================================
     2. Engineering calculation engine
     ===================================================================== */
  function calc(i) {
    const isWall = i.attach === "wall";
    const isFree = !isWall;

    // Posts along each long side (the depth L direction)
    const postsPerSide = Math.ceil(i.L / i.maxSpan) + 1;
    const totalPosts = isFree ? postsPerSide * 2 : postsPerSide;
    const groundPosts = isFree ? totalPosts : postsPerSide; // footings needed
    const postXs = linspace(postsPerSide, i.L);
    const postLen = i.H;

    // Main beams (run along L, sit on posts)
    const beamsCount = isFree ? 2 : 1;
    const hasLedger = isWall;
    const beamLenEach = i.L;
    const beamLenTotal_m = beamsCount * m(i.L) + (hasLedger ? m(i.L) : 0);

    // Rafters (run across W, spaced along L)
    const rafterCount = Math.floor(i.L / i.rafterSpacing) + 1;
    const rafterLen = i.W + i.overhang * (isFree ? 2 : 1);
    const rafterXs = linspace(rafterCount, i.L);
    const rafterLen_m = m(rafterLen);
    const rafterLenTotal_m = rafterCount * rafterLen_m;

    // Top shading layer (run along L, spaced across W)
    let slatCount = 0, slatSpacing = 0, slatLenTotal_m = 0, polyM2 = 0;
    if (i.roofType === "louver") slatSpacing = 12;
    else if (i.roofType === "slat") slatSpacing = 6;
    if (slatSpacing) {
      slatCount = Math.floor(i.W / slatSpacing) + 1;
      slatLenTotal_m = slatCount * m(i.L);
    }
    if (i.roofType === "poly") polyM2 = m(i.W) * m(i.L);

    // Footings (concrete)
    const footingEach_m3 = 0.4 * 0.4 * 0.6; // 0.096 m³
    const concreteM3 = +(groundPosts * footingEach_m3).toFixed(2);
    const cementBags = Math.ceil(concreteM3 / 0.018);

    // Hardware
    const connectors = totalPosts + rafterCount * 2;

    return {
      i, isWall, isFree, postsPerSide, totalPosts, groundPosts, postXs, postLen,
      beamsCount, hasLedger, beamLenEach, beamLenTotal_m,
      rafterCount, rafterLen, rafterXs, rafterLen_m, rafterLenTotal_m,
      slatCount, slatSpacing, slatLenTotal_m, polyM2,
      concreteM3, cementBags, connectors,
      postLenTotal_m: m(postLen) * totalPosts,
      areaM2: +(m(i.W) * m(i.L)).toFixed(2),
    };
  }

  /* =====================================================================
     3. Renderers
     ===================================================================== */
  function render() {
    const i = readInputs();
    const c = calc(i);

    // header
    $("outTitle").textContent = i.projName || "תוכנית פרויקט";
    const bits = [];
    bits.push({ pergola: "פרגולה", canopy: "סוכך/גגון", deck: "דק" }[i.structure]);
    bits.push(`${fmtM(i.W)}×${fmtM(i.L)} מ׳`);
    bits.push(ROOF_LABEL[i.roofType]);
    bits.push(i.attach === "wall" ? "צמוד לקיר" : "עצמאי");
    $("outMeta").textContent = bits.join(" · ");

    renderStats(c);
    renderDrawing(c);
    renderBOM(c);
    renderCut(c);
    renderCost(c);
    renderPlan(c);
  }

  function renderStats(c) {
    const tiles = [
      { val: c.totalPosts, lbl: "עמודים", cls: "primary" },
      { val: c.rafterCount, lbl: "רפפות", cls: "" },
      { val: c.areaM2 + " מ״ר", lbl: "שטח מקורה", cls: "" },
      { val: shekel(costTotal(c)), lbl: "אומדן חומרים", cls: "accent" },
    ];
    $("stats").innerHTML = tiles
      .map((t) => `<div class="stat ${t.cls}"><div class="val">${t.val}</div><div class="lbl">${t.lbl}</div></div>`)
      .join("");
  }

  /* ---- drawings ---- */
  function renderDrawing(c) {
    $("drawing").innerHTML = state.view === "top" ? drawTop(c) : drawSide(c);
  }

  function drawTop(c) {
    const i = c.i, pad = 46, W = 660;
    const scale = (W - 2 * pad) / i.L;
    const boxL = i.L * scale, boxW = i.W * scale;
    const H = boxW + 2 * pad + 30;
    const x0 = pad, y0 = pad;
    const ov = i.overhang * scale;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Rubik, sans-serif">`;
    // footprint
    s += `<rect x="${x0}" y="${y0}" width="${boxL}" height="${boxW}" fill="#faf8f2" stroke="#d8cfb8" stroke-width="1.5"/>`;
    // rafters (across W, thin sky lines at each rafter x)
    c.rafterXs.forEach((rx) => {
      const x = x0 + rx * scale;
      s += `<line x1="${x.toFixed(1)}" y1="${(y0 - ov).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y0 + boxW + (c.isFree ? ov : 0)).toFixed(1)}" stroke="#5f88a0" stroke-width="2" opacity=".75"/>`;
    });
    // beams (along L) — outer, and inner/wall
    const beamTopY = y0, beamBotY = y0 + boxW;
    if (c.isWall) {
      // wall (top) with hatch, outer beam bottom
      s += `<rect x="${x0}" y="${y0 - 8}" width="${boxL}" height="8" fill="#e6dfce"/>`;
      s += `<text x="${x0 + boxL / 2}" y="${y0 - 12}" text-anchor="middle" font-size="12" fill="#71756a">קיר קיים</text>`;
      s += `<line x1="${x0}" y1="${beamBotY}" x2="${x0 + boxL}" y2="${beamBotY}" stroke="#c58a4e" stroke-width="6" stroke-linecap="round"/>`;
    } else {
      s += `<line x1="${x0}" y1="${beamTopY}" x2="${x0 + boxL}" y2="${beamTopY}" stroke="#c58a4e" stroke-width="6" stroke-linecap="round"/>`;
      s += `<line x1="${x0}" y1="${beamBotY}" x2="${x0 + boxL}" y2="${beamBotY}" stroke="#c58a4e" stroke-width="6" stroke-linecap="round"/>`;
    }
    // posts
    const rows = c.isWall ? [beamBotY] : [beamTopY, beamBotY];
    rows.forEach((ry) => {
      c.postXs.forEach((px) => {
        const x = x0 + px * scale;
        s += `<circle cx="${x.toFixed(1)}" cy="${ry.toFixed(1)}" r="6.5" fill="#46603f" stroke="#fff" stroke-width="2"/>`;
      });
    });
    // dimension labels
    s += dimLine(x0, y0 + boxW + 18, x0 + boxL, y0 + boxW + 18, `${fmtM(i.L)} מ׳`);
    s += dimLineV(x0 - 16, y0, x0 - 16, y0 + boxW, `${fmtM(i.W)} מ׳`);
    s += `</svg>`;
    return s;
  }

  function drawSide(c) {
    const i = c.i, pad = 46, W = 660;
    const scale = (W - 2 * pad) / i.L;
    const boxL = i.L * scale;
    const hScale = scale; // same scale for height for readability
    const postH = i.H * hScale;
    const H = postH + 2 * pad + 30;
    const groundY = H - pad;
    const x0 = pad;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Rubik, sans-serif">`;
    // ground
    s += `<line x1="${x0 - 10}" y1="${groundY}" x2="${x0 + boxL + 10}" y2="${groundY}" stroke="#8a8574" stroke-width="2"/>`;
    for (let gx = x0 - 8; gx < x0 + boxL + 10; gx += 14)
      s += `<line x1="${gx}" y1="${groundY}" x2="${gx - 8}" y2="${groundY + 8}" stroke="#c9c1ac" stroke-width="1.5"/>`;
    const beamY = groundY - postH;
    // beam
    s += `<line x1="${x0 - 6}" y1="${beamY}" x2="${x0 + boxL + 6}" y2="${beamY}" stroke="#c58a4e" stroke-width="7" stroke-linecap="round"/>`;
    // rafter tails (small nubs above beam)
    c.rafterXs.forEach((rx) => {
      const x = x0 + rx * scale;
      s += `<line x1="${x.toFixed(1)}" y1="${beamY - 10}" x2="${x.toFixed(1)}" y2="${beamY}" stroke="#5f88a0" stroke-width="3"/>`;
    });
    // posts
    c.postXs.forEach((px) => {
      const x = x0 + px * scale;
      s += `<rect x="${(x - 5).toFixed(1)}" y="${beamY}" width="10" height="${postH}" fill="#46603f" rx="2"/>`;
      // footing
      s += `<rect x="${(x - 9).toFixed(1)}" y="${groundY}" width="18" height="14" fill="#b9b09a" rx="2"/>`;
    });
    // dims
    s += dimLineV(x0 - 20, beamY, x0 - 20, groundY, `${fmtM(i.H)} מ׳`);
    s += `</svg>`;
    return s;
  }

  function dimLine(x1, y, x2, yy, label) {
    return `<g stroke="#71756a" stroke-width="1" fill="#71756a" font-size="12">
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>
      <line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}"/>
      <line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}"/>
      <rect x="${(x1 + x2) / 2 - 30}" y="${y - 9}" width="60" height="18" fill="#fff"/>
      <text x="${(x1 + x2) / 2}" y="${y + 4}" text-anchor="middle" stroke="none">${label}</text></g>`;
  }
  function dimLineV(x, y1, xx, y2, label) {
    return `<g stroke="#71756a" stroke-width="1" fill="#71756a" font-size="12">
      <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>
      <line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}"/>
      <line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}"/>
      <rect x="${x - 30}" y="${(y1 + y2) / 2 - 9}" width="60" height="18" fill="#fff"/>
      <text x="${x}" y="${(y1 + y2) / 2 + 4}" text-anchor="middle" stroke="none">${label}</text></g>`;
  }

  /* ---- bill of materials ---- */
  function renderBOM(c) {
    const i = c.i, sp = SPEC[i.material];
    const rows = [];
    rows.push(["עמודים", sp.post + ` · ${fmtM(c.postLen)} מ׳`, c.totalPosts, "יח׳"]);
    rows.push(["קורות ראשיות", sp.beam + ` · ${fmtM(i.L)} מ׳`, c.beamsCount, "יח׳"]);
    if (c.hasLedger) rows.push(["קורת קיר (ledger)", sp.beam + ` · ${fmtM(i.L)} מ׳`, 1, "יח׳"]);
    rows.push(["רפפות", sp.rafter + ` · ${fmtM(c.rafterLen)} מ׳ (מרווח ${i.rafterSpacing} ס״מ)`, c.rafterCount, "יח׳"]);
    if (c.slatCount) rows.push(["שכבת הצללה עליונה", sp.slat + ` · ${fmtM(i.L)} מ׳`, c.slatCount, "יח׳"]);
    if (c.polyM2) rows.push(["לוחות פוליקרבונט", "יריעות 10 מ״מ", c.polyM2.toFixed(1), "מ״ר"]);
    rows.push(["יסודות בטון", `40×40×60 ס״מ · ${c.concreteM3} מ״ק`, c.groundPosts, "יח׳"]);
    rows.push(["שקי בטון מוכן", "40 ק״ג", c.cementBags, "שק"]);
    rows.push(["בסיסי עמוד / עיגון", "אבץ חם", c.groundPosts, "יח׳"]);
    rows.push(["מחברי רפפה וקורה", "זווית / hurricane tie", c.connectors, "יח׳"]);
    rows.push(["ברגים ואביזרים", "סט התקנה", 1, "סט"]);
    $("bomTable").querySelector("tbody").innerHTML = rows
      .map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="num">${r[2]}</td><td>${r[3]}</td></tr>`)
      .join("");
  }

  /* ---- cut list ---- */
  function renderCut(c) {
    const i = c.i;
    const rows = [];
    rows.push(["עמוד", c.postLen, c.totalPosts]);
    rows.push(["קורה ראשית", i.L, c.beamsCount]);
    if (c.hasLedger) rows.push(["קורת קיר", i.L, 1]);
    rows.push(["רפפה", c.rafterLen, c.rafterCount]);
    if (c.slatCount) rows.push(["שלב עליון", i.L, c.slatCount]);
    $("cutTable").querySelector("tbody").innerHTML = rows
      .map((r) => `<tr><td>${r[0]}</td><td class="num">${fmtM(r[1])} מ׳</td><td class="num">${r[2]}</td><td class="num">${fmtM(r[1] * r[2])} מ׳</td></tr>`)
      .join("");
  }

  /* ---- cost ---- */
  function costItems(c) {
    const i = c.i, p = PRICE[i.material];
    const items = [
      { id: "posts", label: "עמודים", qty: +c.postLenTotal_m.toFixed(1), unit: "מ׳", def: p.post },
      { id: "beams", label: "קורות ראשיות", qty: +c.beamLenTotal_m.toFixed(1), unit: "מ׳", def: p.beam },
      { id: "rafters", label: "רפפות", qty: +c.rafterLenTotal_m.toFixed(1), unit: "מ׳", def: p.rafter },
    ];
    if (c.slatLenTotal_m) items.push({ id: "slats", label: "שכבת הצללה", qty: +c.slatLenTotal_m.toFixed(1), unit: "מ׳", def: p.slat });
    if (c.polyM2) items.push({ id: "poly", label: "פוליקרבונט", qty: +c.polyM2.toFixed(1), unit: "מ״ר", def: PRICE.poly_m2 });
    items.push({ id: "footing", label: "יסודות בטון", qty: c.concreteM3, unit: "מ״ק", def: PRICE.footing_m3 });
    items.push({ id: "bases", label: "בסיסי עמוד", qty: c.groundPosts, unit: "יח׳", def: PRICE.base_ea });
    items.push({ id: "connectors", label: "מחברים", qty: c.connectors, unit: "יח׳", def: PRICE.connector_ea });
    items.push({ id: "hardware", label: "ברגים ואביזרים", qty: 1, unit: "סט", def: PRICE.hardware });
    return items.map((it) => ({ ...it, price: state.priceOverrides[it.id] ?? it.def }));
  }
  function costTotal(c) {
    return costItems(c).reduce((s, it) => s + it.qty * it.price, 0);
  }
  function renderCost(c) {
    const items = costItems(c);
    $("costTable").querySelector("tbody").innerHTML = items
      .map((it) => `<tr><td>${it.label}</td><td class="num">${fmt(it.qty)} ${it.unit}</td><td class="num">${it.price}</td><td class="num">${shekel(it.qty * it.price)}</td></tr>`)
      .join("");
    $("grandTotal").textContent = shekel(costTotal(c));
  }

  /* ---- project plan ---- */
  function renderPlan(c) {
    const i = c.i;
    const steps = [
      { t: "מדידה וסימון", d: "סימון מיקומי העמודים והיסודות באתר, יישור ובדיקת מפלסים.", time: "~0.5 יום" },
      { t: "חפירת יסודות ויציקת בטון", d: `חפירה ויציקה של ${c.groundPosts} יסודות (${c.concreteM3} מ״ק, כ־${c.cementBags} שקי בטון).`, time: "1 יום + ייבוש 24–48ש׳" },
      { t: "התקנת עמודים", d: `הצבת ${c.totalPosts} עמודים בגובה ${fmtM(c.postLen)} מ׳, פילוס ועיגון.`, time: "~1 יום" },
      { t: "התקנת קורות ראשיות", d: `הרכבת ${c.beamsCount}${c.hasLedger ? " + קורת קיר" : ""} קורות לאורך ${fmtM(i.L)} מ׳.`, time: "~0.5 יום" },
      { t: "התקנת רפפות", d: `${c.rafterCount} רפפות במרווח ${i.rafterSpacing} ס״מ.`, time: "~1 יום" },
    ];
    if (c.slatCount) steps.push({ t: "שכבת הצללה עליונה", d: `${c.slatCount} שלבים לכיסוי ${ROOF_LABEL[i.roofType]}.`, time: "~0.5 יום" });
    if (c.polyM2) steps.push({ t: "התקנת פוליקרבונט", d: `כיסוי ${c.polyM2.toFixed(1)} מ״ר יריעות והברגה אטומה.`, time: "~0.5 יום" });
    steps.push({ t: "גימור וצביעה", d: "ליטוש, צביעה/איטום, ניקיון האתר ומסירה ללקוח.", time: "~0.5–1 יום" });

    $("planSteps").innerHTML = steps
      .map((s) => `<li><div class="step-title">${s.t}</div><div class="step-desc">${s.d}</div><div class="step-time">⏱ ${s.time}</div></li>`)
      .join("");

    const days = 3 + (c.slatCount || c.polyM2 ? 0.5 : 0) + (c.totalPosts > 6 ? 1 : 0);
    $("totalDays").textContent = `כ־${days}–${days + 1} ימי עבודה`;
  }

  /* =====================================================================
     4. Photo handling (downscaled to keep localStorage small)
     ===================================================================== */
  function handlePhoto(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 1000, sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = img.width * sc; cv.height = img.height * sc;
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        state.photo = cv.toDataURL("image/jpeg", 0.82);
        showPhoto();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  function showPhoto() {
    const pv = $("photoPreview"), em = $("photoEmpty");
    if (state.photo) { pv.src = state.photo; pv.hidden = false; em.hidden = true; }
    else { pv.hidden = true; em.hidden = false; }
  }

  /* =====================================================================
     5. Save / load projects (localStorage)
     ===================================================================== */
  const LS_KEY = "pergoplan_projects";
  const loadAll = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
  const saveAll = (a) => localStorage.setItem(LS_KEY, JSON.stringify(a));

  function snapshot() {
    const i = readInputs();
    return {
      id: currentId || "p" + Date.now(),
      ...i, photo: state.photo, priceOverrides: state.priceOverrides,
      savedAt: new Date().toISOString(),
    };
  }
  let currentId = null;

  function saveProject() {
    const snap = snapshot();
    currentId = snap.id;
    const all = loadAll();
    const idx = all.findIndex((p) => p.id === snap.id);
    if (idx >= 0) all[idx] = snap; else all.push(snap);
    saveAll(all);
    refreshSavedList();
    flash($("btnSave"), "✓ נשמר");
  }

  function refreshSavedList() {
    const sel = $("savedProjects"), all = loadAll();
    sel.innerHTML = '<option value="">פרויקטים שמורים…</option>' +
      all.map((p) => `<option value="${p.id}">${(p.projName || "ללא שם")} · ${fmtM(p.W)}×${fmtM(p.L)}</option>`).join("");
    if (currentId) sel.value = currentId;
  }

  function loadProject(id) {
    const p = loadAll().find((x) => x.id === id);
    if (!p) return;
    currentId = p.id;
    $("projName").value = p.projName || ""; $("clientName").value = p.clientName || "";
    $("siteNotes").value = p.siteNotes || "";
    $("material").value = p.material; $("roofType").value = p.roofType;
    $("width").value = p.W; $("depth").value = p.L; $("height").value = p.H;
    $("rafterSpacing").value = p.rafterSpacing; $("maxSpan").value = p.maxSpan; $("overhang").value = p.overhang;
    setSeg("segStructure", p.structure); state.structure = p.structure;
    setSeg("segAttach", p.attach); state.attach = p.attach;
    state.photo = p.photo || null; state.priceOverrides = p.priceOverrides || {};
    showPhoto(); render();
  }

  function newProject() {
    currentId = null; state.photo = null; state.priceOverrides = {};
    ["projName", "clientName", "siteNotes"].forEach((id) => ($(id).value = ""));
    $("width").value = 300; $("depth").value = 400; $("height").value = 250;
    $("rafterSpacing").value = 45; $("maxSpan").value = 300; $("overhang").value = 20;
    $("material").value = "wood"; $("roofType").value = "open";
    setSeg("segStructure", "pergola"); state.structure = "pergola";
    setSeg("segAttach", "free"); state.attach = "free";
    showPhoto(); render(); $("savedProjects").value = "";
  }

  /* =====================================================================
     6. Price editor
     ===================================================================== */
  function openPrices() {
    const c = calc(readInputs());
    const items = costItems(c);
    $("priceFields").innerHTML = items.map((it) =>
      `<label class="field"><span>${it.label} (${it.unit})</span>
       <input type="number" data-pid="${it.id}" value="${it.price}" min="0" step="1"></label>`).join("");
    $("priceDialog").showModal();
  }
  function commitPrices() {
    $("priceFields").querySelectorAll("input[data-pid]").forEach((inp) => {
      state.priceOverrides[inp.dataset.pid] = +inp.value || 0;
    });
    render();
  }

  /* =====================================================================
     7. Segmented controls + helpers
     ===================================================================== */
  function setSeg(groupId, val) {
    $(groupId).querySelectorAll(".seg-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.val === val));
  }
  function wireSeg(groupId, key, after) {
    $(groupId).addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn"); if (!btn) return;
      setSeg(groupId, btn.dataset.val);
      if (key) state[key] = btn.dataset.val;
      after && after();
    });
  }
  function flash(el, txt) {
    const old = el.textContent; el.textContent = txt;
    setTimeout(() => (el.textContent = old), 1200);
  }

  /* =====================================================================
     8. Wire everything up
     ===================================================================== */
  function init() {
    $("planForm").addEventListener("input", render);
    wireSeg("segStructure", "structure", render);
    wireSeg("segAttach", "attach", render);
    wireSeg("segView", "view", () => renderDrawing(calc(readInputs())));

    $("btnPhoto").addEventListener("click", () => $("photoInput").click());
    $("photoDrop").addEventListener("click", (e) => { if (e.target.id === "photoPreview") $("photoInput").click(); });
    $("photoInput").addEventListener("change", (e) => handlePhoto(e.target.files[0]));

    $("btnSave").addEventListener("click", saveProject);
    $("btnNew").addEventListener("click", newProject);
    $("btnPrint").addEventListener("click", () => window.print());
    $("savedProjects").addEventListener("change", (e) => e.target.value && loadProject(e.target.value));

    $("btnPrices").addEventListener("click", openPrices);
    $("priceDialog").addEventListener("close", () => { if ($("priceDialog").returnValue === "save") commitPrices(); });

    refreshSavedList();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
