import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { isValidYmd } from "@/lib/chile-time";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/evidence/fragments";
import { altazorActor, altazorTransaction } from "./access";
import { ACADEMIC_WORKSPACE_LIMIT, emptyAcademicBrief, emptyAcademicCall, emptyAcademicMatrix } from "./academic-schemas";
import { CALL_SOURCES, readCallSource, type CallFeedItem, type CallSource } from "./call-sources";
import type { AltazorClient } from "./types";

const maximumItems = 50;
const leaseMs = 60_000;
const providerError = "No pudimos actualizar esta fuente. Puedes intentar otra vez.";
const missingSubscription = () => httpError("La suscripción a esta fuente no está disponible.", 404);
const staleRefresh = () => httpError("La suscripción cambió durante la consulta. Abre de nuevo Convocatorias.", 409);

const sourceId = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/);
const itemId = z.string().min(1).max(1000);
const checkedAt = z.string().datetime();
export const academicCallAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), sourceId }).strict(),
  z.object({ action: z.literal("unsubscribe"), sourceId }).strict(),
  z.object({ action: z.literal("refresh"), sourceId }).strict(),
  z.object({ action: z.literal("save"), sourceId, itemId, checkedAt: checkedAt.optional() }).strict(),
]);
type CallAction = z.infer<typeof academicCallAction>;

const feedItem = z.object({
  id: itemId,
  title: z.string().trim().min(1).max(600),
  url: z.string().url().max(1000).refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch { return false; }
  }),
  summary: z.string().max(5000),
  publishedAt: checkedAt.optional(),
  deadline: z.string().refine(isValidYmd).optional(),
}).strict();
const feedItems = z.array(feedItem).max(maximumItems);
const publicSources = CALL_SOURCES.map(source => ({
  id: source.id, country: source.country, label: source.label, url: source.url, feed: Boolean(source.feedUrl),
}));
type CallReader = (sourceId: string, options: { signal?: AbortSignal }) => Promise<CallFeedItem[]>;

export type AcademicCallOrigin = Omit<CallFeedItem, "id"> & {
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  country: string;
  itemId: string;
  checkedAt: string;
};
export type AcademicCallSnapshot = {
  sources: typeof publicSources;
  subscriptions: {
    sourceId: string;
    checkedAt: string | null;
    error: string | null;
    items: (CallFeedItem & { workspaceId?: string; changed?: true })[];
  }[];
};

function sourceFor(id: string): CallSource {
  const source = CALL_SOURCES.find(source => source.id === id);
  if (!source) throw httpError("La fuente no forma parte del catálogo de convocatorias.", 404);
  if (!source.feedUrl) throw httpError("Esta fuente se consulta en su sitio oficial.", 422);
  return source;
}

const originKey = (sourceId: string, externalId: string) => sha256(JSON.stringify([sourceId, externalId]));
const readItems = (itemsJson: string) => feedItems.parse(JSON.parse(itemsJson));
const changedSince = (item: CallFeedItem, origin: AcademicCallOrigin) =>
  item.title !== origin.title || item.url !== origin.url || item.summary !== origin.summary || item.deadline !== origin.deadline;

async function snapshot(ownerId: string, client: AltazorClient): Promise<AcademicCallSnapshot> {
  const rows = await client.altazorCallSubscription.findMany({
    where: { ownerId, sourceId: { in: publicSources.map(source => source.id) } },
    orderBy: { sourceId: "asc" },
    select: { sourceId: true, checkedAt: true, errorCode: true, itemsJson: true },
  });
  const sources = rows.map(({ itemsJson, ...row }) => ({ ...row, items: readItems(itemsJson) }));
  const keys = sources.flatMap(row => row.items.map(item => originKey(row.sourceId, item.id)));
  const saved = keys.length ? await client.altazorAcademicWorkspace.findMany({
    where: { ownerId, kind: "call", archivedAt: null, callOriginKey: { in: keys } },
    select: { id: true, callOriginKey: true, callOriginJson: true },
  }) : [];
  const savedByKey = new Map(saved.map(row => [row.callOriginKey, row]));
  return {
    sources: publicSources,
    subscriptions: sources.map(row => ({
      sourceId: row.sourceId,
      checkedAt: row.checkedAt?.toISOString() ?? null,
      error: row.errorCode ? providerError : null,
      items: row.items.map(item => {
        const existing = savedByKey.get(originKey(row.sourceId, item.id));
        if (!existing?.callOriginJson) return item;
        const origin = JSON.parse(existing.callOriginJson) as AcademicCallOrigin;
        return { ...item, workspaceId: existing.id, ...(changedSince(item, origin) ? { changed: true as const } : {}) };
      }),
    })),
  };
}

export async function listAcademicCalls(user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await altazorActor(user, client);
  return snapshot(actor.id, client);
}

async function changeSubscription(action: "subscribe" | "unsubscribe", sourceId: string, user: CausaAccessUser, client: PrismaClient) {
  if (action === "subscribe") sourceFor(sourceId);
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx);
    const key = { ownerId: actor.id, sourceId };
    if (action === "subscribe") {
      await tx.altazorCallSubscription.upsert({ where: { ownerId_sourceId: key }, create: key, update: {} });
    } else {
      await tx.altazorCallSubscription.deleteMany({ where: key });
    }
    return snapshot(actor.id, tx);
  });
}

