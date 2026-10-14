# myFuture bulk: notes for Claude

Tools for McGill myFuture (Orbis): documents (upload / packages / cleanup) and job search + applications.

## Layout
- `scripts/`: in-page operations shared by everything: `upload.js`, `packages.js`, `delete.js`, `frame-ops.js`
  (hidden-iframe driver: listDocs, upload, packages, openBoard). `myfuture_playwright.py` = documents CLI.
- `ui/`: bookmarklets. `panel.src.js` (documents panel) + Smart search (bundled from `extension/`). Rebuild with
  `python ui/build.py` after changing any script, the panel, the extension's search files, or `VERSION`.
- `extension/`: myFuture Toolkit (MV3, load unpacked). `lib/jobs.js` (pure parser/scorer/filter, node-testable),
  `orbis-board.js` (postings list + details engine), `smart-search.js` (panel, EN/FR), `popup*.js`, `bridge.js` (service
  worker: runs plans/scans in a hidden iframe via `scripts/frame-ops.js`). Fixed ID via manifest `key`.
- `native/`: native messaging host `mst_bridge.py` (serves `~/.mst/plan.json`, PDFs it references, `scripts/*.js`;
  writes `~/.mst/out/`) + `install_host.ps1` (user runs it).
- `native/letter_settings.py` / `letter_style.py`: shared cover-letter settings + sources digest, and the AI-tell checks.
- `apply/`: letter + plan scripts and the generic `myfuture-apply` skill (`apply/SKILL.md`). `SKILL.md` at the root is
  the documents skill.

## Rules
- Never submit applications or send email; the student clicks Apply/Send. Never evade bot detection (myFuture's sign-in
  blocks Playwright; use the extension bridge instead).
- Keep personal data (profiles, letter text, paths) out of this public repo.
- Orbis quirks: some responses are Windows-1252 without a charset (decode bytes); French labels can contain U+FFFD;
  after a documents list renders, no GET of documents.htm before delete POSTs. See `reference.md`, `docs/job-applications.md`.

## Checks
- `node tests/jobs.test.js`
- `node --check` on changed JS; `python ui/build.py` must succeed (it syntax-checks every bundle).
