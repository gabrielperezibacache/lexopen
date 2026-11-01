import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireBillingManager,
} from "@/lib/api";
import { assertBillingCausa, causaAccessWhere as scopedcausaAccessWhere, billingRelatedWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { prisma } from "@/lib/db";
import { expenseCreateSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const user = await requireBillingManager();
    const unbilled = req.nextUrl.searchParams.get("unbilled");
    const expenses = await prisma.expense.findMany({
      where: { AND: [scopedrelatedCausaWhere(user), (unbilled === "1" ? { billable: true, billed: false } : undefined) ?? {}] },
      include: { author: { select: publicUserSelect }, causa: true, cliente: true },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(expenses);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireBillingManager();
    const body = await parseBody(req, expenseCreateSchema);
    await assertBillingCausa(user, body.causaId, "billing.manage");
    if (body.causaId && body.clienteId) {
      const causa = await prisma.causa.findFirst({
        where: { AND: [scopedcausaAccessWhere(user), { id: body.causaId }] },
        select: { clienteId: true },
      });
      if (!causa) {
        return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
      }
      if (causa.clienteId && causa.clienteId !== body.clienteId) {
        return NextResponse.json(
          { error: "La causa no pertenece al cliente indicado" },
          { status: 400 }
        );
      }
    }
    const expense = await prisma.expense.create({
      data: {
        date: body.date ? new Date(body.date) : new Date(),
        description: body.description,
        category: body.category || "otro",
        amountClp: body.amountClp,
        billable: body.billable !== false,
        reimbursable: body.reimbursable !== false,
        vendor: body.vendor || null,
        authorId: user.id,
        clienteId: body.clienteId || null,
        causaId: body.causaId || null,
      },
      include: { author: { select: publicUserSelect }, causa: true, cliente: true },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
