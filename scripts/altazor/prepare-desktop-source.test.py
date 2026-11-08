"""Offline checks of the source bundle; this does not build a container image."""
import hashlib
import ast
import base64
import importlib.util
import io
import json
import re
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("desktop_source", Path(__file__).with_name("prepare-desktop-source.py"))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class DesktopSourceTests(unittest.TestCase):
    def test_branding_is_selected_and_bundled_with_the_exact_approved_asset(self):
        fixture = {
            "Dockerfile": (b"FROM fixture\nCOPY fonts/ /tmp/fonts/\n"
                           b'RUN for f in /tmp/fonts/*.woff2; do woff2_decompress "$f"; done && mv /tmp/fonts/*.ttf /out/fonts/\n'
                           b"COPY --from=extras /out/fonts/ /usr/share/fonts/truetype/kitties/\n", 0o644),
            "licenses/desktop-original.txt": (b"Synthetic source license fixture\n", 0o644),
            "kitty-page.py": (b'READ_JS = r"""(() => ({text: "old fixture"}))()"""\n\n# Finds the element to act on:\nclass Page:\n    def __init__(self):\n        self.id = 0\n\n    def call(self, method, **params):\n        return {}\n', 0o755),
        }
        original_recipe = fixture["Dockerfile"][0]
        with tempfile.TemporaryDirectory(prefix="lexopen-wallpaper-test-") as temporary, patch.object(source, "source_files", return_value=fixture):
            output = Path(temporary) / "bundle"
            manifest = source.prepare_desktop_source(Path(temporary), output)
            archive = (output / "context.tar.gz").read_bytes()
            self.assertEqual(manifest["sha256"], hashlib.sha256(archive).hexdigest())
            self.assertEqual(manifest["profile"], source.PROFILE["id"])
            with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as bundle:
                wallpaper = bundle.extractfile(".lexopen-desktop-profile/wallpaper.png").read()
                expected = (source.REPO / "public/branding/lexopen-desktop-midnight-2560.png").read_bytes()
                self.assertEqual(wallpaper, expected)
                self.assertEqual(wallpaper[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual((int.from_bytes(wallpaper[16:20], "big"), int.from_bytes(wallpaper[20:24], "big")), (2560, 1600))
                config = bundle.extractfile(".lexopen-desktop-profile/desktop-items-0.conf").read().decode()
                self.assertIn("wallpaper=/usr/share/backgrounds/lexopen/midnight.png\n", config)
                recipe = bundle.extractfile("Dockerfile").read().decode()
                self.assertIn("/home/kitty/.config/pcmanfm/default/desktop-items-0.conf", recipe)
                self.assertIn("/usr/share/backgrounds/lexopen/midnight.png", recipe)
                self.assertIn("/usr/local/lib/lexopen-reading/reading.py", recipe)
                self.assertIn("/usr/local/bin/lexopen-read", recipe)
                self.assertEqual(bundle.extractfile(".lexopen-desktop-profile/reading.py").read(), (source.RECIPE / "reading.py").read_bytes())
                self.assertEqual(bundle.extractfile(".lexopen-desktop-profile/browser-read.js").read(), (source.RECIPE / "browser-read.js").read_bytes())
                adapted = bundle.extractfile("kitty-page.py").read().decode()
                ast.parse(adapted)
                self.assertIn("reader.active_page()", adapted)
                self.assertIn("[redacted]", adapted)
                self.assertNotIn("old fixture", adapted)
                self.assertNotIn("COPY fonts/", recipe)
                self.assertEqual(bundle.extractfile("licenses/desktop-original.txt").read(), fixture["licenses/desktop-original.txt"][0])
                self.assertEqual(bundle.extractfile("licenses/original.Dockerfile").read(), original_recipe)
                self.assertEqual(bundle.extractfile("licenses/lexopen.txt").read(), (source.REPO / "LICENSE").read_bytes())
                self.assertEqual(json.loads((output / "manifest.json").read_text()), manifest)

    def test_signature_is_unchanged_and_both_desktop_resolutions_exist(self):
        signature = (source.REPO / "public/icons/lexopen-logo.png").read_bytes()
        svg = (source.REPO / "public/branding/lexopen-desktop-midnight.svg").read_text()
        embedded = re.findall(r'data:image/png;base64,([A-Za-z0-9+/=]+)', svg)
        self.assertEqual(len(embedded), 1)
        self.assertEqual(base64.b64decode(embedded[0], validate=True), signature)
        self.assertIn(hashlib.sha256(signature).hexdigest(), svg)
        for width, height in ((1280, 800), (2560, 1600)):
            wallpaper = (source.REPO / f"public/branding/lexopen-desktop-midnight-{width}.png").read_bytes()
            self.assertEqual(wallpaper[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual((int.from_bytes(wallpaper[16:20], "big"), int.from_bytes(wallpaper[20:24], "big")), (width, height))

    def test_wrong_upstream_revision_is_rejected_before_archiving(self):
        with patch.object(source.subprocess, "check_output", return_value="not-the-pinned-commit\n") as command:
            with self.assertRaisesRegex(ValueError, "pinned commit"):
                source.source_files(Path("fixture"), source.PROFILE["sourceCommit"])
            self.assertEqual(command.call_count, 1)


if __name__ == "__main__":
    unittest.main()
