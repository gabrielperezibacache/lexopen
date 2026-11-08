import { randomBytes, createHash } from "node:crypto";
import type { AltazorHelpRequest, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess } from "@/lib/auth/causa-access";
import { writeAuditStrict } from "@/lib/audit";
import { decryptSecret, encryptSecret, sha256Hex } from "@/lib/notify/secrets";
import { pollNtfy, publishNtfy } from "@/lib/notify/providers/ntfy";
import { createWhatsAppMetaProvider } from "@/lib/notify/providers/whatsapp";
import { isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import { altazorActor, altazorTransaction, conversationFor } from "../access";
import { getHelpChannelConfig, getWhatsAppMetaConfig } from "./config";

type Client = PrismaClient | Prisma.TransactionClient;
export type HelpRequestView = ReturnType<typeof publicHelpRequest>;
const createSchema = z.object({ requestKey: z.string().min(1).max(500), question: z.string().trim().min(1).max(4000), conversationId: z.string().max(200).nullable().optional(), computerSessionId: z.string().max(200).nullable().optional(), computerTurnId: z.string().max(200).nullable().optional(), scopeKind: z.enum(["causa", "workspace", "personal", "general"]).nullable().optional(), scopeId: z.string().max(200).nullable().optional(), expiresInMinutes: z.number().int().min(5).max(1440).optional() }).strict();
type CreateInput = z.input<typeof createSchema>;
type Delivery = { codeEnc?: string; ntfy?: { status: string; messageId?: string; topic?: string; replyTopic?: string; baseUrl?: string; error?: string }; whatsapp?: { status: string; messageId?: string; channelId?: string; error?: string } };
function delivery(row: AltazorHelpRequest): Delivery { try { return JSON.parse(row.deliveryJson); } catch { return {}; } }

export function publicHelpRequest(row: AltazorHelpRequest) {
  const channels = delivery(row);
  return { id: row.id, question: row.question, status: row.status, response: row.response, responseSource: row.responseSource, respondedAt: row.respondedAt?.toISOString() ?? null, expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString(), conversationId: row.conversationId, computerSessionId: row.computerSessionId, computerTurnId: row.computerTurnId, scopeKind: row.scopeKind, scopeId: row.scopeId, causaId: row.scopeKind === "causa" ? row.scopeId : null, notificationStatus: row.notificationStatus, channels: { ntfy: channels.ntfy?.status ?? "not_configured", whatsapp: channels.whatsapp?.status ?? "not_configured" } };
}

async function helpView(row: AltazorHelpRequest, client: Client) {
  const view = publicHelpRequest(row);
  if (!view.causaId && row.computerSessionId) {
    const session = await client.altazorComputerSession.findFirst({ where: { id: row.computerSessionId, ownerId: row.ownerId }, select: { workspace: { select: { causaId: true } } } });
    view.causaId = session?.workspace.causaId ?? null;
  }
  return view;
}

/** Recheck both ownership and current matter permission at every answer and resumption. */
async function helpAccess(row: Pick<AltazorHelpRequest, "ownerId" | "conversationId" | "computerSessionId" | "scopeKind" | "scopeId">, user: { id: string }, client: Client) {
  if (row.ownerId !== user.id) throw httpError("Solicitud de ayuda no encontrada.", 404);
  const found = await client.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, sessionVersion: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!found) throw httpError("No tiene permiso para esta ayuda.", 403);
  const actor = await altazorActor(found, client);
  let causaId: string | null = null;
  if (row.conversationId) causaId = (await conversationFor(row.conversationId, actor, client, true)).conversation.causaId;
  if (row.computerSessionId) {
    const session = await client.altazorComputerSession.findFirst({ where: { id: row.computerSessionId, ownerId: actor.id }, include: { workspace: true } });
    if (!session || session.workspace.ownerId !== actor.id || !session.workspace.enabled || ["closed", "expired"].includes(session.state) || session.expiresAt <= new Date()) throw httpError("La sesión de escritorio ya no está disponible.", 409);
    if (row.scopeKind === "workspace" && row.scopeId !== session.workspaceId) throw httpError("La ayuda no corresponde a este escritorio.", 409);
    if (causaId && session.workspace.causaId !== causaId) throw httpError("Los alcances de la ayuda no coinciden.", 409);
    causaId = session.workspace.causaId;
  }
  if (row.scopeKind === "causa") {
    if (!row.scopeId || causaId && row.scopeId !== causaId) throw httpError("Los alcances de la ayuda no coinciden.", 409);
    causaId = row.scopeId;
  }
  if (causaId) await assertCausaAccess(causaId, actor, undefined, client);
  return actor;
}

