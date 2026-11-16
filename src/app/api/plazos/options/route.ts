import { NextResponse } from "next/server";
import { requireStaff, handleRouteError } from "@/lib/api";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { serializable } from "@/lib/command-execution";
import { causaAccessWhere, documentReadWhere } from "@/lib/auth/causa-access";
import { listCursorWhere, listWindow } from "@/lib/api/list-window";
export async function GET(req: Request) {
  try {
    const user = await requireStaff(),
      u = new URL(req.url),
      q = (u.searchParams.get("q") || "").trim().slice(0, 200),
      causeId = u.searchParams.get("causaId") || null;
    const result = await serializable(async (tx) => {
      const actor = await currentStaffActor(user, tx);
      if (u.searchParams.get("kind") === "document") {
        const rows = await tx.documento.findMany({
          where: {
            AND: [
              documentReadWhere(actor),
              { causaId: causeId },
              ...(q
                ? [{ nombre: { contains: q, mode: "insensitive" as const } }]
                : []),
              listCursorWhere(
                u.searchParams.get("after") || undefined,
                "updatedAt",
              ),
            ],
          },
          select: { id: true, nombre: true, version: true, updatedAt: true },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 31,
        });
        const window = listWindow(rows, 30, "updatedAt");
        return {
          items: window.items.map((r) => ({
            id: r.id,
            label: r.nombre,
            version: r.version,
          })),
          next: window.next,
        };
      }
      const rows = await tx.causa.findMany({
        where: {
          AND: [
            causaAccessWhere(actor),
            ...(q
              ? [
                  {
                    OR: [
                      { titulo: { contains: q, mode: "insensitive" as const } },
                      { rit: { contains: q, mode: "insensitive" as const } },
                    ],
                  },
                ]
              : []),
            listCursorWhere(
              u.searchParams.get("after") || undefined,
              "updatedAt",
            ),
          ],
        },
        select: { id: true, titulo: true, rit: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 31,
      });
      const window = listWindow(rows, 30, "updatedAt");
      return {
        items: window.items.map((r) => ({
          id: r.id,
          label: [r.rit, r.titulo].filter(Boolean).join(" · "),
        })),
        next: window.next,
      };
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
