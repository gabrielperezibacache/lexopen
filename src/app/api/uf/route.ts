import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireRole, requireStaff } from "@/lib/api";
import { parseLocalDateInput } from "@/lib/minutas";

type MindicadorUf = {
  serie?: Array<{ fecha: string; valor: number }>;
};

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
    assertCsrf(req);
    await requireRole("admin", "abogado");
    const raw = await req.json().catch(() => ({}));
    if (raw.action === "sync-mindicador") {
      let data: MindicadorUf;
      try {
        const res = await fetch("https://mindicador.cl/api/uf", {
          headers: { accept: "application/json" },
          next: { revalidate: 0 },
        });
        if (!res.ok) throw new Error(`mindicador.cl respondió ${res.status}`);
        data = (await res.json()) as MindicadorUf;
      } catch (e) {
        return NextResponse.json(
          { error: `No se pudo sincronizar UF desde mindicador.cl: ${e instanceof Error ? e.message : "error desconocido"}` },
          { status: 502 }
        );
      }
      const latest = data.serie?.[0];
      if (!latest?.fecha || typeof latest.valor !== "number") {
        return NextResponse.json({ error: "mindicador.cl no entregó una UF válida" }, { status: 502 });
      }
      const date = parseLocalDateInput(latest.fecha.slice(0, 10)) || new Date(latest.fecha);
      const valueClp = Math.round(latest.valor);
      const row = await prisma.ufRate.upsert({
        where: { date },
        create: { date, valueClp, source: "mindicador.cl" },
        update: { valueClp, source: "mindicador.cl" },
      });
      return NextResponse.json(row, { status: 201 });
    }
    const body = z
      .object({
        date: z.string(),
        valueClp: z.number().int().positive(),
        source: z.string().optional(),
      })
      .parse(raw);
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
