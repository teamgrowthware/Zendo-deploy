#!/usr/bin/env python3
"""Build downloads/ZendoCoin-Polygon_Mainnet.zip for a direct phone download."""

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = ROOT / "downloads" / ".zendocoin-polygon-staging"
OUTPUT = ROOT / "downloads" / "ZendoCoin-Polygon_Mainnet.zip"

PACKAGE = {
    "name": "zendocoin-polygon-mainnet",
    "private": True,
    "type": "module",
    "dependencies": {"ethers": "^6.15.0"},
}


def main() -> None:
    if STAGING.exists():
        shutil.rmtree(STAGING)
    STAGING.mkdir(parents=True)
    pairs = [
        (ROOT / "polygon" / "README.md", STAGING / "README.md"),
        (ROOT / "founders.json", STAGING / "founders.json"),
        (ROOT / "polygon" / "foundry.toml", STAGING / "foundry.toml"),
        (ROOT / "polygon" / "scripts" / "deploy.mjs", STAGING / "script" / "deploy.mjs"),
        (ROOT / "polygon" / "artifacts" / "ZendoCoinLaunch.json", STAGING / "artifacts" / "ZendoCoinLaunch.json"),
        (ROOT / "public" / "brand" / "zendocoin-logo.png", STAGING / "brand" / "zendocoin-logo.png"),
    ]
    for source, dest in pairs:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
    for folder in ("contracts", "test"):
        shutil.copytree(ROOT / "polygon" / folder, STAGING / folder)
    lib = ROOT / "polygon" / "lib" / "forge-std"
    if lib.exists():
        shutil.copytree(lib, STAGING / "lib" / "forge-std", ignore=shutil.ignore_patterns(".git"))
    (STAGING / "package.json").write_text(json.dumps(PACKAGE, indent=2) + "\n", encoding="utf-8")
    if OUTPUT.exists():
        OUTPUT.unlink()
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(STAGING.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(STAGING).as_posix())
    shutil.rmtree(STAGING)
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
