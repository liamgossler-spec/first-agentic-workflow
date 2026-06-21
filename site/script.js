// Bilingual toggle (Hebrew RTL <-> English LTR).
// Each translatable element carries data-en / data-he (text) or
// data-ph-en / data-ph-he (input placeholders). We swap on toggle and
// remember the choice in localStorage.

(function () {
  const STORAGE_KEY = "zynx-lang";
  const html = document.documentElement;

  function apply(lang) {
    html.lang = lang;
    html.dir = lang === "he" ? "rtl" : "ltr";

    document.querySelectorAll("[data-en]").forEach((el) => {
      const val = el.getAttribute("data-" + lang);
      if (val !== null) el.textContent = val;
    });

    document.querySelectorAll("[data-ph-en]").forEach((el) => {
      const val = el.getAttribute("data-ph-" + lang);
      if (val !== null) el.placeholder = val;
    });

    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  // Initial language: saved choice if any, otherwise Hebrew (Israeli-first brand).
  let initial = "he";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "he" || saved === "en") initial = saved;
  } catch (e) {}
  apply(initial);

  const toggle = document.getElementById("lang-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      apply(html.lang === "he" ? "en" : "he");
    });
  }
})();
