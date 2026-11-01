#!/usr/bin/env python3
"""Generate THIRD_PARTY_LICENSES.txt for the Aether base application.

Run this with the same interpreter that has the backend dependencies installed
(Python 3.12), from anywhere:

    py -3.12 generate_third_party_licences.py
    py -3.12 generate_third_party_licences.py --check

It walks the three dependency graphs that make up a release — the Python
sidecar, the JavaScript runtime bundle and the Rust shell — collects the
licence text each component ships, and writes one document with the components
listed first and the texts (deduplicated by content hash) after them.

`--check` regenerates in memory and exits non-zero when the committed file is
stale, so a dependency bump cannot silently ship an out-of-date notice file.
"""

import argparse
import hashlib
import importlib.metadata as md
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "THIRD_PARTY_LICENSES.txt"
REQUIREMENTS = ROOT / "backend" / "requirements.txt"
CARGO_MANIFEST = ROOT / "frontend" / "src-tauri" / "Cargo.toml"
FFMPEG = ROOT / "bin" / "ffmpeg.exe"

LICENCE_NAME_RE = re.compile(r"(licen[cs]e|copying|notice)", re.IGNORECASE)
SKIP_SUFFIXES = {".json", ".py", ".pyc", ".js"}

# Distribution metadata spells the same licence a dozen ways; normalise to the
# identifier a reader would recognise.
LICENCE_ALIASES = {
    "OSI Approved :: MIT License": "MIT",
    "OSI Approved :: Apache Software License": "Apache-2.0",
    "OSI Approved :: BSD License": "BSD",
    "OSI Approved :: Python Software Foundation License": "PSF-2.0",
    "OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "OSI Approved :: GNU Lesser General Public License v3 (LGPLv3)": "LGPL-3.0",
    "OSI Approved :: ISC License (ISCL)": "ISC",
    "MIT License": "MIT",
    "Apache License, Version 2.0": "Apache-2.0",
    "Apache 2.0": "Apache-2.0",
    "Apache": "Apache-2.0",
    "new BSD License": "BSD-3-Clause",
    "3-Clause BSD License": "BSD-3-Clause",
    "BSD 3-Clause License": "BSD-3-Clause",
    "BSD License": "BSD",
    "PSFL": "PSF-2.0",
    "MIT/Apache-2.0": "MIT OR Apache-2.0",
    "MIT License, Apache License, Version 2.0": "MIT OR Apache-2.0",
    "BSD-3-Clause, Apache-2.0, dependency licenses": "BSD-3-Clause OR Apache-2.0",
    "http://www.opensource.org/licenses/mit-license.php": "MIT",
    "UNKNOWN": "alias of pywin32 (PSF-2.0)",
}

PROSE_HEADER = """Aether — Third-Party Licences
=============================

Aether's own source code is licensed under the Apache License, Version 2.0.
See the LICENSE file for the full text. This file covers every third-party
component that is distributed with the Aether base application, together with
the licence text each one requires us to reproduce.

Generated on {generated} from `backend/requirements.txt` (resolved against the
environment the script runs in), `frontend/package.json` (runtime dependencies
only) and `frontend/src-tauri/Cargo.toml` (the Windows x64 dependency graph).
Regenerate with `py -3.12 generate_third_party_licences.py` after any
dependency change; `--check` fails when the file is stale.

What ships in the base application
----------------------------------
* The Python backend, frozen by PyInstaller with the Python runtime.
* `app.exe` — the Tauri shell: Rust crates plus the compiled frontend bundle.
* The frontend bundle, built from the JavaScript runtime dependencies below.
* FFmpeg and its shared libraries, invoked as an external process.

Not part of the base download
-----------------------------
Optional component packs are downloaded separately by the user and are not
covered by the licence texts below:

* **Voice pack** — espeak-ng, which is **GPL-3.0-or-later**. It runs as a
  separate `espeak-ng.exe` process and is never linked into the backend. The
  pack ships its own licence text and written source offer.
* **Engine packs** — llama.cpp (upstream MIT) and the Prism fork used for
  Ternary Bonsai. The fork's licence must be recorded in the pack manifest
  before the pack is published.
* **STT pack** — the Phonon-2 model and its Python runtime. Model and runtime
  licences are recorded in the pack manifest, not in this file.

Components that carry source or relinking obligations
-----------------------------------------------------
* **pynput — LGPL-3.0.** Used unmodified from PyPI for global hotkeys and the
  mouse tracker. Its source is available from PyPI and from the links in its
  licence text below. Aether is distributed as source, so the library can be
  replaced or relinked; no modifications have been made to it.
* **FFmpeg — LGPL-3.0.** A shared-library build (`--enable-version3`, without
  `--enable-gpl`), invoked by the backend as an external process. Its source is
  available from https://ffmpeg.org/download.html and from the build recipe at
  https://github.com/BtbN/FFmpeg-Builds.
* **certifi — MPL-2.0** and **tqdm — MPL-2.0 AND MIT.** File-level copyleft
  only; both are unmodified upstream releases.

Licence totals
--------------
"""


