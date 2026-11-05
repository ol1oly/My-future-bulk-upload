# Job applications: design notes

## Where the time goes

Per internship application on myFuture, roughly:

| Step | Manual cost | Who should do it |
| --- | --- | --- |
| Read the posting, decide fit, pick CV variant (language × track) | 2–5 min, × every posting skimmed | Extension (deterministic) |
| Find deadline, application method, required documents, addressee | 1–2 min, error-prone | Extension (deterministic) |
| **Tailor the cover letter**: open old letter, strip previous company, rewrite intro + closing, export PDF | **15–45 min** | Template + script, AI only for the opening sentence + fit paragraph |
| Upload letter, build application package (CV + transcript + letter) | 3–5 min | Existing in-page scripts |
| Click Apply, choose package, submit | 1 min | **Always the student** |
| Track what was sent where, deadlines | ongoing | Extension tracker / CSV |

The cover letter is the bottleneck. Inspecting real letters showed ~85% of each letter is identical across
applications; only the salutation, role, company, one "why this role" sentence, and one "environment that values …"
phrase change. Turning templates into `[SLOT]` placeholders removes most of the cost before any AI is involved; the
remaining judgment is about two sentences per posting.

## AI or not

- **No AI** (this extension): field parsing by label text, language detection, CV-track keyword scoring, document
  checklist, deadline, salutation, tracker, scan file. These are deterministic, testable (`tests/jobs.test.js`),
  private (no network), and need no API keys in the extension.
- **AI** (optional, outside the extension, e.g. a Claude Code skill): reads a posting (from a scan or the shortlist), writes the 2–3 slot
  sentences from a fixed list of the student's true facts, fills the Word template, exports a 1-page PDF, and
  prepares the package or an email draft. Guard rails in the fill script: no leftover `[SLOT]`, no previous
  company names, 1 page max.
- **Never automated**: clicking Apply / Submit / Send. A wrong package sent to an employer cannot be undone, and
  myFuture packages used in an application cannot be deleted.

## Parsed posting (entries of `~/.mst/out/scan-<board>.json`)

Written by the popup's **Scan**; `apply/rank_scan.js` re-ranks it offline. Each entry:
`{ id, postingId, url, row{appStatus, shortlisted, deadlineText, …}, fit{score, hits, excluded}, fields{title, organization, location, workArrangement, salary, term, startDate,
description, qualifications, deadline, applicationMethod, documentsRequired, contact, contactEmail, website, …},
extra[{label,value}], language, bilingual, deadline (ISO), documents{cv,coverLetter,transcript,other},
apply{method: myfuture|website|email|unknown, emails[], urls[]}, track{track, scores, matched[]}, cv,
coverLetter{needed, template, slots{SALUTATION, ROLE, COMPANY, HOOK, FIT}} }`

## Orbis markup notes

- Current Outcome UI: `.tag__key-value-list` blocks with a `span.label` ("Label:") and the value as following content.
- Legacy UI: `#postingDiv` panels; rows `td strong` = label, second `td` = value.
- Labels are configurable per school, so matching is by alias table (`FIELD_ALIASES` in `extension/lib/jobs.js`); unknown
  labels are kept in `extra`. Add aliases there when a live McGill posting shows a new label.

## Smart search (live myFuture, verified 2026-10-13)

- Results page is the classic Orbis UI: `#postingsTable`, 100 rows per page, pagination through the page's
  `loadPostingTable(...)` POST to `controllerPath`. Rows carry `tr.isFav` (shortlisted), `tr.isNew`, `tr.isAboutToExpire`,
  an App Status cell ("Application Submitted"), and `orbisAppSr.buildForm({... postingId ...}, '', '_BLANK')` for
  View and Apply (different action tokens).
- Detail = POST of the View parameters; labels are table rows. English and French label sets differ
  ("Title du poste", "Méthode pour postuler"); some responses are Windows-1252 without a charset, so `extension/orbis-board.js`
  decodes bytes itself.
- Application Method values: "Access through McGill University" / "Candidatures gérées par le McGill University"
  (→ Apply in myFuture) or "Access through an external website <url>".
- Shortlist and Not interested are POSTs of `{action, postingId}` (tokens read from the page's own
  `saveFavoritePosting` / `toggleBlacklistPosting`). Tokens never leave the page.
- Snapshot (Internship/Co-op, 338 postings): 183 apply through McGill, 154 external; 64 hidden by default exclude words.
- `listAll` stops at 50 pages (5,000 postings at 100 per page) as a guard against an endless loop. Boards are far below
  that, so the code assumes the list is complete: a posting missing from it counts as closed and is dropped
  (`dropClosed` in `extension/bridge.js`, on sync and on Apply / Open / shortlist). If a board ever nears 5,000
  postings, raise the cap or stop dropping postings when the cap is hit.

## Local bridge (2026-10-13)

myFuture's sign-in provider blocks automated browsers (Playwright), so scripted work runs inside the student's own
browser: `native/mst_bridge.py` (Chrome native messaging host, allowed for this extension's fixed ID only) serves
`~/.mst/plan.json`, the PDFs it references and `scripts/*.js`, and stores results in `~/.mst/out/`.
`extension/bridge.js` (service worker) runs: resolve newest CV/transcript names (same overview → "all" → list method
as the bookmarklet panel's `listDocs`), upload letters (`upload.js` with `__MF.files`), create packages
(`packages.js`), and optionally open one application form and save its structure (`probe-<id>.json`).

## Tailored CVs (optional, 2026-11)

A student who keeps their CV as LaTeX entries can plug in a **CV builder**: `~/.claude/myfuture/config.json`
`jobs.cvBuilder` = a command as a list (`["python", "C:/path/cv_builder.py"]`). The native host runs it as
`<cmd> build --posting <file> [--projects a,b] [--lang en|fr] [--no-reuse]` and `<cmd> catalog`; it prints one JSON line
(`{ok, kind: "variant"|"tailored", pdf, docName: "<lang>_tailored_<id>", variant, projects, why, warnings}`). Without
it, nothing changes (the CV option is hidden).

- **AI or not.** Choosing *which* projects fit a posting is semantic (a "real-time systems" role and a live-audio
  project share no keyword), so Claude ranks them, but only from a closed list of the student's own entries, and the
  bullets are copied verbatim: no CV text is written by AI. The skills line is deterministic (a curated list with
  evidence per skill), since AI adds risk there and nothing else.
- **myFuture.** Popup "Package…" and the letters page offer *Tailored CV*. If an existing CV already holds the best
  projects, the builder says so (`kind: "variant"`) and that CV is used. A tailored CV is uploaded as a CV (type 14)
  named `<lang>_tailored_<id>` (one document per distinct CV, shared by packages that use the same one), together with
  the letter in one upload; the package is `<lang>_tailored_<Org>_<date>`. Tailored names are never picked as a
  default CV (`isTailoredCv`) and, having no date, are never cleanup candidates.
- **Plans.** `make_plan.py` picks accept `cvPdf` + `cvName`; Check plan reports those packages as "CV pending upload"
  (packages.js needs the exact CV name, which only exists after the upload).
- **Letters.** Letter checks now separate numbers taken from the posting (fine about the job, wrong about the student)
  from numbers found nowhere, and flag links or contact details that aren't in the student's facts.
