#!/usr/bin/env python3
"""myFuture (Orbis) internship automation without Claude in Chrome.

Drives a Playwright browser with a persistent, logged-in profile (shared with myfuture_playwright.py) and runs the
extension's in-page engine (lib/jobs.js + orbis-board.js) to read postings. Results go to JSON files.

Commands
  scan          read every posting of a board, parse + score it, write JSON (no clicks)
  probe-apply   open myFuture's application form for one posting and save its structure (never submits)
  prepare       upload cover letters (type 13) and create one application package per planned posting
  apply         fill myFuture's application form with a planned package and submit (requires --yes)

Login: if the profile is not logged in, a browser window opens; log in yourself (SSO/MFA). Never stores passwords.
Note (2026-10): McGill's login provider blocks automated browsers, so a fresh login here can fail. The extension's
local bridge (native/) runs the same work inside your normal browser instead.

Examples
  python myfuture_jobs.py scan --board internshipscoop --out scan_coop.json
  python myfuture_jobs.py scan --board career --out scan_career.json --prefs prefs.json
  python myfuture_jobs.py probe-apply --board internshipscoop --id 23133 --out probe.json
  python myfuture_jobs.py prepare --plan plan.json
  python myfuture_jobs.py apply --plan plan.json --yes
"""

import argparse
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parent / "extension"   # lib/jobs.js + orbis-board.js
MF_SCRIPTS = HERE.parent / "scripts"  # upload.js / packages.js
PROFILE = Path.home() / ".myfuture-playwright-profile"
SITE = "https://myfuture.mcgill.ca"
BOARDS = {"internshipscoop": "/myAccount/opportunities/internshipscoop/postings.htm",
          "career": "/myAccount/opportunities/career/postings.htm"}
DOCS_URL = SITE + "/myAccount/opportunities/documents.htm"

VIEW_ALL = "View all available postings"
HAS_BUTTON = "(label) => [...document.querySelectorAll('a,button')].some(x => x.innerText.trim() === label)"
CLICK = """(label) => { const b = [...document.querySelectorAll('a,button')].find(x => x.innerText.trim() === label);
  if (!b) throw new Error('button not found: ' + label); b.click(); }"""


def log(*parts):
    print(*parts, file=sys.stderr, flush=True)


def launch(pw, headless):
    opts = {"user_data_dir": str(PROFILE), "headless": headless, "accept_downloads": False}
    try:
        return pw.chromium.launch_persistent_context(channel="chrome", **opts)
    except Exception:
        return pw.chromium.launch_persistent_context(**opts)


def ensure_board(context, page, board, login_timeout=600):
    """Open the board's results list ("View all available postings"), waiting for a manual login if needed."""
    url = SITE + BOARDS[board]
    page.goto(url, wait_until="load")
    deadline = time.monotonic() + login_timeout
    warned = False

    def on_board(candidate):
        try:
            return candidate.evaluate(HAS_BUTTON, VIEW_ALL)
        except Exception:  # navigating during SSO, or closed
            return False

    while not on_board(page):
        if time.monotonic() > deadline:
            sys.exit("Timed out waiting for the myFuture login.")
        if not warned:
            log("Not logged in: log in to myFuture in the browser window (waiting up to 10 min)...")
            warned = True
        time.sleep(4)
        live = [p for p in context.pages if not p.is_closed()]
        if not live:
            sys.exit("Browser window closed before login finished.")
        page = live[-1]
        try:
            if "/myAccount/" in page.url and BOARDS[board] not in page.url:
                page.goto(url, wait_until="load")
        except Exception:
            pass
    with page.expect_navigation(wait_until="load"):
        page.evaluate(CLICK, VIEW_ALL)
    page.wait_for_function("() => typeof loadPostingTable === 'function'", timeout=30000)
    for name in ("lib/jobs.js", "orbis-board.js"):
        page.evaluate("(src) => (0, eval)(src)", (REPO / name).read_text(encoding="utf-8"))
    return page


SCAN_JS = """async (prefsIn) => {
  const P = { ...JobTools.DEFAULT_PREFS, ...(prefsIn || {}) };
  const rows = await __orbisBoard.listAll();
  const { details, errors } = await __orbisBoard.fetchDetails(rows.map((r) => r.id));
  const out = rows.map((row) => {
    const p = JobTools.parsePosting(details[row.id] || [], { title: row.title });
    p.id = 'p' + row.id;
    p.fields.title = p.fields.title || row.title;
    p.fields.organization = p.fields.organization || row.organization;
    p.fit = JobTools.scorePosting(p, P);
    p.why = JobTools.filterPosting(p, { appStatus: row.appStatus, shortlisted: row.shortlisted }, P);
    return { postingId: row.id, row, ...p };
  });
  return { prefs: P, errors, postings: out };
}"""


def cmd_scan(args):
    prefs = json.loads(Path(args.prefs).read_text(encoding="utf-8")) if args.prefs else {}
    with sync_playwright() as pw:
        context = launch(pw, args.headless)
        page = ensure_board(context, context.pages[0] if context.pages else context.new_page(), args.board)
        t0 = time.time()
        result = page.evaluate(SCAN_JS, prefs)
        context.close()
    result.update(board=args.board, scannedAt=time.strftime("%Y-%m-%dT%H:%M:%S"), seconds=round(time.time() - t0, 1))
    for p in result["postings"]:
        p["board"] = args.board
    Path(args.out).write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    ok = [p for p in result["postings"] if not p["why"]]
    ok.sort(key=lambda p: -p["fit"]["score"])
    print(json.dumps({"out": args.out, "postings": len(result["postings"]), "matching": len(ok), "seconds": result["seconds"],
                      "top": [[p["postingId"], p["fit"]["score"], p["fields"]["title"][:60], p["fields"].get("organization", "")[:30],
                               p["apply"]["method"], p["deadline"], p["cv"], p["documents"]] for p in ok[: args.top]]},
                     ensure_ascii=False, indent=1))


