import { Prisma, type PrismaClient } from "@prisma/client";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

const pageSize = 20;
const originsPerKind = 4;
const intakeSources = ["manual", "mail"] as const;
type IntakeSource = typeof intakeSources[number];

export type CaseUpdateOrigin = {
  kind: IntakeSource;
  receivedAt: string;
  documentVersion: number | null;
  mailHref?: string;
};

export type CaseUpdateDocument = {
  kind: "document";
  documentId: string;
  title: string;
  type: string;
  version: number;
  status: string | null;
  latestAt: string;
  firstReceivedAt: string;
  hasOriginal: boolean;
  origins: CaseUpdateOrigin[];
  moreOrigins: boolean;
};

export type CaseUpdateMailNotice = {
  kind: "mail-notice";
  messageId: string;
  latestAt: string;
  mailHref: string;
};

export type CaseUpdate = CaseUpdateDocument | CaseUpdateMailNotice;

type Position = { kind: "d" | "m"; id: string; receivedAt: Date };
type Candidate = (Position & { kind: "d"; firstAt: Date }) | (Position & { kind: "m" });

function readPosition(raw: string | null | undefined): Position | null {
  if (raw == null) return null;
  const [date, kind, id, extra] = raw.length <= 190 ? raw.split("~") : [];
  const receivedAt = new Date(date ?? "");
  if (extra !== undefined || (kind !== "d" && kind !== "m") || !id || !/^[a-z0-9_-]{1,160}$/i.test(id) ||
      !Number.isFinite(receivedAt.getTime()) || receivedAt.toISOString() !== date) {
    throw httpError("La posición de Novedades no es válida.", 400);
  }
  return { kind, id, receivedAt };
}

const manualStorage = { storageKey: { startsWith: "documentos/" } } satisfies Prisma.DocumentoWhereInput;
const legacyMailStorage = { OR: [
  { storageKey: { startsWith: "correo/inbox/" } },
  { storageKey: { startsWith: "correo/pjud/" } },
] } satisfies Prisma.DocumentoWhereInput;

function legacySource(storageKey: string | null): IntakeSource | null {
  if (storageKey?.startsWith("documentos/")) return "manual";
  if (storageKey?.startsWith("correo/inbox/") || storageKey?.startsWith("correo/pjud/")) return "mail";
  return null;
}

const receiptSelect = { receivedAt: true, documentVersion: true, mailboxAttachmentId: true } as const;
function recentReceipts(causaId: string, source: IntakeSource) {
  return {
    where: { causaId, source },
    orderBy: [{ receivedAt: "desc" as const }, { id: "desc" as const }],
    take: originsPerKind + 1,
    select: receiptSelect,
  };
}

