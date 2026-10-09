# McGill myFuture (Orbis) — what was learned (live, 2026-09-13/14)

Read only when the fast path in SKILL.md fails.

## Pages
- Documents overview: `/myAccount/opportunities/documents.htm`. Rows per type with counts + "View": Cover Letter, CV/Resume,
  Other, Unofficial Transcript, Application Packages; Archives section. Date filter `select` ("last 30 days" = `30` default
  on every page load, "all" = `0`, auto-submits on change). Counts follow the filter.
- "Upload Document" and "Create Application Package" buttons navigate (POST built by `orbisAppSr.buildForm`);
  plain JS `.click()` works for them and for the overview "View" links.
- List pages: columns [checkbox, buttons, Document Name, Type, Date Created, Package, Archived]; `td` index 2 = name, 3 = type.
  Packages appear as documents of type `Package` with buttons Download PDF / Make Default / Delete. The grid renders a
  few seconds after load (poll for `table tbody tr` with a checkbox). Replaying the View POST via fetch returns no rows.
- docType ids: 13 Cover Letter, 14 CV/Resume, 15 Unofficial Transcript, 16 Other. Only PDF is accepted.

## Upload
- Form fields (multipart POST documents.htm): `_csrf, action, accessToPostings, searchType, initialSearchAction, psrId,
  comingFrom, docName, docType, removeFile_docUpload, docUploaded` (+ `defaultDoc` checkbox).
- Attaching a file = XHR POST documents.htm with `{action, uploadDirectory, upload: File}` and headers
  `Accept, X-CSRF-TOKEN, X-Requested-With` → JSON `{success, name, uuid}` → hidden `docUploaded`. `uploadDirectory`/`action`
  are not in the DOM: capture them by patching `XMLHttpRequest.prototype.send` and feeding a file to the site input through
  `DataTransfer` + `change` (works).
- Save = POST of the form with `docUploaded`. Via fetch: saved first try, ~1.1 s each; 7 parallel temp uploads ≈ 2–3 s;
  whole upload.js for 7 files ≈ 9 s. Form tokens stay valid across saves.
- The site renames stored files (spaces → `_`, `X.html.pdf` → `X.pdf`).

## Delete
- Row "Delete" = `orbisApp.confirmDialog(msg, function(){ orbisApp.buildForm({action, docId, acrmUserId, docTypeId,
  numOfDays, archived}).submit(); })` (in-page modal, no native confirm). The built form also carries `_csrf` and `rand`.
- Replaying that form with fetch works ONLY if no other page load (e.g. a GET of documents.htm to read counts) happened
  since the list rendered; otherwise the server returns 200 and does nothing. Delete everything first, verify after.
- Anything used in a submitted application is refused: "Document is used in an application and cannot be deleted"
  (same for native deletes). Olivier's 11 pre-2026-09-13 packages are in that state.
- "Archive Selected" (Actions menu) is refused for everything: "0 documents updated. N documents were not updated because
  they are default documents or are not allowed to be archived."

