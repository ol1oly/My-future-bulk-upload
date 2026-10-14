# myFuture bulk

<<<<<<< HEAD
Refresh your job-search documents on McGill **myFuture** (Orbis) in one pass: upload CVs, a transcript and
cover letters, rebuild one application package per CV, and delete the older dated copies you made before.

Everything runs in your own signed-in session — nothing is sent anywhere else. Documents tied to a submitted
application are never touched (the site won't let anyone delete them).

## Two ways to run it

| You have | Use | Install |
|----------|-----|---------|
| Just a browser | the bookmarklet: open `ui/install.html` and drag the button to your bookmarks bar | none |
| Claude Code | the `myfuture-documents` skill (`SKILL.md`) | copy this folder into `~/.claude/skills/` |
| Job search / applications | Smart search bookmark, the `extension/`, `apply/SKILL.md` | see *Job search and applications* |

Both run the same three scripts in `scripts/`. `scripts/myfuture_playwright.py` is a command-line runner for
automation (`pip install playwright` then `python -m playwright install chromium`).

The panel loads your current documents first, so you can build packages from CVs or a transcript already on
myFuture: upload only a transcript to re-pair it with your current CVs, or only new CVs to pair them with your
current transcript. Drop all your PDFs in one place; each cover letter can join a CV's package, get its own package,
or just be uploaded. **Review changes** shows what will be added and removed, **Check with myFuture** tests the run
without saving anything, and if a run stops halfway, **Retry remaining steps** picks up where it left off.
**Clean up only** removes older dated copies without uploading. The panel speaks English and French, remembers your
choices, can be dragged or minimised, and tells you when a newer version is out (bump `VERSION`, rebuild, push).

## Job search and applications

Three ways in, same engine:

| You want | Use |
|----------|-----|
| Search every posting with better filters, shortlist, apply | **Smart search bookmark** from `ui/install.html` (no install), or the extension |
| Match score + suggested CV on a single posting, job tracker | **myFuture Toolkit** extension (`extension/`) |
| Scripted cover letters + one package per application | extension **local bridge** + `apply/` scripts, or the Claude Code skill `apply/SKILL.md` |

**Smart search.** On Internship / Co-op or General Jobs → Job Postings → *View all available postings*, click the
*myFuture search* bookmark (or extension → **Smart search all postings**). It reads every posting once (~40 s, cached
for the session), then filters locally: full text in English and French, apply through McGill vs. external, work
language, student year, deadline, no cover letter, applied/shortlisted, and a match score from your keywords. Each row
has **Shortlist** (myFuture's own), **Apply** (opens myFuture's application form; only for postings applied to through
McGill), **Save card** and **Not interested**. English/French toggle in the header.

**Install the extension.** `chrome://extensions` (or `edge://extensions`) → Developer mode → **Load unpacked** →
`extension/`. Its ID is fixed (`jgipagacoahkppcenahkhhjceiigglag`) so the local bridge can trust it.

**Local bridge (optional).** Lets scripts hand work to the extension, which runs it in a hidden frame of your normal,
signed-in myFuture tab (myFuture's sign-in blocks automated browsers):

1. `powershell -NoProfile -ExecutionPolicy Bypass -File native\install_host.ps1` — registers the host for your Windows
   user (Chrome + Edge). `-Uninstall` removes it. Needs Python 3.
2. Put your CV / transcript bases in `~/.claude/myfuture/config.json` (see `config.sample.json`, `jobs` section).
3. Make a plan: `python apply/make_plan.py picks.json` → `~/.mst/plan.json`.
4. On myFuture, open the extension: **Check plan** (tests everything, saves nothing), then **Run plan**: it finds your
   newest CV/transcript copies, uploads cover letters, and builds one package per application. Logs land in
   `~/.mst/out/`. **Scan Internship/Co-op / General Jobs** saves every posting to `~/.mst/out/scan-<board>.json`.
   Nothing is ever submitted.

`apply/`: `fill_letter.ps1` (fill a `[SLOT]` Word template, export a 1-page PDF, refuse leftovers / old company names),
`build_templates.ps1`, `make_plan.py`, `outlook_draft.ps1` (saves a draft, never sends), `card_from_text.js`,
`myfuture_jobs.py` (Playwright CLI; needs an already signed-in profile). Tests: `node tests/jobs.test.js`.
Design notes: `docs/job-applications.md`.

## Setup

Copy `config.sample.json` to `~/.claude/myfuture/config.json` and edit the paths. `type` is the myFuture
document category: `13` cover letter, `14` CV/résumé, `15` unofficial transcript, `16` other. A `newestIn`
entry picks the most recent file in a folder (handy for a transcript you re-download each term).

## Files

- `scripts/upload.js`, `delete.js`, `packages.js` — the operations, run inside a myFuture page.
- `scripts/myfuture_playwright.py` — command-line / GUI runner. `--dry-run` changes nothing; `--swap-transcript`
  rebuilds packages with a new transcript.
- `ui/panel.src.js` + `ui/build.py` — the bookmarklet panel; run `python ui/build.py` to rebuild `install.html`
  after changing a script. `build.py` strips comments so the pasted bookmarklet stays clean.
- `SKILL.md`, `reference.md` — the Claude Code skill and the notes behind it.

## Safety

Check with myFuture (dry run) first — it changes nothing. Real runs ask before applying, and only remove old
copies once every upload and package succeeded. Only names ending in a date are ever removed. Only PDFs upload;
other files are refused with a message.
=======
Refresh your job-search documents on McGill **myFuture**: upload CVs, a transcript and
cover letters, rebuild one application package per CV, and delete the older dated copies.

## Safety
Only PDFs upload
>>>>>>> origin/main
