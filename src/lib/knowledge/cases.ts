import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, assertCausaCapability, documentReadWhere, siteFileReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { sha256 } from "@/lib/evidence/fragments";
import { evidenceResourceReadWhere } from "@/lib/evidence/service";
import { resolveCitation, verifyStoredCitation, toStoredCitation, type ResolvedCitation, type StoredCitation } from "./citations";
import { analyzeEvidenceFragment, detectPotentialContradictions, extractFactAmounts, parseFactTemporal, type TemporalEvidence } from "./extraction";
import { analyzeCaseSourcesSchema, createCaseConflictSchema, createCaseFactSchema, updateCaseConflictSchema, updateCaseFactSchema, type CreateCaseConflictInput, type CreateCaseFactInput, type UpdateCaseConflictInput, type UpdateCaseFactInput } from "./case-schemas";

export const CASE_KNOWLEDGE_LIMITS = { facts: 200, verificationFacts: 400, verificationReferences: 2000, sources: 200, versionsPerAnalysis: 20, fragmentsPerAnalysis: 200, proposalsPerAnalysis: 200, conflicts: 100 } as const;
export const CASE_ANALYSIS_VERSION = "lexopen-case-extractive-1";
type Client = Prisma.TransactionClient;
type FactRow = Prisma.CaseFactGetPayload<{ include: { _count: { select: { reviews: true; citations: true } } } }>;
type FactMeta = { amounts?: ReturnType<typeof extractFactAmounts>; warnings?: string[]; inferenceReason?: string | null };
export type CaseFactView = {
  id: string; causaId: string; statement: string; dateLiteral: string | null; dateStart: string | null; dateEnd: string | null;
  datePrecision: string; dateInferred: boolean; inferenceReason: string | null; comparisonKey: string | null;
  status: string; highlighted: boolean; revision: number; origin: string; createdAt: string; updatedAt: string;
  citations: ResolvedCitation[]; citationCount: number; citationsLimited: boolean; stale: boolean; partial: boolean; warnings: string[]; reviewCount: number;
};
export type CaseConflictView = { id: string; leftFactId: string; rightFactId: string; kind: string; reason: string; status: string; revision: number; stale: boolean; createdAt: string; updatedAt: string };
const factInclude = { _count: { select: { reviews: true, citations: true } } } as const;
function jsonObject<T>(text: string): T { try { const parsed = JSON.parse(text); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); return parsed as T; } catch { throw httpError("El registro de conocimiento no pudo verificarse", 409); } }
const day = (value: Date | null) => value?.toISOString().slice(0, 10) || null;
const normalize = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
async function transaction<T>(client: PrismaClient, operation: (tx: Client) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }); }
    catch (error) { if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034", "P2002"].includes(error.code)) throw error; }
  }
}
async function access(causaId: string, user: CausaAccessUser, tx: Client, write = false) {
  const actor = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!actor || !isStaff(actor.role) || !canSome(actor, "assistant.use")) throw httpError("No tiene permiso para trabajar con conocimiento del expediente", 403);
  const scope = write ? await assertCausaCapability(causaId, actor, "causa.write", tx) : await assertCausaAccess(causaId, actor, { auditOverride: false }, tx);
  return { actor, canWrite: can(actor, "causa.write", { causaRol: scope.causaRol }) };
}
function stored(input: string): StoredCitation { return jsonObject<StoredCitation>(input); }
function resolverCache(user: CausaAccessUser, causaId: string, tx: Client) {
  const cache = new Map<string, Promise<ResolvedCitation>>();
  const sourceCache = new Map<string, unknown>();
  const resolve = (input: string) => {
    let pending = cache.get(input);
    if (!pending) { pending = verifyStoredCitation(stored(input), user, { causaId, client: tx, cache: sourceCache }); if (cache.size < 500) cache.set(input, pending); }
    return pending;
  };
  resolve.references = (factId: string, after?: string) => tx.caseFactCitation.findMany({ where: { factId, ...(after ? { id: { lt: after } } : {}) }, orderBy: { id: "desc" }, take: 50, select: { id: true, sourceKey: true, citationJson: true } });
  return resolve;
}
async function factView(row: FactRow, resolve: ReturnType<typeof resolverCache>, maxCitations = 5): Promise<CaseFactView> {
  if (!row._count.citations || row._count.citations > 500) throw httpError("La evidencia del hecho no pudo verificarse", 409);
  const visible: ResolvedCitation[] = []; let allStale = true, partial = false, verified = 0, after: string | undefined;
  for (;;) {
    const references = await resolve.references(row.id, after);
    if (!references.length) break;
    for (const citation of references) {
      if (++verified > 500 || stored(citation.citationJson).sourceKey !== citation.sourceKey) throw httpError("La referencia del hecho no coincide con su cita", 409);
      const resolved = await resolve(citation.citationJson);
      allStale &&= !resolved.isCurrent; partial ||= resolved.partial;
      if (visible.length < maxCitations) visible.push(resolved);
      else if (maxCitations > 0 && resolved.isCurrent && visible.every(item => !item.isCurrent)) visible[visible.length - 1] = resolved;
    }
    if (references.length < 50) break;
    after = references.at(-1)!.id;
  }
  if (verified !== row._count.citations) throw httpError("Las referencias del hecho cambiaron durante la lectura", 409);
  const citations = visible;
  const meta = jsonObject<FactMeta>(row.metadataJson);
  return { id: row.id, causaId: row.causaId, statement: row.statement, dateLiteral: row.dateLiteral, dateStart: day(row.dateStart), dateEnd: day(row.dateEnd), datePrecision: row.datePrecision, dateInferred: row.dateInferred, inferenceReason: meta.inferenceReason || null, comparisonKey: row.comparisonKey, status: row.status, highlighted: row.highlighted, revision: row.revision, origin: row.origin, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), citations, citationCount: row._count.citations, citationsLimited: row._count.citations > citations.length, stale: allStale, partial, warnings: (meta.warnings || []).filter(value => typeof value === "string").slice(0, 20), reviewCount: row._count.reviews };
}
async function visibleFacts(rows: FactRow[], user: CausaAccessUser, causaId: string, tx: Client) {
  const resolve = resolverCache(user, causaId, tx), facts: CaseFactView[] = []; let restricted = false, verificationLimited = false, references = 0;
  for (const row of rows) {
    if (references + row._count.citations > CASE_KNOWLEDGE_LIMITS.verificationReferences) { verificationLimited = true; continue; }
    references += row._count.citations;
    try { facts.push(await factView(row, resolve)); }
    catch (error) { if (error && typeof error === "object" && "status" in error && [404, 409].includes(Number(error.status))) restricted = true; else throw error; }
  }
  return { facts, restricted, verificationLimited };
}
function conflictView(row: Prisma.CaseConflictGetPayload<object>, facts: Map<string, CaseFactView>): CaseConflictView | null {
  const left = facts.get(row.leftFactId), right = facts.get(row.rightFactId);
  if (!left || !right) return null;
  const meta = jsonObject<{ leftRevision?: number; rightRevision?: number }>(row.metadataJson);
  return { id: row.id, leftFactId: row.leftFactId, rightFactId: row.rightFactId, kind: row.kind, reason: row.reason, status: row.status, revision: row.revision, stale: left.stale || right.stale || meta.leftRevision !== left.revision || meta.rightRevision !== right.revision, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** No source text, titles or derived statements are returned after any backing ACL is lost. */
export async function readCaseKnowledge(causaId: string, user: CausaAccessUser, query: { after?: string; q?: string; status?: string } = {}, client: PrismaClient = prisma) {
  if ((query.after?.length || 0) > 100 || (query.q?.length || 0) > 100 || query.status && !["proposed", "accepted", "rejected", "hidden"].includes(query.status)) throw httpError("Filtro de hechos inválido", 400);
  return transaction(client, async tx => {
    const { actor, canWrite } = await access(causaId, user, tx);
    // Verify a fixed, unfiltered cohort before q/status/cursors can inspect any
    // statement. Restricted/verification signals never depend on a hidden match.
    const rows = await tx.caseFact.findMany({ where: { causaId }, orderBy: { id: "desc" }, take: CASE_KNOWLEDGE_LIMITS.verificationFacts + 1, include: factInclude });
    const verified = await visibleFacts(rows.slice(0, CASE_KNOWLEDGE_LIMITS.verificationFacts), actor, causaId, tx);
    if (query.after) {
      const cursor = rows.find(row => row.id === query.after) || await tx.caseFact.findFirst({ where: { id: query.after, causaId }, include: factInclude });
      if (!cursor) throw httpError("Cursor no encontrado o sin acceso", 404);
      try { await factView(cursor, resolverCache(actor, causaId, tx), 0); } catch (error) { if (error && typeof error === "object" && "status" in error && [404, 409].includes(Number(error.status))) throw httpError("Cursor no encontrado o sin acceso", 404); throw error; }
    }
    const q = query.q ? normalize(query.q).toLocaleLowerCase("es") : "";
    const matching = verified.facts.filter(fact => (!query.after || fact.id < query.after) && (!query.status || fact.status === query.status) && (!q || normalize(fact.statement).toLocaleLowerCase("es").includes(q)));
    const limited = matching.length > CASE_KNOWLEDGE_LIMITS.facts;
    const facts = matching.slice(0, CASE_KNOWLEDGE_LIMITS.facts), restricted = verified.restricted;
    const verificationLimited = verified.verificationLimited || rows.length > CASE_KNOWLEDGE_LIMITS.verificationFacts;
    const factsById = new Map(facts.map(fact => [fact.id, fact]));
    const conflicts = facts.length ? await tx.caseConflict.findMany({ where: { causaId, leftFactId: { in: facts.map(fact => fact.id) }, rightFactId: { in: facts.map(fact => fact.id) } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: CASE_KNOWLEDGE_LIMITS.conflicts + 1 }) : [];
    const active = facts.filter(fact => !["hidden", "rejected"].includes(fact.status));
    const dated = active.filter(fact => fact.dateStart && !["unknown", "ambiguous"].includes(fact.datePrecision)).sort((a, b) => a.dateStart!.localeCompare(b.dateStart!) || (a.dateEnd || "").localeCompare(b.dateEnd || "") || a.id.localeCompare(b.id));
    const undated = active.filter(fact => !fact.dateStart || ["unknown", "ambiguous"].includes(fact.datePrecision));
    return { facts, chronology: { dated, undated }, conflicts: conflicts.slice(0, CASE_KNOWLEDGE_LIMITS.conflicts).flatMap(row => { const view = conflictView(row, factsById); return view ? [view] : []; }), canWrite, restricted, coverage: { factsLimited: limited, conflictsLimited: conflicts.length > CASE_KNOWLEDGE_LIMITS.conflicts, factsShown: facts.length, factsLimit: CASE_KNOWLEDGE_LIMITS.facts, nextAfter: limited ? facts.at(-1)!.id : null, verificationLimited, verificationFactsLimit: CASE_KNOWLEDGE_LIMITS.verificationFacts, verificationReferencesLimit: CASE_KNOWLEDGE_LIMITS.verificationReferences, chronologyScope: "Hechos autorizados de esta página dentro de una ventana acotada de verificación; fecha del acontecimiento, nunca fecha de carga", networkRequests: 0, modelUsed: false } };
  });
}
export async function readCaseFact(causaId: string, factId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  return transaction(client, async tx => {
    const { actor } = await access(causaId, user, tx);
    const row = await tx.caseFact.findFirst({ where: { id: factId, causaId }, include: factInclude });
    if (!row) throw httpError("Hecho no encontrado o sin acceso", 404);
    const fact = await factView(row, resolverCache(actor, causaId, tx), 50);
    const history = await tx.caseFactReview.findMany({ where: { factId }, orderBy: { toRevision: "desc" }, take: 20, select: { id: true, actorId: true, fromRevision: true, toRevision: true, beforeJson: true, afterJson: true, createdAt: true, actor: { select: { name: true } } } });
    return { ...fact, history: history.map(review => ({ ...review, before: jsonObject(review.beforeJson), after: jsonObject(review.afterJson), beforeJson: undefined, afterJson: undefined, actorName: review.actor.name, actor: undefined, createdAt: review.createdAt.toISOString() })), historyLimited: fact.reviewCount > 20 };
  });
}
function calendar(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || day(date) !== value) throw httpError("Fecha del acontecimiento inválida", 400);
  return date;
}
function temporalData(input: Partial<CreateCaseFactInput>, quotes: string[], previous?: FactRow) {
  const previousMeta = previous ? jsonObject<FactMeta>(previous.metadataJson) : {};
  const literalChanged = input.dateLiteral !== undefined;
  const literal = literalChanged ? input.dateLiteral?.trim() || null : previous?.dateLiteral || null;
  if (literal && !quotes.some(quote => quote.includes(literal))) throw httpError("Copie literalmente la expresión de fecha de una de sus citas", 400);
  const parsed = parseFactTemporal(literal || "");
  const normalizedChanged = input.dateStart !== undefined || input.dateEnd !== undefined || input.datePrecision !== undefined;
  const precision = input.datePrecision || (literalChanged || !previous ? parsed.precision : previous.datePrecision);
  const start = calendar(input.dateStart !== undefined ? input.dateStart : normalizedChanged ? day(previous?.dateStart || null) : literalChanged || !previous ? parsed.start : day(previous.dateStart));
  const end = calendar(input.dateEnd !== undefined ? input.dateEnd : normalizedChanged ? day(previous?.dateEnd || null) : literalChanged || !previous ? parsed.end : day(previous.dateEnd));
  const inferred = input.dateInferred ?? (literalChanged || !previous ? false : previous.dateInferred);
  const inferenceReason = input.inferenceReason !== undefined ? input.inferenceReason?.trim() || null : previousMeta.inferenceReason || null;
  if (["unknown", "ambiguous"].includes(precision)) { if (start || end) throw httpError("Una fecha incierta no debe guardar un día normalizado", 400); }
  else {
    if (!start || !end || start > end) throw httpError("La fecha requiere un rango de inicio y término válido", 400);
    if (precision === "day" && day(start) !== day(end)) throw httpError("Una fecha de día debe tener el mismo inicio y término", 400);
    if (precision === "month" && (start.getUTCDate() !== 1 || start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth() || end.getUTCDate() !== new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate())) throw httpError("Una fecha de mes debe conservar el mes completo", 400);
    if (precision === "year" && (start.getUTCMonth() !== 0 || start.getUTCDate() !== 1 || end.getUTCMonth() !== 11 || end.getUTCDate() !== 31 || start.getUTCFullYear() !== end.getUTCFullYear())) throw httpError("Una fecha de año debe conservar el año completo", 400);
    if (!inferred && (parsed.start !== day(start) || parsed.end !== day(end) || parsed.precision !== precision)) throw httpError("La normalización interpreta la cita: márquela como inferida y explique el motivo", 400);
  }
  if (inferred && !inferenceReason) throw httpError("Explique la interpretación de la fecha inferida", 400);
  return { dateLiteral: literal, dateStart: start, dateEnd: end, datePrecision: precision, dateInferred: inferred, inferenceReason: inferred ? inferenceReason : null, warnings: parsed.warning ? [parsed.warning] : [] };
}
function factSnapshot(row: Pick<FactRow, "statement" | "dateLiteral" | "dateStart" | "dateEnd" | "datePrecision" | "dateInferred" | "comparisonKey" | "status" | "highlighted" | "revision" | "metadataJson">) {
  return { statement: row.statement, dateLiteral: row.dateLiteral, dateStart: day(row.dateStart), dateEnd: day(row.dateEnd), datePrecision: row.datePrecision, dateInferred: row.dateInferred, comparisonKey: row.comparisonKey, status: row.status, highlighted: row.highlighted, revision: row.revision, metadata: jsonObject(row.metadataJson) };
}
async function attachCitation(tx: Client, factId: string, citation: ResolvedCitation) {
  const snapshot = toStoredCitation(citation), sourceKey = snapshot.sourceKey;
  const exists = await tx.caseFactCitation.findUnique({ where: { factId_sourceKey: { factId, sourceKey } }, select: { id: true } });
  if (exists) return false;
  if (await tx.caseFactCitation.count({ where: { factId } }) >= 500) throw httpError("El hecho supera el límite de referencias; revise su evidencia antes de añadir versiones", 413);
  await tx.caseFactCitation.create({ data: { factId, sourceKey, citationJson: JSON.stringify(snapshot) } });
  return true;
}
function factFingerprint(citation: ResolvedCitation, quote: string) { return sha256(`${citation.resourceId || `${citation.kind}:${citation.versionId}`}\n${normalize(quote)}`); }
export async function createCaseFact(causaId: string, user: CausaAccessUser, raw: CreateCaseFactInput, client: PrismaClient = prisma) {
  const input = createCaseFactSchema.parse(raw);
  return transaction(client, async tx => {
    const { actor } = await access(causaId, user, tx, true);
    const sourceCache = new Map<string, unknown>();
    const citations = await Promise.all(input.citations.map(citation => resolveCitation(citation, actor, { causaId, client: tx, cache: sourceCache })));
    const temporal = temporalData(input, citations.map(citation => citation.quote));
    const parsed = parseFactTemporal(citations[0].quote);
    const matchesExtraction = citations.length === 1 && normalize(input.statement) === normalize(citations[0].quote) && temporal.dateLiteral === parsed.literal && day(temporal.dateStart) === parsed.start && day(temporal.dateEnd) === parsed.end && temporal.datePrecision === parsed.precision && !temporal.dateInferred;
    // Distinct human assertions may cite the same paragraph. Only an exact
    // extractive assertion shares the automatic proposal's immutable identity.
    const fingerprint = matchesExtraction ? factFingerprint(citations[0], citations[0].quote) : sha256(JSON.stringify(["manual", normalize(input.statement), [...new Set(citations.map(citation => citation.sourceKey))].sort(), temporal.dateLiteral, day(temporal.dateStart), day(temporal.dateEnd), temporal.datePrecision, temporal.dateInferred]));
    let row = await tx.caseFact.findUnique({ where: { causaId_fingerprint: { causaId, fingerprint } }, include: factInclude });
    if (row) {
      await factView(row, resolverCache(actor, causaId, tx));
      // A retry never overwrites a professional's subsequent review.
      return { fact: await factView(row, resolverCache(actor, causaId, tx)), reused: true };
    }
    const { inferenceReason, warnings, ...dateFields } = temporal;
    row = await tx.caseFact.create({ data: { causaId, statement: input.statement, ...dateFields, comparisonKey: input.comparisonKey || null, highlighted: input.highlighted || false, status: "proposed", origin: "manual", createdById: actor.id, fingerprint, metadataJson: JSON.stringify({ inferenceReason, warnings, amounts: extractFactAmounts(input.statement) }) }, include: factInclude });
    for (const citation of citations) await attachCitation(tx, row.id, citation);
    await writeAuditStrict({ actorId: actor.id, action: "case.fact.create", entityType: "CaseFact", entityId: row.id, after: { causaId, statementSha256: sha256(row.statement), citations: citations.length, origin: "manual" } }, tx);
    row = await tx.caseFact.findUniqueOrThrow({ where: { id: row.id }, include: factInclude });
    return { fact: await factView(row, resolverCache(actor, causaId, tx)), reused: false };
  });
}
export async function updateCaseFact(causaId: string, factId: string, user: CausaAccessUser, raw: UpdateCaseFactInput, client: PrismaClient = prisma) {
  const input = updateCaseFactSchema.parse(raw);
  return transaction(client, async tx => {
    const { actor } = await access(causaId, user, tx, true);
    const row = await tx.caseFact.findFirst({ where: { id: factId, causaId }, include: factInclude });
    if (!row) throw httpError("Hecho no encontrado o sin acceso", 404);
    const before = await factView(row, resolverCache(actor, causaId, tx));
    if (row.revision !== input.revision) throw httpError("El hecho cambió. Actualice antes de revisar", 409);
    const temporal = temporalData(input, before.citations.map(citation => citation.quote), row);
    const { inferenceReason, warnings, ...dateFields } = temporal;
    const statement = input.statement || row.statement;
    const data = { ...dateFields, statement, status: input.status || row.status, highlighted: input.highlighted ?? row.highlighted, comparisonKey: input.comparisonKey !== undefined ? input.comparisonKey : row.comparisonKey, metadataJson: JSON.stringify({ amounts: extractFactAmounts(statement), warnings, inferenceReason }), revision: { increment: 1 } };
    const updated = await tx.caseFact.updateMany({ where: { id: row.id, causaId, revision: input.revision }, data });
    if (updated.count !== 1) throw httpError("El hecho cambió. Actualice antes de revisar", 409);
    const after = await tx.caseFact.findUniqueOrThrow({ where: { id: row.id }, include: factInclude });
    await tx.caseFactReview.create({ data: { factId, actorId: actor.id, fromRevision: row.revision, toRevision: after.revision, beforeJson: JSON.stringify(factSnapshot(row)), afterJson: JSON.stringify({ ...factSnapshot(after), reviewReason: input.reason }) } });
    await writeAuditStrict({ actorId: actor.id, action: "case.fact.review", entityType: "CaseFact", entityId: factId, after: { revision: after.revision, status: after.status, statementSha256: sha256(after.statement) } }, tx);
    return factView(after, resolverCache(actor, causaId, tx));
  });
}

async function sourceChoices(causaId: string, actor: CausaAccessUser, tx: Client, q?: string) {
  const versionSelect = { id: true, sourceName: true, sourceRevision: true, extractionStatus: true, metadataJson: true, createdAt: true } as const;
  const [documents, files] = await Promise.all([
    tx.documento.findMany({ where: { AND: [documentReadWhere(actor), { causaId }, ...(q ? [{ nombre: { contains: q, mode: "insensitive" as const } }] : [])] }, orderBy: { id: "asc" }, take: CASE_KNOWLEDGE_LIMITS.sources + 1, select: { id: true, nombre: true, version: true, updatedAt: true, evidenceResource: { select: { id: true, versions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: versionSelect } } } } }),
    tx.siteFile.findMany({ where: { AND: [siteFileReadWhere(actor), { site: { causaId } }, ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : [])] }, orderBy: { id: "asc" }, take: CASE_KNOWLEDGE_LIMITS.sources + 1, select: { id: true, siteId: true, name: true, version: true, updatedAt: true, evidenceResource: { select: { id: true, versions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: versionSelect } } } } }),
  ]);
  const sources = [
    ...documents.map(doc => ({ version: doc.evidenceResource?.versions[0], title: doc.nombre, resourceId: doc.evidenceResource?.id || null, documentId: doc.id, siteFileId: null, siteId: null, expectedRevision: `${doc.version}:${doc.updatedAt.toISOString()}`, expectedUpdatedAt: doc.updatedAt, baseHref: `/documentos/${doc.id}/fuentes` })),
    ...files.map(file => ({ version: file.evidenceResource?.versions[0], title: file.name, resourceId: file.evidenceResource?.id || null, documentId: null, siteFileId: file.id, siteId: file.siteId, expectedRevision: `${file.version}:${file.updatedAt.toISOString()}`, expectedUpdatedAt: file.updatedAt, baseHref: `/sites/${file.siteId}/archivos/${file.id}/fuentes` })),
  ].sort((a, b) => (a.documentId || a.siteFileId || "").localeCompare(b.documentId || b.siteFileId || ""));
  return { sources: sources.slice(0, CASE_KNOWLEDGE_LIMITS.sources).map(({ version, expectedRevision, expectedUpdatedAt, baseHref, ...source }) => ({ ...source, versionId: version?.id || null, isCurrent: Boolean(version && (version.sourceRevision === "legacy" ? expectedUpdatedAt <= version.createdAt : version.sourceRevision === expectedRevision)), partial: Boolean(version && (jsonObject<{ partial?: boolean }>(version.metadataJson).partial || ["needs_ocr", "partial", "failed"].includes(version.extractionStatus))), href: version ? `${baseHref}?version=${version.id}` : baseHref })), limited: sources.length > CASE_KNOWLEDGE_LIMITS.sources };
}
function sourceCaseWhere(causaId: string, actor: CausaAccessUser): Prisma.DocumentResourceWhereInput {
  return { AND: [evidenceResourceReadWhere(actor), { OR: [{ documento: { causaId } }, { siteFile: { site: { causaId } } }] }] };
}
export async function listCaseKnowledgeSources(causaId: string, user: CausaAccessUser, query: { versionId?: string; after?: number; q?: string } = {}, client: PrismaClient = prisma) {
  if ((query.versionId?.length || 0) > 100 || query.after !== undefined && (!Number.isSafeInteger(query.after) || query.after < 0) || (query.q?.length || 0) > 100) throw httpError("Filtro de fuentes inválido", 400);
  return transaction(client, async tx => {
    const { actor } = await access(causaId, user, tx);
    if (!query.versionId) return { ...await sourceChoices(causaId, actor, tx, query.q), warnings: ["Sólo versiones preparadas; abra el lector para preparar una fuente nueva o actualizar una revisión"] };
    const version = await tx.documentEvidenceVersion.findFirst({ where: { id: query.versionId, resource: sourceCaseWhere(causaId, actor) }, select: { id: true, sourceName: true } });
    if (!version) throw httpError("Fuente no encontrada o sin acceso", 404);
    const rows = await tx.documentEvidenceFragment.findMany({ where: { versionId: version.id, ordinal: { gt: query.after || 0 }, ...(query.q ? { text: { contains: query.q, mode: "insensitive" } } : {}) }, orderBy: { ordinal: "asc" }, take: 51, select: { id: true, ordinal: true, text: true } });
    const cache = new Map<string, unknown>();
    const fragments = await Promise.all(rows.slice(0, 50).map(row => resolveCitation({ kind: "document", fragmentId: row.id, quote: row.text }, actor, { causaId, client: tx, cache })));
    return { source: { versionId: version.id, title: version.sourceName }, fragments, nextAfter: rows.length > 50 ? rows[49].ordinal : null };
  });
}
async function twoFacts(causaId: string, leftId: string, rightId: string, actor: CausaAccessUser, tx: Client) {
  if (leftId === rightId) throw httpError("Seleccione dos hechos diferentes", 400);
  const rows = await tx.caseFact.findMany({ where: { causaId, id: { in: [leftId, rightId] } }, include: factInclude });
  if (rows.length !== 2) throw httpError("Los hechos no se encuentran en este expediente", 404);
  const resolve = resolverCache(actor, causaId, tx);
  const facts = await Promise.all(rows.map(row => factView(row, resolve)));
  const left = facts.find(fact => fact.id === leftId)!, right = facts.find(fact => fact.id === rightId)!;
  const references = await tx.caseFactCitation.findMany({ where: { factId: { in: [leftId, rightId] } }, take: 1001, select: { citationJson: true } });
  const fragmentKeys = new Set(references.map(citation => { const ref = stored(citation.citationJson); return `${ref.kind}:${ref.fragmentId}`; }));
  if (fragmentKeys.size < 2) throw httpError("La comparación requiere al menos dos fragmentos distintos y verificables", 400);
  return { left, right };
}
const conflictFingerprint = (left: string, right: string, kind: string) => sha256([...([left, right].sort()), kind].join("\n"));
export async function createCaseConflict(causaId: string, user: CausaAccessUser, raw: CreateCaseConflictInput, client: PrismaClient = prisma) {
  const input = createCaseConflictSchema.parse(raw);
  return transaction(client, async tx => {
    const { actor } = await access(causaId, user, tx, true);
    const { left, right } = await twoFacts(causaId, input.leftFactId, input.rightFactId, actor, tx);
    const fingerprint = conflictFingerprint(left.id, right.id, input.kind);
    const previous = await tx.caseConflict.findUnique({ where: { causaId_fingerprint: { causaId, fingerprint } } });
    if (previous) return { conflict: conflictView(previous, new Map([[left.id, left], [right.id, right]]))!, reused: true };
    const row = await tx.caseConflict.create({ data: { causaId, leftFactId: left.id, rightFactId: right.id, kind: input.kind, reason: input.reason, status: "proposed", fingerprint, createdById: actor.id, metadataJson: JSON.stringify({ leftRevision: left.revision, rightRevision: right.revision, origin: "manual" }) } });
    await writeAuditStrict({ actorId: actor.id, action: "case.conflict.create", entityType: "CaseConflict", entityId: row.id, after: { causaId, leftFactId: left.id, rightFactId: right.id, kind: input.kind } }, tx);
    return { conflict: conflictView(row, new Map([[left.id, left], [right.id, right]]))!, reused: false };
  });
}
export async function readCaseConflict(causaId: string, conflictId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  return transaction(client, async tx => {
    const { actor } = await access(causaId, user, tx);
    const row = await tx.caseConflict.findFirst({ where: { id: conflictId, causaId } });
    if (!row) throw httpError("Comparación no encontrada o sin acceso", 404);
    const { left, right } = await twoFacts(causaId, row.leftFactId, row.rightFactId, actor, tx);
    const reviews = await tx.caseConflictReview.findMany({ where: { conflictId }, orderBy: { toRevision: "desc" }, take: 21, select: { id: true, actorId: true, fromRevision: true, toRevision: true, beforeJson: true, afterJson: true, createdAt: true, actor: { select: { name: true } } } });
    return { ...conflictView(row, new Map([[left.id, left], [right.id, right]]))!, left, right, history: reviews.slice(0, 20).map(review => ({ ...review, before: jsonObject(review.beforeJson), after: jsonObject(review.afterJson), beforeJson: undefined, afterJson: undefined, actorName: review.actor.name, actor: undefined, createdAt: review.createdAt.toISOString() })), historyLimited: reviews.length > 20 };
  });
}
export async function updateCaseConflict(causaId: string, conflictId: string, user: CausaAccessUser, raw: UpdateCaseConflictInput, client: PrismaClient = prisma) {
  const input = updateCaseConflictSchema.parse(raw);
  return transaction(client, async tx => {
    const { actor } = await access(causaId, user, tx, true);
    const row = await tx.caseConflict.findFirst({ where: { id: conflictId, causaId } });
    if (!row) throw httpError("Comparación no encontrada o sin acceso", 404);
    const { left, right } = await twoFacts(causaId, row.leftFactId, row.rightFactId, actor, tx);
    if (row.revision !== input.revision) throw httpError("La comparación cambió. Actualice antes de revisar", 409);
    // The comparison category is part of its identity; create a distinct comparison to change it.
    if (input.kind && input.kind !== row.kind) throw httpError("Cree otra comparación para cambiar su categoría", 400);
    const metadataJson = JSON.stringify({ ...jsonObject(row.metadataJson), leftRevision: left.revision, rightRevision: right.revision });
    const count = await tx.caseConflict.updateMany({ where: { id: row.id, causaId, revision: input.revision }, data: { reason: input.reason, status: input.status || row.status, metadataJson, revision: { increment: 1 } } });
    if (count.count !== 1) throw httpError("La comparación cambió. Actualice antes de revisar", 409);
    const after = await tx.caseConflict.findUniqueOrThrow({ where: { id: row.id } });
    await tx.caseConflictReview.create({ data: { conflictId, actorId: actor.id, fromRevision: row.revision, toRevision: after.revision, beforeJson: JSON.stringify({ reason: row.reason, status: row.status, kind: row.kind, revision: row.revision, metadata: jsonObject(row.metadataJson) }), afterJson: JSON.stringify({ reason: after.reason, status: after.status, kind: after.kind, revision: after.revision, metadata: jsonObject(after.metadataJson), reviewReason: input.reviewReason }) } });
    await writeAuditStrict({ actorId: actor.id, action: "case.conflict.review", entityType: "CaseConflict", entityId: row.id, after: { revision: after.revision, status: after.status } }, tx);
    return conflictView(after, new Map([[left.id, left], [right.id, right]]))!;
  });
}

