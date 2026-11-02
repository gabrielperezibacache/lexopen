import { handleRouteError, requireBillingManager } from "@/lib/api";
import { billingRelatedWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { OPEN_INVOICE_STATUSES } from "@/lib/billing";
import { loadBillingOverview } from "@/lib/billing-overview";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await requireBillingManager();
    const { month, kpis, recentInvoices, recentTime } = await loadBillingOverview(user);
    const openInvoices = await prisma.invoice.findMany({
      where: { AND: [scopedrelatedCausaWhere(user), { status: { in: [...OPEN_INVOICE_STATUSES] } }] },
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