## Application packages
- "Create Application Package" form: `name` (required) + selects named by docType: `13` Cover Letter, `14` CV/Resume,
  `15` Unofficial Transcript (values = numeric doc ids, option text = doc name), hidden `_csrf, action`, "Upload New"
  buttons, Submit (disabled client-side until valid — server doesn't care).
- fetch POST of `FormData(form)` with `name`, `14`, `15` (and `13`) created 6 packages from one render; response = overview.
- Package contents are not shown in the list; keep your own record (state.json) of which package had which cover letter.

## Browser-tool gotchas (Claude in Chrome)
- `file_upload` only accepts files under working directories (a successful Read is not enough) → `additionalDirectories`.
- `find` refs change on every page load; the injected `#__bulk` input avoids depending on the site's input ref.
- Scripts can be stashed in `sessionStorage` (same tab, survives navigation) and run with `eval` (allowed on this site).
- javascript_tool output with hidden values/onclick/URLs is replaced by `[BLOCKED: Cookie/query string data]`.
- Screenshot coordinate frame alternates between 1536 and 1568 px wide (scale = 1568/innerWidth).

## Slow fallback: clicking (only if fetch saving breaks)
1. Open the form from the overview, `find` "Choose File", `file_upload` one file, set `input[name=docName]` and the type
   `select` (14/15) with JS + change events; wait until the page shows `Current File: <stored name>`.
2. JS `.click()` on the form's "Upload Document" link does NOT save. Use a real `computer.left_click` at its centre
   (CSS ≈ 417,309 at 1536 px width). The first click usually just re-renders the form; 2–4 clicks needed; don't GET
   documents.htm between clicks.
3. After each click wait 5 s: overview text without "Upload a Document" = saved. Then add a transparent full-page
   `div#__cs` (max z-index) so remaining scheduled clicks hit nothing. One document per page load.

## Bookmarklet panel (`ui/`)
- `panel.src.js` is the source; `build.py` strips comments (string/regex-aware, gated by `node --check`), injects the
  three scripts as JSON string literals and the version from `VERSION`, escapes every non-ASCII character as a JS
  unicode escape (the bookmarklet loses raw non-ASCII bytes), and writes `panel.bundle.js` + `install.html` (bundle
  embedded as base64, decoded in-page with TextDecoder). Non-ASCII may appear only inside string literals.
- The panel runs every myFuture page in ONE hidden same-origin iframe, so it never navigates the top page away.
- On open it reads the CV / transcript / cover letter / package lists (`listDocs`, skipped when the overview count is 0).
  CVs are grouped by base name (date suffix stripped); a group's package uses its newest copy unless a new file replaces it.
- Screens: Choose -> Review -> Run -> result. Choose has one drop zone (type guessed from the file name, editable) and a
  "Clean up only" mode (keep the newest dated copy per base name, remove the older dated ones). Each cover letter is
  upload-only, joins one CV's package, or gets its own package (named after the cover letter) with a chosen CV.
- Names already on myFuture get `_2`, `_3`... (`DATE_RE` accepts that suffix). Only dated names are ever deleted, and
  nothing a package in this run uses.
- "Check with myFuture" = dry run: upload.js temp uploads (nothing saved), package-form dropdowns read to confirm each
  referenced name exists exactly once, delete.js `dryRun` per category. No writes.
- Apply runs uploads -> packages -> deletes (packages first) -> re-reads the lists. Progress is kept per item (deletes
  keyed `category:name`, since a CV and its package share a name), so "Retry remaining steps" skips finished work.
  Deletes run only after every upload and package succeeded.
- Choices (mode, toggles, unticked CVs, cover letter pairings by base name, language, panel position) persist in
  myFuture's `localStorage` under `mfBulk.prefs`. The panel fetches `VERSION` from the GitHub repo and shows a notice
  when a newer one exists; the install page does the same for itself.
- Tested end to end against a fake stateful myFuture served through Playwright routes (upload, packages, deletes,
  in-use refusal, retry after a failed package) — not yet against the live site.
- Off myFuture, or if reading fails, the panel shows a link to the documents page instead of acting.

## Playwright runner (`scripts/myfuture_playwright.py`)
- Same config + in-page scripts. Launches Chrome (`--channel chrome`, falls back to bundled Chromium) with its own
  persistent profile (`~/.myfuture-playwright-profile`); the user logs in once in that window (SSO/MFA), later runs reuse it.
  `--headless` only works after that login. Runs scripts with `page.evaluate("(src) => eval(src)", text)`; files go to an
  injected `#__bulk` input via `set_input_files`. Asks before each delete unless `--yes`.
- Verified 2026-09-13: compiles, resolves config/newest transcript, launches, detects "not logged in". Not yet run logged in.

## Agents
One logged-in browser tab; parallelism lives inside the page scripts. Multiple subagents don't help.
A fresh Sonnet subagent ran the first version of the skill end-to-end in 12 tool calls / ~66k tokens.
