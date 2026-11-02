import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireBillingManager,
} from "@/lib/api";
import { billingRelatedWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { createInvoice } from "@/lib/billing-invoices";
import { prisma } from "@/lib/db";
import { invoiceCreateSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const user = await requireBillingManager();
    const status = req.nextUrl.searchParams.get("status");
    const invoices = await prisma.invoice.findMany({
      where: { AND: [scopedrelatedCausaWhere(user), (status ? { status } : undefined) ?? {}] },
      include: {
        cliente: true,
        causa: true,
        author: { select: publicUserSelect },
        lines: true,
        payments: true,
        _count: { select: { timeEntries: true, expenses: true } },
      },
      orderBy: { issueDate: "desc" },
    });
    return NextResponse.json(invoices);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireBillingManager();
    const body = await parseBody(req, invoiceCreateSchema);
    const invoice = await createInvoice(user, body);

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
