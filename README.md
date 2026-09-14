# myFuture bulk

Refresh your job-search documents on McGill **myFuture** (Orbis) in one pass: upload CVs, a transcript and
cover letters, rebuild one application package per CV, and delete the older dated copies you made before.

Everything runs in your own signed-in session — nothing is sent anywhere else. Documents tied to a submitted
application are never touched (the site won't let anyone delete them).

## Two ways to run it

| You have | Use | Install |
|----------|-----|---------|
| Just a browser | the bookmarklet: open `ui/install.html` and drag the button to your bookmarks bar | none |
| Claude Code | the `myfuture-documents` skill (`SKILL.md`) | copy this folder into `~/.claude/skills/` |

Both run the same three scripts in `scripts/`. `scripts/myfuture_playwright.py` is a command-line runner for
automation (`pip install playwright` then `python -m playwright install chromium`).

The panel loads your current documents first, so you can build packages from CVs or a transcript already on
myFuture: upload only a transcript to re-pair it with your current CVs, or only new CVs to pair them with your
current transcript. Each cover letter you add gets a menu to choose which package it belongs to.

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

Preview (dry run) first — it changes nothing. Real runs ask before deleting. Only PDFs upload; other formats
are ignored.
