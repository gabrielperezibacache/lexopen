import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireBillingManager } from "@/lib/api";
import { OPEN_INVOICE_STATUSES } from "@/lib/billing";
import { loadBillingOverview } from "@/lib/billing-overview";

export async function GET() {
  try {
    await requireBillingManager();
    const { month, kpis, recentInvoices, recentTime } = await loadBillingOverview();
    const openInvoices = await prisma.invoice.findMany({
      where: { status: { in: [...OPEN_INVOICE_STATUSES] } },
      include: { cliente: true, causa: true },
      orderBy: { issueDate: "desc" },
      take: 8,
    });

    return NextResponse.json({
      stats: {
        unbilledHours: kpis.unbilledHours,
        unbilledHonorarios: kpis.unbilledHonorarios,
        unbilledGastos: kpis.unbilledGastos,
        unbilledTimeCount: kpis.unbilledTimeCount,
        unbilledExpenseCount: kpis.unbilledExpenseCount,
        porCobrar: kpis.porCobrar,
        cobradoMes: kpis.cobradoMes,
        cobradoMesCount: kpis.cobradoMesCount,
        monthLabel: month.label,
        // Suma neta histórica (provisión − adeudo). El tablero muestra la provisión a favor.
        provisionTotal: kpis.netClp,
        provisionAFavorClp: kpis.provisionClp,
        adeudoCcClp: kpis.adeudoClp,
        openInvoiceCount: kpis.openInvoiceCount,
      },
      openInvoices,
      recentInvoices,
      recentTime,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