class Component:
    """One distributed third-party component and the texts it ships."""

    def __init__(self, name, version, licence, kind):
        self.name = name
        self.version = str(version)
        self.licence = licence
        self.kind = kind
        self.files = []

    def add_file(self, display, text):
        self.files.append((display, text))


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).strip().lower()


def tidy(licence):
    value = (licence or "").strip()
    if not value:
        return "see licence texts"
    if value in LICENCE_ALIASES:
        return LICENCE_ALIASES[value]
    parts = [part.strip() for part in value.split(" / ") if part.strip()]
    seen = []
    for part in parts:
        mapped = LICENCE_ALIASES.get(part, part)
        if mapped not in seen:
            seen.append(mapped)
    return " / ".join(seen)


def read_text(path):
    """Reads a licence file, which is rarely twice the same encoding."""
    try:
        raw = Path(path).read_bytes()
    except OSError:
        return ""
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding).replace("\r\n", "\n").strip()
        except UnicodeDecodeError:
            continue
    return ""


def licence_attachments(directory, prefix):
    """Finds the licence files a package or crate ships."""
    found = []
    if not Path(directory).is_dir():
        return found
    for candidate in sorted(Path(directory).iterdir()):
        if not candidate.is_file():
            continue
        if not LICENCE_NAME_RE.search(candidate.name):
            continue
        if candidate.suffix.lower() in SKIP_SUFFIXES:
            continue
        if candidate.stat().st_size > 400_000:
            continue
        text = read_text(candidate)
        if text:
            found.append((f"{prefix}/{candidate.name}", text))
    return found


# ── Python sidecar ────────────────────────────────────────────────────────
def python_licence(dist):
    meta = dist.metadata
    expression = (meta.get("License-Expression") or "").strip()
    if expression:
        return expression
    classifiers = [
        classifier.replace("License :: ", "").strip()
        for classifier in (meta.get_all("Classifier") or [])
        if classifier.startswith("License :: ")
    ]
    if classifiers:
        return " / ".join(dict.fromkeys(classifiers))
    raw = (meta.get("License") or "").strip()
    return raw.splitlines()[0][:80] if raw else ""


def python_components():
    index = {}
    for dist in md.distributions():
        name = (dist.metadata.get("Name") or "").strip()
        if name:
            index[normalize(name)] = dist

    roots = set()
    for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        match = re.match(r"([A-Za-z0-9._-]+)", line)
        if match:
            roots.add(normalize(match.group(1)))

    components = {}
    pending = sorted(roots)
    while pending:
        name = pending.pop(0)
        if name in components:
            continue
        dist = index.get(name)
        if dist is None:
            continue
        component = Component(
            dist.metadata.get("Name") or name,
            dist.version,
            tidy(python_licence(dist)),
            "python",
        )
        for entry in dist.files or []:
            path = Path(entry)
            if ".dist-info" not in str(path) and ".egg-info" not in str(path):
                continue
            if not LICENCE_NAME_RE.search(path.name):
                continue
            if path.suffix.lower() in SKIP_SUFFIXES:
                continue
            text = read_text(dist.locate_file(entry))
            if text:
                component.add_file(
                    f"{component.name}-{component.version}/{path.name}", text
                )
        components[name] = component
        for requirement in dist.requires or []:
            # Extras are not installed, so they are not distributed either.
            if "extra ==" in requirement:
                continue
            dependency = re.match(r"([A-Za-z0-9._-]+)", requirement)
            if dependency:
                pending.append(normalize(dependency.group(1)))
    return list(components.values())


