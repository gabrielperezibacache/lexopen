"""Rebuild the fictional three-page native/scanned/blank evidence fixture."""
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image, ImageDraw, ImageFont
import reportlab

root = Path(__file__).parent
font = Path(reportlab.__file__).parent / "fonts" / "Vera.ttf"
pdfmetrics.registerFont(TTFont("FixtureVera", str(font)))
image = Image.new("RGB", (1600, 2000), "white")
draw = ImageDraw.Draw(image)
scan_font = ImageFont.truetype(str(font), 48)
draw.text((120, 180), "PAGINA DOS - DOCUMENTO ESCANEADO", font=scan_font, fill="black")
draw.text((120, 300), "HECHO FICTICIO: PAGO EL 12 DE MAYO DE 2025.", font=scan_font, fill="black")
draw.text((120, 420), "IMPORTE CONFIRMADO: 25000 PESOS.", font=scan_font, fill="black")
imgbytes=BytesIO();image.save(imgbytes, format="PNG");imgbytes.seek(0)
pdf = canvas.Canvas(str(root / "mixed-three-pages.pdf"), pagesize=(600, 750), invariant=1)
pdf.setTitle("LexOpen fictional PDF page evidence fixture")
pdf.setAuthor("LexOpen test fixture")
pdf.setFont("FixtureVera", 16)
pdf.drawString(50, 675, "Página uno: decisión, año y número 42.")
pdf.drawString(50, 645, "Este texto pertenece únicamente a la primera página.")
pdf.showPage()
pdf.drawImage(ImageReader(imgbytes),0,0,width=600,height=750)
pdf.showPage()
pdf.showPage()
pdf.save()
