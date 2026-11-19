import { assertPjudManagementEnabled } from "@/lib/causas/management-mode";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { assertCausaCapability as mutateCausa, assertCausaAccess as readCausa, causaAccessWhere as scopedcausaAccessWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import {
  getCausaDocImportStatus,
  startCausaDocImport,
  processManualDocumentImport,
} from "@/lib/pjud/import-causa-documents";
import { privatePjudJson, privatePjudResponse } from "@/lib/pjud/private-response";
import { after, NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    await assertPjudManagementEnabled();
    const { id } = await params;
    await readCausa(id, user);
    const causa = await prisma.causa.findFirst({
      where: { AND: [scopedcausaAccessWhere(user), { id }] },
      select: { id: true },
    });
    if (!causa) {
      return privatePjudJson({ error: "Causa no encontrada" }, { status: 404 });
    }
    return privatePjudJson({ status: await getCausaDocImportStatus(id) });
  } catch (e) {
    return privatePjudResponse(handleRouteError(e));
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    await assertPjudManagementEnabled();
    const { id } = await params;
    await mutateCausa(id, user, "causa.write");
    const causa = await prisma.causa.findFirst({
      where: { AND: [scopedcausaAccessWhere(user), { id }] },
      select: { id: true },
    });
    if (!causa) {
      return privatePjudJson({ error: "Causa no encontrada" }, { status: 404 });
    }

    const result = await startCausaDocImport(id, user.id);
    if (result.globalBusy) {
      return privatePjudJson(
        {
          error:
            result.status.note ||
            "Ya hay una descarga de documentos en curso. Espere a que termine.",
          status: result.status,
        },
        { status: 409 }
      );
    }

    after(() => processManualDocumentImport({ causaId: id }));
    return privatePjudJson(
      {
        ok: true,
        started: result.started,
        alreadyRunning: result.alreadyRunning,
        status: result.status,
      },
      { status: result.started ? 202 : 200 }
    );
  } catch (e) {
    return privatePjudResponse(handleRouteError(e));
  }
}
