const assert = require("node:assert/strict");
const jobs = require("../extension/lib/jobs.js");

// Orbis-style English posting (label/value rows as scraped by jobs-extractor.js).
const english = jobs.parsePosting([
  { label: "Job ID:", value: "123456" },
  { label: "Job Title:", value: "Full-Stack Developer Intern" },
  { label: "Organization:", value: "Acme Robotics" },
  { label: "Job Location:", value: "Montréal, QC" },
  { label: "Work Arrangement:", value: "Hybrid" },
  { label: "Salary:", value: "$25/hour" },
  { label: "Job Description:", value: "You will build React and TypeScript frontends backed by Node.js REST APIs on AWS. Join our web team." },
  { label: "Job Requirements:", value: "Experience with JavaScript, HTML, CSS and GraphQL. Git." },
  { label: "Application Deadline:", value: "October 31, 2026 11:59 PM" },
  { label: "Application Method:", value: "Through myFuture" },
  { label: "Application Documents Required:", value: "Résumé, Cover Letter, Unofficial Transcript" },
  { label: "Cover Letter Addressed To:", value: "Jane Smith, Talent Acquisition" },
  { label: "Favourite Colour:", value: "Blue" }
], { url: "https://myfuture.mcgill.ca/myAccount/co-op/postings.htm" });

assert.equal(english.id, "p123456");
assert.equal(english.fields.title, "Full-Stack Developer Intern");
assert.equal(english.fields.organization, "Acme Robotics");
assert.equal(english.deadline, "2026-10-31");
assert.equal(english.language, "en");
assert.equal(english.track.track, "fullstack");
assert.equal(english.cv, "en_fullstack");
assert.deepEqual(english.documents, { cv: true, coverLetter: true, transcript: true, other: false });
assert.equal(english.apply.method, "myfuture");
assert.equal(english.coverLetter.slots.SALUTATION, "Dear Jane Smith,");
assert.equal(english.coverLetter.slots.COMPANY, "Acme Robotics");
assert.deepEqual(english.extra, [{ label: "Favourite Colour", value: "Blue" }]);
assert.ok(jobs.isLikelyPosting(english));

// French games posting, website application, no named contact.
const french = jobs.parsePosting([
  { label: "Titre du poste", value: "Stagiaire programmeur gameplay" },
  { label: "Entreprise", value: "Studio Lune" },
  { label: "Description du poste", value: "Vous travaillerez avec les designers sur les systèmes de jeu dans Unity et Unreal. Le stagiaire développera des mécaniques de jeu en C++ et C# avec l'équipe." },
  { label: "Date limite", value: "15 novembre 2026" },
  { label: "Mode de candidature", value: "Sur le site web de l'employeur : https://studiolune.example/carrieres" },
  { label: "Documents requis", value: "CV et lettre de motivation" }
], { url: "https://myfuture.mcgill.ca/x" });

assert.equal(french.language, "fr");
assert.equal(french.track.track, "games");
assert.equal(french.cv, "fr_games");
assert.equal(french.deadline, "2026-11-15");
assert.equal(french.apply.method, "website");
assert.deepEqual(french.apply.urls, ["https://studiolune.example/carrieres"]);
assert.equal(french.documents.coverLetter, true);
assert.equal(french.documents.transcript, false);
assert.equal(french.coverLetter.slots.SALUTATION, "Madame, Monsieur,");
assert.match(french.id, /^h[0-9a-z]+$/);

// Email-only posting where everything is in free text (e.g. an attached PDF pasted in).
const email = jobs.parsePosting([], {
  title: "Software Engineering Internship",
  url: "",
  text: "Sensequake is looking for a software engineering intern. Excellent skills in Python and JavaScript. Experience in web development. Please forward your resume and unofficial transcript to info@sensequake.com."
});
assert.equal(email.apply.method, "email");
assert.deepEqual(email.apply.emails, ["info@sensequake.com"]);
assert.equal(email.documents.transcript, true);
assert.equal(email.documents.coverLetter, false);
assert.equal(email.cv, "en_normal");
assert.equal(jobs.isLikelyPosting(email), false);

const mailto = jobs.mailtoFor(email, "Sam Student");
assert.match(mailto, /^mailto:info%40sensequake\.com\?subject=Application%20%E2%80%93%20Software%20Engineering%20Internship/);
assert.match(decodeURIComponent(mailto), /my resume and unofficial transcript for the Software Engineering Internship position/);

// Label matching, dates, deadlines.
assert.equal(jobs.fieldForLabel("Job Location - City:"), "location");
assert.equal(jobs.fieldForLabel("Application Deadline *"), "deadline");
assert.equal(jobs.fieldForLabel("Something unrelated"), null);
assert.equal(jobs.parseDate("2026-01-05"), "2026-01-05");
assert.equal(jobs.parseDate("Jan 5th, 2026"), "2026-01-05");
assert.equal(jobs.parseDate("01/05/2026"), "2026-01-05");
assert.equal(jobs.parseDate("1er décembre 2026"), "2026-12-01");
assert.equal(jobs.parseDate("soon"), "");
assert.equal(jobs.daysUntil("2026-10-20", new Date(2026, 9, 13)), 7);

