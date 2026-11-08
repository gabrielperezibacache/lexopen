#!/usr/bin/env python3
"""Package the pinned desktop's build sources without copying a local checkout."""
import argparse
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
import sys
from pathlib import Path, PurePosixPath


RECIPE = Path(__file__).resolve().parent / "desktop-profile"
REPO = RECIPE.parents[2]
DESKTOP = PurePosixPath("docker/kitty-desktop")
PROFILE = json.loads((REPO / "desktop/altazor-desktop-profile.json").read_text(encoding="utf-8"))
MAX_BYTES = 20 * 1024 * 1024


def source_files(checkout, revision):
    actual = subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip()
    if actual != revision:
        raise ValueError("The desktop checkout does not match its pinned commit")
    archive = subprocess.check_output(["git", "-C", str(checkout), "archive", "--format=tar", revision, "--", "LICENSE", str(DESKTOP)])
    if len(archive) > MAX_BYTES:
        raise ValueError("The desktop source archive exceeds the allowed size")
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as source:
        for member in source:
            if member.isdir():
                continue
            if not member.isfile() or ".." in PurePosixPath(member.name).parts:
                raise ValueError("Unexpected entry in desktop sources")
            original = PurePosixPath(member.name)
            if original == PurePosixPath("LICENSE"):
                name = "licenses/desktop-original.txt"
            else:
                relative = original.relative_to(DESKTOP)
                if relative.parts[0] == "fonts":
                    continue
                name = relative.as_posix()
            if name in files:
                raise ValueError("Duplicate entry in desktop sources")
            files[name] = (source.extractfile(member).read(), member.mode)
    return files


def prepare_desktop_source(checkout, output, profile=PROFILE):
    files = source_files(checkout, profile["sourceCommit"])
    sys.path.insert(0, str(RECIPE))
    from adapt_desktop import adapt_page
    files['kitty-page.py'] = (adapt_page(files['kitty-page.py'][0].decode('utf-8')).encode(), 0o755)
    original, _ = files["Dockerfile"]
    if not files["licenses/desktop-original.txt"][0]:
        raise ValueError("Missing original desktop source license")
    recipe = original.decode("utf-8")
    # Use system fonts already present in Debian. The original font binaries
    # are separate works and the pinned desktop tree omits their license files.
    font_steps = [
        "COPY fonts/ /tmp/fonts/\n",
        'RUN for f in /tmp/fonts/*.woff2; do woff2_decompress "$f"; done && mv /tmp/fonts/*.ttf /out/fonts/\n',
        "COPY --from=extras /out/fonts/ /usr/share/fonts/truetype/kitties/\n",
    ]
    for step in font_steps:
        if recipe.count(step) != 1:
            raise ValueError("Original desktop recipe changed. Review font and source licensing")
        recipe = recipe.replace(step, "", 1)
    recipe = "# Desktop recipe modified by LexOpen on 2026-11-05. See licenses/changes.txt.\n" + recipe
    files["Dockerfile"] = (recipe.encode() + b"\n" + (RECIPE / "Dockerfile.suffix").read_bytes(), 0o644)
    for name in ("check.py", "managed-install.sh", "reading.py", "browser-read.js", "desktop-items-0.conf"):
        files[f".lexopen-desktop-profile/{name}"] = ((RECIPE / name).read_bytes(), 0o644)
    files[".lexopen-desktop-profile/wallpaper.png"] = ((REPO / "public/branding/lexopen-desktop-midnight-2560.png").read_bytes(), 0o644)
    files["licenses/original.Dockerfile"] = (original, 0o644)
    files["licenses/lexopen.txt"] = ((REPO / "LICENSE").read_bytes(), 0o644)
    files["licenses/changes.txt"] = (
        (f"Original desktop source revision {profile['sourceCommit']}\n"
         "Recipe modified by LexOpen on 2026-11-05. The original license and Dockerfile are retained here.\n"
         "This context includes the desktop source recipe and scripts. It substitutes Debian system fonts and adds\n"
         "office tools, OCR, PDF inspection, audio conversion, the LexOpen wallpaper and a local smoke check. Docker fetches dependencies\n"
         "during the local build. This context does not contain a compiled desktop image or gateway.\n").encode(),
        0o644,
    )

    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, filename="", mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as context:
            for name, (data, mode) in sorted(files.items()):
                entry = tarfile.TarInfo(name)
                entry.mode = 0o755 if mode & 0o111 else 0o644
                entry.size = len(data)
                context.addfile(entry, io.BytesIO(data))
    data = buffer.getvalue()
    if not 0 < len(data) <= MAX_BYTES:
        raise ValueError("Invalid desktop context size")
    manifest = {
        "format": 1, "profile": profile["id"], "sourceCommit": profile["sourceCommit"],
        "lumenCommit": profile["windowManagerCommit"], "file": "context.tar.gz",
        "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
    }
    output.mkdir(parents=True, exist_ok=False)
    (output / manifest["file"]).write_bytes(data)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkout", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare_desktop_source(args.checkout, args.output)))