async function ownRequest(id: string, user: { id: string }, client: Client) {
  const row = await client.altazorHelpRequest.findFirst({ where: { id, ownerId: user.id } });
  if (!row) throw httpError("Solicitud de ayuda no encontrada.", 404);
  await helpAccess(row, user, client);
  return row;
}

export async function createHelpRequest(user: { id: string }, raw: CreateInput, client: PrismaClient = prisma): Promise<HelpRequestView> {
  const input = createSchema.parse(raw);
  const requestKey = sha256Hex(`${user.id}:${input.requestKey}`);
  return altazorTransaction(client, async tx => {
    const scope = { ownerId: user.id, conversationId: input.conversationId ?? null, computerSessionId: input.computerSessionId ?? null, scopeKind: input.scopeKind ?? "personal", scopeId: input.scopeId ?? null };
    const actor = await helpAccess(scope, user, tx);
    const prior = await tx.altazorHelpRequest.findUnique({ where: { requestKey } });
    if (prior) {
      if (prior.ownerId !== actor.id || prior.computerSessionId !== scope.computerSessionId || prior.conversationId !== scope.conversationId || prior.computerTurnId !== (input.computerTurnId ?? null) || prior.scopeKind !== scope.scopeKind || prior.scopeId !== scope.scopeId) throw httpError("La solicitud de ayuda ya existe con otro alcance.", 409);
      return publicHelpRequest(prior);
    }
    const code = randomBytes(24).toString("base64url");
    const row = await tx.altazorHelpRequest.create({ data: { ...scope, computerTurnId: input.computerTurnId ?? null, requestKey, question: input.question, correlationHash: sha256Hex(code), expiresAt: new Date(Date.now() + (input.expiresInMinutes ?? 60) * 60_000), deliveryJson: JSON.stringify({ codeEnc: encryptSecret(code) }) } });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.help.wait", entityType: "AltazorHelpRequest", entityId: row.id, after: { computerSessionId: row.computerSessionId, conversationId: row.conversationId, expiresAt: row.expiresAt.toISOString() } }, tx);
    return publicHelpRequest(row);
  });
}

export async function getHelpRequest(user: { id: string }, id: string, client: PrismaClient = prisma) { return helpView(await ownRequest(id, user, client), client); }
export async function listHelpRequests(user: { id: string }, client: PrismaClient = prisma) {
  const rows = await client.altazorHelpRequest.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" }, take: 30 });
  const result: HelpRequestView[] = [];
  for (const row of rows) { try { await helpAccess(row, user, client); result.push(await helpView(row, client)); } catch { /* No stale case metadata after revocation. */ } }
  return result;
}

