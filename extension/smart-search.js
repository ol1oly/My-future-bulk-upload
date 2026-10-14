(function () {
  "use strict";

  // Smart search panel for myFuture postings. Injected (MAIN world) together with lib/jobs.js and orbis-board.js.
  // Reads every posting once, then filters on the full text locally. Shortlist / Apply / Not interested only run on
  // the student's click; Apply opens myFuture's own application wizard, where the student submits.
  const ROOT_ID = "mst-smart-search";
  const PREFS_KEY = "mst.smartSearch.prefs";
  const LANG_KEY = "mst.smartSearch.lang";
  let lang = (() => {
    try { const saved = localStorage.getItem(LANG_KEY); if (saved === "fr" || saved === "en") return saved; } catch (error) { /* ignore */ }
    return /^fr/i.test(document.documentElement.lang || navigator.language || "") ? "fr" : "en";
  })();
  const FR = {
      "Smart search": "Recherche avancée",
      "Loading postings…": "Chargement des offres…",
      "Rescan": "Relire",
      "Reload every posting from myFuture": "Relire toutes les offres sur myFuture",
      "Close": "Fermer",
      "Select all": "Tout sélectionner",
      "Clear": "Effacer",
      "Shortlist selected": "Présélectionner la sélection",
      "Export CSV": "Exporter en CSV",
      "Search all text": "Rechercher dans tout le texte",
      "Every word must appear anywhere in the posting; -word excludes.": "Chaque mot doit apparaître dans l'offre; -mot exclut.",
      "Sort by": "Trier par",
      "Best match": "Meilleure correspondance",
      "Deadline soonest": "Date limite la plus proche",
      "Newest": "Plus récentes",
      "Apply through": "Postuler via",
      "Any": "Tous",
      "McGill (myFuture)": "McGill (myFuture)",
      "External site / email": "Site externe / courriel",
      "Work language": "Langue de travail",
      "English (incl. bilingual)": "Anglais (bilingue inclus)",
      "English only": "Anglais seulement",
      "French (incl. bilingual)": "Français (bilingue inclus)",
      "French only": "Français seulement",
      "Targets year": "Année ciblée",
      "First year": "1re année",
      "Second year": "2e année",
      "Third year": "3e année",
      "Fourth year": "4e année",
      "Deadline within (days)": "Date limite d'ici (jours)",
      "Empty = any": "Vide = toutes",
      "Minimum match score": "Score minimal",
      "Hide passed deadlines": "Masquer les dates limites passées",
      "Hide postings I applied to": "Masquer mes candidatures",
      "Only postings without cover letter": "Seulement sans lettre de présentation",
      "Only my shortlist": "Seulement ma présélection",
      "Hide my shortlist": "Masquer ma présélection",
      "Match keywords": "Mots-clés recherchés",
      "Raise the score (title counts 4×).": "Augmentent le score (le titre compte 4×).",
      "Exclude words": "Mots à exclure",
      "In the title (or twice in the text) → hidden.": "Dans le titre (ou deux fois dans le texte) → masquée.",
      "Reset filters": "Réinitialiser les filtres",
      "Reading postings…": "Lecture des offres…",
    "Not on a postings list": "Pas sur une liste d'offres",
    "Province / State": "Province / État", "City contains": "Ville contient", "e.g. Montreal": "ex. Montréal",
    "Appears once postings are read.": "S'affiche une fois les offres lues.", "None checked = anywhere.": "Aucune cochée = partout.",
    "Work format": "Format de travail", "In person": "En personne", "Hybrid": "Hybride", "Remote": "À distance",
    "location": "lieu", "format": "format",
    "Smart search reads the “View all available postings” list. Open one of these, click “View all available postings”, then open Smart search again:": "La recherche avancée lit la liste « View all available postings ». Ouvrez l'une de ces pages, cliquez sur « View all available postings », puis rouvrez la recherche avancée :",
    "Internship / Co-op postings": "Offres de stage / co-op", "General Jobs postings": "Offres d'emploi",
      "Open Internship / Co-op (or General Jobs) → Job Postings → “View all available postings”, then open Smart search again.": "Ouvrez Stage / Co-op (ou Emplois) → Offres → « View all available postings », puis rouvrez la recherche avancée.",
      "Listing postings… {n}": "Liste des offres… {n}",
      "Reading postings {done}/{total}": "Lecture des offres {done}/{total}",
      "{n} postings read · {time}": "{n} offres lues · {time}",
      "Could not read postings": "Impossible de lire les offres",
      "Failed": "Échec",
      "Shortlisting {i}/{n}": "Présélection {i}/{n}",
      "{shown} of {total} postings": "{shown} sur {total} offres",
      "hidden": "masquées",
      "{n} selected": "{n} sélectionnées",
      "No posting matches these filters.": "Aucune offre ne correspond à ces filtres.",
      "Apply via McGill": "Postuler via McGill",
      "External site": "Site externe",
      "By email": "Par courriel",
      "Method ?": "Méthode ?",
      "Cover letter": "Lettre",
      "Transcript": "Relevé",
      "New": "Nouveau",
      "★ Shortlisted": "★ Présélectionnée",
      "☆ Shortlist": "☆ Présélectionner",
      "Apply": "Postuler", "Continue": "Continuer", "Submitted": "Soumise", "Started": "Commencée",
      "Opens myFuture's application form in a new tab": "Ouvre le formulaire de candidature de myFuture dans un nouvel onglet",
      "Employer site ↗": "Site de l'employeur ↗",
      "Not interested": "Pas intéressé",
      "Hide from myFuture lists (myFuture's own Not Interested list)": "Masquer dans myFuture (liste « Not Interested » de myFuture)",
      "no keyword matched": "aucun mot-clé trouvé",
      "Open posting in a new tab": "Ouvrir l'offre dans un nouvel onglet",
      "deadline {date}": "date limite {date}",
      "applied": "déjà postulé",
      "not shortlisted": "non présélectionnée",
      "shortlisted": "présélectionnée",
      "deadline passed": "date passée",
      "deadline later": "date plus tard",
      "not through McGill": "hors McGill",
      "through McGill": "via McGill",
      "needs cover letter": "lettre requise",
      "language": "langue",
      "year": "année",
      "text": "texte",
      "excluded": "exclue",
      "low score": "score faible"
  };
  // English text is the key; French comes from FR (same approach as the bookmarklet panel's t()).
  const t = (text, vars) => String(lang === "fr" && FR[text] ? FR[text] : text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  const labelled = []; // [node, property, english text] re-labelled when the language changes
  const L = (node, prop, text) => { labelled.push([node, prop, text]); node[prop] = t(text); return node; };
  const existing = document.getElementById(ROOT_ID);
  if (existing) { existing.hidden = false; return; }

  const J = globalThis.JobTools;
  const board = globalThis.__orbisBoard;
  let prefs = loadPrefs();
  let postings = [];   // parsed postings with .row (list metadata) and .fit
  let selected = new Set();

  function loadPrefs() {
    try { return { ...J.DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; } catch (error) { return { ...J.DEFAULT_PREFS }; }
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (error) { /* per-browser convenience only */ }
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
    return node;
  }

  const style = el("style", { textContent: `
#${ROOT_ID}{position:fixed;inset:0;z-index:2147483000;background:rgba(10,12,16,.45);font:13px/1.4 system-ui,"Segoe UI",sans-serif;color:#16181d}
#${ROOT_ID}[hidden]{display:none}
#${ROOT_ID} .mst-shell{position:absolute;inset:16px;display:grid;grid-template-columns:270px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}
#${ROOT_ID} header{grid-column:1/-1;display:flex;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid #e3e5e8}
#${ROOT_ID} header h2{margin:0;font-size:16px;font-weight:750}
#${ROOT_ID} header .mst-status{flex:1;color:#68707d}
#${ROOT_ID} aside{padding:14px 16px;border-right:1px solid #e3e5e8;overflow:auto;background:#f6f7f8}
#${ROOT_ID} aside label{display:block;margin:10px 0 4px;font-weight:650;font-size:12px}
#${ROOT_ID} aside input[type=text],#${ROOT_ID} aside input[type=number],#${ROOT_ID} aside select,#${ROOT_ID} aside textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #cdd1d6;border-radius:6px;font:inherit;background:#fff}
#${ROOT_ID} aside textarea{min-height:64px;resize:vertical;font-size:12px}
#${ROOT_ID} aside .mst-check{display:flex;gap:6px;align-items:center;font-weight:500;margin:6px 0}
#${ROOT_ID} aside small{color:#68707d;display:block}
#${ROOT_ID} main{display:flex;flex-direction:column;min-height:0}
#${ROOT_ID} .mst-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid #e3e5e8}
#${ROOT_ID} .mst-bar .mst-count{flex:1;color:#68707d}
#${ROOT_ID} .mst-list{overflow:auto;flex:1}
#${ROOT_ID} .mst-row{display:grid;grid-template-columns:22px 44px minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 16px;border-bottom:1px solid #eef0f2}
#${ROOT_ID} .mst-row:hover{background:#fafbfc}
#${ROOT_ID} .mst-score{font-weight:750;font-size:15px;text-align:center;border-radius:8px;padding:4px 0;background:#eef0f2}
#${ROOT_ID} .mst-score.hi{background:#dff3e4;color:#14632b}#${ROOT_ID} .mst-score.mid{background:#fff4d6;color:#7a5600}
#${ROOT_ID} .mst-title{font-weight:700;color:#16181d;text-decoration:none;cursor:pointer}
#${ROOT_ID} .mst-title:hover{text-decoration:underline}
#${ROOT_ID} .mst-meta{color:#68707d;font-size:12px;margin-top:2px}
#${ROOT_ID} .mst-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
#${ROOT_ID} .mst-chip{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid #d8dade;background:#fff}
#${ROOT_ID} .mst-chip.mcgill{border-color:#ed1b2f;color:#c4122d}#${ROOT_ID} .mst-chip.warn{background:#fff4d6;border-color:#f0d58a}
#${ROOT_ID} .mst-chip.hit{background:#f1f3f5;border-color:#f1f3f5;color:#4b525c}
#${ROOT_ID} .mst-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
#${ROOT_ID} button,#${ROOT_ID} .mst-link{font:inherit;font-size:12px;font-weight:650;border-radius:6px;padding:5px 10px;border:1px solid #d8dade;background:#fff;color:#16181d;cursor:pointer;text-decoration:none;white-space:nowrap}
#${ROOT_ID} button.primary{background:#ed1b2f;border-color:#ed1b2f;color:#fff}#${ROOT_ID} button.primary:hover{background:#c4122d}
#${ROOT_ID} button.on{background:#16181d;color:#fff;border-color:#16181d}
#${ROOT_ID} button:disabled{opacity:.5;cursor:wait}
#${ROOT_ID} .mst-progress{height:3px;background:#ed1b2f;width:0;transition:width .2s}
#${ROOT_ID} .mst-empty{padding:40px;text-align:center;color:#68707d}
#${ROOT_ID} .mst-areas{max-height:150px;overflow:auto;border:1px solid #d8dade;border-radius:6px;background:#fff;padding:4px 8px}
#${ROOT_ID} .mst-areas .mst-check{margin:3px 0;font-size:12px}
` });

  const status = el("span", { class: "mst-status", textContent: t("Loading postings…") });
  const progress = el("div", { class: "mst-progress" });
  const list = el("div", { class: "mst-list" });
  const count = el("span", { class: "mst-count" });
  const aside = el("aside");
  const root = el("div", { id: ROOT_ID },
    el("div", { class: "mst-shell" },
      el("header", {},
        L(el("h2"), "textContent", "Smart search"), status,
        el("button", { type: "button", textContent: lang === "fr" ? "EN" : "FR", title: "English / Français", onclick: (event) => switchLang(event.currentTarget) }),
        L(L(el("button", { type: "button", onclick: () => { board.clearCache(); scan(); } }), "textContent", "Rescan"), "title", "Reload every posting from myFuture"),
        L(el("button", { type: "button", onclick: () => { root.hidden = true; } }), "textContent", "Close")),
      aside,
      el("main", {}, progress,
        el("div", { class: "mst-bar" }, count,
          L(el("button", { type: "button", onclick: () => { visible().forEach((p) => selected.add(p.row.id)); render(); } }), "textContent", "Select all"),
          L(el("button", { type: "button", onclick: () => { selected.clear(); render(); } }), "textContent", "Clear"),
          L(el("button", { type: "button", onclick: (event) => bulkShortlist(event.currentTarget) }), "textContent", "Shortlist selected"),
          L(el("button", { type: "button", onclick: exportCsv }), "textContent", "Export CSV")),
        list)));
  document.head.append(style);
  document.body.append(root);

  // ---------- filters ----------
  function field(labelText, control, hint) {
    return [el("label", { textContent: t(labelText) }), control, hint ? el("small", { textContent: t(hint) }) : null];
  }
  function bind(control, key, parse = (v) => v) {
    control.addEventListener(control.tagName === "TEXTAREA" || control.type === "text" ? "input" : "change", () => {
      prefs[key] = control.type === "checkbox" ? control.checked : parse(control.value);
      savePrefs(); rescore(); render();
    });
    return control;
  }
  function select(key, options) {
    return bind(el("select", {}, ...options.map(([value, text]) => el("option", { value, textContent: t(text), selected: String(prefs[key]) === value }))), key,
      (v) => (/^\d+$/.test(v) ? Number(v) : v));
  }
  function check(key, text) {
    return el("label", { class: "mst-check" }, bind(el("input", { type: "checkbox", checked: Boolean(prefs[key]) }), key), t(text));
  }
  // Province / state checkboxes with counts (like myFuture's advanced search), and a city box with suggestions.
  function locationFilters() {
    const areaCounts = {}, cities = {};
    for (const p of postings) {
      const where = J.locationOf(p, p.row.city);
      for (const area of where.areas) areaCounts[area] = (areaCounts[area] || 0) + 1;
      if (where.city) cities[where.city] = (cities[where.city] || 0) + 1;
    }
    const chosen = new Set(prefs.provinces || []);
    for (const area of chosen) areaCounts[area] = areaCounts[area] || 0;
    const boxes = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).map(([area, n]) => {
      const box = el("input", { type: "checkbox", checked: chosen.has(area) });
      box.addEventListener("change", () => {
        const set = new Set(prefs.provinces || []);
        if (box.checked) set.add(area); else set.delete(area);
        prefs.provinces = [...set]; savePrefs(); render();
      });
      return el("label", { class: "mst-check" }, box, `${area} (${n})`);
    });
    const listId = "mst-city-list";
    const city = bind(el("input", { type: "text", value: prefs.city || "", placeholder: t("e.g. Montreal") }), "city");
    city.setAttribute("list", listId);
    const datalist = el("datalist", { id: listId }, ...Object.keys(cities).sort().map((c) => el("option", { value: c })));
    return [
      el("label", { textContent: t("Province / State") }),
      postings.length ? el("div", { class: "mst-areas" }, ...boxes) : el("small", { textContent: t("Appears once postings are read.") }),
      el("small", { textContent: t("None checked = anywhere.") }),
      el("label", { textContent: t("City contains") }), city, datalist
    ];
  }

  function renderFilters() {
    const list = (key) => bind(el("textarea", { value: (prefs[key] || []).join(", ") }), key, (v) => v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean));
    aside.replaceChildren(...[
      ...field("Search all text", bind(el("input", { type: "text", value: prefs.text, placeholder: "react montreal -senior" }), "text"), "Every word must appear anywhere in the posting; -word excludes."),
      ...field("Sort by", select("sort", [["score", "Best match"], ["deadline", "Deadline soonest"], ["newest", "Newest"]])),
      ...field("Apply through", select("method", [["any", "Any"], ["myfuture", "McGill (myFuture)"], ["external", "External site / email"]])),
      ...field("Work language", select("language", [["any", "Any"], ["en-ok", "English (incl. bilingual)"], ["en", "English only"], ["fr-ok", "French (incl. bilingual)"], ["fr", "French only"]])),
      ...field("Targets year", select("year", [["", "Any"], ["First Year", "First year"], ["Second Year", "Second year"], ["Third Year", "Third year"], ["Fourth Year", "Fourth year"]])),
      ...locationFilters(),
      ...field("Work format", select("format", [["any", "Any"], ["inperson", "In person"], ["hybrid", "Hybrid"], ["remote", "Remote"]])),
      ...field("Deadline within (days)", bind(el("input", { type: "number", min: 0, value: prefs.deadlineDays || "" }), "deadlineDays", (v) => Number(v) || 0), "Empty = any"),
      ...field("Minimum match score", bind(el("input", { type: "number", min: 0, max: 100, value: prefs.minScore || "" }), "minScore", (v) => Number(v) || 0)),
      check("hidePassed", "Hide passed deadlines"),
      check("hideApplied", "Hide postings I applied to"),
      check("noCoverLetter", "Only postings without cover letter"),
      check("onlyShortlisted", "Only my shortlist"),
      check("hideShortlisted", "Hide my shortlist"),
      ...field("Match keywords", list("keywords"), "Raise the score (title counts 4×)."),
      ...field("Exclude words", list("exclude"), "In the title (or twice in the text) → hidden."),
      el("p", {}, el("button", { type: "button", textContent: t("Reset filters"), onclick: () => { prefs = { ...J.DEFAULT_PREFS }; savePrefs(); renderFilters(); rescore(); render(); } }))

    ].filter(Boolean));
  }

  // ---------- data ----------
  function rescore() {
    for (const p of postings) p.fit = J.scorePosting(p, prefs);
  }
  function visible() {
    const shown = postings.filter((p) => !(p.why = J.filterPosting(p, { appStatus: p.row.appStatus, shortlisted: p.row.shortlisted, city: p.row.city }, prefs)));
    const byDeadline = (a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999");
    if (prefs.sort === "deadline") return shown.sort(byDeadline);
    if (prefs.sort === "newest") return shown.sort((a, b) => Number(b.row.id) - Number(a.row.id));
    return shown.sort((a, b) => b.fit.score - a.fit.score || byDeadline(a, b));
  }

  async function scan() {
    list.replaceChildren(el("div", { class: "mst-empty", textContent: t("Reading postings…") }));
    try {
      if (!board.ready()) {
        status.textContent = t("Not on a postings list");
        const link = (path, text) => el("a", { href: location.origin + path, textContent: t(text), style: "color:#c4122d;font-weight:650" });
        list.replaceChildren(el("div", { class: "mst-empty" },
          t("Smart search reads the “View all available postings” list. Open one of these, click “View all available postings”, then open Smart search again:"),
          el("p", {}, link("/myAccount/opportunities/internshipscoop/postings.htm", "Internship / Co-op postings"), " · ",
            link("/myAccount/opportunities/career/postings.htm", "General Jobs postings"))));
        return;
      }
      const rows = await board.listAll({ onProgress: ({ done }) => { status.textContent = t("Listing postings… {n}", { n: done }); } });
      const { details } = await board.fetchDetails(rows.map((row) => row.id), {
        onProgress: ({ done, total }) => { status.textContent = t("Reading postings {done}/{total}", { done, total }); progress.style.width = `${Math.round((done / total) * 100)}%`; }
      });
      postings = rows.map((row) => {
        const p = J.parsePosting(details[row.id] || [], { title: row.title, url: location.href });
        p.id = `p${row.id}`;
        p.fields.title = p.fields.title || row.title;
        p.fields.organization = p.fields.organization || row.organization;
        p.row = row;
        return p;
      });
      rescore();
      renderFilters();
      status.textContent = t("{n} postings read · {time}", { n: postings.length, time: new Date().toLocaleTimeString() });
      progress.style.width = "0";
      render();
    } catch (error) {
      status.textContent = t("Could not read postings");
      list.replaceChildren(el("div", { class: "mst-empty", textContent: error.message || String(error) }));
    }
  }

  // ---------- actions ----------
  async function toggleShortlist(p, button) {
    button.disabled = true;
    try { await board.toggleShortlist(p.row.id); p.row.shortlisted = !p.row.shortlisted; render(); }
    catch (error) { button.textContent = t("Failed"); button.title = error.message; }
    finally { button.disabled = false; }
  }
  async function bulkShortlist(button) {
    const targets = postings.filter((p) => selected.has(p.row.id) && !p.row.shortlisted);
    if (!targets.length) return;
    button.disabled = true;
    for (const [index, p] of targets.entries()) {
      button.textContent = t("Shortlisting {i}/{n}", { i: index + 1, n: targets.length });
      try { await board.toggleShortlist(p.row.id); p.row.shortlisted = true; } catch (error) { /* keep going */ }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    button.textContent = t("Shortlist selected"); button.disabled = false; render();
  }
  async function notInterested(p) {
    try { await board.notInterested(p.row.id); postings = postings.filter((other) => other !== p); render(); } catch (error) { /* ignore */ }
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = el("a", { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function exportCsv() {
    const rows = visible().map((p) => ({ ...J.trackerRow(p, p.row.appStatus ? "applied" : p.row.shortlisted ? "shortlisted" : "found"), notes: `score ${p.fit.score}` }));
    download(J.trackerCsv(rows), `myfuture-postings-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
  }

  // ---------- results ----------
  function render() {
    const shown = visible();
    const hidden = postings.length - shown.length;
    const reasons = {};
    for (const p of postings) if (p.why) { const key = p.why.replace(/:.*/, ""); reasons[key] = (reasons[key] || 0) + 1; }
    count.textContent = postings.length
      ? `${t("{shown} of {total} postings", { shown: shown.length, total: postings.length })}${hidden ? ` · ${t("hidden")}: ${Object.entries(reasons).map(([k, n]) => `${n} ${t(k)}`).join(", ")}` : ""}${selected.size ? ` · ${t("{n} selected", { n: selected.size })}` : ""}`
      : "";
    if (!postings.length) return;
    if (!shown.length) { list.replaceChildren(el("div", { class: "mst-empty", textContent: t("No posting matches these filters.") })); return; }
    list.replaceChildren(...shown.slice(0, 400).map(rowView));
  }

  function rowView(p) {
    const f = p.fields, r = p.row;
    const days = J.daysUntil(p.deadline);
    const score = p.fit.score;
    const mcgill = p.apply.method === "myfuture";
    const chips = [
      el("span", { class: `mst-chip${mcgill ? " mcgill" : ""}`, textContent: t(mcgill ? "Apply via McGill" : p.apply.method === "website" ? "External site" : p.apply.method === "email" ? "By email" : "Method ?") }),
      p.documents.coverLetter ? el("span", { class: "mst-chip warn", textContent: t("Cover letter") }) : null,
      p.documents.transcript ? el("span", { class: "mst-chip", textContent: t("Transcript") }) : null,
      el("span", { class: "mst-chip", textContent: `CV ${p.cv}` }),
      f.jobLanguage ? el("span", { class: "mst-chip", textContent: f.jobLanguage.replace(/\s+/g, " + ") }) : null,
      r.isNew ? el("span", { class: "mst-chip", textContent: t("New") }) : null,
      r.appStatus ? el("span", { class: "mst-chip warn", textContent: J.isSubmitted(r.appStatus) ? t("Submitted") : `${t("Started")}: ${r.appStatus}` }) : null,
      ...p.fit.hits.slice(0, 5).map((hit) => el("span", { class: "mst-chip hit", textContent: hit }))
    ];
    const actions = [
      el("button", { type: "button", class: r.shortlisted ? "on" : "", textContent: t(r.shortlisted ? "★ Shortlisted" : "☆ Shortlist"), onclick: (event) => toggleShortlist(p, event.currentTarget) }),
      mcgill && r.canApply && !J.isSubmitted(r.appStatus) ? el("button", { type: "button", class: "primary", textContent: t(r.appStatus ? "Continue" : "Apply"), title: t("Opens myFuture's application form in a new tab"), onclick: () => board.apply(r.id) }) : null,
      !mcgill && p.apply.urls[0] ? el("a", { class: "mst-link", href: p.apply.urls[0], target: "_blank", rel: "noopener", textContent: t("Employer site ↗") }) : null,
      el("button", { type: "button", textContent: t("Not interested"), title: t("Hide from myFuture lists (myFuture's own Not Interested list)"), onclick: () => notInterested(p) })
    ];
    return el("div", { class: "mst-row" },
      el("input", { type: "checkbox", checked: selected.has(r.id), onchange: (event) => { event.target.checked ? selected.add(r.id) : selected.delete(r.id); render(); } }),
      el("div", { class: `mst-score${score >= 60 ? " hi" : score >= 30 ? " mid" : ""}`, textContent: String(score), title: p.fit.hits.join(", ") || t("no keyword matched") }),
      el("div", {},
        el("a", { class: "mst-title", textContent: f.title || r.title, title: t("Open posting in a new tab"), onclick: () => board.open(r.id) }),
        el("div", { class: "mst-meta", textContent: [r.organization, [r.city, J.locationOf(p, r.city).areas.join(" / ")].filter(Boolean).join(", "), f.term, f.salary && f.salary.slice(0, 40), p.deadline ? `${t("deadline {date}", { date: p.deadline })}${days !== null && days >= 0 ? ` (${days}d)` : ""}` : r.deadlineText].filter(Boolean).join(" · ") }),
        el("div", { class: "mst-chips" }, ...chips)),
      el("div", { class: "mst-actions" }, ...actions));
  }

  function switchLang(button) {
    lang = lang === "fr" ? "en" : "fr";
    try { localStorage.setItem(LANG_KEY, lang); } catch (error) { /* per-browser convenience only */ }
    button.textContent = lang === "fr" ? "EN" : "FR";
    for (const [node, prop, text] of labelled) node[prop] = t(text);
    renderFilters();
    render();
  }

  renderFilters();
  scan();
})();
