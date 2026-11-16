import { NextResponse } from "next/server";
import { requireStaff, handleRouteError } from "@/lib/api";
import { serializable } from "@/lib/command-execution";
import { deadlineFor, eventDocument } from "@/lib/deadlines/completion";
import { httpError } from "@/lib/auth/access";
import { getObjectBounded } from "@/lib/storage";
import { sha256 } from "@/lib/evidence/fragments";
import {
  documentBodyForDownload,
  downloadResponseHeaders,
} from "@/lib/security/download";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  try {
    const user = await requireStaff(),
      { id, eventId } = await params;
    const result = await serializable(async (tx) => {
      const { row } = await deadlineFor(id, user, tx);
      const event = await tx.plazoStateEvent.findFirst({
        where: { id: eventId, plazoId: id },
      });
      if (!event) throw httpError("Comprobante no disponible", 404);
      const { revision } = await eventDocument(row, event, user, tx);
      const bytes = documentBodyForDownload(
        revision,
        revision.storageKey
          ? await getObjectBounded(revision.storageKey)
          : null,
      );
      if (!bytes || sha256(bytes) !== event.documentSha256)
        throw httpError(
          "El original conservado no coincide con el comprobante",
          409,
        );
      return { bytes, name: revision.nombre, mime: revision.mimeType };
    });
    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        ...downloadResponseHeaders(result.name, result.mime),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