PROBE_JS = """() => {
  const t = (n) => (n.innerText || n.textContent || n.value || '').replace(/\\s+/g, ' ').trim();
  const forms = [...document.forms].map((f) => ({
    id: f.id, name: f.getAttribute('name'),
    fields: [...f.elements].filter((e) => e.name && e.name !== '_csrf' && e.name !== 'rand').map((e) => ({
      tag: e.tagName, type: e.type, name: e.name, required: e.required,
      label: t(e.closest('.control-group,.form-group,tr,label') || e).slice(0, 80),
      options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.text.trim()).slice(0, 40) : undefined,
      value: e.type === 'hidden' ? (String(e.value).startsWith('_-_-') ? 'TOKEN' : String(e.value).slice(0, 40)) : undefined }))
  }));
  const buttons = [...document.querySelectorAll('a,button,input[type=submit],input[type=button]')]
    .filter((b) => b.offsetParent).map((b) => t(b)).filter((s) => s && s.length < 60);
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,.panel-heading,legend,.alert')].map(t).filter(Boolean).slice(0, 30);
  return { url: location.pathname, title: document.title, headings, buttons: [...new Set(buttons)], forms,
           text: t(document.querySelector('#mainContentDiv, main') || document.body).slice(0, 4000) };
}"""


def open_apply_form(context, page, posting_id):
    """Find the posting in the list and open myFuture's application form (new tab). Returns that tab."""
    page.evaluate("async () => { await __orbisBoard.listAll(); }")
    with context.expect_page() as info:
        page.evaluate("(id) => __orbisBoard.apply(String(id))", posting_id)
    form_page = info.value
    form_page.wait_for_load_state("load")
    return form_page


def cmd_probe(args):
    with sync_playwright() as pw:
        context = launch(pw, args.headless)
        page = ensure_board(context, context.pages[0] if context.pages else context.new_page(), args.board)
        form_page = open_apply_form(context, page, args.id)
        result = {"postingId": args.id, "steps": [form_page.evaluate(PROBE_JS)]}
        Path(args.out).write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
        if args.html:
            Path(args.html).write_text(form_page.content(), encoding="utf-8")
        context.close()
    s = result["steps"][0]
    print(json.dumps({"out": args.out, "title": s["title"], "headings": s["headings"], "buttons": s["buttons"],
                      "forms": [{"fields": [f["name"] + ":" + f["type"] for f in fm["fields"]]} for fm in s["forms"] if fm["fields"]]},
                     ensure_ascii=False, indent=1))


def run_mf_script(page, name, var, cfg):
    page.evaluate("([k, v]) => { window[k] = v; }", [var, cfg])
    return json.loads(page.evaluate("(src) => eval(src)", (MF_SCRIPTS / name).read_text(encoding="utf-8")))


def cmd_prepare(args):
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    letters = [a for a in plan["applications"] if a.get("letterPdf")]
    packages = [{"name": a["package"], "cv": a["cv"], "transcript": a.get("transcript"),
                 "coverLetter": a.get("letterName")} for a in plan["applications"] if a.get("createPackage", True)]
    with sync_playwright() as pw:
        context = launch(pw, args.headless)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(DOCS_URL, wait_until="load")
        if not page.evaluate(HAS_BUTTON, "Upload Document"):
            sys.exit("Not logged in: run `scan` once without --headless and log in.")
        summary = {}
        if letters:
            with page.expect_navigation(wait_until="load"):
                page.evaluate(CLICK, "Upload Document")
            page.wait_for_selector("input[name=docName]")
            page.evaluate("() => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = '__bulk'; document.body.appendChild(i); }")
            page.set_input_files("#__bulk", [a["letterPdf"] for a in letters])
            summary["upload"] = run_mf_script(page, "upload.js", "__MF", {
                "docs": [{"file": Path(a["letterPdf"]).name, "name": a["letterName"], "type": "13"} for a in letters],
                "dryRun": args.dry_run})
            log("upload:", json.dumps(summary["upload"]))
            if not args.dry_run and not summary["upload"].get("ok"):
                context.close()
                sys.exit("letter upload failed; no packages created")
        if packages:
            page.goto(DOCS_URL, wait_until="load")
            with page.expect_navigation(wait_until="load"):
                page.evaluate(CLICK, "Create Application Package")
            page.wait_for_selector("input[name=name]")
            summary["packages"] = run_mf_script(page, "packages.js", "__MFP", {"packages": packages, "dryRun": args.dry_run})
        context.close()
    print(json.dumps(summary, indent=1, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--headless", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan"); s.add_argument("--board", choices=BOARDS, default="internshipscoop")
    s.add_argument("--out", required=True); s.add_argument("--prefs"); s.add_argument("--top", type=int, default=25)
    s.set_defaults(func=cmd_scan)
    s = sub.add_parser("probe-apply"); s.add_argument("--board", choices=BOARDS, default="internshipscoop")
    s.add_argument("--id", required=True); s.add_argument("--out", required=True); s.add_argument("--html")
    s.set_defaults(func=cmd_probe)
    s = sub.add_parser("prepare"); s.add_argument("--plan", required=True); s.add_argument("--dry-run", action="store_true")
    s.set_defaults(func=cmd_prepare)
    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
