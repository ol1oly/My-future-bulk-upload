---
name: myfuture-documents
description: Upload and refresh documents (CVs, transcripts, cover letters) and application packages on McGill myFuture (Orbis) for any student through the Claude in Chrome browser. First run asks setup questions (files, naming, what to delete, packages, cover letters) and saves them; later runs are ~8 tool calls using fast in-page scripts. Use when someone wants to upload, replace or clean up CVs, transcripts or application packages on myFuture.
argument-hint: "[changes for this run, e.g. include cover letter eaton.pdf for my games CV]"
disable-model-invocation: true
model: sonnet
allowed-tools: mcp__claude-in-chrome Read Write Edit Glob Bash(date *) Bash(ls *)
---

# myFuture documents & application packages (any student)

- In-page scripts: `${CLAUDE_SKILL_DIR}/scripts/upload.js`, `delete.js`, `packages.js` (read their header comments only if you need the config shape).
- Knowledge, gotchas and slow fallbacks: `${CLAUDE_SKILL_DIR}/reference.md` — read ONLY when a step fails.
- Standalone alternative without Claude in Chrome: `${CLAUDE_SKILL_DIR}/scripts/myfuture_playwright.py` (same config file).
- User config: `~/.claude/myfuture/config.json`; last run: `~/.claude/myfuture/state.json`.
- Site: `https://myfuture.mcgill.ca/myAccount/opportunities/documents.htm` (the user must already be logged in in Chrome).

## Hard rules
- Delete only what the chosen policy selects, and on the first run show the exact rows (`dryRun:true`) and get a yes. Never delete cover letters unless the user explicitly asks.
- Packages/documents "used in an application" cannot be deleted by anyone — report them, don't retry.
- javascript_tool output that contains tokens is replaced by `[BLOCKED: Cookie/query string data]`: never return form values, onclick attributes or URLs with queries.
- After a documents LIST renders, never GET `documents.htm` before the delete POSTs (the server silently ignores them). The scripts already respect this; don't add fetches in between.
- No screenshots unless a step fails. One `browser_batch` per run step. Login page → stop and ask the user to log in.

## Two other jobs this skill handles
- **Swap transcript on packages** (user asks to update/swap the transcript on existing packages): upload the new transcript (or reuse an existing document name), then for each package in state.json `deleteNames`-delete it and recreate it with the new transcript, same cv + coverLetter. Skip and report packages tied to a submitted application (the site refuses to delete them). Playwright: `--swap-transcript`.
- **People without Claude Code** use `ui/install.html`: a bookmarklet panel that runs on the myFuture documents page and does the whole flow (read existing documents, upload, build packages, delete old copies) with no install. Rebuild it after editing a script with `python ui/build.py`. `scripts/myfuture_playwright.py` remains for command-line/automation use.

## 1. Setup (AskUserQuestion, max 4 questions per call)
If config.json exists: show a 3-line summary and ask "Use the saved setup?" (Use it / Change something). `$ARGUMENTS` overrides for this run only.
Otherwise ask:
1. **Folder** holding the documents (Glob it, list PDFs; myFuture accepts PDF only, other formats are ignored).
2. **Files + type** for each: CV/Resume (14), Unofficial Transcript (15), Other (16). Transcript: "newest PDF in <folder>" (recommended) or a fixed file.
3. **Naming**: `<base>_<YYYY-MM-DD>` (recommended — makes cleanup safe) / exact file name / custom.
4. **Old copies of those documents**: delete older dated copies with the same base (recommended) / delete every other document of those types / keep all.
5. **Packages**: one per CV with the transcript, named like the CV document (recommended) / custom combinations / none.
6. **Old packages**: delete older dated packages with the same base (recommended) / delete all other packages (in-use ones are refused) / keep all.
7. **Cover letters**: only when I ask (recommended) / never / ask every run. **Carry-over** when a previous package had a cover letter: ask me (recommended) / infer from the letter / drop.
8. **Save as default?**
Permission (ask first): `file_upload` only accepts files inside working directories. Read `~/.claude/settings.json` and merge the documents folder and the absolute `${CLAUDE_SKILL_DIR}` into `permissions.additionalDirectories` (Edit, keep other keys; applies live). `/add-dir "path with spaces"` fails.

config.json:
```json
{ "root": "C:\\Users\\me\\Documents\\Jobs",
  "documents": [ {"file": "cv\\en_cv.pdf", "base": "en_cv", "type": "14"},
                 {"newestIn": "transcripts", "ext": ".pdf", "base": "Transcript", "type": "15"} ],
  "dateSuffix": true,
  "deleteOld": "same-base-dated",
  "packages": "one-per-cv",
  "deleteOldPackages": "same-base-dated",
  "coverLetters": { "folder": "coverLetters", "mode": "on-request", "carryOver": "ask" } }
```
`deleteOld` / `deleteOldPackages`: `same-base-dated` | `all` | `none`. `packages`: `one-per-cv` | `none` | `[{"base","cv","transcript","coverLetter"}]` (bases).

