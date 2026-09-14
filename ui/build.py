#!/usr/bin/env python3
"""Assemble the bookmarklet from the shared scripts + panel source.

Strips comments (the bookmarklet is meant to be pasted, so it stays comment-free), injects the three
operation scripts into the panel as JSON string literals, and writes panel.bundle.js and install.html.
Run after changing a script or the panel.
"""

import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

UI = Path(__file__).resolve().parent
SCRIPTS = UI.parent / "scripts"


def strip_comments(js):
    out, i, n = [], 0, len(js)

    def last_sig():
        for c in reversed(out):
            if not c.isspace():
                return c
        return ""

    def scan_quoted(q):
        nonlocal i
        out.append(js[i]); i += 1
        while i < n:
            ch = js[i]
            if ch == "\\":
                out.append(ch); out.append(js[i + 1] if i + 1 < n else ""); i += 2; continue
            out.append(ch); i += 1
            if ch == q:
                break

    while i < n:
        c = js[i]
        d = js[i + 1] if i + 1 < n else ""
        if c == "/" and d == "/":
            while i < n and js[i] != "\n":
                i += 1
        elif c == "/" and d == "*":
            i += 2
            while i + 1 < n and not (js[i] == "*" and js[i + 1] == "/"):
                i += 1
            i += 2
        elif c in "\"'`":
            scan_quoted(c)
        elif c == "/" and (last_sig() == "" or last_sig() in "(,=:[!&|?{};+-*%<>~^"):
            out.append(c); i += 1
            in_class = False
            while i < n:
                ch = js[i]
                if ch == "\\":
                    out.append(ch); out.append(js[i + 1] if i + 1 < n else ""); i += 2; continue
                out.append(ch); i += 1
                if ch == "[":
                    in_class = True
                elif ch == "]":
                    in_class = False
                elif ch == "/" and not in_class:
                    break
            while i < n and js[i].isalpha():
                out.append(js[i]); i += 1
        else:
            out.append(c); i += 1

    lines = [ln.rstrip() for ln in "".join(out).split("\n")]
    return "\n".join(ln for ln in lines if ln.strip()) + "\n"


def check(js, label):
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as fh:
        fh.write(js); path = fh.name
    r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    Path(path).unlink(missing_ok=True)
    if r.returncode:
        sys.exit(f"stripped {label} is not valid JS:\n{r.stderr}")


def build_bundle():
    panel = strip_comments((UI / "panel.src.js").read_text(encoding="utf-8"))
    for token, name in (("__UPLOAD_JSON__", "upload.js"), ("__DELETE_JSON__", "delete.js"), ("__PACKAGES_JSON__", "packages.js")):
        src = strip_comments((SCRIPTS / name).read_text(encoding="utf-8"))
        check(src, name)
        panel = panel.replace(token, json.dumps(src))
    check(panel, "panel bundle")
    return panel


def main():
    bundle = build_bundle()
    (UI / "panel.bundle.js").write_text(bundle, encoding="utf-8")
    b64 = base64.b64encode(bundle.encode("utf-8")).decode("ascii")
    html = (UI / "install.template.html").read_text(encoding="utf-8").replace("__BUNDLE_B64__", b64)
    (UI / "install.html").write_text(html, encoding="utf-8")
    print(f"panel.bundle.js: {len(bundle)} chars (comment-free); install.html: {len(html)} chars")


if __name__ == "__main__":
    main()
