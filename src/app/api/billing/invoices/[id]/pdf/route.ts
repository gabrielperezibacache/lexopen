import { handleRouteError, requireBillingManager } from "@/lib/api";
import { billingRelatedWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { renderInvoiceHtml } from "@/lib/billing-pdf";
import { prisma } from "@/lib/db";
import { downloadResponseHeaders } from "@/lib/security/download";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireBillingManager();
    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { AND: [scopedrelatedCausaWhere(user), { id }] },
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

    // text/html is not inline-safe → attachment + nosniff (avoids XSS via HTML body).
    return new NextResponse(html, {
      headers: downloadResponseHeaders(`${invoice.number}.html`, "text/html"),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