// Tracker CSV.
const row = jobs.trackerRow(english, "saved", new Date("2026-10-13T12:00:00Z"));
assert.equal(row.savedAt, "2026-10-13");
const csv = jobs.trackerCsv([{ ...row, notes: 'said "hi", twice' }]);
assert.ok(csv.startsWith(jobs.TRACKER_COLUMNS.join(",")));
assert.match(csv, /"said ""hi"", twice"/);
assert.equal(jobs.jobFileStem(french), "Studio_Lune_Stagiaire_programmeur_gameplay");

console.log("Job posting parser tests passed.");

assert.equal(jobs.parseDocuments("Résumé, Cover Letter. Assets: Github / Gitlab").other, false);
assert.equal(jobs.parseDocuments("University of Waterloo Co-op Work History,Résumé,Grade Report").transcript, true);
assert.equal(jobs.parseDocuments("Résumé, Portfolio").other, true);
console.log("Document requirement tests passed.");

// Live McGill labels (EN + FR) and filtering.
const mcgill = jobs.parsePosting([
  { label: "Job Title:", value: "Intern Software Engineer (12 - 16 Months)" },
  { label: "Job Function:", value: "Engineering" },
  { label: "Job Description:", value: "Build web features in Java and TypeScript with React." },
  { label: "Job Language:", value: "English" },
  { label: "Target Student Year:", value: "Second Year Third Year" },
  { label: "Application Deadline:", value: "October 22, 2026 11:59 PM" },
  { label: "Application Documents Required:", value: "CV/Resume, Unofficial Transcript" },
  { label: "Application Method:", value: "Access through McGill University" },
  { label: "Organization:", value: "Veeva Systems" }
]);
assert.equal(mcgill.apply.method, "myfuture");
assert.equal(mcgill.fields.jobFunction, "Engineering");
assert.equal(mcgill.fields.jobLanguage, "English");
const fit = jobs.scorePosting(mcgill);
assert.ok(fit.score >= 40, `score ${fit.score}`);
assert.ok(fit.hits.includes("software"));
const now = new Date(2026, 9, 13);
assert.equal(jobs.filterPosting(mcgill, {}, jobs.DEFAULT_PREFS, now), "");
assert.equal(jobs.filterPosting(mcgill, { appStatus: "Applied" }, jobs.DEFAULT_PREFS, now), "applied");
assert.equal(jobs.filterPosting(mcgill, {}, { ...jobs.DEFAULT_PREFS, language: "fr" }, now), "language");
assert.equal(jobs.filterPosting(mcgill, {}, { ...jobs.DEFAULT_PREFS, year: "First Year" }, now), "year");
assert.equal(jobs.filterPosting(mcgill, {}, { ...jobs.DEFAULT_PREFS, method: "external" }, now), "through McGill");
assert.equal(jobs.filterPosting(mcgill, {}, { ...jobs.DEFAULT_PREFS, text: "react -cobol" }, now), "");
assert.equal(jobs.filterPosting(mcgill, {}, { ...jobs.DEFAULT_PREFS, text: "kotlin" }, now), "text: kotlin");
assert.equal(jobs.filterPosting(mcgill, {}, jobs.DEFAULT_PREFS, new Date(2026, 10, 1)), "deadline passed");

const payroll = jobs.parsePosting([{ label: "Job Title", value: "Payroll and Benefits Co-op" }, { label: "Organization", value: "FGF" }]);
assert.match(jobs.filterPosting(payroll, {}, jobs.DEFAULT_PREFS, now), /^excluded: payroll/);

const fr = jobs.parsePosting([
  { label: "Title du poste:", value: "Stagiaire développeur web" },
  { label: "Fonction du poste:", value: "Ingénierie" },
  { label: "Langue du travail:", value: "Français Anglais" },
  { label: "Documents de candidature requis:", value: "Lettre de motivation, CV/résumé, Relevé de notes non officiel" },
  { label: "Méthode pour postuler :", value: "Accès par l'Université McGill" },
  { label: "Date limite pour postuler:", value: "November 1, 2026 11:59 PM" }
]);
assert.equal(fr.fields.title, "Stagiaire développeur web");
assert.equal(fr.fields.jobLanguage, "Français Anglais");
assert.deepEqual(fr.documents, { cv: true, coverLetter: true, transcript: true, other: false });
assert.equal(fr.apply.method, "myfuture");
assert.equal(fr.deadline, "2026-11-01");
assert.equal(jobs.filterPosting(fr, {}, { ...jobs.DEFAULT_PREFS, language: "en-ok" }, now), "");
console.log("McGill label and filter tests passed.");
assert.equal(jobs.fieldForLabel("M�thode pour postuler�:"), "applicationMethod");
assert.equal(jobs.fieldForLabel("Methode pour postuler"), "applicationMethod");
assert.equal(jobs.parseMethod({ applicationMethod: "Candidatures gérées par le McGill University" }).method, "myfuture");
assert.equal(jobs.parseMethod({ applicationMethod: "Access through an external website https://x.example/apply-by-email" }).method, "website");
console.log("Broken-label tests passed.");