/** No prompt, document, URL, account detail or credential is transmitted. */
export async function notifyHelpRequest(ownerId: string, id: string, client: PrismaClient = prisma, transports = { publishNtfy, createWhatsAppMetaProvider }) {
  const row = await ownRequest(id, { id: ownerId }, client);
  if (row.status !== "pending" || row.expiresAt <= new Date()) return publicHelpRequest(row);
  const policy = await client.firmSettings.findFirst({ select: { assistantLlmMode: true } });
  if (policy?.assistantLlmMode === "local_only") {
    await client.altazorHelpRequest.updateMany({ where: { id, ownerId, notificationStatus: { in: ["pending", "unconfigured", "restricted"] } }, data: { notificationStatus: "restricted" } });
    return getHelpRequest({ id: ownerId }, id, client);
  }
  // These states prove no outbound attempt occurred. Delivery/unknown states never retry implicitly.
  const claimed = await client.altazorHelpRequest.updateMany({ where: { id, ownerId, status: "pending", notificationStatus: { in: ["pending", "unconfigured", "restricted"] }, expiresAt: { gt: new Date() } }, data: { notificationStatus: "sending", notificationAttemptedAt: new Date() } });
  if (!claimed.count) return getHelpRequest({ id: ownerId }, id, client);
  const [config, meta] = await Promise.all([getHelpChannelConfig(ownerId, client), getWhatsAppMetaConfig(client)]);
  const state = delivery(row), code = decryptSecret(state.codeEnc);
  if (!code) throw httpError("La solicitud no puede preparar su aviso.", 503);
  const message = `Altazor necesita tu ayuda y está en pausa. Responde: ALTAZOR ${code} tu respuesta`;
  let href: string | undefined;
  try { const base = new URL(process.env.NEXT_PUBLIC_APP_URL || ""); if (base.protocol === "https:" && !base.username && !base.password && isSafeOutboundHttpUrl(base.href)) href = new URL("/inicio?altazor=help", base.origin).href; } catch { /* A public URL is optional; never infer one from a request Host. */ }
  if (config.ntfy?.enabled) {
    state.ntfy = { status: "sending", baseUrl: config.ntfy.baseUrl, topic: config.ntfy.topic, replyTopic: config.ntfy.replyTopic };
    await client.altazorHelpRequest.update({ where: { id }, data: { deliveryJson: JSON.stringify(state) } });
    const result = await transports.publishNtfy(config.ntfy, { title: "Altazor espera tu respuesta", body: `${message}\nPublica tu respuesta en el tema ${config.ntfy.replyTopic}.`, ...(href ? { href } : {}) });
    state.ntfy = { ...state.ntfy, status: result.ok ? "sent" : result.uncertain ? "uncertain" : "failed", ...(result.ok ? { messageId: result.providerMessageId } : { error: result.error }) };
    await client.altazorHelpRequest.update({ where: { id }, data: { deliveryJson: JSON.stringify(state) } });
  }
  if (config.whatsapp.enabled && config.whatsapp.channelId && meta) {
    const channel = await client.canalUsuario.findFirst({ where: { id: config.whatsapp.channelId, userId: ownerId, canal: "whatsapp", estado: "activo", verificadoAt: { not: null } } });
    const phone = channel ? decryptSecret(channel.destinoEnc) : undefined;
    if (phone) {
      state.whatsapp = { status: "sending", channelId: channel!.id };
      await client.altazorHelpRequest.update({ where: { id }, data: { deliveryJson: JSON.stringify(state) } });
      const result = await transports.createWhatsAppMetaProvider(meta).send({ title: "Altazor", text: `${message}${href ? `\n${href}` : ""}` }, { kind: "whatsapp", e164: phone });
      state.whatsapp = { ...state.whatsapp, status: result.ok ? "sent" : result.uncertain ? "uncertain" : "failed", ...(result.ok ? { messageId: result.providerMessageId } : { error: result.error }) };
      await client.altazorHelpRequest.update({ where: { id }, data: { deliveryJson: JSON.stringify(state) } });
    }
  }
  const outcomes = [state.ntfy?.status, state.whatsapp?.status].filter(Boolean);
  const notificationStatus = outcomes.some(value => value === "uncertain") ? "uncertain" : outcomes.some(value => value === "sent") ? "notified" : outcomes.length ? "failed" : "unconfigured";
  await client.altazorHelpRequest.update({ where: { id }, data: { notificationStatus, ...(notificationStatus === "notified" ? { notifiedAt: new Date() } : {}) } });
  return getHelpRequest({ id: ownerId }, id, client);
}

