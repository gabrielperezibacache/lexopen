import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";
import { renderInvoiceHtml } from "@/lib/billing-pdf";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { cliente: true, causa: true, lines: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    const firm = await prisma.firmSettings.findFirst();
    const html = renderInvoiceHtml({
      number: invoice.number,
      tipoDocumento: invoice.tipoDocumento,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      emisor: {
        razonSocial: firm?.emisorRazonSocial || "Estudio LexOpen",
        rut: firm?.emisorRut || null,
        giro: firm?.emisorGiro || "Servicios jurídicos",
        direccion: firm?.emisorDireccion || null,
      },
      cliente: invoice.cliente,
      causa: invoice.causa,
      lines: invoice.lines,
      subtotalClp: invoice.subtotalClp,
      ivaClp: invoice.ivaClp,
      retencionClp: invoice.retencionClp,
      totalClp: invoice.totalClp,
      notes: invoice.notes,
      glosa: invoice.glosa,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${invoice.number}.html"`,
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