async function refreshCalls(sourceId: string, user: CausaAccessUser, client: PrismaClient, read: CallReader, signal?: AbortSignal) {
  sourceFor(sourceId);
  const token = randomUUID();
  const subscription = await altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx);
    const row = await tx.altazorCallSubscription.findUnique({ where: { ownerId_sourceId: { ownerId: actor.id, sourceId } }, select: { id: true } });
    if (!row) throw missingSubscription();
    const started = new Date();
    const acquired = await tx.altazorCallSubscription.updateMany({
      where: { id: row.id, OR: [{ refreshStartedAt: null }, { refreshStartedAt: { lt: new Date(+started - leaseMs) } }] },
      data: { refreshKey: token, refreshStartedAt: started },
    });
    if (!acquired.count) throw httpError("La fuente ya se está actualizando. Espera a que termine la consulta.", 409);
    return row;
  });
  let items: CallFeedItem[] | undefined;
  try {
    const seen = new Set<string>();
    items = feedItems.parse((await read(sourceId, { signal })).filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, maximumItems));
  } catch {
    // A failed provider response does not replace the last successful snapshot.
  }
  const observedAt = new Date();
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx);
    const updated = await tx.altazorCallSubscription.updateMany({
      where: { id: subscription.id, ownerId: actor.id, refreshKey: token },
      data: {
        ...(items ? { itemsJson: JSON.stringify(items), checkedAt: observedAt, errorCode: null } : { errorCode: "source_unavailable" }),
        refreshKey: null, refreshStartedAt: null,
      },
    });
    if (!updated.count) throw staleRefresh();
    return snapshot(actor.id, tx);
  });
}

const savedWorkspace = { id: true, title: true, archivedAt: true, briefJson: true } as const;
function savedCall(workspace: { id: string; title: string; briefJson: string }, reused: boolean) {
  const brief = JSON.parse(workspace.briefJson) as typeof emptyAcademicBrief;
  const call = brief.call && { country: brief.call.country, status: brief.call.status, deadline: brief.call.deadline };
  return { workspaceId: workspace.id, reused, workspace: { id: workspace.id, title: workspace.title, kind: "call" as const, ...(call ? { call } : {}) } };
}

async function saveCall(input: Extract<CallAction, { action: "save" }>, user: CausaAccessUser, client: PrismaClient) {
  const source = sourceFor(input.sourceId);
  const key = originKey(source.id, input.itemId);
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx);
    const previous = await tx.altazorAcademicWorkspace.findUnique({
      where: { ownerId_callOriginKey: { ownerId: actor.id, callOriginKey: key } }, select: savedWorkspace,
    });
    if (previous) {
      if (previous.archivedAt) throw httpError("Esta convocatoria ya está guardada en un trabajo archivado.", 409);
      return savedCall(previous, true);
    }
    const subscription = await tx.altazorCallSubscription.findUnique({
      where: { ownerId_sourceId: { ownerId: actor.id, sourceId: source.id } },
      select: { itemsJson: true, checkedAt: true },
    });
    if (!subscription?.checkedAt) throw missingSubscription();
    if (input.checkedAt && subscription.checkedAt.toISOString() !== input.checkedAt) {
      throw httpError("La fuente se actualizó. Vuelve a abrir Convocatorias antes de guardar.", 409);
    }
    const found = readItems(subscription.itemsJson).find(item => item.id === input.itemId);
    if (!found) throw httpError("La convocatoria no aparece en la última consulta de esta fuente.", 404);
    if (await tx.altazorAcademicWorkspace.count({ where: { ownerId: actor.id, archivedAt: null } }) >= ACADEMIC_WORKSPACE_LIMIT) {
      throw httpError("Archiva un trabajo para guardar otra convocatoria. El límite activo es cien.", 413);
    }
    const { id: itemId, ...item } = found;
    const provenance: AcademicCallOrigin = {
      ...item, itemId, sourceId: source.id, sourceLabel: source.label, sourceUrl: source.url, country: source.country,
      checkedAt: subscription.checkedAt.toISOString(),
    };
    const brief: typeof emptyAcademicBrief = {
      ...emptyAcademicBrief,
      task: "teaching_material",
      objective: item.summary,
      call: {
        ...emptyAcademicCall,
        country: source.country,
        organization: source.label.slice(0, 200),
        url: item.url,
        deadline: item.deadline || "",
      },
    };
    const created = await tx.altazorAcademicWorkspace.create({
      data: {
        ownerId: actor.id, requestId: randomUUID(), kind: "call", title: item.title.slice(0, 200),
        briefJson: JSON.stringify(brief), matrixJson: JSON.stringify(emptyAcademicMatrix),
        callOriginKey: key, callOriginJson: JSON.stringify(provenance),
      },
      select: savedWorkspace,
    });
    await writeAuditStrict({
      actorId: actor.id, action: "altazor.academic.call.import", entityType: "AltazorAcademicWorkspace", entityId: created.id,
      after: { sourceId: source.id, externalKey: key },
    }, tx);
    return savedCall(created, false);
  });
}

export async function mutateAcademicCalls(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma,
  options: { read?: CallReader; signal?: AbortSignal } = {}) {
  const input = academicCallAction.parse(raw);
  switch (input.action) {
    case "subscribe":
    case "unsubscribe":
      return changeSubscription(input.action, input.sourceId, user, client);
    case "refresh":
      return refreshCalls(input.sourceId, user, client, options.read ?? readCallSource, options.signal);
    case "save":
      return saveCall(input, user, client);
  }
}
