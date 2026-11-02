import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireBillingManager,
} from "@/lib/api";
import { paymentCreateSchema } from "@/lib/schemas";
import { requestCommandKey } from "@/lib/command-execution";
import { createPaymentCommand } from "@/lib/billing-payments";
import { billingRelatedWhere } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";

export async function GET() {
  try {
    const user = await requireBillingManager();
    const scope = billingRelatedWhere(user);
    const payments = await prisma.payment.findMany({
      where: Object.keys(scope).length ? { OR: [...(can(user, "billing.manage") ? [{ invoiceId: null }] : []), { invoice: scope }] } : {},
      include: { cliente: true, invoice: true },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(payments);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireBillingManager();
    const body = await parseBody(req, paymentCreateSchema);
    const payment = await createPaymentCommand(user, body, requestCommandKey(req, "billing.payment.create"));

    return NextResponse.json(payment, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
