import {
  deadlineCursorWhere,
  deadlineWindow,
  deadlineMonth,
  deadlineBefore,
} from "@/lib/deadlines/pagination";
import { deadlineVersion } from "@/lib/deadlines/completion";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { serializable } from "@/lib/command-execution";
import { santiagoDateKey } from "@/lib/chile-time";
import { httpError } from "@/lib/auth/access";
import { NextRequest, NextResponse } from "next/server";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { plazoCreateSchema } from "@/lib/schemas";
import { publicUserSelect } from "@/lib/auth/public-user";
import { parseListLimit } from "@/lib/api/list-limit";
import { requestCommandKey } from "@/lib/command-execution";
import { plazoAccessWhere } from "@/lib/auth/causa-access";
import {
  createPlazoCommand,
  updatePlazoCommand,
  plazoStateSchema,
} from "@/lib/plazo-commands";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const limit = parseListLimit(req.nextUrl.searchParams.get("limit"), {
      default: 200,
      max: 500,
    });
    const url = req.nextUrl;
    const state = url.searchParams.get("estado");
    if (
      state &&
      !["pendiente", "cumplido", "vencido", "suspendido"].includes(state)
    )
      throw httpError("Estado inválido", 400);
    const result = await serializable(async (tx) => {
      const actor = await currentStaffActor(user, tx),
        cause = url.searchParams.get("causaId"),
        q = (url.searchParams.get("q") || "").slice(0, 200),
        month = url.searchParams.get("mes");
      const where = {
        AND: [
          plazoAccessWhere(actor),
          ...(cause ? [{ causaId: cause }] : []),
          ...(q
            ? [{ titulo: { contains: q, mode: "insensitive" as const } }]
            : []),
          ...(state ? [{ estado: state }] : []),
          ...(month ? [deadlineMonth(month)] : []),
          ...(url.searchParams.get("vista") === "mis-vencidos"
            ? [
                { estado: "pendiente", responsableId: actor.id },
                deadlineBefore(santiagoDateKey(new Date())),
              ]
            : []),
        ],
      };
      const [rows, total] = await Promise.all([
        tx.plazo.findMany({
          where: {
            AND: [
              where,
              deadlineCursorWhere(url.searchParams.get("after") || undefined),
            ],
          },
          include: { causa: true, responsable: { select: publicUserSelect } },
          orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
          take: limit + 1,
        }),
        tx.plazo.count({ where }),
      ]);
      const window = deadlineWindow(rows, limit);
      return { ...window, total };
    });
    return NextResponse.json(
      result.items.map((row) => ({
        ...row,
        expectedVersion: deadlineVersion(row),
      })),
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Next-Cursor": result.next || "",
          "X-Total-Count": String(result.total),
        },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, plazoCreateSchema);
    const plazo = await createPlazoCommand(
      user,
      body,
      requestCommandKey(req, "plazo.create"),
    );
    return NextResponse.json(plazo, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, plazoStateSchema);
    const plazo = await updatePlazoCommand(
      user,
      body,
      requestCommandKey(req, "plazo.update"),
    );
    return NextResponse.json(
      { ...plazo, expectedVersion: deadlineVersion(plazo) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