function newestFirst(a: Position, b: Position) {
  return b.receivedAt.getTime() - a.receivedAt.getTime() ||
    a.kind.localeCompare(b.kind) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/** Readable documents with intake receipts, plus private filed notices that have no attachments. */
export async function listCaseUpdates(
  causaId: string,
  user: CausaAccessUser,
  { before }: { before?: string | null } = {},
  client: PrismaClient = prisma,
): Promise<{ items: CaseUpdate[]; nextBefore: string | null }> {
  const position = readPosition(before);
  return client.$transaction(async tx => {
    const actor = await tx.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
    });
    if (!actor || !isStaff(actor.role)) throw httpError("No encontrado", 404);
    await assertCausaAccess(causaId, actor, { auditOverride: false }, tx);
    const documentsInScope = { AND: [{ causaId }, documentReadWhere(actor)] } satisfies Prisma.DocumentoWhereInput;
    const supportedIntakes = { causaId, source: { in: [...intakeSources] } };
    const ownedFiledMail = { causaId, userId: actor.id, account: { userId: actor.id }, status: "aplicado" };
    const [intakeDocuments, legacyDocuments, mailNotices] = await Promise.all([
      tx.caseDocumentIntake.groupBy({
        by: ["documentoId"],
        where: { ...supportedIntakes, documento: documentsInScope },
        _min: { receivedAt: true },
        _max: { receivedAt: true },
        ...(position ? { having: { OR: [
          { receivedAt: { _max: { lt: position.receivedAt } } },
          ...(position.kind === "d" ? [{ receivedAt: { _max: { equals: position.receivedAt } }, documentoId: { lt: position.id } }] : []),
        ] } } : {}),
        orderBy: [{ _max: { receivedAt: "desc" } }, { documentoId: "desc" }],
        take: pageSize + 1,
      }),
      tx.documento.findMany({
        where: { AND: [
          documentsInScope,
          { caseIntakes: { none: supportedIntakes }, OR: [manualStorage, legacyMailStorage] },
          ...(position ? [{ OR: [
            { createdAt: { lt: position.receivedAt } },
            ...(position.kind === "d" ? [{ createdAt: position.receivedAt, id: { lt: position.id } }] : []),
          ] }] : []),
        ] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        select: { id: true, createdAt: true },
      }),
      tx.mailboxMessage.findMany({
        where: {
          ...ownedFiledMail,
          attachments: { none: {} },
          ...(position?.kind === "d" ? { receivedAt: { lte: position.receivedAt } } : {}),
          ...(position?.kind === "m" ? { OR: [
            { receivedAt: { lt: position.receivedAt } },
            { receivedAt: position.receivedAt, id: { lt: position.id } },
          ] } : {}),
        },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        select: { id: true, receivedAt: true },
      }),
    ]);
    const candidates: Candidate[] = [
      ...intakeDocuments.flatMap(group => group.documentoId && group._max.receivedAt && group._min.receivedAt ? [{
        kind: "d" as const, id: group.documentoId, receivedAt: group._max.receivedAt, firstAt: group._min.receivedAt,
      }] : []),
      ...legacyDocuments.map(doc => ({ kind: "d" as const, id: doc.id, receivedAt: doc.createdAt, firstAt: doc.createdAt })),
      ...mailNotices.map(message => ({ kind: "m" as const, id: message.id, receivedAt: message.receivedAt })),
    ].sort(newestFirst);
    const page = candidates.slice(0, pageSize);
    if (!page.length) return { items: [], nextBefore: null };

    const ids = page.flatMap(row => row.kind === "d" ? [row.id] : []);
    const pageDocuments = { AND: [documentsInScope, { id: { in: ids } }] } satisfies Prisma.DocumentoWhereInput;
    const [documents, mailDocuments] = await Promise.all([
      tx.documento.findMany({
        where: pageDocuments,
        select: {
          id: true, nombre: true, tipo: true, version: true, extractionStatus: true, storageKey: true, createdAt: true,
          caseIntakes: recentReceipts(causaId, "manual"),
        },
      }),
      tx.documento.findMany({
        where: pageDocuments,
        select: { id: true, caseIntakes: recentReceipts(causaId, "mail") },
      }),
    ]);
    const manualByDocument = new Map(documents.map(doc => [doc.id, doc]));
    const mailByDocument = new Map(mailDocuments.map(doc => [doc.id, doc.caseIntakes]));
    const mailboxReceiptKeys = mailDocuments.flatMap(doc => doc.caseIntakes.flatMap(receipt => receipt.mailboxAttachmentId ? [receipt.mailboxAttachmentId] : []));
    const legacyMailIds = documents.filter(doc => legacySource(doc.storageKey) === "mail").map(doc => doc.id);
    const ownMail = mailboxReceiptKeys.length || legacyMailIds.length ? await tx.mailboxAttachment.findMany({
      where: {
        message: ownedFiledMail,
        OR: [{ id: { in: mailboxReceiptKeys } }, { documentoId: { in: legacyMailIds } }],
      },
      orderBy: [{ message: { receivedAt: "desc" } }, { id: "desc" }],
      take: pageSize * (originsPerKind + 2),
      select: { id: true, documentoId: true, message: { select: { id: true } } },
    }) : [];
    const ownMailByReceipt = new Map(ownMail.map(attachment => [attachment.id, attachment]));
    const ownMailByDocument = new Map<string, (typeof ownMail)[number]>();
    for (const attachment of ownMail) {
      if (attachment.documentoId && !ownMailByDocument.has(attachment.documentoId)) {
        ownMailByDocument.set(attachment.documentoId, attachment);
      }
    }

    const items = page.flatMap((row): CaseUpdate[] => {
      if (row.kind === "m") return [{
        kind: "mail-notice", messageId: row.id, latestAt: row.receivedAt.toISOString(),
        mailHref: `/correo?id=${encodeURIComponent(row.id)}`,
      }];
      const doc = manualByDocument.get(row.id);
      if (!doc) return [];
      const manual = doc.caseIntakes;
      const mail = mailByDocument.get(doc.id) ?? [];
      const origins: CaseUpdateOrigin[] = [
        ...manual.slice(0, originsPerKind).map(receipt => ({
          kind: "manual" as const, receivedAt: receipt.receivedAt.toISOString(), documentVersion: receipt.documentVersion,
        })),
        ...mail.slice(0, originsPerKind).map(receipt => {
          const attachment = receipt.mailboxAttachmentId ? ownMailByReceipt.get(receipt.mailboxAttachmentId) : undefined;
          return {
            kind: "mail" as const, receivedAt: receipt.receivedAt.toISOString(), documentVersion: receipt.documentVersion,
            ...(attachment?.documentoId === doc.id ? { mailHref: `/correo?id=${encodeURIComponent(attachment.message.id)}` } : {}),
          };
        }),
      ];
      const fallback = legacySource(doc.storageKey);
      const fallbackNeeded = (fallback === "manual" && !manual.length) || (fallback === "mail" && !mail.length);
      if (fallbackNeeded && fallback) {
        const attachment = fallback === "mail" ? ownMailByDocument.get(doc.id) : undefined;
        origins.push({
          kind: fallback, receivedAt: doc.createdAt.toISOString(), documentVersion: doc.version === 1 ? 1 : null,
          ...(attachment ? { mailHref: `/correo?id=${encodeURIComponent(attachment.message.id)}` } : {}),
        });
      }
      if (!origins.length) return [];
      return [{
        kind: "document",
        documentId: doc.id,
        title: doc.nombre,
        type: doc.tipo,
        version: doc.version,
        status: doc.extractionStatus,
        latestAt: row.receivedAt.toISOString(),
        firstReceivedAt: new Date(fallbackNeeded ? Math.min(doc.createdAt.getTime(), row.firstAt.getTime()) : row.firstAt.getTime()).toISOString(),
        hasOriginal: Boolean(doc.storageKey),
        origins: origins.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || a.kind.localeCompare(b.kind)),
        moreOrigins: manual.length > originsPerKind || mail.length > originsPerKind,
      }];
    });
    const last = page.at(-1);
    return {
      items,
      nextBefore: candidates.length > pageSize && last ? `${last.receivedAt.toISOString()}~${last.kind}~${last.id}` : null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
