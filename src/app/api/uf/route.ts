import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError, parseBody, requireRole, requireStaff } from "@/lib/api";
import { parseLocalDateInput } from "@/lib/minutas";

export async function GET() {
  try {
    await requireStaff();
    const rates = await prisma.ufRate.findMany({
      orderBy: { date: "desc" },
      take: 60,
    });
    const latest = rates[0] || null;
    return NextResponse.json({ latest, rates });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("admin", "abogado");
    const body = await parseBody(
      req,
      z.object({
        date: z.string(),
        valueClp: z.number().int().positive(),
        source: z.string().optional(),
      })
    );
    const date = parseLocalDateInput(body.date);
    if (!date) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    const row = await prisma.ufRate.upsert({
      where: { date },
      create: {
        date,
        valueClp: body.valueClp,
        source: body.source || "manual",
      },
      update: { valueClp: body.valueClp, source: body.source || "manual" },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function ufToClp(amountUf: number, onDate = new Date()) {
  const day = new Date(onDate.getFullYear(), onDate.getMonth(), onDate.getDate(), 12);
  const rate = await prisma.ufRate.findFirst({
    where: { date: { lte: day } },
    orderBy: { date: "desc" },
  });
  if (!rate) return null;
  return Math.round(amountUf * rate.valueClp);
}