function asTemporal(fact: CaseFactView): TemporalEvidence { return { literal: fact.dateLiteral, start: fact.dateStart, end: fact.dateEnd, precision: fact.datePrecision as TemporalEvidence["precision"], inferred: fact.dateInferred, warning: fact.warnings[0] || null }; }
/** Deterministic extraction proposes source text only. Reviews and statements already stored are never replaced. */
export async function analyzeCaseSources(causaId: string, user: CausaAccessUser, raw: { versionIds?: string[] } = {}, client: PrismaClient = prisma) {
  const input = analyzeCaseSourcesSchema.parse(raw);
  return transaction(client, async tx => {
    const { actor } = await access(causaId, user, tx, true);
    const choices = await sourceChoices(causaId, actor, tx);
    let versions: string[], versionsLimited = choices.limited;
    if (input.versionIds) {
      versions = [...new Set(input.versionIds)];
      const authorized = await tx.documentEvidenceVersion.count({ where: { id: { in: versions }, resource: sourceCaseWhere(causaId, actor) } });
      if (authorized !== versions.length) throw httpError("Alguna versión no existe en el expediente o dejó de estar autorizada", 404);
    } else {
      const eligible = choices.sources.filter(source => source.versionId && source.isCurrent).map(source => source.versionId!);
      const completed = await tx.caseAnalysisSource.findMany({ where: { causaId, versionId: { in: eligible }, extractorVersion: CASE_ANALYSIS_VERSION, completed: true }, select: { versionId: true } });
      const done = new Set(completed.map(source => source.versionId));
      const pending = eligible.filter(versionId => !done.has(versionId));
      versions = pending.slice(0, CASE_KNOWLEDGE_LIMITS.versionsPerAnalysis); versionsLimited ||= pending.length > versions.length;
    }
    let newFacts = 0, newCitations = 0, processedFragments = 0, processedProposals = 0, completedSources = 0, hasMore = versionsLimited;
    const warnings = new Set<string>();
    const cache = new Map<string, unknown>();
    for (const versionId of versions) {
      if (processedFragments >= CASE_KNOWLEDGE_LIMITS.fragmentsPerAnalysis || processedProposals >= CASE_KNOWLEDGE_LIMITS.proposalsPerAnalysis) { hasMore = true; break; }
      const progress = await tx.caseAnalysisSource.upsert({ where: { causaId_versionId_extractorVersion: { causaId, versionId, extractorVersion: CASE_ANALYSIS_VERSION } }, create: { causaId, versionId, extractorVersion: CASE_ANALYSIS_VERSION }, update: {} });
      if (progress.completed) continue;
      const budget = CASE_KNOWLEDGE_LIMITS.fragmentsPerAnalysis - processedFragments;
      const fragments = await tx.documentEvidenceFragment.findMany({ where: { versionId, ordinal: { gt: progress.afterOrdinal }, version: { resource: sourceCaseWhere(causaId, actor) } }, orderBy: { ordinal: "asc" }, take: budget + 1, select: { id: true, ordinal: true, text: true } });
      let lastOrdinal = progress.afterOrdinal, stopped = false;
      for (const fragment of fragments.slice(0, budget)) {
        const verified = await resolveCitation({ kind: "document", fragmentId: fragment.id, quote: fragment.text }, actor, { causaId, client: tx, cache });
        if (verified.partial) warnings.add("Hay fuentes con extracción parcial; analizar el texto disponible no revisa sus páginas pendientes");
        if (!verified.isCurrent) warnings.add("Se revisó una captura anterior del archivo; prepare su revisión actual para actualizar la evidencia");
        const extraction = analyzeEvidenceFragment({ id: fragment.id, text: fragment.text }, { maxProposals: 10 });
        for (const warning of extraction.warnings) warnings.add(warning);
        if (processedProposals + extraction.proposals.length > CASE_KNOWLEDGE_LIMITS.proposalsPerAnalysis) { stopped = true; hasMore = true; break; }
        for (const proposal of extraction.proposals) {
          const citation = proposal.quote === fragment.text ? verified : await resolveCitation({ kind: "document", fragmentId: fragment.id, quote: proposal.quote }, actor, { causaId, client: tx, cache });
          const fingerprint = factFingerprint(citation, proposal.quote);
          let fact = await tx.caseFact.findUnique({ where: { causaId_fingerprint: { causaId, fingerprint } }, select: { id: true } });
          if (!fact) {
            const dateFields = temporalData({ dateLiteral: proposal.temporal.literal }, [proposal.quote]);
            const { inferenceReason, warnings: temporalWarnings, ...dates } = dateFields;
            fact = await tx.caseFact.create({ data: { causaId, fingerprint, statement: proposal.statement, ...dates, origin: "extracted", createdById: actor.id, status: "proposed", metadataJson: JSON.stringify({ amounts: proposal.amounts, warnings: [...new Set([...temporalWarnings, ...extraction.warnings])].slice(0, 20), inferenceReason }) }, select: { id: true } }); newFacts++;
          }
          if (await attachCitation(tx, fact.id, citation)) newCitations++;
          processedProposals++;
        }
        processedFragments++; lastOrdinal = fragment.ordinal;
        if (extraction.limited) warnings.add("Un fragmento contiene más propuestas que el límite de extracción; revise el pasaje completo en su fuente");
      }
      const complete = !stopped && fragments.length <= budget;
      await tx.caseAnalysisSource.update({ where: { id: progress.id }, data: { afterOrdinal: lastOrdinal, completed: complete } });
      if (complete) completedSources++; else hasMore = true;
    }
    const rows = await tx.caseFact.findMany({ where: { causaId, status: { in: ["proposed", "accepted"] } }, orderBy: { id: "asc" }, take: CASE_KNOWLEDGE_LIMITS.facts + 1, include: factInclude });
    const { facts, restricted, verificationLimited } = await visibleFacts(rows.slice(0, CASE_KNOWLEDGE_LIMITS.facts), actor, causaId, tx);
    if (rows.length > CASE_KNOWLEDGE_LIMITS.facts) warnings.add("Las comparaciones automáticas revisan hasta 200 hechos; use comparaciones manuales para pares fuera de este lote");
    if (restricted) warnings.add("Algunos registros no se incluyeron porque su evidencia no está disponible o autorizada");
    if (verificationLimited) warnings.add("Se alcanzó el presupuesto de verificación de referencias; no se compararon hechos sin comprobar todo su respaldo");
    const candidates = detectPotentialContradictions(facts.map(fact => ({ id: fact.id, statement: fact.statement, comparisonKey: fact.comparisonKey, temporal: asTemporal(fact), amounts: extractFactAmounts(fact.statement) })));
    let newConflicts = 0;
    const byId = new Map(facts.map(fact => [fact.id, fact]));
    for (const candidate of candidates) {
      const left = byId.get(candidate.leftFactId)!, right = byId.get(candidate.rightFactId)!;
      const references = await tx.caseFactCitation.findMany({ where: { factId: { in: [left.id, right.id] } }, take: 1001, select: { citationJson: true } });
      if (new Set(references.map(citation => { const ref = stored(citation.citationJson); return `${ref.kind}:${ref.fragmentId}`; })).size < 2) continue;
      const fingerprint = conflictFingerprint(left.id, right.id, candidate.kind);
      if (await tx.caseConflict.findUnique({ where: { causaId_fingerprint: { causaId, fingerprint } }, select: { id: true } })) continue;
      await tx.caseConflict.create({ data: { causaId, leftFactId: left.id, rightFactId: right.id, kind: candidate.kind, reason: candidate.reason, status: "proposed", fingerprint, createdById: actor.id, metadataJson: JSON.stringify({ leftRevision: left.revision, rightRevision: right.revision, origin: "detected", ruleVersion: CASE_ANALYSIS_VERSION }) } }); newConflicts++;
    }
    if (choices.sources.some(source => !source.versionId || !source.isCurrent)) warnings.add("Hay archivos sin una captura actual preparada; no se interpretaron como material nuevo");
    if (versionsLimited) warnings.add("El alcance supera el lote disponible; seleccione versiones concretas o continúe el análisis");
    warnings.add("Las propuestas copian pasajes y comparaciones acotadas. Aceptar un hecho o confirmar una discrepancia requiere revisión profesional");
    await writeAuditStrict({ actorId: actor.id, action: "case.knowledge.analyze", entityType: "Causa", entityId: causaId, after: { newFacts, newCitations, newConflicts, processedFragments, completedSources, hasMore, extractorVersion: CASE_ANALYSIS_VERSION } }, tx);
    return { newFacts, newCitations, newConflicts, processedFragments, completedSources, hasMore, warnings: [...warnings].slice(0, 30), networkRequests: 0 as const, modelUsed: false as const };
  });
}
