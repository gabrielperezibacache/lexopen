import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const unbilled = req.nextUrl.searchParams.get("unbilled");
    const expenses = await prisma.expense.findMany({
      where: unbilled === "1" ? { billable: true, billed: false } : undefined,
      include: { author: true, causa: true, cliente: true },
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
    const user = await requireStaff();
    const body = await req.json();
    const expense = await prisma.expense.create({
      data: {
        date: body.date ? new Date(body.date) : new Date(),
        description: body.description,
        category: body.category || "otro",
        amountClp: Number(body.amountClp),
        billable: body.billable !== false,
        reimbursable: body.reimbursable !== false,
        vendor: body.vendor || null,
        authorId: user.id,
        clienteId: body.clienteId || null,
        causaId: body.causaId || null,
      },
      include: { author: true, causa: true, cliente: true },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
