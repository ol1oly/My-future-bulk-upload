---
name: myfuture-apply
description: Find matching internships/jobs on McGill myFuture and prepare applications for any student : read a board scan (or the student's myFuture shortlist), pick postings, write the job-specific opening sentence and fit paragraph from the student's own facts, fill their Word template into a 1-page PDF, and hand uploads + application packages to the myFuture Toolkit extension's local bridge. Never submits. Use when someone asks to find postings, apply to internships, or prepare cover letters/packages on myFuture.
argument-hint: "[posting ids | 'shortlist' | 'scan' [keywords]]"
allowed-tools: Read Write Edit Glob Bash(python *) Bash(node *) Bash(powershell *) Bash(date *) AskUserQuestion
---

# myFuture applications (any student)

Repo: `${CLAUDE_SKILL_DIR}/..` (`R`) : extension in `R/extension`, scripts in `R/apply`, document scripts in `R/scripts`.
Shared config: `~/.claude/myfuture/config.json` (same file as the documents skill): `root`, `documents` (CV bases type 14,
transcript base type 15), and `jobs` = `{applicationsFolder, letterTemplates, profile}` relative to `root` (profile may be absolute).

## Hard rules
- Never submit an application, never send email. The student clicks **Apply** in myFuture and picks the named package.
- Letter facts come only from the profile file + the posting. If there is no profile, build one first (below) and get the
  student to confirm it. No invented numbers, roles or technologies.
- `R/apply/fill_letter.ps1` must return `ok:true` (no leftover `[SLOT]`, no forbidden names, 1 page). Otherwise fix and re-run.
- Work goes through scripts and the extension's local bridge, not step-by-step browser automation.

## One-time setup (ask, then save)
1. Extension: `chrome://extensions` → Developer mode → Load unpacked → `R/extension`.
2. Local bridge: `powershell -NoProfile -ExecutionPolicy Bypass -File R/native/install_host.ps1` (the student runs it; it adds a
   per-user registry entry for Chrome/Edge native messaging; `-Uninstall` removes it).
3. Profile (`jobs.profile`): facts the letters may use : read the student's CV PDFs, personal site and GitHub, list projects
   with stack, role, team size and numbers, plus a "do not claim" list. Show it; save after they confirm.
4. Templates: write letter bodies per `<lang>_<track>` (e.g. `en_fullstack`, `fr_general`) into a JSON file
   (`["[SALUTATION]", "[HOOK] ... [ROLE] ... [COMPANY].", "[FIT]", ..., "Name", "contact"]`), citing profile facts
   only, with a concrete closing line (no stock closer); build with `R/apply/build_templates.ps1 -Json <file> -Base <one of their letters.docx> -OutDir <root>/<jobs.letterTemplates>`.

## Run
1. Postings: ids in `$ARGUMENTS`; or `shortlist` / `scan` → ask the student to click **Scan Internship/Co-op** (or
   General Jobs) in the extension popup and read `~/.mst/out/scan-<board>.json` (`postings[]` with `fields`, `apply.method`,
   `documents`, `deadline`, `fit.score`, `cv`, `row.shortlisted`, `row.appStatus`). Shortlist = `row.shortlisted && !row.appStatus`;
   scan = `!why`, sorted by `fit.score`, skip passed deadlines.
2. Show a table (id, score, title, org, apply via McGill/external, deadline, letter?, CV) and confirm the picks.
3. Letters (only where `documents.coverLetter`): template `<lang>_<track>` from the posting's language and the CV track;
   write `HOOK` (first sentence, ≤ 30 words: one real, specific thing the company makes or did, from the posting or its
   own site, and what in the role connects to it) and `FIT` (two sentences, ≤ 60 words: the posting's two most stressed
   requirements, each with the profile fact that proves it; never stretch a fact); both end with a period. Settings in
   `~/.claude/myfuture/letter-settings.json` apply (style, instructions, `forbidCompanies`); `SALUTATION` from `coverLetter.slots.SALUTATION`; then
   `powershell -NoProfile -ExecutionPolicy Bypass -File R/apply/fill_letter.ps1 -Template <tpl.docx> -OutStem <root>/<applicationsFolder>/<date>_<org>_<label>/<Name>_<org> -SlotsJson <slots.json> -Forbid "<letter-settings forbidCompanies, comma-separated>"`. Read each PDF once.
4. Plan: write picks (`postingId, board, organization, label, title, cv base, transcript bool, letterPdf`) and run
   `python R/apply/make_plan.py <picks.json> [--probe <one posting id>]`.
5. Tell the student: open myFuture → extension → **Check plan** (saves nothing) → **Run plan** (resolves newest CV/transcript,
   uploads letters, builds one package per posting). Read `~/.mst/out/run-*.json`; report packages created and errors.
6. External postings (`apply.method` website/email): give the link or address and the exact files; for email,
   `R/apply/outlook_draft.ps1` saves a draft (never sends).
7. Final list: posting → package name. The student applies on myFuture (Smart search **Apply** button) and picks it.