# ── JavaScript bundle ─────────────────────────────────────────────────────
def resolve_js(name, start):
    """Finds an installed package by walking node_modules upwards."""
    current = Path(start)
    while True:
        candidate = current.joinpath("node_modules", *name.split("/"), "package.json")
        if candidate.is_file():
            return candidate
        if current == current.parent:
            return None
        current = current.parent


def javascript_components():
    frontend = ROOT / "frontend"
    manifest_path = frontend / "package.json"
    if not manifest_path.is_file():
        return []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    roots = sorted(manifest.get("dependencies") or {})

    components = {}
    pending = [(name, frontend) for name in roots]
    while pending:
        name, origin = pending.pop(0)
        if name in components or name.startswith("@types/"):
            continue
        found = resolve_js(name, origin)
        if found is None:
            components[name] = None
            continue
        try:
            meta = json.loads(found.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        licence = meta.get("license")
        if isinstance(licence, dict):
            licence = licence.get("type")
        component = Component(
            name, meta.get("version") or "?", tidy(str(licence or "")), "js"
        )
        prefix = f"{name}-{component.version}"
        for display, text in licence_attachments(found.parent, prefix):
            component.add_file(display, text)
        components[name] = component
        for child in list(meta.get("dependencies") or {}) + list(
            meta.get("optionalDependencies") or {}
        ):
            if child not in components:
                pending.append((child, frontend))
    return [component for component in components.values() if component]


# ── Rust shell ────────────────────────────────────────────────────────────
def cargo_metadata():
    cargo = shutil.which("cargo")
    if cargo is None:
        raise SystemExit("cargo was not found on PATH; it is needed for the Rust graph")
    base = [
        cargo,
        "metadata",
        "--format-version",
        "1",
        "--filter-platform",
        "x86_64-pc-windows-msvc",
        "--manifest-path",
        str(CARGO_MANIFEST),
    ]
    for extra in (["--offline"], []):
        completed = subprocess.run(
            base + extra, capture_output=True, check=False, cwd=str(ROOT)
        )
        if completed.returncode == 0:
            return json.loads(completed.stdout.decode("utf-8-sig"))
    raise SystemExit(
        "cargo metadata failed. Run it once with network access so the crate "
        "sources and their licence files are present locally."
    )


def rust_components(meta):
    packages = {package["id"]: package for package in meta["packages"]}
    nodes = {node["id"]: node for node in meta["resolve"]["nodes"]}
    root = next((pkg for pkg in meta["packages"] if pkg["name"] == "app"), None)

    reachable = set()
    pending = [root["id"]] if root else []
    while pending:
        identifier = pending.pop()
        if identifier in reachable:
            continue
        reachable.add(identifier)
        for dependency in nodes.get(identifier, {}).get("deps", []):
            kinds = {kind["kind"] for kind in dependency.get("dep_kinds", [])}
            if kinds == {"dev"}:
                continue
            pending.append(dependency["pkg"])

    components = []
    ordered = sorted(
        reachable,
        key=lambda item: (packages[item]["name"].lower(), packages[item]["version"]),
    )
    for identifier in ordered:
        package = packages[identifier]
        if package["name"] == "app":
            continue
        component = Component(
            package["name"],
            package["version"],
            tidy(package.get("license") or ""),
            "rust",
        )
        prefix = f"{package['name']}-{package['version']}"
        for display, text in licence_attachments(
            Path(package["manifest_path"]).parent, prefix
        ):
            component.add_file(display, text)
        components.append(component)
    return components


# ── FFmpeg facts ──────────────────────────────────────────────────────────
def ffmpeg_facts():
    """Reads the bundled build's version and configuration, if it is present."""
    if not FFMPEG.is_file():
        return None
    completed = subprocess.run(
        [str(FFMPEG), "-version"], capture_output=True, check=False
    )
    text = completed.stdout.decode("utf-8", errors="replace")
    first = text.splitlines()[0] if text else ""
    version = first.replace("ffmpeg version ", "").split(" Copyright")[0].strip()
    configuration = ""
    for line in text.splitlines():
        if line.startswith("configuration:"):
            configuration = line.split(":", 1)[1].strip()
            break
    if not version:
        return None
    version3 = "--enable-version3" in configuration
    gpl = "--enable-gpl" in configuration or "--enable-nonfree" in configuration
    licence = "LGPL-3.0" if version3 else "LGPL-2.1-or-later"
    if gpl:
        licence = "GPL (--enable-gpl is set: review before shipping)"
    libraries = sorted(
        path.name
        for path in (ROOT / "bin").glob("*.dll")
        if re.match(r"(lib)?av(codec|device|filter|format|util)|sw(resample|scale)", path.name)
    )
    return {
        "version": version,
        "configuration": configuration,
        "licence": licence,
        "libraries": libraries,
    }


# ── document ──────────────────────────────────────────────────────────────
def table(components, title):
    lines = [title, "-" * len(title), ""]
    width = min(max((len(item.name) for item in components), default=9), 42)
    lines.append(f"{'Component'.ljust(width)}  {'Version'.ljust(11)}  Licence")
    lines.append(f"{'-' * width}  {'-' * 11}  {'-' * 32}")
    for item in components:
        lines.append(
            f"{item.name[:width].ljust(width)}  "
            f"{item.version.ljust(11)}  {item.licence}"
        )
    lines.append("")
    return lines


def build_document(components, generated):
    texts = {}
    for component in components:
        for display, text in component.files:
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            entry = texts.setdefault(digest, {"text": text, "users": []})
            entry["users"].append(f"{component.name} {component.version}")
    ordered = sorted(texts.values(), key=lambda entry: entry["users"][0].lower())
    for entry in ordered:
        entry["users"] = sorted(set(entry["users"]), key=str.lower)

    counts = {}
    for component in components:
        counts[component.licence] = counts.get(component.licence, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0].lower()))

    missing = [item for item in components if not item.files]
    by_kind = {"python": [], "js": [], "rust": []}
    for component in components:
        by_kind[component.kind].append(component)
    for bucket in by_kind.values():
        bucket.sort(key=lambda item: item.name.lower())

    out = [PROSE_HEADER.format(generated=generated)]
    out.append(
        f"{len(components)} third-party components, {len(ordered)} distinct licence texts."
    )
    out.append("")
    for licence, count in ranked[:12]:
        out.append(f"  {count:>4}  {licence}")
    out.extend(["", ""])

    out.extend(table(by_kind["python"], f"1. Python packages ({len(by_kind['python'])})"))
    out.extend(table(by_kind["js"], f"2. JavaScript packages ({len(by_kind['js'])})"))
    out.extend(table(by_kind["rust"], f"3. Rust crates ({len(by_kind['rust'])})"))

    out.append("4. Bundled native binaries")
    out.append("--------------------------")
    out.append("")
    facts = ffmpeg_facts()
    if facts:
        out.append(f"FFmpeg {facts['version']}  —  {facts['licence']}")
        out.append("  ffmpeg.exe, ffprobe.exe, ffplay.exe and the shared libraries")
        for library in facts["libraries"]:
            out.append(f"  {library}")
        out.append("  Configuration line as reported by the binary:")
        out.append(f"    {facts['configuration']}")
        out.append("  Copyright (c) 2000-2025 the FFmpeg developers.")
        out.append("  Source: https://ffmpeg.org/download.html")
        out.append("  Build recipe: https://github.com/BtbN/FFmpeg-Builds")
    else:
        out.append("FFmpeg — LGPL-3.0 shared-library build (no --enable-gpl).")
        out.append("  The binary was not present when this file was generated.")
        out.append("  Source: https://ffmpeg.org/download.html")
    out.append("")
    out.append("Python runtime  —  PSF-2.0")
    out.append("  Copyright (c) 2001-2025 Python Software Foundation.")
    out.append("  Source: https://www.python.org/downloads/source/")
    out.append("")
    out.append("PyInstaller bootloader  —  GPL-2.0-or-later WITH a special exception")
    out.append("  The bootloader may be used to package and distribute proprietary or")
    out.append("  differently licensed applications. See the exception text at")
    out.append("  https://github.com/pyinstaller/pyinstaller/blob/develop/COPYING.txt")
    out.append("")
    out.append("Microsoft Edge WebView2 Runtime  —  Microsoft terms")
    out.append("  Installed by Microsoft's own bootstrapper, never redistributed by Aether.")
    out.append("  https://developer.microsoft.com/microsoft-edge/webview2/")
    out.extend(["", ""])

    section = 5
    if missing:
        out.append(f"{section}. Components without a bundled licence file")
        out.append("-" * len(f"{section}. Components without a bundled licence file"))
        out.append("")
        out.append("These are distributed under the licence named in the tables above, but")
        out.append("their package does not ship the text. Fetch it from the project.")
        out.append("")
        for component in missing:
            if component.kind == "python":
                url = f"https://pypi.org/project/{component.name}/"
            elif component.kind == "js":
                url = f"https://www.npmjs.com/package/{component.name}"
            else:
                url = f"https://crates.io/crates/{component.name}"
            out.append(
                f"  {component.name} {component.version} — {component.licence} — {url}"
            )
        out.extend(["", ""])
        section += 1

    out.append(f"{section}. Licence texts")
    out.append("-" * len(f"{section}. Licence texts"))
    out.append("")
    out.append("Each text below is reproduced exactly as the component ships it. A text")
    out.append("appears once even when many components use it.")
    out.append("")
    for number, entry in enumerate(ordered, start=1):
        out.extend(["", "=" * 78])
        out.append(f"Text {number} of {len(ordered)} — used by {len(entry['users'])} component(s)")
        out.extend(["=" * 78, ""])
        for user in entry["users"][:40]:
            out.append(f"  * {user}")
        if len(entry["users"]) > 40:
            out.append(f"  * ... and {len(entry['users']) - 40} more")
        out.extend(["", "-" * 78, "", entry["text"], ""])

    return "\n".join(out) + "\n"