async function answer(user: { id: string }, input: { requestId: string; response: string; source: "web" | "ntfy" | "whatsapp"; messageId?: string }, client: PrismaClient) {
  const response = z.string().trim().min(1).max(2000).parse(input.response);
  if (Buffer.byteLength(response, "utf8") > 2000) throw httpError("La respuesta admite hasta 2000 bytes de texto. Acórtala antes de continuar.", 400);
  return altazorTransaction(client, async tx => {
    const row = await ownRequest(input.requestId, user, tx);
    if (row.expiresAt <= new Date()) { await tx.altazorHelpRequest.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "expired" } }); return { accepted: false, request: publicHelpRequest({ ...row, status: "expired" }) }; }
    if (row.status !== "pending") return { accepted: false, request: publicHelpRequest(row) };
    const changed = await tx.altazorHelpRequest.updateMany({ where: { id: row.id, ownerId: user.id, status: "pending", expiresAt: { gt: new Date() } }, data: { status: "answered", response, responseSource: input.source, responseMessageId: input.messageId ?? null, respondedAt: new Date() } });
    if (changed.count) await writeAuditStrict({ actorId: user.id, action: "altazor.help.answer", entityType: "AltazorHelpRequest", entityId: row.id, after: { source: input.source } }, tx);
    return { accepted: changed.count === 1, request: publicHelpRequest(await tx.altazorHelpRequest.findUniqueOrThrow({ where: { id: row.id } })) };
  });
}
export async function answerHelpRequest(user: { id: string }, input: { requestId: string; response: string }, client: PrismaClient = prisma) { return answer(user, { ...input, source: "web" }, client); }

export function parseHelpReply(text: string) {
  const match = /^ALTAZOR\s+([A-Za-z0-9_-]{32})\s+([\s\S]{1,4000})$/i.exec(text.trim());
  return match ? { code: match[1], response: match[2].trim() } : null;
}

