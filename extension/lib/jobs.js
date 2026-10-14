(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.JobTools = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Canonical field -> label aliases (lowercase, no trailing colon). English + French Orbis labels.
  const FIELD_ALIASES = {
    postingId: ["job id", "posting id", "id", "numéro de l'offre", "numéro du poste", "id de l'offre"],
    title: ["title du poste", "job title", "position title", "title", "titre du poste", "titre de l'emploi", "titre"],
    organization: ["organization", "organisation", "company", "employer", "entreprise", "employeur", "organization name"],
    division: ["division", "department", "département", "service"],
    positionType: ["position type", "job type", "type de poste", "level", "type of position", "type de poste", "type d'emploi"],
    location: ["job city", "ville de l'emploi", "job location", "location", "work location", "job - city", "city", "lieu de travail", "lieu", "emplacement", "ville"],
    region: ["job province/state", "province/état de l'emploi", "job - province / state", "job - country", "province / state", "province/state", "province", "region", "country", "pays"],
    workArrangement: ["job format", "format du travail", "employment location arrangement", "work arrangement", "work mode", "employment mode", "remote work", "mode de travail", "télétravail", "modalité de travail"],
    openings: ["number of job openings", "job openings", "number of positions", "number of openings", "nombre de postes"],
    salary: ["starting salary or salary range", "salaire de départ ou échelle salariale", "compensation and benefits information", "compensation and benefits", "salary", "compensation", "salary range", "wage", "pay", "rémunération", "salaire"],
    hours: ["hours per week", "work hours", "heures par semaine"],
    term: ["internship starting term", "trimestre de début de stage", "work term", "term", "session", "duration", "work term duration", "length of internship", "durée", "durée du stage"],
    startDate: ["internship start date", "date de début du stage", "start date", "anticipated start date", "date de début", "date d'entrée en fonction"],
    endDate: ["internship end date", "date de fin du stage", "end date", "date de fin"],
    description: ["job summary", "job responsibilities", "job description", "description", "position description", "responsibilities", "job duties", "description du poste", "responsabilités", "tâches"],
    qualifications: ["exigences liées au poste", "savoir-être", "required skills", "special job requirements", "job requirements", "qualifications", "requirements", "required skills", "skills", "exigences", "compétences requises", "qualifications requises", "profil recherché"],
    targetedPrograms: ["targeted areas of study", "domaines d'étude ciblés", "targeted programs", "targeted degrees and disciplines", "targeted academic programs", "level of study", "degree level", "programmes ciblés", "niveau d'études"],
    citizenship: ["citizenship requirement", "citizenship", "work authorization", "eligibility", "citoyenneté", "admissibilité"],
    deadline: ["date limite pour postuler", "application deadline", "deadline", "posting expiry date", "expiration date", "date limite", "date limite de candidature", "date d'échéance"],
    applicationMethod: ["méthode pour postuler", "application delivery", "application method", "how to apply", "application procedure", "apply via", "mode de candidature", "méthode de candidature", "comment postuler"],
    documentsRequired: ["documents de candidature requis", "application documents required", "application material required", "application materials", "required documents", "documents required", "documents requis", "documents de candidature requis"],
    contact: ["cover letter addressed to", "address cover letter to", "contact", "contact name", "contact person", "hiring manager", "lettre adressée à", "personne-ressource", "nom du contact"],
    contactEmail: ["if by email, send to", "contact email", "email", "e-mail", "courriel", "adresse courriel"],
    applicationInstructions: ["additional application information", "application instructions", "special application instructions", "instructions de candidature"],
    website: ["if by website, go to", "website", "company website", "application url", "apply url", "site web", "site internet"],
    jobFunction: ["job function", "fonction du poste"],
    jobLanguage: ["job language", "langue du travail"],
    studentLevel: ["student level", "niveau étudiant"],
    targetYear: ["target student year", "année de l'étudiant ciblé"],
    postingStatus: ["job posting status"],
    postedDate: ["posting date", "date posted", "posted", "date de publication"]
  };

  const LONG_FIELDS = new Set(["description", "qualifications", "applicationInstructions"]);

  const TRACK_KEYWORDS = {
    games: ["unity", "unreal", "gameplay", "game", "games", "jeu", "jeux", "jeu vidéo", "jeux vidéo", "video game", "studio", "shader", "rendering", "graphics", "c++", "c#", "level design", "game engine", "moteur de jeu", "ubisoft", "eidos", "beenox", "behaviour interactive", "warner bros", "electronic arts", "audiokinetic", "wwise", "godot", "multiplayer", "xr", "vr", "ar/vr"],
    fullstack: ["react", "typescript", "javascript", "node", "node.js", "front-end", "frontend", "back-end", "backend", "full-stack", "full stack", "fullstack", "web", "angular", "vue", "next.js", "html", "css", "rest", "api", "graphql", "django", "fastapi", "flask", "express", "cloud", "aws", "azure", "nosql", "mongodb", "postgresql", "ui", "ux"],
    normal: ["java", "python", "sql", "data", "testing", "qa", "automation", "embedded", "linux", "c", "algorithms", "machine learning", "devops", "ci/cd", "analyst", "analyste", "software engineer", "développeur", "developer"]
  };

  const FRENCH_WORDS = ["le", "la", "les", "des", "du", "et", "est", "pour", "dans", "avec", "une", "nous", "vous", "sur", "au", "aux", "poste", "stage", "stagiaire", "équipe", "être", "connaissance", "expérience"];
  const ENGLISH_WORDS = ["the", "and", "of", "to", "in", "for", "with", "you", "we", "our", "will", "is", "are", "on", "as", "team", "experience", "internship", "skills", "work"];

  const MONTHS = {
    jan: 1, january: 1, janvier: 1, feb: 2, february: 2, février: 2, fevrier: 2, mar: 3, march: 3, mars: 3,
    apr: 4, april: 4, avril: 4, may: 5, mai: 5, jun: 6, june: 6, juin: 6, jul: 7, july: 7, juillet: 7,
    aug: 8, august: 8, août: 8, aout: 8, sep: 9, sept: 9, september: 9, septembre: 9, oct: 10, october: 10, octobre: 10,
    nov: 11, november: 11, novembre: 11, dec: 12, december: 12, décembre: 12, decembre: 12
  };

  function clean(value) {
    return String(value ?? "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function normalizeLabel(label) {
    return clean(label).toLowerCase().replace(/[\s*:\uff1a\u00a0\u200b\ufffd]+$/, "").replace(/\s*\(.*?\)\s*$/, "").replace(/[\u2019]/g, "'").trim();
  }

  // Accent-insensitive; myFuture sometimes serves French labels with a broken character (U+FFFD) in place of "é".
  function fold(value) {
    return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  const ALIAS_INDEX = new Map();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) if (!ALIAS_INDEX.has(fold(alias))) ALIAS_INDEX.set(fold(alias), field);
  }

  function fieldForLabel(label) {
    const key = fold(normalizeLabel(label));
    if (!key || key.length > 80) return null;
    if (ALIAS_INDEX.has(key)) return ALIAS_INDEX.get(key);
    if (key.includes("�")) {
      const parts = key.split("�").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const pattern = new RegExp("^" + parts.join(".") + "$");
      for (const [alias, field] of ALIAS_INDEX) if (pattern.test(alias)) return field;
    }
    // Loose match: longest alias that the label starts with ("Job Location - City" -> location).
    let best = null;
    for (const [alias, field] of ALIAS_INDEX) {
      if (alias.length >= 5 && key.startsWith(alias) && (!best || alias.length > best.alias.length)) best = { alias, field };
    }
    return best ? best.field : null;
  }

  function wordsIn(text) {
    return clean(text).toLowerCase().match(/[a-zà-ÿœ']+/g) || [];
  }

  function detectLanguage(text) {
    const words = wordsIn(text);
    if (!words.length) return "en";
    const fr = new Set(FRENCH_WORDS), en = new Set(ENGLISH_WORDS);
    let frCount = 0, enCount = 0;
    for (const word of words) { if (fr.has(word)) frCount += 1; if (en.has(word)) enCount += 1; }
    return frCount > enCount * 1.2 ? "fr" : "en";
  }

  function countKeyword(haystack, keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, "g");
    return (haystack.match(pattern) || []).length;
  }

  function recommendTrack(job) {
    const haystack = ` ${[job.title, job.title, job.description, job.qualifications, job.organization].map(clean).join(" ").toLowerCase()} `;
    const scores = {}, hits = {};
    for (const [track, keywords] of Object.entries(TRACK_KEYWORDS)) {
      scores[track] = 0; hits[track] = [];
      for (const keyword of keywords) {
        const count = countKeyword(haystack, keyword);
        if (count) { scores[track] += Math.min(count, 3); hits[track].push(keyword); }
      }
    }
    // "normal" is the general-purpose fallback: it only wins when the specialised tracks are weak.
    let track = "normal";
    if (scores.games >= 3 && scores.games >= scores.fullstack) track = "games";
    else if (scores.fullstack >= 4 && scores.fullstack >= scores.normal) track = "fullstack";
    return { track, scores, matched: hits[track].slice(0, 8) };
  }

  function parseDocuments(text) {
    const value = clean(text).toLowerCase();
    const docs = {
      cv: /r[ée]sum[ée]|\bcv\b|curriculum/.test(value),
      coverLetter: /cover letter|lettre de (?:pr[ée]sentation|motivation)|letter of (?:intent|interest|motivation)/.test(value),
      transcript: /transcript|relev[ée] de notes|grade report/.test(value),
      other: /portfolio|writing sample|references|letters? of reference|demo reel|other documents?|autres? documents?|work history/.test(value)
    };
    return docs;
  }

  function parseMethod(job) {
    const all = clean([job.applicationMethod, job.website, job.contactEmail, job.applicationInstructions, job.description, job.qualifications].join("\n"));
    const emails = [...new Set((all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((email) => email.replace(/\.$/, "")))];
    const urls = [...new Set((all.match(/https?:\/\/[^\s)<>"']+/gi) || []).map((url) => url.replace(/[.,;]+$/, "")))];
    // Decide from the words only: URLs and addresses often contain "email", "apply", etc.
    const words = (value) => clean(value).toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/\S+@\S+/g, " ");
    const text = words([job.applicationMethod, job.applicationInstructions].join(" "));
    let method = "unknown";
    if (/external website|employer(?:'s)? website|company website|site (?:web|internet) (?:externe|de l'employeur)|website/.test(text)) method = "website";
    else if (/through mcgill|mcgill university|universit[ée] mcgill|g[ée]r[ée]es par|myfuture|orbis|through this (?:site|system|portal)|via (?:the )?portal|apply (?:online )?through/.test(text)) method = "myfuture";
    else if (/e-?mail|courriel/.test(text) && emails.length) method = "email";
    const loose = words(all);
    if (method === "unknown" && emails.length && /send|forward|envoy|soumet/.test(loose)) method = "email";
    if (method === "unknown" && urls.length && /apply|postuler/.test(loose)) method = "website";
    return { method, emails, urls };
  }

  function pad(number) { return String(number).padStart(2, "0"); }

  function parseDate(value) {
    const text = clean(value).toLowerCase().replace(/(\d)(st|nd|rd|th|er)\b/g, "$1");
    let match = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (match) return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
    match = text.match(/([a-zéû]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (match && MONTHS[match[1]]) return `${match[3]}-${pad(MONTHS[match[1]])}-${pad(match[2])}`;
    match = text.match(/(\d{1,2})\s+([a-zéû]+)\.?,?\s+(\d{4})/);
    if (match && MONTHS[match[2]]) return `${match[3]}-${pad(MONTHS[match[2]])}-${pad(match[1])}`;
    match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) return `${match[3]}-${pad(match[1])}-${pad(match[2])}`; // Orbis US-style MM/DD/YYYY
    return "";
  }

  function daysUntil(isoDate, now = new Date()) {
    if (!isoDate) return null;
    const [y, m, d] = isoDate.split("-").map(Number);
    const target = Date.UTC(y, m - 1, d);
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  }

  function hashId(text) {
    let hash = 5381;
    for (const char of String(text)) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
    return hash.toString(36);
  }

  function slug(value) {
    return clean(value).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "job";
  }

  function salutationFor(contact, organization, language) {
    const name = clean(contact).split("\n")[0].replace(/,.*$/, "").trim();
    const usable = name && !/^(n\/?a|none|hiring (?:manager|team)|recruit(?:er|ment)|human resources|hr|rh)$/i.test(name) && name.length < 60;
    if (language === "fr") return usable ? `Bonjour ${name},` : "Madame, Monsieur,";
    return usable ? `Dear ${name},` : `Dear ${clean(organization) ? `${clean(organization)} ` : ""}Hiring Team,`;
  }

  // pairs: [{label, value}] scraped from a posting page. fallback: {title, url, text}.
  function parsePosting(pairs, fallback = {}) {
    const job = {};
    const extra = [];
    for (const pair of pairs || []) {
      const value = clean(pair.value);
      if (!value) continue;
      const field = fieldForLabel(pair.label);
      if (!field) { extra.push({ label: clean(pair.label).replace(/:\s*$/, ""), value }); continue; }
      if (job[field] && LONG_FIELDS.has(field)) { if (!job[field].includes(value)) job[field] = `${job[field]}\n\n${value}`; }
      else if (!job[field] || (value.length > job[field].length && !LONG_FIELDS.has(field) && field !== "title")) job[field] = value;
    }
    if (!job.title && fallback.title) job.title = clean(fallback.title);
    if (!job.description && fallback.text) job.description = clean(fallback.text).slice(0, 20000);

    const fullText = [job.title, job.description, job.qualifications, job.applicationInstructions, job.documentsRequired, job.applicationMethod].join("\n");
    const language = detectLanguage([job.description, job.qualifications].join(" ") || fullText);
    const docs = parseDocuments([job.documentsRequired, job.applicationInstructions].join(" ") || fullText);
    if (!docs.cv && !docs.coverLetter && !docs.transcript) Object.assign(docs, parseDocuments(fullText));
    docs.cv = true; // every application needs one
    const apply = parseMethod(job);
    const deadline = parseDate(job.deadline);
    const track = recommendTrack(job);
    const bilingual = /bilingu|french (?:is )?(?:required|an asset)|français|francais/i.test(fullText);

    return {
      id: job.postingId ? `p${clean(job.postingId).replace(/\D+/g, "") || slug(job.postingId)}` : `h${hashId(`${job.title}|${job.organization}|${fallback.url || ""}`)}`,
      url: fallback.url || "",
      fields: job,
      extra,
      language,
      bilingual,
      deadline,
      documents: docs,
      apply,
      track,
      cv: `${language}_${track.track}`,
      coverLetter: {
        needed: docs.coverLetter,
        template: `${language}_${track.track}`,
        slots: {
          SALUTATION: salutationFor(job.contact, job.organization, language),
          ROLE: clean(job.title),
          COMPANY: clean(job.organization),
          INTEREST_ABOUT_ROLE: "",
          QUALITY: ""
        }
      }
    };
  }

  function isLikelyPosting(parsed) {
    const f = parsed.fields;
    const signals = ["title", "organization", "deadline", "description", "applicationMethod", "documentsRequired", "location"].filter((key) => f[key]).length;
    return Boolean(f.title) && signals >= 3;
  }

  function jobFileStem(parsed) {
    return `${slug(parsed.fields.organization)}_${slug(parsed.fields.title)}`;
  }

  function mailtoFor(parsed, applicantName) {
    const to = parsed.apply.emails[0];
    if (!to) return "";
    const fr = parsed.language === "fr";
    const title = parsed.fields.title || (fr ? "stage" : "internship");
    const subject = fr ? `Candidature – ${title} – ${applicantName}` : `Application – ${title} – ${applicantName}`;
    const attachments = [fr ? "CV" : "resume", parsed.documents.coverLetter && (fr ? "lettre de présentation" : "cover letter"), parsed.documents.transcript && (fr ? "relevé de notes non officiel" : "unofficial transcript")].filter(Boolean);
    const list = attachments.length > 1 ? `${attachments.slice(0, -1).join(", ")} ${fr ? "et" : "and"} ${attachments.at(-1)}` : attachments[0];
    const body = fr
      ? `${parsed.coverLetter.slots.SALUTATION}\n\nVeuillez trouver ci-joint mon ${list} pour le poste de ${title}.\n\nCordialement,\n${applicantName}`
      : `${parsed.coverLetter.slots.SALUTATION}\n\nPlease find attached my ${list} for the ${title} position.\n\nBest regards,\n${applicantName}`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const DEFAULT_PREFS = {
    keywords: ["software", "developer", "développeur", "programmer", "programmeur", "full-stack", "full stack", "frontend", "front-end", "backend", "back-end", "web", "react", "typescript", "javascript", "python", "java", "c#", "c++", "unity", "unreal", "game", "jeu", "jeux", "api", "cloud", "devops", "qa automation", "data engineer", "machine learning", "ai", "informatique", "computer science"],
    exclude: ["senior technical student", "phd", "ph.d", "full time/permanent", "accounting", "accountant", "comptab", "payroll", "marketing", "geolog", "géolog", "civil engineering", "chemical", "metallurg", "métallurg", "bakery"],
    text: "",
    language: "any",          // any | en | fr | en-ok (English or bilingual) | fr-ok
    method: "any",            // any | myfuture | external
    noCoverLetter: false,
    deadlineDays: 0,          // 0 = no limit
    hidePassed: true,
    hideApplied: true,
    onlyShortlisted: false,
    hideShortlisted: false,
    year: "",                 // e.g. "Third Year" — posting must target it (postings without the field pass)
    minScore: 0,
    sort: "score"             // score | deadline | newest
  };

  function scorePosting(parsed, prefs = DEFAULT_PREFS) {
    const f = parsed.fields;
    const title = ` ${clean(f.title).toLowerCase()} `;
    const body = ` ${[f.jobFunction, f.description, f.qualifications, f.targetedPrograms].map(clean).join(" ").toLowerCase()} `;
    let points = 0;
    const hits = [];
    for (const keyword of prefs.keywords || []) {
      const k = keyword.toLowerCase();
      const inTitle = countKeyword(title, k), inBody = Math.min(countKeyword(body, k), 3);
      if (inTitle || inBody) { points += inTitle * 4 + inBody; hits.push(keyword); }
    }
    const excluded = (prefs.exclude || []).filter((word) => countKeyword(title, word.toLowerCase()) || (word.length > 5 && countKeyword(body, word.toLowerCase()) >= 2));
    const score = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-points / 14))) - excluded.length * 40));
    return { score, hits: hits.slice(0, 8), excluded };
  }

  // myFuture's App Status column: "Application Submitted" once sent; other values (e.g. a started application) are not.
  function isSubmitted(appStatus) {
    return /submitted|soumise|envoy/i.test(String(appStatus || ""));
  }

  // meta: { appStatus, shortlisted } from the postings list. Returns "" when the posting passes, else the reason.
  function filterPosting(parsed, meta = {}, prefs = DEFAULT_PREFS, now = new Date()) {
    const f = parsed.fields;
    const fit = parsed.fit || scorePosting(parsed, prefs);
    if (prefs.hideApplied && isSubmitted(meta.appStatus)) return "applied";
    if (prefs.onlyShortlisted && !meta.shortlisted) return "not shortlisted";
    if (prefs.hideShortlisted && meta.shortlisted) return "shortlisted";
    const days = daysUntil(parsed.deadline, now);
    if (prefs.hidePassed && days !== null && days < 0) return "deadline passed";
    if (prefs.deadlineDays && (days === null || days > prefs.deadlineDays)) return "deadline later";
    if (prefs.method === "myfuture" && parsed.apply.method !== "myfuture") return "not through McGill";
    if (prefs.method === "external" && parsed.apply.method === "myfuture") return "through McGill";
    if (prefs.noCoverLetter && parsed.documents.coverLetter) return "needs cover letter";
    const jobLang = clean(f.jobLanguage).toLowerCase();
    const hasFr = /fran[cç]ais|french/.test(jobLang), hasEn = /anglais|english/.test(jobLang);
    if (prefs.language === "en" && (hasFr || (!jobLang && parsed.language !== "en"))) return "language";
    if (prefs.language === "fr" && (hasEn || (!jobLang && parsed.language !== "fr"))) return "language";
    if (prefs.language === "en-ok" && jobLang && !hasEn) return "language";
    if (prefs.language === "fr-ok" && jobLang && !hasFr) return "language";
    if (prefs.year && f.targetYear && !clean(f.targetYear).toLowerCase().includes(prefs.year.toLowerCase())) return "year";
    if (prefs.text) {
      const all = Object.values(f).join(" ").toLowerCase();
      const missing = prefs.text.toLowerCase().split(/\s+/).filter(Boolean).find((word) => word.startsWith("-") ? all.includes(word.slice(1)) : !all.includes(word));
      if (missing) return `text: ${missing}`;
    }
    if (fit.excluded.length) return `excluded: ${fit.excluded[0]}`;
    if (fit.score < (prefs.minScore || 0)) return "low score";
    return "";
  }

  const TRACKER_COLUMNS =["id", "status", "organization", "title", "deadline", "method", "cv", "coverLetter", "transcript", "url", "savedAt", "appliedAt", "notes"];

  function trackerRow(parsed, status = "saved", now = new Date()) {
    return {
      id: parsed.id, status,
      organization: parsed.fields.organization || "", title: parsed.fields.title || "",
      deadline: parsed.deadline || "", method: parsed.apply.method, cv: parsed.cv,
      coverLetter: parsed.documents.coverLetter ? "yes" : "no", transcript: parsed.documents.transcript ? "yes" : "no",
      url: parsed.url, savedAt: now.toISOString().slice(0, 10), appliedAt: "", notes: ""
    };
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function trackerCsv(rows) {
    return `${[TRACKER_COLUMNS.join(","), ...rows.map((row) => TRACKER_COLUMNS.map((key) => csvCell(row[key])).join(","))].join("\r\n")}\r\n`;
  }

  return {
    FIELD_ALIASES, fieldForLabel, normalizeLabel, detectLanguage, recommendTrack, parseDocuments, parseMethod, parseDate, daysUntil,
    parsePosting, isLikelyPosting, jobFileStem, mailtoFor, DEFAULT_PREFS, scorePosting, filterPosting, isSubmitted, trackerRow, trackerCsv, TRACKER_COLUMNS, slug
  };
});
