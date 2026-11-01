import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { plazoCreateSchema } from "@/lib/schemas";
import { publicUserSelect } from "@/lib/auth/public-user";
import { parseListLimit } from "@/lib/api/list-limit";
import { requestCommandKey } from "@/lib/command-execution";
import { plazoAccessWhere } from "@/lib/auth/causa-access";
import { createPlazoCommand, updatePlazoCommand, plazoStateSchema } from "@/lib/plazo-commands";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const limit = parseListLimit(req.nextUrl.searchParams.get("limit"), { default: 200, max: 500 });
    const plazos = await prisma.plazo.findMany({
      where: plazoAccessWhere(user), include: { causa: true, responsable: { select: publicUserSelect } },
      orderBy: { fechaLimite: "asc" }, take: limit,
    });
    return NextResponse.json(plazos);
  } catch (error) { return handleRouteError(error); }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, plazoCreateSchema);
    const plazo = await createPlazoCommand(user, body, requestCommandKey(req, "plazo.create"));
    return NextResponse.json(plazo, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, plazoStateSchema);
    const plazo = await updatePlazoCommand(user, body, requestCommandKey(req, "plazo.update"));
    return NextResponse.json(plazo);
  } catch (error) { return handleRouteError(error); }
}
