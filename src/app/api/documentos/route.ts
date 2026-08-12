import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  confidentialWhere,
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { documentoCreateSchema } from "@/lib/schemas";
import { MAX_STORAGE_OBJECT_BYTES, newStorageKey, putObject } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";
import { MAX_PROCESSING_BYTES } from "@/lib/document-processing";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";
import { inferDocumentoTipo, normalizeIngestPath } from "@/lib/document-ingest";
import { sanitizeUploadMimeType } from "@/lib/security/download";
import { documentoListSelect } from "@/lib/sites/file-select";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const causaId = new URL(req.url).searchParams.get("causaId");
    const documentos = await prisma.documento.findMany({
      where: {
        ...(causaId ? { causaId } : {}),
        ...confidentialWhere(user.role),
      },
      select: {
        ...documentoListSelect,
        causa: true,
        autor: { select: publicUserSelect },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(documentos);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (declaredLength > MAX_STORAGE_OBJECT_BYTES * 2) {
      return NextResponse.json(
        { error: `La solicitud supera el límite de ${MAX_STORAGE_OBJECT_BYTES} bytes` },
        { status: 413 }
      );
    }
    const user = await requireStaff();
    const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
    const body = isMultipart
      ? null
      : await parseBody(req, documentoCreateSchema);

    let nombre = body?.nombre || "";
    let tipo = body?.tipo || "otro";
    let contenido = body?.contenido || null;
    let mimeType = body?.mimeType || null;
    let storageKey: string | null = null;
    let confidencial = Boolean(body?.confidencial);
    let privilegio = Boolean(body?.privilegio);
    let causaId = body?.causaId || null;
    let ruta = body?.ruta?.trim() || null;
    if (ruta && ruta.length > 1000) {
      return NextResponse.json({ error: "Ruta demasiado larga" }, { status: 400 });
    }
    const autorId = user.id;
    const extractedMarkdown: string | null = null;
    let extractionStatus: string | null = null;
    const extractionJson: string | null = null;
    let processingBytes: Buffer | null = null;
    let tipoAuto = false;

    if (!canSeeConfidential(user.role) && (confidencial || privilegio)) {
      return NextResponse.json(
        { error: "Su rol no puede crear contenido confidencial o privilegiado" },
        { status: 403 }
      );
    }

    if (isMultipart) {
      const form = await req.formData();
      const file = form.get("file");
      nombre = String(form.get("nombre") || "");
      const tipoRaw = String(form.get("tipo") || "otro");
      tipoAuto = tipoRaw === "auto" || tipoRaw === "";
      tipo = tipoAuto ? "otro" : tipoRaw;
      confidencial = form.get("confidencial") === "on";
      privilegio = form.get("privilegio") === "on";
      causaId = String(form.get("causaId") || "") || null;
      const rutaField = String(form.get("ruta") || "").trim();
      const relativeHint = String(form.get("relativePath") || "").trim();
      if (rutaField) {
        const normalized = normalizeIngestPath(
          rutaField.endsWith("/") ? `${rutaField}x` : `${rutaField}/x`
        );
        ruta = normalized?.ruta || null;
      } else if (relativeHint) {
        const normalized = normalizeIngestPath(relativeHint);
        if (normalized) {
          ruta = normalized.ruta;
          nombre = nombre || normalized.nombre;
        }
      }
      if (!canSeeConfidential(user.role) && (confidencial || privilegio)) {
        return NextResponse.json(
          { error: "Su rol no puede crear contenido confidencial o privilegiado" },
          { status: 403 }
        );
      }
      if (file && typeof (file as File).arrayBuffer === "function" && (file as File).size > 0) {
        const uploaded = file as File;
        if (uploaded.size > MAX_STORAGE_OBJECT_BYTES || uploaded.size > MAX_PROCESSING_BYTES) {
          return NextResponse.json(
            { error: `El archivo supera el límite de ${MAX_STORAGE_OBJECT_BYTES} bytes` },
            { status: 413 }
          );
        }
        const fromBrowser =
          typeof (uploaded as File & { webkitRelativePath?: string }).webkitRelativePath ===
            "string" &&
          (uploaded as File & { webkitRelativePath?: string }).webkitRelativePath
            ? normalizeIngestPath(
                (uploaded as File & { webkitRelativePath?: string }).webkitRelativePath!
              )
            : null;
        if (fromBrowser) {
          ruta = ruta || fromBrowser.ruta;
          nombre = nombre || fromBrowser.nombre;
        }
        nombre = nombre || uploaded.name;
        if (tipoAuto) {
          tipo = inferDocumentoTipo(ruta ? `${ruta}/${nombre}` : nombre);
        }
        mimeType = sanitizeUploadMimeType(
          uploaded.type || "application/octet-stream"
        );
        const bytes = Buffer.from(await uploaded.arrayBuffer());
        processingBytes = bytes;
        extractionStatus = "pending";
        const key = newStorageKey("documentos", nombre);
        await putObject({
          key,
          body: bytes,
          contentType: mimeType,
        });
        storageKey = key;
      }
      if (!storageKey) {
        contenido = String(form.get("contenido") || "");
        mimeType = sanitizeUploadMimeType(mimeType || "text/plain");
      }
    } else if (tipo === "auto") {
      tipo = inferDocumentoTipo(ruta ? `${ruta}/${nombre}` : nombre);
    }

    if (!nombre) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }

    mimeType = sanitizeUploadMimeType(mimeType || "text/markdown");

    if (contenido && !storageKey) {
      const key = newStorageKey("documentos", nombre);
      await putObject({
        key,
        body: contenido,
        contentType: mimeType,
      });
      storageKey = key;
    }

    const doc = await prisma.documento.create({
      data: {
        nombre,
        tipo,
        contenido,
        mimeType,
        storageKey,
        ruta,
        extractedMarkdown,
        extractionStatus: processingBytes ? "pending" : extractionStatus,
        extractionJson,
        confidencial,
        privilegio,
        causaId,
        autorId,
      },
    });

    if (processingBytes) {
      enqueueDocumentProcessing({
        id: doc.id,
        name: doc.nombre,
        bytes: processingBytes,
      });
    }

    if (doc.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "documento",
          mensaje: `Documento creado: ${doc.nombre}`,
          causaId: doc.causaId,
          userId: user.id,
        },
      });
    }
    await writeAudit({
      actorId: user.id,
      action: "documento.create",
      entityType: "Documento",
      entityId: doc.id,
      after: { nombre: doc.nombre, storageKey },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
