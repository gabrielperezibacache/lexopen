import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("clienteId");
  const entries = await prisma.ledgerEntry.findMany({
    where: clienteId ? { clienteId } : undefined,
    include: { cliente: true, causa: true, invoice: true, payment: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  // Saldos por cliente
  const all = await prisma.ledgerEntry.findMany({
    orderBy: [{ clienteId: "asc" }, { date: "asc" }, { createdAt: "asc" }],
    include: { cliente: true },
  });
  const balances = new Map<string, { clienteId: string; nombre: string; balanceClp: number }>();
  for (const e of all) {
    balances.set(e.clienteId, {
      clienteId: e.clienteId,
      nombre: e.cliente.razonSocial,
      balanceClp: e.balanceClp,
    });
  }

  return NextResponse.json({
    entries,
    balances: [...balances.values()],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const debitClp = Number(body.debitClp || 0);
  const creditClp = Number(body.creditClp || 0);

  const last = await prisma.ledgerEntry.findFirst({
    where: { clienteId: body.clienteId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const prev = last?.balanceClp ?? 0;
  const balanceClp = prev - debitClp + creditClp;

  const entry = await prisma.ledgerEntry.create({
    data: {
      date: body.date ? new Date(body.date) : new Date(),
      tipo: body.tipo || "provision",
      description: body.description,
      debitClp,
      creditClp,
      balanceClp,
      clienteId: body.clienteId,
      causaId: body.causaId || null,
    },
    include: { cliente: true, causa: true },
  });
  return NextResponse.json(entry, { status: 201 });
}
