#!/usr/bin/env python3
"""Package only the public LexOpen pages with web-server readable Unix modes."""
import argparse
import hashlib
from pathlib import Path
import stat
import zipfile


PUBLIC_FILES = (
    "index.html", "privacidad/index.html", "styles.css",
    "assets/OFL-Fraunces.txt", "assets/OFL-Sora.txt", "assets/altazor.png",
    "assets/escritorio.png", "assets/fraunces-latin.woff2", "assets/lector.png",
    "assets/lexopen.png", "assets/sora-latin.woff2",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1] / "docs/perezibacache-site/lexopen"
    payloads = {}
    for relative in PUBLIC_FILES:
        path = source / relative
        path.resolve().relative_to(source.resolve())
        if not path.is_file() or any(p.is_symlink() for p in (path, *path.parents)):
            raise ValueError("Only regular public source files may be packaged")
        payloads["lexopen/" + relative] = path.read_bytes()
    directories = {"lexopen/", "lexopen/assets/", "lexopen/privacidad/"}
    with zipfile.ZipFile(args.output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted({**dict.fromkeys(directories, b""), **payloads}.items()):
            entry = zipfile.ZipInfo(name)
            entry.create_system = 3
            is_directory = name in directories
            mode = (stat.S_IFDIR | 0o755) if is_directory else (stat.S_IFREG | 0o644)
            entry.external_attr = (mode << 16) | (0x10 if is_directory else 0)
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, data)
    with zipfile.ZipFile(args.output) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive integrity check failed")
        for name, data in payloads.items():
            if archive.read(name) != data:
                raise ValueError("Public source changed while packaging")
    print(f"{args.output}: {len(payloads)} public files, Unix 0644/0755, "
          f"SHA-256 {hashlib.sha256(args.output.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
