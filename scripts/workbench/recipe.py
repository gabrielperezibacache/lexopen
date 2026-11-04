"""Controlled, offline document recipe. No evaluation, subprocesses, network or plugins."""
import json
import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

VERSION = "lexopen-documents-1"


def build(data, output):
    if data.get("version") != 1 or set(data) != {"version", "title", "body", "sources"}:
        raise ValueError("Unsupported recipe input")
    title, body, sources = data["title"], data["body"], data["sources"]
    if not isinstance(title, str) or not 1 <= len(title) <= 200 or not isinstance(body, str) or len(body) > 100000 or not 1 <= len(sources) <= 8:
        raise ValueError("Input exceeds recipe limits")
    # Remove XML-illegal controls; text is never interpreted as code, HTML or instructions.
    clean = lambda value: re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff]", "", value)
    lines = ["# " + clean(title), "", "Borrador para revisión profesional.", "", clean(body), "", "## Fuentes seleccionadas", ""]
    for index, source in enumerate(sources, 1):
        if set(source) != {"marker", "title", "quote", "href", "versionId", "sourceSha256"} or source["marker"] != "R" + str(index):
            raise ValueError("Invalid source")
        if not source["href"].startswith("/") or source["href"].startswith("//") or not re.fullmatch(r"[a-f0-9]{64}", source["sourceSha256"]):
            raise ValueError("Invalid source provenance")
        lines += ["[^" + source["marker"] + "]: " + clean(source["title"]), "", "> " + clean(source["quote"]).replace("\n", "\n> "), "", "Versión: " + source["versionId"], "SHA-256 del original: " + source["sourceSha256"], "Fuente en LexOpen: " + clean(source["href"]), ""]
    markdown = "\n".join(lines).strip() + "\n"
    output.mkdir(parents=True, exist_ok=True)
    output.joinpath("borrador.md").write_text(markdown, encoding="utf-8")
    ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    paragraphs = []
    for line in markdown.splitlines():
        style = 'Heading1' if line.startswith("# ") else 'Heading2' if line.startswith("## ") else 'Normal'
        text = line.lstrip("# ") if style != 'Normal' else line
        reference = re.match(r"^\[\^(R[0-9]+)\]:\s*(.*)", text)
        if reference:
            text, style = reference[1] + ". " + reference[2], 'Heading2'
        text = re.sub(r"\[\^(R[0-9]+)\]", r"[\1]", text)
        quote_style = '<w:ind w:left="360"/>' if text.startswith("> ") else ''
        if quote_style:
            text = text[2:]
        keep = '<w:keepNext/>' if style.startswith('Heading') else ''
        paragraphs.append('<w:p><w:pPr><w:pStyle w:val="' + style + '"/>' + keep + quote_style + '</w:pPr><w:r><w:t xml:space="preserve">' + escape(text) + '</w:t></w:r></w:p>')
    document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + ns + '><w:body>' + ''.join(paragraphs) + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body></w:document>'
    parts = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml": document,
        "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        "word/styles.xml": '<?xml version="1.0" encoding="UTF-8"?><w:styles ' + ns + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>',
    }
    with zipfile.ZipFile(output / "borrador.docx", "w", zipfile.ZIP_DEFLATED) as archive:
        for name, value in parts.items():
            archive.writestr(name, value.encode("utf-8"))


if __name__ == "__main__":
    source = Path("/input/input.json")
    if source.stat().st_size > 250000:
        raise ValueError("Oversized input")
    build(json.loads(source.read_text(encoding="utf-8")), Path("/output"))
