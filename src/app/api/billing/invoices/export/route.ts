import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireBillingManager } from "@/lib/api";
import {
  billingExportToCsv,
  billingExportToXml,
  buildBillingExportRows,
} from "@/lib/billing-export";
import { downloadResponseHeaders } from "@/lib/security/download";

/**
 * Export invoices as CSV/XML for external DTE providers.
 * Does not generate SII electronic DTEs.
 */
export async function GET(req: NextRequest) {
  try {
    await requireBillingManager();
    const format = (req.nextUrl.searchParams.get("format") || "csv").toLowerCase();
    if (format !== "csv" && format !== "xml") {
      return NextResponse.json(
        { error: "format debe ser csv o xml" },
        { status: 400 }
      );
    }
    const status = req.nextUrl.searchParams.get("status");
    const id = req.nextUrl.searchParams.get("id");

    const invoices = await prisma.invoice.findMany({
      where: {
        ...(id ? { id } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        cliente: { select: { rut: true, razonSocial: true } },
        causa: { select: { rit: true } },
      },
      orderBy: { issueDate: "desc" },
      take: 5000,
    });

    if (id && invoices.length === 0) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    const firm = await prisma.firmSettings.findFirst();
    const rows = buildBillingExportRows(invoices, {
      rut: firm?.emisorRut,
      razonSocial: firm?.emisorRazonSocial,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "xml") {
      const xml = billingExportToXml(rows);
      return new NextResponse(xml, {
        headers: downloadResponseHeaders(
          `lexopen-facturacion-${stamp}.xml`,
          "application/xml"
        ),
      });
    }

    const csv = billingExportToCsv(rows);
    return new NextResponse(csv, {
      headers: downloadResponseHeaders(
        `lexopen-facturacion-${stamp}.csv`,
        "text/csv"
      ),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