## 2. Cover letters (only when mode/arguments call for it; untested live)
1. Find the file under `<root>/<coverLetters.folder>` (recursive) matching what the user named; newest if several.
2. PDF only, no conversion: if the letter isn't a PDF, ask the user for the PDF.
3. Target package: the one the user named. If not named, Read the letter and infer (language, role/track vs each CV's base); if unsure, AskUserQuestion.
4. Upload it with the other files as type `13`, name `<stem>_<DATE>`, and set it as that package's `coverLetter`.
5. Carry-over: Read state.json. For each base whose previous package had a `coverLetter` and got none this run: follow `carryOver` (ask with AskUserQuestion; or infer — generic letter for that role → keep, company-specific → drop). A kept letter is referenced by its existing document name (no upload).

## 3. Run
Derive: `DATE` = `date +%F`; each document's file (for `newestIn`: `ls -t "<root>/<dir>/"*<ext> | head -1`); names = `<base>_<DATE>` (or base); `BASES_RE` = `^(<bases regex-escaped, joined with |>)_\d{4}-\d{2}-\d{2}$`.
Delete policy → DELETE config: `same-base-dated` → `{keep:[today's names], deleteMatch:BASES_RE, requireKept:true}`; `all` → `{keep:[today's names], requireKept:true}`; `none` → skip that list.
Inside browser_batch JSON, double every backslash of the snippets.

0. One message, in parallel: Bash `date +%F`; Bash for `newestIn` files; Read config.json/state.json; ToolSearch `select:mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__find,mcp__claude-in-chrome__file_upload,mcp__claude-in-chrome__computer` (tools missing → Skill `claude-in-chrome` once). Resolve cover letters (§2).
1. `navigate` (no tabId) to the site → tabId.
2. browser_batch: JS `OPEN_UPLOAD`, wait 3, JS `INJECT`, find `bulk upload input (file input, aria-label 'bulk upload input')`.
3. browser_batch: file_upload into that ref — all document files + the three scripts (absolute paths; ≤10 MB per call); JS `UPLOAD` with `window.__MF={docs:[{file:'<file name>',name:'<doc name>',type:'14'},...]}`. Expect `ok:true`. First run with deletes: also run the DELETE snippets below with `dryRun:true` and confirm with the user before step 4.
4. browser_batch (stops at the first thrown error):
   - navigate site; JS `ALL`; wait 4; JS `LIST` (CV/Resume); wait 4; JS `DELETE` type `CV/Resume`
   - navigate; JS `ALL`; wait 4; JS `LIST` (Unofficial Transcript); wait 4; JS `DELETE` type `Unofficial Transcript`
   - navigate; JS `OPEN_PACKAGE`; wait 4; JS `PACKAGES` with `window.__MFP={packages:[{name,cv,transcript,coverLetter}]}` (skip if packages none)
   - navigate; JS `ALL`; wait 4; JS `LIST` (Application Packages); wait 4; JS `DELETE` type `Package`
   - navigate; JS `ALL`; wait 4; JS `COUNTS`
5. Write state.json `{"date":"<DATE>","packages":[{"name","cv","transcript","coverLetter"}]}`. Report: uploaded names, packages created, deleted rows, rows refused as in-use, final counts. Leave the tab open.

## Snippets (javascript_tool `text`)
- OPEN_UPLOAD: `const b=[...document.querySelectorAll('button,a')].find(x=>x.innerText.trim()==='Upload Document'&&x.offsetParent); if(!b) throw new Error('no Upload Document button (logged out?)'); b.click(); 'ok'`
- INJECT: `if(!document.querySelector('input[name=docName]')) throw new Error('upload form not loaded'); const i=document.createElement('input'); i.type='file'; i.multiple=true; i.id='__bulk'; i.setAttribute('aria-label','bulk upload input'); i.style.cssText='position:fixed;left:8px;bottom:8px;z-index:2147483647'; document.body.appendChild(i); 'ok'`
- UPLOAD: `for(const f of document.getElementById('__bulk').files) if(f.name.endsWith('.js')) sessionStorage['__mf_'+f.name]=await f.text(); window.__MF={docs:[...]}; await eval(sessionStorage['__mf_upload.js'])`
- ALL: `const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.text.trim()==='all')); if(!s) throw new Error('not on the documents overview (logged out?)'); if(s.value!=='0'){s.value='0'; s.dispatchEvent(new Event('change',{bubbles:true}));} 'all'`
- LIST: `const L=/^\s*CV\/Resume\s*\d+/; const r=[...document.querySelectorAll('tr,li,div')].filter(e=>L.test(e.innerText||'')&&e.querySelector('a,button')).sort((a,b)=>a.innerText.length-b.innerText.length)[0]; if(!r) throw new Error('overview row not found'); r.querySelector('a,button').click(); 'ok'` — other lists: `L=/^\s*Unofficial Transcript\s*\d+/`, `/^\s*Application Packages\s*\d+/`, `/^\s*Cover Letter\s*\d+/`.
- OPEN_PACKAGE: `const b=[...document.querySelectorAll('button,a')].find(x=>x.innerText.trim()==='Create Application Package'&&x.offsetParent); if(!b) throw new Error('no Create Application Package button'); b.click(); 'ok'`
- DELETE: `window.__MFD={type:'CV/Resume',keep:[...],deleteMatch:'...',requireKept:true}; await eval(sessionStorage['__mf_delete.js'])`
- PACKAGES: `window.__MFP={packages:[...]}; await eval(sessionStorage['__mf_packages.js'])`
- COUNTS: `const b=document.body.innerText, n=re=>(b.match(re)||[])[1]; JSON.stringify({coverLetters:n(/Cover Letter\s*(\d+)/), cvs:n(/CV\/Resume\s*(\d+)/), transcripts:n(/Unofficial Transcript\s*(\d+)/), packages:n(/Application Packages\s*(\d+)/)})`
