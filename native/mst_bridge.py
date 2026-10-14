#!/usr/bin/env python3
"""Native messaging host for the McGill Student Toolkit extension.

Lets local scripts (or Claude Code) hand work to the extension, which runs it inside the student's own signed-in
browser tab, and lets the extension write results back to disk. Chrome starts this process on demand and talks to
it over stdin/stdout (4-byte length + JSON). Only the extension ID listed in the host manifest can connect.

Folder (MST_HOME, default ~/.mst):
  plan.json      work for the extension: {"applications": [...], "submit": false}   (written by local scripts)
  config.json    optional {"scriptsDir": "..."}; default: this repository's scripts/ folder
  out/<name>.json  results written by the extension (scan results, run logs, probes)

Commands: ping | getPlan | readFile {path} | readScript {name} | writeResult {name, data}
readFile only serves files that plan.json references; readScript only serves *.js from scriptsDir.
"""

import base64
import json
import os
import re
import struct
import sys
from pathlib import Path

HOME = Path(os.environ.get("MST_HOME") or Path.home() / ".mst")


def read_message():
    header = sys.stdin.buffer.read(4)
    if len(header) < 4:
        return None
    (length,) = struct.unpack("<I", header)
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


def send(obj):
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def load_json(path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def plan_files(plan):
    files = set()
    for app in (plan or {}).get("applications", []):
        for key in ("letterPdf",):
            if app.get(key):
                files.add(str(Path(app[key]).resolve()).lower())
    return files


def handle(msg):
    cmd = msg.get("cmd")
    if cmd == "ping":
        return {"ok": True, "home": str(HOME)}
    if cmd == "getPlan":
        return {"ok": True, "plan": load_json(HOME / "plan.json")}
    if cmd == "readFile":
        path = Path(msg.get("path", "")).resolve()
        if str(path).lower() not in plan_files(load_json(HOME / "plan.json")):
            return {"ok": False, "error": "file is not referenced by plan.json"}
        return {"ok": True, "name": path.name, "base64": base64.b64encode(path.read_bytes()).decode("ascii")}
    if cmd == "readScript":
        name = msg.get("name", "")
        default = Path(__file__).resolve().parent.parent / "scripts"  # this repository's upload.js / packages.js
        scripts = Path((load_json(HOME / "config.json", {}) or {}).get("scriptsDir") or default)
        if not re.fullmatch(r"[\w.-]+\.js", name) or not (scripts / name).is_file():
            return {"ok": False, "error": f"script not available: {name}"}
        return {"ok": True, "source": (scripts / name).read_text(encoding="utf-8")}
    if cmd == "writeResult":
        name = re.sub(r"[^\w.-]+", "_", msg.get("name", "result"))[:80]
        out = HOME / "out"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{name}.json").write_text(json.dumps(msg.get("data"), indent=1, ensure_ascii=False), encoding="utf-8")
        return {"ok": True, "path": str(out / f"{name}.json")}
    return {"ok": False, "error": f"unknown command: {cmd}"}


def main():
    while True:
        msg = read_message()
        if msg is None:
            return
        try:
            send(handle(msg))
        except Exception as exc:  # report, never crash silently
            send({"ok": False, "error": f"{exc.__class__.__name__}: {exc}"})


if __name__ == "__main__":
    main()
