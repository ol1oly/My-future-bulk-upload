(function () {
  // Bookmarklet panel. build.py strips comments, injects the three operation scripts and the version, and escapes
  // non-ASCII characters (the bookmarklet loses raw non-ASCII bytes), so French text can stay readable here.
  var VERSION = "__VERSION__";
  var REPO = "https://github.com/ol1oly/My-future-bulk-upload";
  var LATEST_URL = "https://raw.githubusercontent.com/ol1oly/My-future-bulk-upload/main/VERSION";
  var DOCS_URL = "https://myfuture.mcgill.ca/myAccount/opportunities/documents.htm";
  var PREFS_KEY = "mfBulk.prefs";

  function pl(n, one, many) { return n + " " + (n === 1 || (lang === "fr" && n === 0) ? one : many); }
  var I18N = {
    en: {
      notHere: "Open your myFuture documents page, then click the bookmark there.",
      goDocs: "Go to myFuture documents",
      minimise: "Minimise", restore: "Open", close: "Close", langSwitch: "FR", langLabel: "Passer en français",
      stepChoose: "Choose", stepReview: "Review", stepRun: "Run",
      loading: "Reading your documents on myFuture…",
      loadFail: "Could not read your documents. Make sure you are signed in, open the documents page and click the bookmark again.",
      update: "Version {v} is available.", getIt: "Get it",
      modeUpdate: "Update documents", modeClean: "Clean up only",
      addFiles: "Add files", pdfOnly: "PDF only",
      dropHere: "Drop PDFs here", or: "or", browse: "browse",
      dropSub: "CVs, a transcript and cover letters, all at once",
      kindCV: "CV", kindTR: "Transcript", kindCL: "Cover letter",
      removeFile: "Remove {name}", typeOf: "Type of {name}", replaces: "replaces {name}",
      rejected: "{names}: not added. myFuture only accepts PDF here. Export it as PDF and add it again.",
      pkgTitle: "Packages to build", pkgSub: "one per ticked CV",
      newFile: "new file", onMyFuture: "on myFuture",
      usesNew: "Uses {name}, added just now",
      newestOf: function (v) { return v.n > 1 ? "Newest of " + v.n + " copies: " + v.name : v.name; },
      noCVs: "No CVs on myFuture yet. Add one above.",
      trTitle: "Transcript in every package",
      trKeep: "Keep current", trNew: "Use the new one", trNewHint: "Add a transcript PDF above", trNone: "No transcript",
      trWhich: "Which transcript",
      clTitle: "Cover letters",
      clEmpty: "Add cover letters above. Each one can join a CV's package or get its own package.",
      clNone: "Upload only, no package", clAddGroup: "Add to the package of", clOwnGroup: "Its own package with",
      clFor: "Package for {name}",
      optDate: "Add today's date to names", optDateEx: "{a} becomes {b}",
      optDel: "Remove older copies when everything succeeds",
      optDelSub: function (v) { return pl(v.n, "item", "items") + ". Only dated copies are removed; anything in a submitted application stays."; },
      reviewBtn: "Review changes",
      hint: function (v) { return pl(v.u, "file", "files") + " · " + pl(v.p, "package", "packages"); },
      cleanTitle: "Remove older dated copies",
      cleanSub: "For each name, the newest dated copy stays. Names without a date are never touched.",
      cleanCount: function (v) { return v.n + " to remove"; },
      cleanNothing: "Nothing to clean up: every name has a single dated copy.", showNames: "Show names",
      catCV: "CVs", catTR: "Transcripts", catCL: "Cover letters", catPKG: "Packages",
      sumUpdate: function (v) {
        var a = [];
        if (v.u) a.push("upload " + pl(v.u, "file", "files"));
        if (v.p) a.push("build " + pl(v.p, "package", "packages"));
        if (v.d) a.push("remove " + pl(v.d, "older item", "older items"));
        return a.join(", ").replace(/^./, function (c) { return c.toUpperCase(); }) + ". Nothing changes until you confirm.";
      },
      renamed: "{a} already exists on myFuture, so the new copy is named {b}.",
      after: "after: {n}", others: function (v) { return pl(v.n, "other document stays", "other documents stay") + " as they are"; },
      tagNew: "new", tagRemoved: "removed",
      fCV: "CV", fTR: "Transcript", fCL: "Cover letter", none: "none",
      checkBtn: "Check with myFuture", checking: "Checking…",
      checkHint: "Tries the uploads and looks up every name on myFuture without saving anything.",
      chkUpload: "myFuture accepts the files", chkNames: "Every document name is found once",
      chkDelete: "Older copies can be removed",
      chkOk: "Check passed. Nothing was saved.", chkFail: "The check found a problem. Nothing was saved.",
      issCount: "{name}: found {n} times in the {field} list",
      issExists: "{name} already exists on myFuture", issMissing: "{name} is not in the {field} list anymore",
      back: "Back", applyBtn: function (v) { return "Apply " + pl(v.n, "change", "changes"); },
      confirmQ: "Change your myFuture documents now?", confirmDel: "Removed documents can't be restored.",
      notYet: "Not yet", yesApply: "Yes, apply",
      taskUpload: "Upload files", taskPkg: "Build packages", taskDel: "Remove older copies",
      taskVerify: "Check the result on myFuture",
      waiting: "Waiting", skipped: "Skipped. Nothing was removed.",
      keepOpen: "Keep this tab open until it finishes. Usually under a minute.", working: "Working…",
      doneTitle: "Your documents are up to date",
      doneSum: function (v) { return pl(v.u, "file", "files") + " uploaded, " + pl(v.p, "package", "packages") + " built, " + pl(v.d, "item", "items") + " removed."; },
      stoppedTitle: "Stopped at: {step}", nothingRemoved: "Nothing was removed.",
      retry: "Retry remaining steps", copy: "Copy details", copied: "Copied", startOver: "Start over",
      openDocs: "Open documents",
      keptBySite: "Kept by myFuture", keptWhy: "Used in a submitted application, so the site won't delete it.",
      stillThere: "Still on myFuture after removal: {names}",
      cntCV: "CVs", cntTR: "Transcripts", cntCL: "Cover letters", cntPKG: "Packages",
      errSignedOut: "You are not signed in to myFuture.", errSlow: "myFuture took too long to respond.",
      errUploadForm: "The upload form did not open.", errPkgForm: "The package form did not open.",
      errTwoTr: "Add only one transcript PDF.",
      errDupBase: "Two CV files are both named {b}. Rename one of them.",
      errTwoAdd: "Two cover letters join the {b} package. A package holds one cover letter, so give one of them its own package.",
      errOffAdd: "{c} joins the {b} package, but that package is turned off.",
      errNothing: "Add files, or tick a CV whose package you want rebuilt.",
      errNoCleanup: "Nothing selected to remove.",
      errUpload: "Some files were not saved.", errPkg: "Some packages were not created."
    },
    fr: {
      notHere: "Ouvrez votre page Documents de myFuture, puis cliquez sur le favori à cet endroit.",
      goDocs: "Aller aux documents myFuture",
      minimise: "Réduire", restore: "Ouvrir", close: "Fermer", langSwitch: "EN", langLabel: "Switch to English",
      stepChoose: "Choisir", stepReview: "Vérifier", stepRun: "Exécuter",
      loading: "Lecture de vos documents sur myFuture…",
      loadFail: "Impossible de lire vos documents. Vérifiez que vous êtes connecté, ouvrez la page Documents et cliquez de nouveau sur le favori.",
      update: "La version {v} est disponible.", getIt: "L'obtenir",
      modeUpdate: "Mettre à jour", modeClean: "Nettoyer seulement",
      addFiles: "Ajouter des fichiers", pdfOnly: "PDF seulement",
      dropHere: "Déposez vos PDF ici", or: "ou", browse: "parcourir",
      dropSub: "CV, relevé de notes et lettres de présentation, tout à la fois",
      kindCV: "CV", kindTR: "Relevé de notes", kindCL: "Lettre de présentation",
      removeFile: "Retirer {name}", typeOf: "Type de {name}", replaces: "remplace {name}",
      rejected: "{names} : non ajouté. myFuture n'accepte que le PDF ici. Exportez-le en PDF et ajoutez-le de nouveau.",
      pkgTitle: "Dossiers de candidature à créer", pkgSub: "un par CV coché",
      newFile: "nouveau fichier", onMyFuture: "sur myFuture",
      usesNew: "Utilise {name}, ajouté à l'instant",
      newestOf: function (v) { return v.n > 1 ? "Plus récente de " + v.n + " copies : " + v.name : v.name; },
      noCVs: "Aucun CV sur myFuture pour l'instant. Ajoutez-en un ci-dessus.",
      trTitle: "Relevé de notes dans chaque dossier",
      trKeep: "Garder l'actuel", trNew: "Utiliser le nouveau", trNewHint: "Ajoutez un relevé PDF ci-dessus", trNone: "Sans relevé",
      trWhich: "Quel relevé",
      clTitle: "Lettres de présentation",
      clEmpty: "Ajoutez des lettres ci-dessus. Chacune peut rejoindre le dossier d'un CV ou avoir son propre dossier.",
      clNone: "Téléverser seulement, sans dossier", clAddGroup: "Ajouter au dossier de", clOwnGroup: "Son propre dossier avec",
      clFor: "Dossier pour {name}",
      optDate: "Ajouter la date du jour aux noms", optDateEx: "{a} devient {b}",
      optDel: "Supprimer les anciennes copies si tout réussit",
      optDelSub: function (v) { return pl(v.n, "élément", "éléments") + ". Seules les copies datées sont supprimées ; tout ce qui sert dans une candidature envoyée est conservé."; },
      reviewBtn: "Vérifier les changements",
      hint: function (v) { return pl(v.u, "fichier", "fichiers") + " · " + pl(v.p, "dossier", "dossiers"); },
      cleanTitle: "Supprimer les anciennes copies datées",
      cleanSub: "Pour chaque nom, la copie datée la plus récente reste. Les noms sans date ne sont jamais touchés.",
      cleanCount: function (v) { return v.n + " à supprimer"; },
      cleanNothing: "Rien à nettoyer : chaque nom n'a qu'une seule copie datée.", showNames: "Voir les noms",
      catCV: "CV", catTR: "Relevés de notes", catCL: "Lettres de présentation", catPKG: "Dossiers",
      sumUpdate: function (v) {
        var a = [];
        if (v.u) a.push("téléverser " + pl(v.u, "fichier", "fichiers"));
        if (v.p) a.push("créer " + pl(v.p, "dossier", "dossiers"));
        if (v.d) a.push("supprimer " + pl(v.d, "ancien élément", "anciens éléments"));
        return a.join(", ").replace(/^./, function (c) { return c.toUpperCase(); }) + ". Rien ne change avant votre confirmation.";
      },
      renamed: "{a} existe déjà sur myFuture ; la nouvelle copie s'appellera {b}.",
      after: "après : {n}", others: function (v) { return pl(v.n, "autre document reste", "autres documents restent") + " tels quels"; },
      tagNew: "nouveau", tagRemoved: "supprimé",
      fCV: "CV", fTR: "Relevé", fCL: "Lettre", none: "aucun",
      checkBtn: "Vérifier avec myFuture", checking: "Vérification…",
      checkHint: "Essaie les téléversements et cherche chaque nom sur myFuture sans rien enregistrer.",
      chkUpload: "myFuture accepte les fichiers", chkNames: "Chaque nom de document est trouvé une seule fois",
      chkDelete: "Les anciennes copies peuvent être supprimées",
      chkOk: "Vérification réussie. Rien n'a été enregistré.", chkFail: "La vérification a trouvé un problème. Rien n'a été enregistré.",
      issCount: "{name} : trouvé {n} fois dans la liste {field}",
      issExists: "{name} existe déjà sur myFuture", issMissing: "{name} n'est plus dans la liste {field}",
      back: "Retour", applyBtn: function (v) { return "Appliquer " + pl(v.n, "changement", "changements"); },
      confirmQ: "Modifier vos documents myFuture maintenant ?", confirmDel: "Les documents supprimés ne peuvent pas être récupérés.",
      notYet: "Pas encore", yesApply: "Oui, appliquer",
      taskUpload: "Téléverser les fichiers", taskPkg: "Créer les dossiers", taskDel: "Supprimer les anciennes copies",
      taskVerify: "Vérifier le résultat sur myFuture",
      waiting: "En attente", skipped: "Ignoré. Rien n'a été supprimé.",
      keepOpen: "Gardez cet onglet ouvert jusqu'à la fin. En général, moins d'une minute.", working: "En cours…",
      doneTitle: "Vos documents sont à jour",
      doneSum: function (v) { return pl(v.u, "fichier téléversé", "fichiers téléversés") + ", " + pl(v.p, "dossier créé", "dossiers créés") + ", " + pl(v.d, "élément supprimé", "éléments supprimés") + "."; },
      stoppedTitle: "Arrêté à l'étape : {step}", nothingRemoved: "Rien n'a été supprimé.",
      retry: "Reprendre les étapes restantes", copy: "Copier les détails", copied: "Copié", startOver: "Recommencer",
      openDocs: "Ouvrir les documents",
      keptBySite: "Conservés par myFuture", keptWhy: "Utilisé dans une candidature envoyée ; le site refuse de le supprimer.",
      stillThere: "Toujours sur myFuture après suppression : {names}",
      cntCV: "CV", cntTR: "Relevés", cntCL: "Lettres", cntPKG: "Dossiers",
      errSignedOut: "Vous n'êtes pas connecté à myFuture.", errSlow: "myFuture a mis trop de temps à répondre.",
      errUploadForm: "Le formulaire de téléversement ne s'est pas ouvert.", errPkgForm: "Le formulaire de dossier ne s'est pas ouvert.",
      errTwoTr: "Ajoutez un seul relevé de notes PDF.",
      errDupBase: "Deux fichiers CV s'appellent {b}. Renommez-en un.",
      errTwoAdd: "Deux lettres rejoignent le dossier {b}. Un dossier ne contient qu'une lettre : donnez à l'une son propre dossier.",
      errOffAdd: "{c} rejoint le dossier {b}, mais ce dossier est désactivé.",
      errNothing: "Ajoutez des fichiers, ou cochez un CV dont le dossier doit être recréé.",
      errNoCleanup: "Rien n'est sélectionné pour la suppression.",
      errUpload: "Certains fichiers n'ont pas été enregistrés.", errPkg: "Certains dossiers n'ont pas été créés."
    }
  };

  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ } }
  var prefs = loadPrefs();
  var lang = prefs.lang === "fr" || prefs.lang === "en" ? prefs.lang : (/^fr/i.test(navigator.language || "") ? "fr" : "en");
  function t(key, vars) {
    var s = I18N[lang][key] != null ? I18N[lang][key] : I18N.en[key];
    if (typeof s === "function") return s(vars || {});
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }

  if (location.hostname !== "myfuture.mcgill.ca") { showLink(t("notHere")); return; }
  if (window.__mfPanel) { window.__mfPanel.show(); return; }

  function showLink(msg) {
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#fff;color:#1c1e22;" +
      "border:1px solid #d6dbe1;border-top:4px solid #b01e2e;border-radius:8px;padding:14px 16px;max-width:320px;" +
      "font:14px/1.5 'Segoe UI',system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.25)";
    var p = document.createElement("div"); p.style.marginBottom = "8px"; p.textContent = msg;
    var a = document.createElement("a"); a.href = DOCS_URL; a.textContent = t("goDocs"); a.style.cssText = "color:#b01e2e;font-weight:600";
    d.appendChild(p); d.appendChild(a);
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 12000);
  }

  var SCRIPTS = { upload: __UPLOAD_JSON__, del: __DELETE_JSON__, packages: __PACKAGES_JSON__ };
  var BASE = location.origin + "/myAccount/opportunities/documents.htm";
  var CV = "14", TR = "15", CL = "13";
  var DATE_RE = /_(\d{4}-\d{2}-\d{2})(?:_(\d+))?$/;
  // Delete order: packages first, so no package is left pointing at a removed document.
  var CATS = [
    { key: "packages", label: "Application Packages", type: "Package", t: "catPKG" },
    { key: "cvs", label: "CV/Resume", type: "CV/Resume", t: "catCV" },
    { key: "transcripts", label: "Unofficial Transcript", type: "Unofficial Transcript", t: "catTR" },
    { key: "covers", label: "Cover Letter", type: "Cover Letter", t: "catCL" }
  ];

  // ---- myFuture pages, driven in one hidden same-origin iframe so the top page never navigates ----
  var frame;
  function ensureFrame() {
    if (!frame) {
      frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;left:-99999px;top:0;width:1280px;height:900px;border:0";
      document.body.appendChild(frame);
    }
    return frame;
  }
  function win() { return frame.contentWindow; }
  function frameLoad(trigger) {
    return new Promise(function (res, rej) {
      var f = ensureFrame();
      var tm = setTimeout(function () { rej(new Error(t("errSlow"))); }, 30000);
      f.addEventListener("load", function () { clearTimeout(tm); res(f.contentDocument); }, { once: true });
      trigger(f);
    });
  }
  function gotoBase() { return frameLoad(function (f) { f.src = BASE; }); }
  function runInFrame(src, varName, cfg) { win()[varName] = cfg; return Promise.resolve(win().eval(src)).then(JSON.parse); }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function pickOverviewRow(doc, label) {
    var re = new RegExp("^\\s*" + reEsc(label) + "\\s*\\d+");
    return [].slice.call(doc.querySelectorAll("tr,li,div"))
      .filter(function (e) { return re.test(e.innerText || "") && e.querySelector("a,button"); })
      .sort(function (a, b) { return a.innerText.length - b.innerText.length; })[0];
  }
  function rowCount(row, label) { var m = (row.innerText || "").match(new RegExp(reEsc(label) + "\\s*(\\d+)")); return m ? Number(m[1]) : -1; }
  function findButton(doc, text) { return [].slice.call(doc.querySelectorAll("button,a")).find(function (x) { return x.innerText.trim() === text && x.offsetParent; }); }
  async function frameToAll() {
    var doc = await gotoBase();
    var sel = [].slice.call(doc.querySelectorAll("select")).find(function (s) {
      return [].slice.call(s.options).some(function (o) { return o.text.trim() === "all"; });
    });
    if (!sel) throw new Error(t("errSignedOut"));
    if (sel.value !== "0") doc = await frameLoad(function () { sel.value = "0"; sel.dispatchEvent(new (win().Event)("change", { bubbles: true })); });
    return doc;
  }
  async function listDocs(label) {
    var doc = await frameToAll();
    var row = pickOverviewRow(doc, label);
    if (!row || rowCount(row, label) === 0) return [];
    doc = await frameLoad(function () { row.querySelector("a,button").click(); });
    var rows = [];
    for (var i = 0; i < 20 && !rows.length; i++) {
      rows = [].slice.call(doc.querySelectorAll("table tbody tr")).filter(function (r) { return r.querySelector("input[type=checkbox]"); });
      if (!rows.length) await new Promise(function (r) { setTimeout(r, 400); });
    }
    return rows.map(function (r) { var c = [].slice.call(r.querySelectorAll("td")).map(function (d) { return d.innerText.trim(); }); return { name: c[2], date: c[4] }; });
  }
  async function opUpload(docs, files, dryRun) {
    var doc = await gotoBase();
    var btn = findButton(doc, "Upload Document");
    if (!btn) throw new Error(t("errSignedOut"));
    await frameLoad(function () { btn.click(); });
    if (!win().document.querySelector("input[name=docName]")) throw new Error(t("errUploadForm"));
    return runInFrame(SCRIPTS.upload, "__MF", { docs: docs, files: files, dryRun: dryRun });
  }
  async function opDelete(label, cfg) {
    var doc = await frameToAll();
    var row = pickOverviewRow(doc, label);
    if (!row || rowCount(row, label) === 0) return { kept: [], results: [], toDelete: [] };
    await frameLoad(function () { row.querySelector("a,button").click(); });
    return runInFrame(SCRIPTS.del, "__MFD", cfg);
  }
  async function openPackageForm() {
    var doc = await gotoBase();
    var btn = findButton(doc, "Create Application Package");
    if (!btn) throw new Error(t("errSignedOut"));
    await frameLoad(function () { btn.click(); });
    if (!win().document.querySelector("input[name=name]")) throw new Error(t("errPkgForm"));
  }
  async function opPackages(packages, dryRun) {
    await openPackageForm();
    return runInFrame(SCRIPTS.packages, "__MFP", { packages: packages, dryRun: dryRun });
  }
  async function readPackageOptions() {
    await openPackageForm();
    var d = win().document, out = {};
    [CL, CV, TR].forEach(function (k) {
      var s = d.querySelector('select[name="' + k + '"]');
      out[k] = s ? [].slice.call(s.options).filter(function (o) { return o.value; }).map(function (o) { return o.text.trim(); }) : [];
    });
    return out;
  }

  // ---- names ----
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function stem(name) { return name.replace(/\.[^.]+$/, ""); }
  function baseOf(name) { return name.replace(DATE_RE, ""); }
  function isDated(name) { return DATE_RE.test(name); }
  function sortKey(d) {
    var m = d.name.match(DATE_RE);
    if (m) return m[1] + "#" + ("0000" + (m[2] || "1")).slice(-4);
    var ms = Date.parse(d.date || "");
    return isNaN(ms) ? "" : new Date(ms).toISOString().slice(0, 10) + "#0000";
  }
  function byNewest(a, b) { var x = sortKey(a), y = sortKey(b); return x < y ? 1 : x > y ? -1 : 0; }
  function groupByBase(list) {
    var groups = [], idx = {};
    list.forEach(function (d) {
      var b = baseOf(d.name);
      if (!(b in idx)) { idx[b] = groups.length; groups.push({ base: b, items: [] }); }
      groups[idx[b]].items.push(d);
    });
    groups.forEach(function (g) { g.items.sort(byNewest); g.newest = g.items[0].name; });
    return groups;
  }
  function newestName(list) { return list.length ? list.slice().sort(byNewest)[0].name : ""; }
  function guessKind(name) {
    var n = name.toLowerCase();
    if (/transcript|relev|bulletin|unofficial/.test(n)) return TR;
    if (/cover|lettre|letter|motivation|(^|[_\- ])cl([_\- .]|$)/.test(n)) return CL;
    return CV;
  }
  function isPdf(f) { return /\.pdf$/i.test(f.name) || f.type === "application/pdf"; }

  // ---- state ----
  var existing = { cvs: [], transcripts: [], covers: [], packages: [] };
  var S = {
    screen: "loading", mode: prefs.mode === "cleanup" ? "cleanup" : "update",
    files: [], nextId: 1, rejected: [],
    cvOff: prefs.cvOff || {}, trChoice: null, trKeep: "", covers: {},
    dateSuffix: prefs.dateSuffix !== false, deleteOld: prefs.deleteOld !== false,
    clean: prefs.clean || {}, minimised: false, confirm: false, check: null, update: null, busy: false
  };
  var run = null;
  var logLines = [];
  function log(line) { logLines.push(new Date().toTimeString().slice(0, 8) + " " + line); }

  function filesOf(kind) { return S.files.filter(function (f) { return f.kind === kind; }); }
  function trFile() { return filesOf(TR)[0] || null; }
  function trChoice() {
    if (S.trChoice === "new" && trFile()) return "new";
    if (S.trChoice === "none") return "none";
    if (S.trChoice === "keep" && existing.transcripts.length) return "keep";
    return trFile() ? "new" : existing.transcripts.length ? "keep" : "none";
  }
  function cvRows() {
    var rows = [], seen = {}, groups = groupByBase(existing.cvs), gIdx = {};
    groups.forEach(function (g) { gIdx[g.base] = g; });
    filesOf(CV).forEach(function (f) {
      var b = baseOf(stem(f.file.name));
      if (seen[b]) return;
      seen[b] = 1; rows.push({ base: b, file: f, group: gIdx[b] || null });
    });
    groups.forEach(function (g) { if (!seen[g.base]) { seen[g.base] = 1; rows.push({ base: g.base, file: null, group: g }); } });
    return rows;
  }
  function coverChoice(f, rows) {
    var c = S.covers[f.id];
    if (c != null) return c;
    var saved = (prefs.covers || {})[baseOf(stem(f.file.name))];
    var bases = rows.map(function (r) { return r.base; });
    if (saved && (saved === "none" || bases.indexOf(saved.slice(4)) >= 0)) return saved;
    var n = stem(f.file.name).toLowerCase();
    var guess = bases.filter(function (b) { return n.indexOf(b.toLowerCase()) >= 0; }).sort(function (a, b) { return b.length - a.length; })[0];
    return guess ? "add:" + guess : "none";
  }

  function computePlan() {
    return S.mode === "cleanup" ? cleanupPlan() : updatePlan();
  }
  function emptyDeletes() { return { packages: [], cvs: [], transcripts: [], covers: [] }; }
  function namesSet(list) { var o = {}; list.forEach(function (d) { o[d.name] = 1; }); return o; }

  function updatePlan() {
    var suffix = S.dateSuffix ? "_" + today() : "";
    var taken = { cv: namesSet(existing.cvs), tr: namesSet(existing.transcripts), cl: namesSet(existing.covers), pkg: namesSet(existing.packages) };
    var renamed = [], uploads = [], errors = [];
    function claim(kind, want) {
      var name = want, i = 2;
      while (taken[kind][name]) name = want + "_" + i++;
      taken[kind][name] = 1;
      if (name !== want) renamed.push({ from: want, to: name });
      return name;
    }
    function docName(f) { var s = stem(f.name); return S.dateSuffix ? baseOf(s) + suffix : s; }

    var rows = cvRows(), cvByBase = {}, seenNew = {};
    filesOf(CV).forEach(function (f) {
      var b = baseOf(stem(f.file.name));
      if (seenNew[b]) errors.push(t("errDupBase", { b: b })); seenNew[b] = 1;
    });
    rows.forEach(function (r) {
      if (r.file) { r.cv = claim("cv", docName(r.file.file)); uploads.push({ file: r.file.file, name: r.cv, type: CV }); }
      else r.cv = r.group.newest;
      cvByBase[r.base] = r.cv;
    });
    var targets = rows.filter(function (r) { return !S.cvOff[r.base]; });

    if (filesOf(TR).length > 1) errors.push(t("errTwoTr"));
    var trName = null, tc = trChoice(), trf = trFile();
    if (tc === "new") { trName = claim("tr", docName(trf.file)); uploads.push({ file: trf.file, name: trName, type: TR }); }
    else if (tc === "keep") trName = existing.transcripts.some(function (d) { return d.name === S.trKeep; }) ? S.trKeep : newestName(existing.transcripts);

    var addTo = {}, own = [];
    filesOf(CL).forEach(function (f) {
      var name = claim("cl", docName(f.file));
      uploads.push({ file: f.file, name: name, type: CL });
      var c = coverChoice(f, rows), b = c.slice(4);
      if (c.indexOf("add:") === 0) {
        if (S.cvOff[b] || !cvByBase[b]) errors.push(t("errOffAdd", { c: stem(f.file.name), b: b }));
        else if (addTo[b]) errors.push(t("errTwoAdd", { b: b }));
        else addTo[b] = name;
      } else if (c.indexOf("own:") === 0 && cvByBase[b]) own.push({ base: baseOf(stem(f.file.name)), cvBase: b, cover: name });
    });

    var packages = targets.map(function (r) {
      return { name: claim("pkg", r.base + suffix), base: r.base, cv: r.cv, transcript: trName, coverLetter: addTo[r.base] || null };
    }).concat(own.map(function (o) {
      return { name: claim("pkg", o.base + suffix), base: o.base, cv: cvByBase[o.cvBase], transcript: trName, coverLetter: o.cover };
    }));

    var deletes = emptyDeletes();
    if (S.deleteOld) {
      var used = {};
      packages.forEach(function (p) { [p.cv, p.transcript, p.coverLetter].forEach(function (n) { if (n) used[n] = 1; }); });
      var olderOf = function (list, bases) {
        return list.map(function (d) { return d.name; }).filter(function (n) { return isDated(n) && bases[baseOf(n)] && !used[n]; });
      };
      var set = function (arr) { var o = {}; arr.forEach(function (b) { o[b] = 1; }); return o; };
      deletes.packages = olderOf(existing.packages, set(packages.map(function (p) { return p.base; })));
      deletes.cvs = olderOf(existing.cvs, set(rows.filter(function (r) { return r.file; }).map(function (r) { return r.base; })));
      if (tc === "new") deletes.transcripts = olderOf(existing.transcripts, set([baseOf(stem(trf.file.name))]));
      deletes.covers = olderOf(existing.covers, set(filesOf(CL).map(function (f) { return baseOf(stem(f.file.name)); })));
    }
    if (!uploads.length && !packages.length && !errors.length) errors.push(t("errNothing"));
    return { mode: "update", uploads: uploads, packages: packages, deletes: deletes, renamed: renamed, errors: errors, rows: rows, trName: trName };
  }

  function cleanupCandidates() {
    var out = emptyDeletes();
    CATS.forEach(function (c) {
      groupByBase(existing[c.key]).forEach(function (g) {
        g.items.filter(function (d) { return isDated(d.name); }).slice(1).forEach(function (d) { out[c.key].push(d.name); });
      });
    });
    return out;
  }
  function cleanupPlan() {
    var all = cleanupCandidates(), deletes = emptyDeletes();
    CATS.forEach(function (c) { if (S.clean[c.key] !== false) deletes[c.key] = all[c.key]; });
    var errors = delCount(deletes) ? [] : [t(delCount(all) ? "errNoCleanup" : "cleanNothing")];
    return { mode: "cleanup", uploads: [], packages: [], deletes: deletes, renamed: [], errors: errors, all: all };
  }
  function delCount(d) { return d.packages.length + d.cvs.length + d.transcripts.length + d.covers.length; }
  function changeCount(p) { return p.uploads.length + p.packages.length + delCount(p.deletes); }

  function rememberChoices() {
    prefs.mode = S.mode; prefs.dateSuffix = S.dateSuffix; prefs.deleteOld = S.deleteOld; prefs.clean = S.clean; prefs.cvOff = S.cvOff;
    var rows = cvRows();
    prefs.covers = prefs.covers || {};
    filesOf(CL).forEach(function (f) { prefs.covers[baseOf(stem(f.file.name))] = coverChoice(f, rows); });
    savePrefs();
  }

  // ---- dry run: everything except saving ----
  async function checkPlan(plan, res) {
    function step(key, ok, issues) { res.steps.push({ key: key, ok: ok, issues: issues || [] }); if (!ok) res.ok = false; render(); }
    try {
      if (plan.uploads.length) {
        await opUpload(plan.uploads.map(function (u) { return { file: u.file.name, name: u.name, type: u.type }; }), plan.uploads.map(function (u) { return u.file; }), true);
        step("chkUpload", true);
      }
      if (plan.uploads.length || plan.packages.length) {
        var opts = await readPackageOptions(), issues = [], fieldName = {};
        fieldName[CV] = t("fCV"); fieldName[TR] = t("fTR"); fieldName[CL] = t("fCL");
        var uploading = {};
        plan.uploads.forEach(function (u) {
          uploading[u.name] = 1;
          if (opts[u.type].indexOf(u.name) >= 0) issues.push(t("issExists", { name: u.name }));
        });
        var seenRef = {};
        plan.packages.forEach(function (p) {
          [[CV, p.cv], [TR, p.transcript], [CL, p.coverLetter]].forEach(function (pair) {
            var name = pair[1];
            if (!name || uploading[name] || seenRef[name]) return;
            seenRef[name] = 1;
            var n = opts[pair[0]].filter(function (x) { return x === name; }).length;
            if (n !== 1) issues.push(t("issCount", { name: name, n: n, field: fieldName[pair[0]] }));
          });
        });
        step("chkNames", !issues.length, issues);
      }
      var delIssues = [];
      for (var i = 0; i < CATS.length; i++) {
        var c = CATS[i], names = plan.deletes[c.key];
        if (!names.length) continue;
        var r = await opDelete(c.label, { type: c.type, deleteNames: names, dryRun: true });
        var found = r.toDelete || [];
        names.forEach(function (n) { if (found.indexOf(n) < 0) delIssues.push(t("issMissing", { name: n, field: t(c.t) })); });
      }
      if (delCount(plan.deletes)) step("chkDelete", !delIssues.length, delIssues);
    } catch (e) {
      step(res.steps.length ? "chkDelete" : plan.uploads.length ? "chkUpload" : "chkNames", false, [errText(e)]);
    }
    return res;
  }
  function errText(e) { return e && e.message ? e.message : String(e); }

  // ---- real run, resumable: finished uploads/packages/deletes are skipped on retry ----
  function newRun(plan) {
    return {
      plan: plan, done: { uploads: {}, packages: {}, deletes: {} }, inUse: [], still: [], error: null, finished: false,
      tasks: { upload: "wait", pkg: "wait", del: "wait", verify: "wait" }, current: ""
    };
  }
  function keyName(k) { return k.slice(k.indexOf(":") + 1); }
  function doneCount(obj) { return Object.keys(obj).length; }
  async function execute() {
    var p = run.plan, d = run.done;
    run.error = null; run.finished = false;
    var stage = "upload";
    try {
      if (p.uploads.length) {
        run.tasks.upload = "run"; render();
        var todo = p.uploads.filter(function (u) { return !d.uploads[u.name]; });
        if (todo.length) {
          log("upload " + todo.map(function (u) { return u.name; }).join(", "));
          var up = await opUpload(todo.map(function (u) { return { file: u.file.name, name: u.name, type: u.type }; }), todo.map(function (u) { return u.file; }), false);
          (up.results || []).forEach(function (r) { if (r.status === "saved") d.uploads[r.name] = 1; else log("  " + r.name + ": " + r.status); });
          if (todo.some(function (u) { return !d.uploads[u.name]; })) throw new Error(t("errUpload"));
          if (!up.ok) log("  saved, but myFuture's counts did not match: " + JSON.stringify({ before: up.before, after: up.after }));
        }
        run.tasks.upload = "ok"; render();
      }
      stage = "pkg";
      if (p.packages.length) {
        run.tasks.pkg = "run"; render();
        var ptodo = p.packages.filter(function (x) { return !d.packages[x.name]; });
        if (ptodo.length) {
          log("packages " + ptodo.map(function (x) { return x.name; }).join(", "));
          var made = await opPackages(ptodo.map(function (x) { return { name: x.name, cv: x.cv, transcript: x.transcript, coverLetter: x.coverLetter }; }), false);
          (made.results || []).forEach(function (r) { if (r.status === "created") d.packages[r.name] = 1; else log("  " + r.name + ": " + r.status); });
          if (ptodo.some(function (x) { return !d.packages[x.name]; })) throw new Error(t("errPkg"));
        }
        run.tasks.pkg = "ok"; render();
      }
      stage = "del";
      if (delCount(p.deletes)) {
        run.tasks.del = "run"; render();
        for (var i = 0; i < CATS.length; i++) {
          var c = CATS[i];
          // Keyed by category: a CV and a package often share a name.
          var names = p.deletes[c.key].filter(function (n) { return !d.deletes[c.key + ":" + n]; });
          if (!names.length) continue;
          log("remove " + c.type + ": " + names.join(", "));
          var r = await opDelete(c.label, { type: c.type, deleteNames: names });
          (r.results || []).forEach(function (x) {
            if (String(x.status).indexOf("in-use") === 0) { if (run.inUse.indexOf(c.key + ":" + x.name) < 0) run.inUse.push(c.key + ":" + x.name); }
            else if (x.status !== "requested") log("  " + x.name + ": " + x.status);
          });
          names.forEach(function (n) { d.deletes[c.key + ":" + n] = 1; });
          render();
        }
        run.tasks.del = "ok"; render();
      }
      stage = "verify";
      run.tasks.verify = "run"; render();
      await loadExisting();
      var present = {};
      CATS.forEach(function (c) { existing[c.key].forEach(function (x) { present[c.key + ":" + x.name] = 1; }); });
      run.still = Object.keys(d.deletes).filter(function (k) { return present[k] && run.inUse.indexOf(k) < 0; });
      run.tasks.verify = "ok"; run.finished = true;
      log("done");
    } catch (e) {
      run.tasks[stage] = "fail";
      run.error = { stage: stage, message: errText(e) };
      log("stopped at " + stage + ": " + errText(e));
    }
  }

  async function loadExisting() {
    existing.cvs = await listDocs("CV/Resume");
    existing.transcripts = await listDocs("Unofficial Transcript");
    existing.covers = await listDocs("Cover Letter");
    existing.packages = await listDocs("Application Packages");
  }

  // ---- UI ----
  var CSS =
    ":host{all:initial}*{box-sizing:border-box}" +
    ".wrap{position:fixed;right:20px;bottom:20px;width:440px;max-width:calc(100vw - 24px);max-height:88vh;display:flex;flex-direction:column;" +
    "background:#fff;color:#1c1e22;border:1px solid #d6dbe1;border-radius:10px;box-shadow:0 18px 44px rgba(20,24,30,.28);" +
    "font:14px/1.5 'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;z-index:2147483647;overflow:hidden}" +
    "button,select,input{font:inherit;color:inherit}" +
    "button:focus-visible,select:focus-visible,input:focus-visible,.drop:focus-within{outline:2px solid #1f5fbf;outline-offset:2px}" +
    ".ph{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #d6dbe1;cursor:move;user-select:none;touch-action:none}" +
    ".ph b{font-weight:600;font-size:15px}.ph .v{color:#5d646d;font-size:11.5px}.ph .mark{width:10px;height:10px;border-radius:2px;background:#b01e2e;flex:none}" +
    ".ph .st{color:#5d646d;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}" +
    ".ph .acts{margin-left:auto;display:flex;gap:2px;flex:none}" +
    ".ph .acts button{border:0;background:none;color:#5d646d;font-size:12.5px;padding:4px 7px;border-radius:5px;cursor:pointer}" +
    ".ph .acts button:hover{background:#eceff2;color:#1c1e22}" +
    ".upd{background:#fbf1dc;color:#6b4600;font-size:12.5px;padding:7px 12px;display:flex;gap:8px;align-items:center}" +
    ".upd a{color:#6b4600;font-weight:600}" +
    ".steps{display:flex;padding:0 12px;border-bottom:1px solid #d6dbe1;font-size:12.5px}" +
    ".steps span{flex:1;padding:8px 0 7px;color:#5d646d;border-bottom:2px solid transparent;display:flex;gap:6px;align-items:center}" +
    ".steps i{font-style:normal;width:18px;height:18px;border-radius:50%;border:1px solid #d6dbe1;display:inline-grid;place-items:center;font-size:11px}" +
    ".steps .on{color:#1c1e22;font-weight:600;border-color:#b01e2e}.steps .on i{background:#b01e2e;border-color:#b01e2e;color:#fff}" +
    ".steps .done i{background:#1c1e22;border-color:#1c1e22;color:#fff}" +
    ".pb{padding:12px;display:flex;flex-direction:column;gap:14px;overflow:auto;min-height:0}" +
    ".sec{display:flex;flex-direction:column;gap:6px}" +
    ".sec h3{margin:0;font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:baseline;gap:8px}" +
    ".sec h3 small{font-weight:400;color:#5d646d;font-size:12px}" +
    ".seg{display:flex;border:1px solid #d6dbe1;border-radius:7px;padding:2px;gap:2px;background:#f4f6f8}" +
    ".seg button{flex:1;border:0;background:none;padding:6px;border-radius:5px;cursor:pointer;font-size:13px;color:#5d646d}" +
    ".seg button[aria-pressed=true]{background:#fff;color:#1c1e22;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}" +
    ".drop{display:block;border:1.5px dashed #c3c9d1;border-radius:8px;padding:12px;text-align:center;background:#f4f6f8;color:#5d646d;font-size:13px;cursor:pointer}" +
    ".drop.over{border-color:#b01e2e;background:#f8e7e9}.drop b{color:#1c1e22}.drop u{color:#b01e2e}" +
    ".drop input{position:absolute;width:1px;height:1px;opacity:0}" +
    ".file{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:6px 8px;border:1px solid #d6dbe1;border-radius:7px;font-size:13px}" +
    ".file.two{grid-template-columns:minmax(0,1fr)}" +
    ".n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.n small,.meta{display:block;color:#5d646d;font-size:11.5px;white-space:normal}" +
    "select{font-size:12.5px;padding:3px 4px;border:1px solid #d6dbe1;border-radius:5px;background:#fff;max-width:100%}" +
    ".x{border:0;background:none;color:#5d646d;cursor:pointer;font-size:16px;line-height:1;padding:2px 5px;border-radius:4px}.x:hover{background:#eceff2}" +
    ".note{font-size:12.5px;border-radius:6px;padding:7px 9px}.warn{color:#6b4600;background:#fbf1dc}.err{color:#8c1d28;background:#f8e7e9}" +
    ".group{border:1px solid #d6dbe1;border-radius:7px}" +
    ".row{display:flex;gap:9px;align-items:flex-start;padding:6px 9px;font-size:13px}.row+.row{border-top:1px solid #d6dbe1}" +
    ".row input{margin-top:3px;accent-color:#b01e2e}.grow{flex:1;min-width:0;overflow-wrap:anywhere}" +
    ".tag{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;white-space:nowrap}" +
    ".t-new{background:#e5f2ea;color:#22603c}.t-del{background:#f8e7e9;color:#8c1d28}.t-keep{background:#f4f6f8;color:#5d646d;border:1px solid #d6dbe1}" +
    ".opt{display:flex;gap:9px;align-items:flex-start;font-size:13px}.opt input{margin-top:3px;accent-color:#b01e2e}.opt code,.mono{font:12px Consolas,Menlo,monospace}" +
    ".pf{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #d6dbe1;background:#f4f6f8;align-items:center;flex-wrap:wrap}" +
    ".pf .hint{font-size:12px;color:#5d646d;flex:1}" +
    ".btn{border:1px solid #d6dbe1;background:#fff;font-weight:600;font-size:13px;padding:8px 12px;border-radius:6px;cursor:pointer;text-decoration:none;color:#1c1e22}" +
    ".btn.primary{flex:1;background:#b01e2e;color:#fff;border-color:#b01e2e}.btn:disabled{opacity:.5;cursor:default}" +
    ".sum{font-size:13px;background:#f4f6f8;border-radius:7px;padding:8px 10px}" +
    ".gone .mono{text-decoration:line-through;color:#5d646d}" +
    ".pkg{border:1px solid #d6dbe1;border-radius:7px;padding:8px 10px;font-size:12.5px}" +
    ".pkg dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 10px;margin:4px 0 0}.pkg dt{color:#5d646d}.pkg dd{margin:0;font:12px Consolas,Menlo,monospace;overflow-wrap:anywhere}" +
    ".confirm{border:1px solid #b01e2e;border-radius:8px;padding:10px;font-size:13px;display:flex;flex-direction:column;gap:8px}" +
    ".prog{height:6px;background:#eceff2;border-radius:99px;overflow:hidden}.prog i{display:block;height:100%;background:#b01e2e;transition:width .3s}" +
    ".task{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:start;font-size:13px;padding:6px 0}.task+.task{border-top:1px solid #d6dbe1}" +
    ".ic{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;margin-top:1px}" +
    ".ic.ok{background:#2a7148;color:#fff}.ic.fail{background:#a3313d;color:#fff}.ic.wait{border:1.5px solid #d6dbe1}" +
    ".ic.run{border:2px solid #b01e2e;border-right-color:transparent;animation:spin 1s linear infinite}" +
    "@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.ic.run{animation:none}.prog i{transition:none}}" +
    ".task small{display:block;color:#5d646d;font-size:12px;overflow-wrap:anywhere}.ct{font-variant-numeric:tabular-nums;color:#5d646d;font-size:12px}" +
    ".result{border-radius:8px;padding:10px 12px;font-size:13px}.result b{display:block}.bad{background:#f8e7e9}.good{background:#e5f2ea}" +
    ".counts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center}" +
    ".counts div{border:1px solid #d6dbe1;border-radius:7px;padding:6px 2px;font-size:11.5px;color:#5d646d}.counts b{display:block;font-size:18px;color:#1c1e22;font-variant-numeric:tabular-nums}" +
    "details summary{cursor:pointer;font-size:12px;color:#5d646d}details .mono{display:block;padding:1px 0 1px 12px}" +
    ".min .steps,.min .pb,.min .pf,.min .upd{display:none}";

  var host = document.createElement("div");
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var styleEl = document.createElement("style"); styleEl.textContent = CSS; root.appendChild(styleEl);
  var wrap = h("div", { class: "wrap", role: "dialog", "aria-label": "myFuture bulk" });
  root.appendChild(wrap);

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "open") e[k] = !!v;
      else if (k === "value") e.value = v;
      else e.setAttribute(k, v === true ? "" : v);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  function sec(title, small, kids) { return h("div", { class: "sec" }, [h("h3", null, [title, small ? h("small", { text: small }) : null])].concat(kids)); }
  function tag(kind, text) { return h("span", { class: "tag t-" + kind, text: text }); }

  function set(fn) { return function (e) { fn(e); rememberChoices(); render(); }; }

  function addFiles(list) {
    S.rejected = [];
    [].slice.call(list || []).forEach(function (f) {
      if (!isPdf(f)) { S.rejected.push(f.name); return; }
      var same = S.files.find(function (x) { return x.file.name === f.name; });
      if (same) { same.file = f; return; }
      var kind = guessKind(f.name);
      S.files.push({ id: S.nextId++, file: f, kind: kind });
      if (kind === TR) S.trChoice = "new";
    });
    S.check = null;
    rememberChoices(); render();
  }

  function header() {
    var status = "";
    if (S.minimised && run && S.screen === "run") status = t("working") + " " + progress() + "%";
    var bar = h("div", { class: "ph", onpointerdown: startDrag }, [
      h("span", { class: "mark" }), h("b", { text: "myFuture bulk" }), h("span", { class: "v", text: "v" + VERSION }),
      status ? h("span", { class: "st", text: status }) : null,
      h("div", { class: "acts" }, [
        h("button", { type: "button", "aria-label": t("langLabel"), text: t("langSwitch"), onclick: function () { lang = lang === "fr" ? "en" : "fr"; prefs.lang = lang; savePrefs(); render(); } }),
        h("button", { type: "button", text: S.minimised ? t("restore") : t("minimise"), onclick: function () { S.minimised = !S.minimised; render(); } }),
        h("button", { type: "button", text: t("close"), onclick: function () { host.style.display = "none"; } })
      ])
    ]);
    return bar;
  }
  function stepsBar() {
    var n = { choose: 1, review: 2, run: 3, result: 3 }[S.screen] || 0;
    return h("div", { class: "steps" }, [["stepChoose", 1], ["stepReview", 2], ["stepRun", 3]].map(function (s) {
      var k = s[1];
      return h("span", { class: k === n ? "on" : k < n ? "done" : "" }, [h("i", { text: k < n ? "✓" : String(k) }), t(s[0])]);
    }));
  }

  function chooseScreen() {
    var plan = computePlan(), body = [];
    body.push(h("div", { class: "seg", role: "group" }, [["update", "modeUpdate"], ["cleanup", "modeClean"]].map(function (m) {
      return h("button", { type: "button", "aria-pressed": String(S.mode === m[0]), "data-k": "mode-" + m[0], text: t(m[1]), onclick: set(function () { S.mode = m[0]; S.check = null; }) });
    })));

    if (S.mode === "cleanup") {
      var all = plan.all;
      body.push(sec(t("cleanTitle"), null, [h("div", { class: "meta", text: t("cleanSub") })].concat(
        delCount(all) ? [h("div", { class: "group" }, CATS.filter(function (c) { return all[c.key].length; }).map(function (c) {
          return h("label", { class: "row" }, [
            h("input", { type: "checkbox", "data-k": "clean-" + c.key, checked: S.clean[c.key] !== false, onchange: set(function (e) { S.clean[c.key] = e.target.checked; }) }),
            h("span", { class: "grow" }, [t(c.t) + " ", h("span", { class: "meta", text: t("cleanCount", { n: all[c.key].length }) }),
              h("details", null, [h("summary", { text: t("showNames") })].concat(all[c.key].map(function (n) { return h("span", { class: "mono", text: n }); })))])
          ]);
        }))] : [h("div", { class: "note warn", text: t("cleanNothing") })]
      )));
      return { body: body, foot: footChoose(plan, h("span", { class: "hint", text: t("cleanCount", { n: delCount(plan.deletes) }) })) };
    }

    var input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple: true, "data-k": "fileinput", onchange: function (e) { addFiles(e.target.files); e.target.value = ""; } });
    var drop = h("label", {
      class: "drop",
      ondragover: function (e) { e.preventDefault(); drop.classList.add("over"); },
      ondragleave: function () { drop.classList.remove("over"); },
      ondrop: function (e) { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); }
    }, [input, h("b", { text: t("dropHere") }), " " + t("or") + " ", h("u", { text: t("browse") }), h("br"), t("dropSub")]);
    var cvGroups = {}; groupByBase(existing.cvs).forEach(function (g) { cvGroups[g.base] = g; });
    var fileRows = S.files.map(function (f) {
      var meta = Math.max(1, Math.round(f.file.size / 1024)) + " KB";
      var g = f.kind === CV && cvGroups[baseOf(stem(f.file.name))];
      if (g) meta += " · " + t("replaces", { name: g.newest });
      return h("div", { class: "file" }, [
        h("div", { class: "n", title: f.file.name }, [f.file.name, h("small", { text: meta })]),
        h("select", { "aria-label": t("typeOf", { name: f.file.name }), "data-k": "kind-" + f.id, onchange: set(function (e) { f.kind = e.target.value; if (f.kind === TR) S.trChoice = "new"; S.check = null; }) },
          [[CV, "kindCV"], [TR, "kindTR"], [CL, "kindCL"]].map(function (k) { return h("option", { value: k[0], selected: f.kind === k[0], text: t(k[1]) }); })),
        h("button", { type: "button", class: "x", "aria-label": t("removeFile", { name: f.file.name }), text: "×", onclick: set(function () { S.files.splice(S.files.indexOf(f), 1); delete S.covers[f.id]; S.check = null; }) })
      ]);
    });
    body.push(sec(t("addFiles"), t("pdfOnly"), [drop].concat(fileRows, S.rejected.length ? [h("div", { class: "note warn", text: t("rejected", { names: S.rejected.join(", ") }) })] : [])));

    var rows = plan.rows;
    body.push(sec(t("pkgTitle"), t("pkgSub"), rows.length ? [h("div", { class: "group" }, rows.map(function (r) {
      return h("label", { class: "row" }, [
        h("input", { type: "checkbox", "data-k": "cv-" + r.base, checked: !S.cvOff[r.base], onchange: set(function (e) { if (e.target.checked) delete S.cvOff[r.base]; else S.cvOff[r.base] = true; S.check = null; }) }),
        h("span", { class: "grow" }, [r.base + " ", r.file ? tag("new", t("newFile")) : tag("keep", t("onMyFuture")),
          h("span", { class: "meta", text: r.file ? t("usesNew", { name: r.file.file.name }) : t("newestOf", { n: r.group.items.length, name: r.group.newest }) })])
      ]);
    }))] : [h("div", { class: "meta", text: t("noCVs") })]));

    var tc = trChoice(), trf = trFile();
    var trOpts = [];
    if (existing.transcripts.length) trOpts.push(["keep", t("trKeep"), null]);
    trOpts.push(["new", t("trNew"), trf ? trf.file.name : t("trNewHint")]);
    trOpts.push(["none", t("trNone"), null]);
    var trRows = trOpts.map(function (o) {
      var extra = o[2] ? h("span", { class: "meta", text: o[2] }) : null;
      if (o[0] === "keep") {
        var cur = S.trKeep && existing.transcripts.some(function (d) { return d.name === S.trKeep; }) ? S.trKeep : newestName(existing.transcripts);
        extra = existing.transcripts.length > 1
          ? h("select", { "aria-label": t("trWhich"), "data-k": "trkeep", onchange: set(function (e) { S.trKeep = e.target.value; S.trChoice = "keep"; S.check = null; }) },
            existing.transcripts.slice().sort(byNewest).map(function (d) { return h("option", { value: d.name, selected: d.name === cur, text: d.name }); }))
          : h("span", { class: "meta", text: cur });
      }
      return h("label", { class: "row" }, [
        h("input", { type: "radio", name: "tr", "data-k": "tr-" + o[0], checked: tc === o[0], disabled: o[0] === "new" && !trf, onchange: set(function () { S.trChoice = o[0]; S.check = null; }) }),
        h("span", { class: "grow" }, [o[1], extra])
      ]);
    });
    body.push(sec(t("trTitle"), null, [h("div", { class: "group" }, trRows)]));

    var covers = filesOf(CL), targets = rows.filter(function (r) { return !S.cvOff[r.base]; });
    body.push(sec(t("clTitle"), null, covers.length ? covers.map(function (f) {
      var cur = coverChoice(f, rows);
      return h("div", { class: "file two" }, [
        h("div", { class: "n", title: f.file.name, text: stem(f.file.name) }),
        h("select", { "aria-label": t("clFor", { name: f.file.name }), "data-k": "cl-" + f.id, onchange: set(function (e) { S.covers[f.id] = e.target.value; S.check = null; }) }, [
          h("option", { value: "none", selected: cur === "none", text: t("clNone") }),
          targets.length ? h("optgroup", { label: t("clAddGroup") }, targets.map(function (r) { return h("option", { value: "add:" + r.base, selected: cur === "add:" + r.base, text: r.base }); })) : null,
          rows.length ? h("optgroup", { label: t("clOwnGroup") }, rows.map(function (r) { return h("option", { value: "own:" + r.base, selected: cur === "own:" + r.base, text: r.base }); })) : null
        ])
      ]);
    }) : [h("div", { class: "meta", text: t("clEmpty") })]));

    var ex = S.files[0] ? S.files[0].file.name : "en_cv.pdf";
    body.push(h("div", { class: "sec" }, [
      h("label", { class: "opt" }, [h("input", { type: "checkbox", "data-k": "optdate", checked: S.dateSuffix, onchange: set(function (e) { S.dateSuffix = e.target.checked; S.check = null; }) }),
        h("span", null, [t("optDate"), h("span", { class: "meta" }, [t("optDateEx", { a: ex, b: "" }), h("code", { text: (S.dateSuffix ? baseOf(stem(ex)) + "_" + today() : stem(ex)) })])])]),
      h("label", { class: "opt" }, [h("input", { type: "checkbox", "data-k": "optdel", checked: S.deleteOld, onchange: set(function (e) { S.deleteOld = e.target.checked; S.check = null; }) }),
        h("span", null, [t("optDel"), h("span", { class: "meta", text: t("optDelSub", { n: delCount(plan.deletes) }) })])])
    ]));
    return { body: body, foot: footChoose(plan, h("span", { class: "hint", text: t("hint", { u: plan.uploads.length, p: plan.packages.length }) })) };
  }
  function footChoose(plan, hint) {
    var foot = [];
    if (plan.errors.length) foot.push(h("div", { class: "note err", style: "flex-basis:100%" }, plan.errors.map(function (e) { return h("div", { text: e }); })));
    foot.push(hint, h("button", { type: "button", class: "btn primary", "data-k": "toreview", disabled: !!plan.errors.length, text: t("reviewBtn"), onclick: function () { S.screen = "review"; S.confirm = false; render(); } }));
    return foot;
  }

  function reviewScreen() {
    var plan = computePlan(), body = [];
    if (plan.errors.length) { S.screen = "choose"; return chooseScreen(); }
    body.push(h("div", { class: "sum", text: t("sumUpdate", { u: plan.uploads.length, p: plan.packages.length, d: delCount(plan.deletes) }) }));
    plan.renamed.forEach(function (r) { body.push(h("div", { class: "note warn" }, t("renamed", { a: r.from, b: r.to }))); });

    var newByType = {}; newByType[CV] = []; newByType[TR] = []; newByType[CL] = [];
    plan.uploads.forEach(function (u) { newByType[u.type].push(u.name); });
    [["cvs", CV], ["transcripts", TR], ["covers", CL]].forEach(function (pair) {
      var key = pair[0], c = CATS.find(function (x) { return x.key === key; }), added = newByType[pair[1]] || [], gone = plan.deletes[key];
      if (!added.length && !gone.length) return;
      var rows = added.map(function (n) { return h("div", { class: "row" }, [h("span", { class: "grow mono", text: n }), tag("new", t("tagNew"))]); })
        .concat(gone.map(function (n) { return h("div", { class: "row gone" }, [h("span", { class: "grow mono", text: n }), tag("del", t("tagRemoved"))]); }));
      var others = existing[key].length - gone.length;
      if (others > 0) rows.push(h("div", { class: "row meta", text: t("others", { n: others }) }));
      body.push(sec(t(c.t), t("after", { n: existing[key].length - gone.length + added.length }), [h("div", { class: "group" }, rows)]));
    });
    if (plan.packages.length || plan.deletes.packages.length) {
      var cards = plan.packages.map(function (p) {
        return h("div", { class: "pkg" }, [h("div", { class: "row", style: "padding:0" }, [h("b", { class: "grow mono", text: p.name }), tag("new", t("tagNew"))]),
          h("dl", null, [h("dt", { text: t("fCV") }), h("dd", { text: p.cv }), h("dt", { text: t("fTR") }), h("dd", { text: p.transcript || t("none") }),
            h("dt", { text: t("fCL") }), h("dd", { text: p.coverLetter || t("none") })])]);
      });
      if (plan.deletes.packages.length) cards.push(h("div", { class: "group" }, plan.deletes.packages.map(function (n) { return h("div", { class: "row gone" }, [h("span", { class: "grow mono", text: n }), tag("del", t("tagRemoved"))]); })));
      body.push(sec(t("catPKG"), t("after", { n: existing.packages.length - plan.deletes.packages.length + plan.packages.length }), cards));
    }

    var chk = S.check;
    var chkKids = [h("div", { class: "meta", text: t("checkHint") }),
      h("button", { type: "button", class: "btn", "data-k": "check", disabled: S.busy, text: chk && chk.running ? t("checking") : t("checkBtn"), onclick: doCheck })];
    if (chk) {
      chk.steps.forEach(function (s) {
        chkKids.push(h("div", { class: "task" }, [h("span", { class: "ic " + (s.ok ? "ok" : "fail"), text: s.ok ? "✓" : "!" }),
          h("span", null, [t(s.key)].concat(s.issues.map(function (i) { return h("small", { text: i }); }))), h("span")]));
      });
      if (!chk.running) chkKids.push(h("div", { class: "note " + (chk.ok ? "good" : "err"), text: t(chk.ok ? "chkOk" : "chkFail") }));
    }
    body.push(h("div", { class: "sec", "data-k": "checksec" }, chkKids));

    if (S.confirm) {
      body.push(h("div", { class: "confirm" }, [h("b", { text: t("confirmQ") }),
        h("span", null, [t("sumUpdate", { u: plan.uploads.length, p: plan.packages.length, d: delCount(plan.deletes) }), delCount(plan.deletes) ? " " + t("confirmDel") : ""]),
        h("div", { style: "display:flex;gap:8px" }, [
          h("button", { type: "button", class: "btn", text: t("notYet"), onclick: function () { S.confirm = false; render(); } }),
          h("button", { type: "button", class: "btn primary", "data-k": "yes", text: t("yesApply"), onclick: function () { startRun(plan); } })])]));
    }
    var foot = [h("button", { type: "button", class: "btn", disabled: S.busy, text: t("back"), onclick: function () { S.screen = "choose"; render(); } }),
      h("button", { type: "button", class: "btn primary", "data-k": "apply", disabled: S.busy || S.confirm, text: t("applyBtn", { n: changeCount(plan) }), onclick: function () { S.confirm = true; render(); var y = root.querySelector("[data-k=yes]"); if (y) { y.scrollIntoView({ block: "nearest" }); y.focus(); } } })];
    return { body: body, foot: foot };
  }
  function doCheck() {
    if (S.busy) return;
    var plan = computePlan(), res = { running: true, steps: [], ok: true };
    S.busy = true; S.check = res;
    render();
    checkPlan(plan, res).then(function () {
      res.running = false; S.busy = false; render();
      var el = root.querySelector('[data-k="checksec"]');
      if (el) el.scrollIntoView({ block: "end" });
    });
  }

  function progress() {
    if (!run) return 0;
    var p = run.plan, total = p.uploads.length + p.packages.length + delCount(p.deletes) + 1;
    var done = doneCount(run.done.uploads) + doneCount(run.done.packages) + doneCount(run.done.deletes) + (run.tasks.verify === "ok" ? 1 : 0);
    return Math.round(100 * done / total);
  }
  function taskRow(state, title, sub, count) {
    var ic = { ok: ["ok", "✓"], fail: ["fail", "!"], run: ["run", ""], wait: ["wait", ""] }[state];
    return h("div", { class: "task" }, [h("span", { class: "ic " + ic[0], text: ic[1] }), h("span", null, [title, sub ? h("small", { text: sub }) : null]), h("span", { class: "ct", text: count || "" })]);
  }
  function tasksList() {
    var p = run.plan, d = run.done, rows = [];
    if (p.uploads.length) rows.push(taskRow(run.tasks.upload, t("taskUpload"), p.uploads.map(function (u) { return u.name; }).join(", "), doneCount(d.uploads) + " / " + p.uploads.length));
    if (p.packages.length) rows.push(taskRow(run.tasks.pkg, t("taskPkg"), p.packages.filter(function (x) { return !d.packages[x.name]; }).map(function (x) { return x.name; }).join(", "), doneCount(d.packages) + " / " + p.packages.length));
    var dc = delCount(p.deletes);
    if (dc) rows.push(taskRow(run.tasks.del, t("taskDel"), run.error && run.tasks.del === "wait" ? t("skipped") : null, doneCount(d.deletes) + " / " + dc));
    rows.push(taskRow(run.tasks.verify, t("taskVerify")));
    return h("div", null, rows);
  }
  function startRun(plan) {
    rememberChoices();
    run = newRun(plan);
    logLines = [];
    S.screen = "run"; S.busy = true; S.confirm = false;
    render();
    execute().then(function () { S.busy = false; S.screen = "result"; render(); });
  }
  function retry() {
    S.screen = "run"; S.busy = true;
    ["upload", "pkg", "del", "verify"].forEach(function (k) { if (run.tasks[k] !== "ok") run.tasks[k] = "wait"; });
    render();
    execute().then(function () { S.busy = false; S.screen = "result"; render(); });
  }
  function runScreen() {
    var pct = progress();
    return {
      body: [h("div", { class: "prog", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) }, [h("i", { style: "width:" + pct + "%" })]),
        tasksList(), h("div", { class: "sum", text: t("keepOpen") })],
      foot: [h("span", { class: "hint", text: t("working") })]
    };
  }
  function resultScreen() {
    var body = [], foot = [], d = run.done;
    if (run.error) {
      var stepName = { upload: "taskUpload", pkg: "taskPkg", del: "taskDel", verify: "taskVerify" }[run.error.stage];
      body.push(h("div", { class: "result bad" }, [h("b", { text: t("stoppedTitle", { step: t(stepName) }) }), run.error.message,
        !doneCount(d.deletes) ? h("div", { text: t("nothingRemoved") }) : null]));
    } else {
      body.push(h("div", { class: "result good" }, [h("b", { text: t("doneTitle") }),
        t("doneSum", { u: doneCount(d.uploads), p: doneCount(d.packages), d: doneCount(d.deletes) - run.inUse.length - run.still.length })]));
    }
    body.push(tasksList());
    if (run.finished) {
      body.push(h("div", { class: "counts" }, [["cvs", "cntCV"], ["transcripts", "cntTR"], ["covers", "cntCL"], ["packages", "cntPKG"]].map(function (c) {
        return h("div", null, [h("b", { text: String(existing[c[0]].length) }), t(c[1])]);
      })));
    }
    if (run.inUse.length) body.push(sec(t("keptBySite"), null, [h("div", { class: "group" }, run.inUse.map(keyName).map(function (n) {
      return h("div", { class: "row" }, [h("span", { class: "grow" }, [h("span", { class: "mono", text: n }), h("span", { class: "meta", text: t("keptWhy") })])]);
    }))]));
    if (run.still.length) body.push(h("div", { class: "note warn", text: t("stillThere", { names: run.still.map(keyName).join(", ") }) }));

    var copyBtn = h("button", { type: "button", class: "btn", text: t("copy"), onclick: function () {
      var text = "myFuture bulk v" + VERSION + "\n" + logLines.join("\n");
      Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(text)).then(function () { copyBtn.textContent = t("copied"); }, function () { copyBtn.textContent = "✕"; });
    } });
    foot.push(copyBtn);
    if (run.error) foot.push(h("button", { type: "button", class: "btn primary", "data-k": "retry", text: t("retry"), onclick: retry }));
    else {
      foot.push(h("a", { class: "btn", href: DOCS_URL, text: t("openDocs") }));
      foot.push(h("button", { type: "button", class: "btn primary", "data-k": "again", text: t("startOver"), onclick: function () {
        run = null; S.files = []; S.covers = {}; S.rejected = []; S.check = null; S.trChoice = null; S.screen = "choose"; render();
      } }));
    }
    return { body: body, foot: foot };
  }

  function render() {
    var focusKey = root.activeElement && root.activeElement.getAttribute && root.activeElement.getAttribute("data-k");
    var scroll = wrap.querySelector(".pb") ? wrap.querySelector(".pb").scrollTop : 0;
    wrap.innerHTML = "";
    wrap.classList.toggle("min", S.minimised);
    wrap.appendChild(header());
    if (S.update) wrap.appendChild(h("div", { class: "upd" }, [t("update", { v: S.update }), h("a", { href: REPO + "#readme", target: "_blank", rel: "noopener", text: t("getIt") })]));
    var view;
    if (S.screen === "loading") view = { body: [h("div", { text: t("loading") })] };
    else if (S.screen === "error") view = { body: [h("div", { class: "note err", text: t("loadFail") }), h("a", { class: "btn", href: DOCS_URL, text: t("goDocs") })] };
    else {
      wrap.appendChild(stepsBar());
      view = S.screen === "choose" ? chooseScreen() : S.screen === "review" ? reviewScreen() : S.screen === "run" ? runScreen() : resultScreen();
    }
    var pb = h("div", { class: "pb" }, view.body);
    wrap.appendChild(pb);
    if (view.foot) wrap.appendChild(h("div", { class: "pf" }, view.foot));
    pb.scrollTop = scroll;
    if (focusKey) { var el = root.querySelector('[data-k="' + focusKey.replace(/"/g, '\\"') + '"]'); if (el) el.focus(); }
  }

  // ---- drag and minimise ----
  function place(x, y) {
    var r = wrap.getBoundingClientRect();
    x = Math.max(0, Math.min(x, window.innerWidth - Math.min(r.width, 120)));
    y = Math.max(0, Math.min(y, window.innerHeight - 44));
    wrap.style.left = x + "px"; wrap.style.top = y + "px"; wrap.style.right = "auto"; wrap.style.bottom = "auto";
  }
  function startDrag(e) {
    if (e.button !== 0 || e.target.closest("button")) return;
    var r = wrap.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    function move(ev) { place(ev.clientX - dx, ev.clientY - dy); }
    function up() {
      bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up);
      prefs.pos = { x: parseInt(wrap.style.left, 10), y: parseInt(wrap.style.top, 10) }; savePrefs();
    }
    bar.addEventListener("pointermove", move); bar.addEventListener("pointerup", up);
  }

  function newerThan(a, b) {
    var x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
    for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  }
  function checkForUpdate() {
    try {
      fetch(LATEST_URL, { cache: "no-store", credentials: "omit" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (v) {
        v = (v || "").trim();
        if (/^\d+\.\d+\.\d+$/.test(v) && newerThan(v, VERSION)) { S.update = v; render(); }
      }, function () { /* offline or blocked by the site: no notice */ });
    } catch (e) { /* fetch unavailable */ }
  }

  window.__mfPanel = { show: function () { host.style.display = ""; S.minimised = false; render(); } };
  render();
  if (prefs.pos) place(prefs.pos.x, prefs.pos.y);
  checkForUpdate();
  loadExisting().then(function () { S.screen = "choose"; render(); }, function () { S.screen = "error"; render(); });
})();