export async function pollHelpReplies(user: { id: string }, client: PrismaClient = prisma, poll = pollNtfy) {
  const config = await getHelpChannelConfig(user.id, client);
  const pending = await client.altazorHelpRequest.findMany({ where: { ownerId: user.id, status: "pending", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" }, take: 30 });
  if (!config.ntfy?.enabled || !pending.length) return { accepted: 0 };
  const rows: typeof pending = [];
  for (const row of pending) {
    try { await helpAccess(row, user, client); rows.push(row); }
    catch (error) {
      // A revoked/closed old scope must not block replies to other current tasks.
      if ([403, 404, 409, 410].includes((error as { status?: number }).status || 0)) await client.altazorHelpRequest.updateMany({ where: { id: row.id, ownerId: user.id, status: "pending" }, data: { status: "cancelled" } });
    }
  }
  if (!rows.length) return { accepted: 0 };
  const replies = await poll(config.ntfy, rows[0].createdAt);
  let accepted = 0;
  for (const reply of replies) {
    const value = parseHelpReply(reply.message);
    if (!value || !value.response) continue;
    const hash = sha256Hex(value.code), row = rows.find(item => item.correlationHash === hash);
    const sent = row ? delivery(row).ntfy : undefined;
    if (!row || !sent || sent.baseUrl !== config.ntfy.baseUrl || sent.replyTopic !== config.ntfy.replyTopic || !["sent", "uncertain", "sending"].includes(sent.status) || reply.time * 1000 < row.createdAt.getTime() - 1000 || reply.time * 1000 > Date.now() + 60_000) continue;
    try { const result = await answer(user, { requestId: row.id, response: value.response, source: "ntfy", messageId: `ntfy:${createHash("sha256").update(config.ntfy.baseUrl).digest("hex").slice(0, 16)}:${reply.id}` }, client); if (result.accepted) accepted++; } catch { /* Invalidated scope or duplicate message never resumes work. */ }
  }
  return { accepted };
}

export async function cancelHelpRequest(user: { id: string }, id: string, client: PrismaClient = prisma) {
  await ownRequest(id, user, client);
  await client.altazorHelpRequest.updateMany({ where: { id, ownerId: user.id, status: { in: ["pending", "answered", "resume_failed"] } }, data: { status: "cancelled" } });
  return getHelpRequest(user, id, client);
}

/** Only a server worker claims an authenticated answer; polling cannot call the gateway. */
export async function claimHelpResponse(user: { id: string }, id: string, client: PrismaClient = prisma) {
  return altazorTransaction(client, async tx => {
    const row = await ownRequest(id, user, tx);
    if (!row.response || row.expiresAt <= new Date()) return null;
    const changed = await tx.altazorHelpRequest.updateMany({ where: { id, ownerId: user.id, status: "answered", expiresAt: { gt: new Date() } }, data: { status: "resuming" } });
    return changed.count ? { ...publicHelpRequest(row), response: row.response, status: "resuming" } : null;
  });
}
export async function completeHelpResponse(user: { id: string }, id: string, success: boolean, client: PrismaClient = prisma) {
  await ownRequest(id, user, client);
  await client.altazorHelpRequest.updateMany({ where: { id, ownerId: user.id, status: "resuming" }, data: { status: success ? "resumed" : "resume_failed" } });
  return getHelpRequest(user, id, client);
}

export async function helpWorkerQueue(client: PrismaClient = prisma, limit = 30) {
  const now = new Date();
  await client.altazorHelpRequest.updateMany({ where: { status: { in: ["pending", "answered"] }, expiresAt: { lte: now } }, data: { status: "expired" } });
  // A crash after provider acceptance is ambiguous. Never resend such an alert automatically.
  await client.altazorHelpRequest.updateMany({ where: { notificationStatus: "sending", notificationAttemptedAt: { lt: new Date(now.getTime() - 2 * 60_000) } }, data: { notificationStatus: "uncertain" } });
  await client.altazorHelpRequest.updateMany({ where: { status: "resuming", updatedAt: { lt: new Date(now.getTime() - 2 * 60_000) } }, data: { status: "resume_failed" } });
  return client.altazorHelpRequest.findMany({ where: { status: { in: ["pending", "answered"] }, expiresAt: { gt: now } }, select: { id: true, ownerId: true, status: true, notificationStatus: true, computerSessionId: true, conversationId: true }, orderBy: { createdAt: "asc" }, take: Math.min(100, Math.max(1, limit)) });
}

/** Called exclusively after verifying the Meta signature and matching a verified phone channel. */
export async function acceptWhatsAppHelpReply(ownerId: string, input: { text: string; messageId: string; contextId?: string; channelId: string; timestamp: number }, client: PrismaClient = prisma) {
  const now = Date.now();
  if (input.timestamp * 1000 > now + 60_000 || input.timestamp * 1000 < now - 24 * 60 * 60_000) return { accepted: false };
  const parsed = parseHelpReply(input.text);
  const rows = await client.altazorHelpRequest.findMany({ where: { ownerId, status: "pending", expiresAt: { gt: new Date() }, ...(parsed ? { correlationHash: sha256Hex(parsed.code) } : {}) }, orderBy: { createdAt: "asc" }, take: 30 });
  const row = rows.find(item => { const sent = delivery(item).whatsapp; return sent?.channelId === input.channelId && (parsed || input.contextId && sent.messageId === input.contextId); });
  if (!row || input.timestamp * 1000 < row.createdAt.getTime() - 1000) return { accepted: false };
  return answer({ id: ownerId }, { requestId: row.id, response: parsed?.response || input.text, source: "whatsapp", messageId: `whatsapp:${input.messageId}` }, client);
}
