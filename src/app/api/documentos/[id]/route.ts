import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { documentoUpdateSchema } from "@/lib/schemas";
import { documentoListSelect } from "@/lib/sites/file-select";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { executeCommand, requestCommandKey } from "@/lib/command-execution";
import { loadFileSource, authorizeFileWrite } from "@/lib/offline/file-sources";
import { retainDocument, authorizeFileFlags } from "@/lib/offline/file-service";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
type Params = { params: Promise<{ id: string }> };
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req); const user = await requireStaff(), { id } = await params, body = await parseBody(req, documentoUpdateSchema);
    const result = await executeCommand({ key: requestCommandKey(req, "documento.update"), ownerId: user.id, input: { id, body },
      authorize: async tx => { const actor = await currentStaffActor(user, tx); await authorizeFileWrite(await loadFileSource("documento", id, actor, tx), actor, tx); },
      run: async tx => {
        const actor = await currentStaffActor(user, tx), source = await loadFileSource("documento", id, actor, tx); if (source.kind !== "documento") throw httpError("Documento no encontrado", 404);
        if (body.expectedVersion !== undefined && source.row.version !== body.expectedVersion) throw httpError("El documento cambió en otra sesión; conserve la clasificación y compare las versiones", 409);
        await authorizeFileFlags({ name: source.row.nombre, type: source.row.tipo, path: source.row.ruta, tags: "", confidential: body.confidencial ?? source.row.confidencial, privileged: body.privilegio ?? source.row.privilegio }, actor, source, tx, undefined, true);
        await retainDocument(source, tx);
        const { expectedVersion: _version, ...data } = body;
        const row = await tx.documento.update({ where: { id, version: source.row.version, updatedAt: source.row.updatedAt }, data: { ...data, version: { increment: 1 } }, select: documentoListSelect });
        await writeAuditStrict({ actorId: actor.id, action: "documento.update", entityType: "Documento", entityId: id, before: { version: source.row.version }, after: { ...data, version: row.version, expectedVersion: _version } }, tx);
        return { id };
      },
    });
    const { prisma } = await import("@/lib/db"); return NextResponse.json(await prisma.documento.findUniqueOrThrow({ where: { id: result.id }, select: documentoListSelect }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return handleRouteError(e); }
}
