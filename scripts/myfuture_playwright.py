#!/usr/bin/env python3
"""McGill myFuture (Orbis): upload documents, rebuild application packages, clean up old copies.

Standalone Playwright runner. It shares the in-page scripts (upload.js, delete.js, packages.js) and the
config file (~/.claude/myfuture/config.json, schema in ../SKILL.md) with the `myfuture-documents` skill.

Login: the first run opens a browser window on myFuture. Log in yourself (SSO/MFA); the script notices and
continues. The session is kept in --profile for later runs. The script never sees or stores your password.

Examples:
  python myfuture_playwright.py --dry-run
  python myfuture_playwright.py
  python myfuture_playwright.py --cover-letter "coverLetters/eaton.pdf=en_games"
  python myfuture_playwright.py --date 2026-09-14 --yes
"""

import argparse
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

SCRIPTS = Path(__file__).resolve().parent
DEFAULT_CONFIG = Path.home() / ".claude" / "myfuture" / "config.json"
DEFAULT_STATE = Path.home() / ".claude" / "myfuture" / "state.json"
DEFAULT_PROFILE = Path.home() / ".myfuture-playwright-profile"
DOCS_PATH = "/myAccount/opportunities/documents.htm"
DATE_RE = r"_\d{4}-\d{2}-\d{2}$"
# docType -> (overview row label, list "Type" column)
TYPES = {"13": ("Cover Letter", "Cover Letter"), "14": ("CV/Resume", "CV/Resume"),
         "15": ("Unofficial Transcript", "Unofficial Transcript"), "16": ("Other", "Other")}

CLICK_BUTTON = r"""(label) => {
  const b = [...document.querySelectorAll('button,a')].find(x => x.innerText.trim() === label && x.offsetParent);
  if (!b) throw new Error('button not found: ' + label);
  b.click();
}"""
INJECT_BULK = r"""() => {
  const i = document.createElement('input');
  i.type = 'file'; i.multiple = true; i.id = '__bulk';
  document.body.appendChild(i);
}"""
FILTER_IS_ALL = r"""() => {
  const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.text.trim() === 'all'));
  if (!s) throw new Error('not on the documents overview');
  return s.value === '0';
}"""
SET_FILTER_ALL = r"""() => {
  const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.text.trim() === 'all'));
  s.value = '0';
  s.dispatchEvent(new Event('change', { bubbles: true }));
}"""
OPEN_LIST = r"""(label) => {
  const esc = label.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  const re = new RegExp('^\\s*' + esc + '\\s*\\d+');
  const r = [...document.querySelectorAll('tr,li,div')]
    .filter(e => re.test(e.innerText || '') && e.querySelector('a,button'))
    .sort((a, b) => a.innerText.length - b.innerText.length)[0];
  if (!r) throw new Error('overview row not found: ' + label);
  r.querySelector('a,button').click();
}"""
LIST_READY = r"""() => [...document.querySelectorAll('table tbody tr')].some(t => t.querySelector('input[type=checkbox]'))
  || /No Records Found/i.test(document.body.innerText)"""
COUNTS = r"""() => {
  const b = document.body.innerText, n = re => Number((b.match(re) || [])[1]);
  return { coverLetters: n(/Cover Letter\s*(\d+)/), cvs: n(/CV\/Resume\s*(\d+)/), other: n(/\bOther\s*(\d+)/),
           transcripts: n(/Unofficial Transcript\s*(\d+)/), packages: n(/Application Packages\s*(\d+)/) };
}"""


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    p.add_argument("--date", help="date suffix YYYY-MM-DD (default: today)")
    p.add_argument("--dry-run", action="store_true", help="upload to temp storage and show plans; save/delete nothing")
    p.add_argument("--yes", action="store_true", help="don't ask before deleting")
    p.add_argument("--no-delete", action="store_true", help="skip every delete step")
    p.add_argument("--swap-transcript", action="store_true",
                   help="only rebuild tracked packages with a new transcript (upload none of the CVs)")
    p.add_argument("--transcript-name", help="with --swap-transcript: use this existing document name instead of uploading")
    p.add_argument("--cover-letter", action="append", default=[], metavar="FILE[=BASE]",
                   help="PDF under root (or absolute) to upload and put in package BASE (asked if omitted)")
    p.add_argument("--headless", action="store_true")
    p.add_argument("--channel", default="chrome", help="chrome | msedge | chromium (bundled)")
    p.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    p.add_argument("--login-timeout", type=int, default=600, help="seconds to wait for you to log in")
    return p.parse_args()


