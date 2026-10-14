// Build a job card from plain posting text (PDF/email postings the extension can't read).
// Usage: node card_from_text.js <posting.txt> <out.json> [--title "..."] [--org "..."] [--url "..."]
// Uses the same parser as the myFuture Toolkit extension (../extension/lib/jobs.js) so cards look identical.
const fs = require("node:fs");
const path = require("node:path");
const LIB = process.env.JOB_TOOLS_LIB || path.join(__dirname, "..", "extension", "lib", "jobs.js");
const JobTools = require(LIB);

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) { console.error("usage: node card_from_text.js <posting.txt> <out.json> [--title t] [--org o] [--url u]"); process.exit(2); }
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, "")] = rest[i + 1];

const text = fs.readFileSync(input, "utf8");
const pairs = [];
if (opt.title) pairs.push({ label: "Job Title", value: opt.title });
if (opt.org) pairs.push({ label: "Organization", value: opt.org });
// Also pick up "Label: value" lines written in the text itself.
for (const line of text.split(/\r?\n/)) {
  const match = line.match(/^\s*([^:]{2,60}):\s*(.+)$/);
  if (match && JobTools.fieldForLabel(match[1])) pairs.push({ label: match[1], value: match[2] });
}
const parsed = JobTools.parsePosting(pairs, { title: opt.title || path.basename(input, path.extname(input)), url: opt.url || "", text });
if (!parsed.fields.description) parsed.fields.description = text.trim();
const card = { schema: 1, savedAt: new Date().toISOString(), ...parsed, applicant: "" };
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(card, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, out: output, title: parsed.fields.title, org: parsed.fields.organization || null, cv: parsed.cv, method: parsed.apply.method, emails: parsed.apply.emails, docs: parsed.documents, deadline: parsed.deadline || null }));
