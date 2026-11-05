#!/usr/bin/python3 -I
"""Exercise the installed tools offline with synthetic files as the desktop user."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import wave

from bs4 import BeautifulSoup
from docx import Document
from ebooklib import ITEM_DOCUMENT, epub
from openpyxl import Workbook, load_workbook
from pypdf import PdfReader


def run(*args, env=None):
    result = subprocess.run(args, check=True, text=True, capture_output=True, timeout=35, env=env)
    return result.stdout


def verify():
    assert os.geteuid() != 0, "The check must run as the desktop user"
    assert not pathlib.Path("/etc/sudoers.d/kitty").exists()
    for command in ("chromium", "soffice", "localc", "loimpress", "lodraw", "ffprobe"):
        assert shutil.which(command), f"Executable missing: {command}"

    with tempfile.TemporaryDirectory(prefix="lexopen-tools-") as temporary:
        root = pathlib.Path(temporary)
        paragraph = "Documento ficticio para verificar el escritorio"
        document = Document()
        document.add_heading("Informe", level=1)
        document.add_paragraph(paragraph)
        document.save(root / "fixture.docx")
        profile = (root / "office-profile").as_uri()
        run("soffice", f"-env:UserInstallation={profile}", "--headless", "--convert-to", "pdf",
            "--outdir", str(root), str(root / "fixture.docx"), env={**os.environ, "SAL_USE_VCLPLUGIN": "svp"})
        pdf = root / "fixture.pdf"
        run("qpdf", "--check", str(pdf))
        assert len(PdfReader(pdf).pages) == 1
        assert paragraph in run("pdftotext", str(pdf), "-")
        run("pdftoppm", "-f", "1", "-l", "1", "-r", "160", "-png", "-singlefile", str(pdf), str(root / "page"))
        assert {"eng", "spa"}.issubset(run("tesseract", "--list-langs").splitlines())
        recognized = run("tesseract", str(root / "page.png"), "stdout", "-l", "spa", "--psm", "3")
        assert "documento ficticio" in recognized.lower(), "OCR did not recover the synthetic text"

        table = Workbook()
        table.active.append(["Archivo", 1])
        table.save(root / "fixture.xlsx")
        with (root / "fixture.xlsx").open("rb") as stream:
            workbook = load_workbook(stream, read_only=True)
            try:
                assert workbook.active["A1"].value == "Archivo"
            finally:
                workbook.close()

        markdown = root / "fixture.md"
        markdown.write_text("# Informe\n\n" + paragraph + " [@ejemplo].\n", encoding="utf-8")
        bibliography = root / "fixture.bib"
        bibliography.write_text("@book{ejemplo,author={Torres, Ana},title={Lecturas de prueba},year={2026}}\n", encoding="utf-8")
        book_path = root / "fixture.epub"
        run("pandoc", str(markdown), "--citeproc", "--bibliography", str(bibliography),
            "--metadata", "title=Informe", "-o", str(book_path))
        book = epub.read_epub(str(book_path))
        chapters = " ".join(BeautifulSoup(chapter.get_content(), "html.parser").get_text()
                            for chapter in book.get_items_of_type(ITEM_DOCUMENT))
        assert paragraph in chapters and "Lecturas de prueba" in chapters
        assert paragraph in run("rg", "--fixed-strings", paragraph, str(markdown))

        with wave.open(str(root / "fixture.wav"), "wb") as recording:
            recording.setparams((1, 2, 8_000, 0, "NONE", "not compressed"))
            recording.writeframes(bytes(8_000))
        audio = root / "normalized.wav"
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(root / "fixture.wav"),
            "-ac", "1", "-ar", "16000", str(audio))
        with wave.open(str(audio), "rb") as recording:
            assert recording.getframerate() == 16_000 and recording.getnchannels() == 1

    print(json.dumps({"ok": True, "checks": ["docx", "libreoffice-pdf", "pdf-pages", "ocr-spa-eng",
                                             "xlsx", "epub", "bibliography", "local-search", "audio-16khz"]}))


if __name__ == "__main__":
    verify()
