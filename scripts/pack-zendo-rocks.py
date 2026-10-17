#!/usr/bin/env python3
"""Build the ZendoRocks2026 release zip: binary, configs, and docs."""

import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "downloads" / "ZendoRocks2026.zip"


def main() -> None:
    subprocess.check_call(
        ["cargo", "build", "--release", "--manifest-path", str(ROOT / "zendo-chain" / "Cargo.toml"), "--offline"],
        cwd=ROOT,
    )
    binary = ROOT / "zendo-chain" / "target" / "release" / "zendo-chain"
    if not binary.is_file():
        raise SystemExit("zendo-chain binary missing")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(binary, "bin/zendo-chain")
        for path in (ROOT / "zendo-chain" / "config").glob("*"):
            if path.is_file():
                archive.write(path, f"config/{path.name}")
        archive.write(ROOT / "zendo-chain" / "README.md", "README.md")
        archive.write(ROOT / "SECURITY.md", "SECURITY.md")
        example = ROOT / "zendo-chain" / "config" / "external-assets.json"
        archive.write(example, "config/external-assets.example.json")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
