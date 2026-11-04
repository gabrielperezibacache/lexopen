"""Local structural recipe verification. This is not a Docker or desktop test."""
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree
from recipe import build


class RecipeTest(unittest.TestCase):
    def test_real_docx_and_unicode_without_macros(self):
        with tempfile.TemporaryDirectory(prefix="lexopen-recipe-test-") as directory:
            output = Path(directory)
            build({"version": 1, "title": "Análisis ficticio", "body": "Información y revisión <texto> [^R1]", "sources": [{"marker": "R1", "title": "Fuente ficticia", "quote": "Cita de prueba.", "href": "/documentos/ficticio/fuentes", "versionId": "v1", "sourceSha256": "a" * 64}]}, output)
            self.assertEqual(sorted(p.name for p in output.iterdir()), ["borrador.docx", "borrador.md"])
            self.assertIn("Información y revisión", (output / "borrador.md").read_text())
            with zipfile.ZipFile(output / "borrador.docx") as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), {"[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml"})
                for name in archive.namelist():
                    ElementTree.fromstring(archive.read(name))
                self.assertIn("Información y revisión", archive.read("word/document.xml").decode())
                self.assertNotIn("vbaProject", str(archive.namelist()))

    def test_refuses_unbounded_input(self):
        with tempfile.TemporaryDirectory(prefix="lexopen-recipe-test-") as directory:
            with self.assertRaises(ValueError):
                build({"version": 1, "title": "Prueba", "body": "x" * 100001, "sources": [{}]}, Path(directory))


if __name__ == "__main__":
    unittest.main()
