#!/usr/bin/env python3
"""Write the public host archives from the tracked tree."""

import os
import subprocess
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ("ZendoL-1_App.zip", "ZendoDeployL1.zip")
STORED = {
    ".mp4",
    ".pdf",
    ".apk",
    ".ico",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".jks",
    ".woff",
    ".woff2",
}


def main() -> None:
    os.chdir(ROOT)
    names = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
    os.makedirs(os.path.join(ROOT, "downloads"), exist_ok=True)
    entries: list[tuple[str, zipfile.ZipInfo, bytes]] = []
    for rel in names:
        if rel.endswith(".zip") or not os.path.isfile(rel):
            continue
        info = zipfile.ZipInfo(rel)
        ext = os.path.splitext(rel)[1].lower()
        executable = rel == "bin/zendo-node" or os.access(rel, os.X_OK)
        info.compress_type = zipfile.ZIP_STORED if ext in STORED or rel == "bin/zendo-node" else zipfile.ZIP_DEFLATED
        info.external_attr = ((0o755 if executable else 0o644) & 0xFFFF) << 16
        with open(rel, "rb") as handle:
            entries.append((rel, info, handle.read()))
    for name in NAMES:
        out = os.path.join(ROOT, "downloads", name)
        with zipfile.ZipFile(out, "w") as archive:
            for rel, info, payload in entries:
                copy = zipfile.ZipInfo(rel)
                copy.compress_type = info.compress_type
                copy.external_attr = info.external_attr
                archive.writestr(copy, payload)
        print(out, os.path.getsize(out))


if __name__ == "__main__":
    main()
