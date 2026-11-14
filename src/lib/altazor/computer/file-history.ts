import { z } from "zod";
import { prisma } from "@/lib/db";
import { altazorActor, altazorScopeKey } from "@/lib/altazor/access";
import { assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { addCivilDays, isValidYmd, santiagoMidnight } from "@/lib/chile-time";
import { normalizeStoredFileReceipt, stagedFileRequest } from "./file-receipt";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { FileHistoryItem, FileHistoryPage } from "./file-history-types";

type Client = PrismaClient | Prisma.TransactionClient;
const alias = /^altazor-(?:google|github|dropbox)-[a-f0-9]{16}$/;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const day = z.string().refine(isValidYmd, "Fecha no válida.");
const position = z.object({ at: z.iso.datetime(), id }).strict();
export const fileHistoryQuery = z.object({
  causaId: id.optional(), status: z.enum(["confirmed", "failed", "unknown"]).optional(),
  connector: z.string().regex(alias).optional(), from: day.optional(), to: day.optional(),
  cursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, "El inicio debe ser anterior al fin.");
export type FileHistoryQuery = z.infer<typeof fileHistoryQuery>;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const readObject = (json: string | null) => { try { const value: unknown = JSON.parse(json || "null"); return object(value) ? value : null; } catch { return null; } };
const namesFor = (json: string): string[] => { try { const value: unknown = JSON.parse(json); return Array.isArray(value) ? value.filter((name): name is string => typeof name === "string" && alias.test(name)) : []; } catch { return []; } };
const safeName = (value: unknown) => typeof value === "string" && value.length <= 180 && value.length > 0 && !/[\\/\u0000-\u001f\u007f]/.test(value) ? value : null;

/** Read only: closed/expired sessions and an offline or disabled gateway need no reopening. */
export async function listComputerFileHistory(user: CausaAccessUser, raw: FileHistoryQuery, db: Client = prisma): Promise<FileHistoryPage> {
  const query = fileHistoryQuery.parse(raw), causaId = query.causaId ?? null;
  let cursor: z.infer<typeof position> | null = null;
  if (query.cursor) {
    try { cursor = position.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))); }
    catch { throw new ConnectorError("history_cursor_invalid", "La página solicitada no es válida.", 400); }
  }
  const assertScope = async () => {
    const actor = await altazorActor(user, db);
    if (causaId) await assertCausaAccess(causaId, actor, { auditOverride: false }, db);
    return actor;
  };
  const actor = await assertScope();
  const workspace = { ownerId: actor.id, causaId, scopeKey: altazorScopeKey(causaId) };
  const scope = { ownerId: actor.id, workspace };
  const rows = await db.altazorComputerAction.findMany({
    where: { ownerId: actor.id, session: scope, kind: "message", status: "completed", resultJson: { contains: '"fileTask"' },
      AND: [
        ...(query.from ? [{ createdAt: { gte: santiagoMidnight(query.from) } }] : []),
        ...(query.to ? [{ createdAt: { lt: santiagoMidnight(addCivilDays(query.to, 1)) } }] : []),
        ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), id: { lt: cursor.id } }] }] : []),
      ],
    },
    select: { id: true, kind: true, status: true, resultJson: true, createdAt: true,
      session: { select: { id: true, chatId: true, kittyId: true, connectorNamesJson: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 26,
  });
  const items: FileHistoryItem[] = [];
  // One page scans at most 25 staged downloads. Filtering never expands access
  // or loops unboundedly through a user's complete action history.
  for (const row of rows.slice(0, 25)) {
    const stage = stagedFileRequest(row, namesFor(row.session.connectorNamesJson));
    if (!stage || (query.connector && stage.task.connector !== query.connector)) continue;
    const approvals = await db.altazorComputerAction.findMany({
      where: { ownerId: actor.id, sessionId: row.session.id, kind: "connector_approval", status: "completed",
        resultJson: { contains: JSON.stringify(stage.approvalId) }, createdAt: { gte: row.createdAt } },
      select: { resultJson: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
    });
    let state: FileHistoryItem["status"] = "unknown", file: ReturnType<typeof normalizeStoredFileReceipt> | null = null;
    for (const approval of approvals) {
      const value = readObject(approval.resultJson);
      if (!value || value.id !== stage.approvalId || value.canContinue !== false) continue;
      if (value.status === "approved" && value.failed === false && row.session.chatId && row.session.kittyId) {
        try {
          file = normalizeStoredFileReceipt(value.verifiedFile, { ...stage.task, requestId: stage.requestId, approvalId: stage.approvalId, chatId: row.session.chatId, kittyId: row.session.kittyId });
          state = "confirmed"; break;
        } catch { /* No complete, bound evidence means an uncertain result. */ }
      } else if (value.failed === true || ["rejected", "denied", "cancelled"].includes(String(value.status))) state = "failed";
    }
    if (query.status && state !== query.status) continue;
    const args = stage.task.args as Record<string, unknown>;
    const name = file?.name ?? safeName(args.name) ?? (typeof args.path === "string" ? safeName(args.path.split(/[\\/]/).at(-1)) : null) ?? "Archivo solicitado";
    items.push({ id: row.id, at: row.createdAt.toISOString(), connector: stage.task.connector, kind: stage.task.kind, name, status: state,
      ...(file ? { bytes: file.bytes, ...(file.pages === undefined ? {} : { pages: file.pages }) } : {}) });
  }
  const sessions = await db.altazorComputerSession.findMany({ where: scope, select: { connectorNamesJson: true }, distinct: ["connectorNamesJson"], take: 100 });
  const connectors = [...new Set(sessions.flatMap(session => namesFor(session.connectorNamesJson)))].sort().slice(0, 100);
  await assertScope(); // A revocation while reading must discard every projected row.
  const last = rows[24];
  return { items, connectors, nextCursor: rows.length > 25 && last ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null };
}
