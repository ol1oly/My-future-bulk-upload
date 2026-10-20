// Rank the postings of a popup scan (~/.mst/out/scan-<board>.json) with the extension's own scorer and filter.
// Usage: node rank_scan.js <scan.json> [--prefs '{"onlyShortlisted":true}'] [--top N] [--ids 123,456 --out picked.json]
// Prints one line per open posting (id | score | title | org | method | deadline | cv | CL/-); closed deadlines are dropped.
// With --ids and --out, writes those postings (full parsed objects) to a JSON array for the letter steps.
const fs = require("node:fs");
const path = require("node:path");
const JobTools = require(path.join(__dirname, "..", "extension", "lib", "jobs.js"));

const [input, ...rest] = process.argv.slice(2);
if (!input) { console.error("usage: node rank_scan.js <scan.json> [--prefs json] [--top N] [--ids a,b --out file]"); process.exit(2); }
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, "")] = rest[i + 1];

const scan = JSON.parse(fs.readFileSync(input, "utf8"));
const prefs = { ...JobTools.DEFAULT_PREFS, ...JSON.parse(opt.prefs || "{}") };
const today = new Date().toISOString().slice(0, 10);
const ranked = scan.postings.map((p) => ({
  ...p,
  fit: JobTools.scorePosting(p, prefs),
  why: JobTools.filterPosting(p, { appStatus: p.row.appStatus, shortlisted: p.row.shortlisted }, prefs),
})).filter((p) => !p.why && !(p.deadline && p.deadline < today)).sort((a, b) => b.fit.score - a.fit.score);

console.log(`scanned ${scan.scannedAt} · ${ranked.length} open matches`);
for (const p of ranked.slice(0, Number(opt.top) || 20)) {
  console.log([p.postingId, p.fit.score, p.fields.title, p.fields.organization, p.apply.method, p.deadline || "?", p.cv,
    p.documents.coverLetter ? "CL" : "-"].join(" | "));
}
if (opt.ids && opt.out) {
  const ids = new Set(opt.ids.split(","));
  const picked = scan.postings.filter((p) => ids.has(p.postingId)).map(({ row, why, ...p }) => p);
  fs.writeFileSync(opt.out, `${JSON.stringify(picked, null, 2)}\n`);
  console.log(`wrote ${picked.length} postings to ${opt.out}`);
}