def ask_yes(question):
    return input(question + " [y/N] ").strip().lower() in ("y", "yes")


def resolve_documents(cfg, root, suffix):
    docs = []
    for d in cfg["documents"]:
        if "newestIn" in d:
            folder = root / d["newestIn"]
            ext = d.get("ext", ".pdf").lower()
            found = [f for f in folder.iterdir() if f.is_file() and f.name.lower().endswith(ext)]
            if not found:
                sys.exit(f"no *{ext} file in {folder}")
            path = max(found, key=lambda f: f.stat().st_mtime)
        else:
            path = root / d["file"]
        docs.append(make_doc(path, d["base"], suffix, str(d["type"])))
    return docs


def make_doc(path, base, suffix, doc_type):
    if not path.is_file():
        sys.exit(f"missing file: {path}")
    if path.suffix.lower() != ".pdf":
        sys.exit(f"myFuture accepts PDF only: {path}")
    return {"path": path, "file": path.name, "base": base, "name": base + suffix, "type": doc_type}


def load_state(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def base_of(package):
    return package.get("base") or re.sub(DATE_RE, "", package.get("name", ""))


def plan_packages(cfg, docs, suffix, cover_for, previous, carry_over):
    mode = cfg.get("packages", "one-per-cv")
    if mode == "none":
        return []
    by_base = {d["base"]: d["name"] for d in docs}
    if mode == "one-per-cv":
        transcript = next((d["base"] for d in docs if d["type"] == "15"), None)
        specs = [{"base": d["base"], "cv": d["base"], "transcript": transcript} for d in docs if d["type"] == "14"]
    else:
        specs = mode
    prev_letters = {base_of(p): p.get("coverLetter") for p in previous.get("packages", []) if p.get("coverLetter")}
    packages = []
    for s in specs:
        base = s["base"]
        letter = cover_for.get(base) or s.get("coverLetter")
        if not letter and base in prev_letters and carry_over != "drop":
            # "infer" needs judgement (the Claude skill reads the letter); here it falls back to asking.
            if ask_yes(f"The previous {base} package had cover letter '{prev_letters[base]}'. Include it again?"):
                letter = prev_letters[base]
        packages.append({
            "base": base,
            "name": base + suffix,
            "cv": by_base.get(s["cv"], s["cv"]),
            "transcript": by_base.get(s.get("transcript"), s.get("transcript")),
            "coverLetter": letter or None,
        })
    return packages


def delete_config(policy, list_type, keep_names, bases):
    if policy == "none" or not keep_names:
        return None
    cfg = {"type": list_type, "keep": keep_names, "requireKept": True}
    if policy == "same-base-dated":
        cfg["deleteMatch"] = "^(" + "|".join(re.escape(b) for b in bases) + ")" + DATE_RE
    return cfg


def launch(pw, args):
    options = {"user_data_dir": str(args.profile), "headless": args.headless, "accept_downloads": False}
    if args.channel != "chromium":
        try:
            return pw.chromium.launch_persistent_context(channel=args.channel, **options)
        except Exception as exc:  # channel not installed
            print(f"browser channel '{args.channel}' unavailable ({exc.__class__.__name__}); using bundled Chromium")
    return pw.chromium.launch_persistent_context(**options)


def on_overview(page):
    try:
        page.evaluate(FILTER_IS_ALL)
        return True
    except Exception:
        return False


def wait_for_login(context, docs_url, timeout_s):
    """Wait until any tab of the window reaches the documents page; return that tab."""
    print(f"Log in to myFuture in the browser window (waiting up to {timeout_s // 60} min)...", flush=True)
    host = urlparse(docs_url).hostname
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        time.sleep(3)
        pages = [p for p in context.pages if not p.is_closed()]
        if not pages:
            sys.exit("The browser window was closed before the login finished. Run the script again and log in there.")
        for page in pages:
            try:
                if on_overview(page):
                    return page
                # Logged-in area but another page (e.g. the dashboard): go to the documents page once.
                if urlparse(page.url).hostname == host and "/myAccount/" in page.url:
                    page.goto(docs_url, wait_until="load")
                    if on_overview(page):
                        return page
            except Exception:
                pass  # the page is navigating during login
    sys.exit("Timed out waiting for the myFuture login.")


def navigate_by_js(page, script, arg=None):
    with page.expect_navigation(wait_until="load", timeout=30000):
        page.evaluate(script, arg)


def overview_all(page, docs_url):
    page.goto(docs_url, wait_until="load")
    if not page.evaluate(FILTER_IS_ALL):
        navigate_by_js(page, SET_FILTER_ALL)


def run_script(page, name, var, cfg):
    page.evaluate("([k, v]) => { window[k] = v; }", [var, cfg])
    return json.loads(page.evaluate("(src) => eval(src)", (SCRIPTS / name).read_text(encoding="utf-8")))


def upload_docs(page, docs_url, docs, dry_run):
    page.goto(docs_url, wait_until="load")
    navigate_by_js(page, CLICK_BUTTON, "Upload Document")
    page.wait_for_selector("input[name=docName]")
    page.evaluate(INJECT_BULK)
    page.set_input_files("#__bulk", [str(d["path"]) for d in docs])
    return run_script(page, "upload.js", "__MF", {
        "docs": [{"file": d["file"], "name": d["name"], "type": d["type"]} for d in docs],
        "dryRun": dry_run,
    })


def create_packages(page, docs_url, packages, dry_run):
    page.goto(docs_url, wait_until="load")
    navigate_by_js(page, CLICK_BUTTON, "Create Application Package")
    page.wait_for_selector("input[name=name]")
    return run_script(page, "packages.js", "__MFP", {
        "packages": [{k: p.get(k) for k in ("name", "cv", "transcript", "coverLetter")} for p in packages],
        "dryRun": dry_run,
    })


def run_delete(page, docs_url, row_label, dcfg, args):
    overview_all(page, docs_url)
    navigate_by_js(page, OPEN_LIST, row_label)
    page.wait_for_function(LIST_READY, timeout=20000)
    plan = run_script(page, "delete.js", "__MFD", {**dcfg, "dryRun": True})
    print(f"  {row_label}: keep {len(plan['kept'])}, delete {plan['toDelete']}")
    if args.dry_run or not plan["toDelete"]:
        return plan
    if not args.yes and not ask_yes(f"  Delete these {len(plan['toDelete'])} {row_label} rows?"):
        return plan
    # Same rendered page, no other request in between (the server ignores deletes after another page load).
    result = run_script(page, "delete.js", "__MFD", dcfg)
    refused = [r["name"] for r in result["results"] if r["status"].startswith("in-use")]
    if refused:
        print(f"  refused (used in an application): {refused}")
    return result


def run_swap(page, docs_url, cfg, docs, previous, state_path, args):
    """Rebuild the tracked packages so they use a new transcript; leave every other package alone."""
    tracked = previous.get("packages", [])
    if not tracked:
        sys.exit("No tracked packages in state.json — run a normal upload first, then swap.")
    summary = {"mode": "swap-transcript", "dryRun": args.dry_run}

    if args.transcript_name:
        tr_name = args.transcript_name
    else:
        tr_doc = next((d for d in docs if d["type"] == "15"), None)
        if not tr_doc:
            sys.exit("No transcript configured and no --transcript-name given.")
        summary["upload"] = up = upload_docs(page, docs_url, [tr_doc], args.dry_run)
        print("transcript upload:", json.dumps(up))
        if not args.dry_run and not up.get("ok"):
            sys.exit("transcript upload failed; packages unchanged")
        tr_name = tr_doc["name"]
    summary["newTranscript"] = tr_name
    print(f"swapping transcript on {len(tracked)} package(s) -> {tr_name}")

    # Delete then recreate (same name), so no two packages ever share a name at once.
    if not args.no_delete:
        summary["deletePackages"] = run_delete(page, docs_url, "Application Packages",
                                               {"type": "Package", "deleteNames": [p["name"] for p in tracked]}, args)
    new_packages = [{"base": base_of(p), "name": p["name"], "cv": p["cv"],
                     "transcript": tr_name, "coverLetter": p.get("coverLetter")} for p in tracked]
    summary["packages"] = created = create_packages(page, docs_url, new_packages, args.dry_run)
    print("packages:", json.dumps(created))

    overview_all(page, docs_url)
    summary["counts"] = page.evaluate(COUNTS)
    if not args.dry_run and created.get("ok"):
        state = {**previous, "date": args.date or dt.date.today().isoformat(),
                 "packages": [{k: p[k] for k in ("base", "name", "cv", "transcript", "coverLetter")} for p in new_packages]}
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


def main():
    args = parse_args()
    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    docs_url = cfg.get("site", "https://myfuture.mcgill.ca").rstrip("/") + DOCS_PATH
    root = Path(cfg["root"])
    date = args.date or dt.date.today().isoformat()
    suffix = f"_{date}" if cfg.get("dateSuffix", True) else ""
    state_path = Path(cfg.get("stateFile") or DEFAULT_STATE)
    previous = load_state(state_path)

    docs = resolve_documents(cfg, root, suffix)
    cv_bases = [d["base"] for d in docs if d["type"] == "14"]
    cover_for = {}
    for spec in args.cover_letter:
        file_part, _, base = spec.partition("=")
        path = Path(file_part) if Path(file_part).is_absolute() else root / file_part
        while base not in cv_bases:
            base = input(f"Which package gets cover letter {path.name}? {cv_bases}: ").strip()
        letter = make_doc(path, path.stem, suffix, "13")
        docs.append(letter)
        cover_for[base] = letter["name"]
    if len({d["file"] for d in docs}) != len(docs):
        sys.exit("two documents share the same file name; rename one")

    packages = plan_packages(cfg, docs, suffix, cover_for, previous,
                             cfg.get("coverLetters", {}).get("carryOver", "ask"))
    print(f"date {date}; uploading: {[d['name'] for d in docs]}")
    print(f"packages: {[(p['name'], bool(p['coverLetter'])) for p in packages]}")

    summary = {"date": date, "dryRun": args.dry_run}
    with sync_playwright() as pw:
        context = launch(pw, args)
        page = context.pages[0] if context.pages else context.new_page()

        page.goto(docs_url, wait_until="load")
        if not on_overview(page):
            if args.headless:
                sys.exit("Not logged in. Run once without --headless and log in.")
            page = wait_for_login(context, docs_url, args.login_timeout)

        if args.swap_transcript:
            summary = run_swap(page, docs_url, cfg, docs, previous, state_path, args)
            context.close()
            print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
            return

        # 1. Upload (throttled temp uploads, then one save per document).
        summary["upload"] = up = upload_docs(page, docs_url, docs, args.dry_run)
        print("upload:", json.dumps(up))
        if not args.dry_run and not up.get("ok"):
            context.close()
            sys.exit("upload did not fully succeed; nothing else was changed")

        # 2. Delete older copies of the uploaded document types (never cover letters).
        if not args.no_delete:
            for doc_type in ("14", "15", "16"):
                typed = [d for d in docs if d["type"] == doc_type]
                dcfg = delete_config(cfg.get("deleteOld", "same-base-dated"), TYPES[doc_type][1],
                                     [d["name"] for d in typed], [d["base"] for d in typed])
                if dcfg:
                    summary[f"delete_{doc_type}"] = run_delete(page, docs_url, TYPES[doc_type][0], dcfg, args)

        # 3. Create packages.
        if packages:
            created = create_packages(page, docs_url, packages, args.dry_run)
            summary["packages"] = created
            print("packages:", json.dumps(created))
            if not args.dry_run and not created.get("ok"):
                context.close()
                sys.exit("package creation failed; old packages were not touched")

            # 4. Delete older packages.
            if not args.no_delete:
                dcfg = delete_config(cfg.get("deleteOldPackages", "same-base-dated"), "Package",
                                     [p["name"] for p in packages], [p["base"] for p in packages])
                if dcfg:
                    summary["delete_packages"] = run_delete(page, docs_url, "Application Packages", dcfg, args)

        # 5. Final counts (all dates).
        overview_all(page, docs_url)
        summary["counts"] = page.evaluate(COUNTS)
        print("counts:", json.dumps(summary["counts"]))
        context.close()

    if not args.dry_run and packages:
        state = {**previous, "date": date,
                 "packages": [{k: p[k] for k in ("base", "name", "cv", "transcript", "coverLetter")} for p in packages]}
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
