#!/usr/bin/env python3
"""Write the local bridge plan (~/.mst/plan.json) for a set of postings, using the shared myFuture config.

Reads the same config as the documents tools (~/.claude/myfuture/config.json): CV base names (type 14) and the
transcript base (type 15) come from "documents", so packages always point at your newest dated copies on myFuture
(the extension resolves "en_cv" -> "en_cv_<newest date>" before building anything).

picks.json: [{"postingId": "23133", "board": "internshipscoop", "organization": "Greyhaven", "title": "...",
               "label": "Backend", "cv": "en_fullstack", "transcript": true, "letterPdf": "C:/.../letter.pdf"}]
  cv          a CV base from config.json
  label       optional short tag for the package name when you apply to several postings at one company
  transcript  true -> attach your transcript base
  letterPdf   optional cover letter PDF to upload (type 13) and put in this application's package

Usage:  python make_plan.py picks.json [--probe <postingId>] [--config path] [--out path]
Then open myFuture, click the extension → Check plan → Run plan.
"""

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

CONFIG = Path.home() / ".claude" / "myfuture" / "config.json"
PLAN = Path.home() / ".mst" / "plan.json"


def slug(value):
    return re.sub(r"[^A-Za-z0-9]+", "", str(value or ""))[:24] or "Job"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("picks", type=Path)
    p.add_argument("--config", type=Path, default=CONFIG)
    p.add_argument("--out", type=Path, default=PLAN)
    p.add_argument("--probe", help="posting id whose application form to open and save (inspect only)")
    p.add_argument("--date", default=dt.date.today().isoformat())
    args = p.parse_args()

    config = json.loads(args.config.read_text(encoding="utf-8")) if args.config.is_file() else {}
    docs = config.get("documents", [])
    cv_bases = [d["base"] for d in docs if str(d.get("type")) == "14"]
    transcript = next((d["base"] for d in docs if str(d.get("type")) == "15"), None)
    picks = json.loads(args.picks.read_text(encoding="utf-8"))

    apps, used = [], set()
    for pick in picks:
        cv = pick.get("cv")
        if cv_bases and cv not in cv_bases:
            sys.exit(f"posting {pick.get('postingId')}: cv '{cv}' is not a CV base in {args.config} ({', '.join(cv_bases)})")
        org = slug(pick.get("organization")) + (f"-{slug(pick['label'])}" if pick.get("label") else "")
        name = f"{cv}_{org}_{args.date}"
        n = 2
        while name in used:  # several postings at one company
            name, n = f"{cv}_{org}{n}_{args.date}", n + 1
        used.add(name)
        app = {"postingId": str(pick["postingId"]), "board": pick.get("board", "internshipscoop"),
               "organization": pick.get("organization", ""), "title": pick.get("title", ""), "package": name, "cv": cv}
        if pick.get("transcript"):
            if not transcript:
                sys.exit(f"posting {pick['postingId']} wants a transcript but {args.config} has no type 15 document")
            app["transcript"] = transcript
        if pick.get("letterPdf"):
            pdf = Path(pick["letterPdf"])
            if not pdf.is_file() or pdf.suffix.lower() != ".pdf":
                sys.exit(f"letter not found or not a PDF: {pdf}")
            app["letterPdf"] = str(pdf.resolve())
            app["letterName"] = "cl_" + name[len(cv) + 1:]
        apps.append(app)

    plan = {"createdAt": args.date, "resolveNewest": True, "submit": False, "applications": apps}
    if args.probe:
        plan["probeApply"] = str(args.probe)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(plan, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"out": str(args.out), "applications": [[a["postingId"], a["package"], a.get("letterName", "")] for a in apps]}, indent=1))


if __name__ == "__main__":
    main()