def collect():
    components = python_components()
    components += javascript_components()
    components += rust_components(cargo_metadata())
    return components


def strip_date(text):
    """Normalises line endings and drops the generated date, for comparisons."""
    text = text.replace("\r\n", "\n")
    return re.sub(r"^Generated on \d{4}-\d{2}-\d{2}", "Generated on", text, flags=re.MULTILINE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit non-zero when THIRD_PARTY_LICENSES.txt is out of date",
    )
    arguments = parser.parse_args()

    generated = date.today().isoformat()
    components = collect()
    document = build_document(components, generated)

    if arguments.check:
        if not OUTPUT.is_file():
            print("THIRD_PARTY_LICENSES.txt is missing; run the script to create it.")
            return 1
        current = strip_date(OUTPUT.read_text(encoding="utf-8"))
        if current == strip_date(document):
            print(f"THIRD_PARTY_LICENSES.txt is up to date ({len(components)} components).")
            return 0
        print("THIRD_PARTY_LICENSES.txt is stale; re-run without --check.")
        return 1

    # Keep the existing date when nothing else changed, so a no-op run really
    # is a no-op.
    if OUTPUT.is_file():
        current = OUTPUT.read_text(encoding="utf-8").replace("\r\n", "\n")
        stamp = re.search(r"Generated on (\d{4}-\d{2}-\d{2})", current)
        if stamp and stamp.group(1) != generated:
            candidate = build_document(components, stamp.group(1))
            if candidate == current:
                document = candidate

    OUTPUT.write_text(document, encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
    print(
        "  python={python} js={js} rust={rust} texts={texts}".format(
            python=sum(1 for item in components if item.kind == "python"),
            js=sum(1 for item in components if item.kind == "js"),
            rust=sum(1 for item in components if item.kind == "rust"),
            texts=len({hashlib.sha256(text.encode()).hexdigest()
                       for item in components for _, text in item.files}),
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())