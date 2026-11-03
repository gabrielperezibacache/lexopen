import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireStaff, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { actorFor } from "@/lib/books/access";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import type { AudienceHubCatalog, AudienceHubWorkspace } from "@/lib/hearings/hub-types";

const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["active", "closed", "all"]).default("active"),
  after: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
}).strict();
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const causeSelect = { id: true, titulo: true, rit: true, tribunal: true } as const;

export async function GET(request: Request) {
  try {
    const user = await requireStaff();
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const data = await prisma.$transaction(async tx => {
      const actor = await actorFor(user, tx), now = new Date();
      const search: Prisma.CausaWhereInput = query.q ? { OR: [
        { titulo: { contains: query.q, mode: "insensitive" } },
        { rit: { contains: query.q, mode: "insensitive" } },
        { tribunal: { contains: query.q, mode: "insensitive" } },
      ] } : {};
      const accessible = causaAccessWhere(actor);
      const scope: Prisma.HearingWorkspaceWhereInput = { ownerId: actor.id, causa: accessible };
      if (query.after && !await tx.hearingWorkspace.findFirst({ where: { ...scope, id: query.after }, select: { id: true } })) throw httpError("La página de mesas ya no está disponible", 404);
      const [rows, causes] = await Promise.all([
        tx.hearingWorkspace.findMany({
          where: { ...scope, ...(query.status === "active" ? { status: { in: ["preparation", "live"] } } : query.status === "closed" ? { status: "closed" } : {}), ...(query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { causa: search }] } : {}) },
          select: { id: true, title: true, status: true, scheduledFor: true, updatedAt: true, causa: { select: causeSelect }, liveState: { select: { phase: true } } },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 51,
          ...(query.after ? { cursor: { id: query.after }, skip: 1 } : {}),
        }),
        tx.causa.findMany({
          where: { AND: [accessible, search] },
          select: { ...causeSelect, abogadoId: true, miembros: { where: { userId: actor.id, desde: { lte: now }, OR: [{ hasta: null }, { hasta: { gt: now } }] }, select: { rol: true }, take: 1 } },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 41,
        }),
      ]);
      return {
        workspaces: rows.slice(0, 50).map(row => ({ id: row.id, title: row.title, status: row.status as AudienceHubWorkspace["status"], scheduledFor: row.scheduledFor?.toISOString() || null, updatedAt: row.updatedAt.toISOString(), livePhase: (row.liveState?.phase || "idle") as AudienceHubWorkspace["livePhase"], causa: row.causa })),
        causas: causes.slice(0, 40).map(row => ({ id: row.id, titulo: row.titulo, rit: row.rit, tribunal: row.tribunal, canWrite: can(actor, "causa.write", { causaRol: row.miembros[0]?.rol || (row.abogadoId === actor.id ? "responsable" : null) }) })),
        nextAfter: rows.length > 50 ? rows[49].id : null,
        limited: { workspaces: rows.length > 50, causas: causes.length > 40 },
      } satisfies AudienceHubCatalog;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
    return NextResponse.json(data, { headers });
  } catch (error) { const response = handleRouteError(error); for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
}
