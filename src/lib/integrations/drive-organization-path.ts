import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalJson } from "@/lib/command-execution";
import { digest } from "@/lib/personal-connectors/core";
import { httpError } from "@/lib/auth/access";
import type { ManagedDriveAccount } from "@/lib/altazor/connectors/drive-management";
import { inspectChosenDriveFolder } from "./drive-import";
import { STUDY_ORGANIZATION_KEY } from "./google-study-drive";

type Db = typeof prisma | Prisma.TransactionClient;
const rootSchema = z.object({ folderId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/), name: z.string(), connectionId: z.string(), bindingRevision: z.string().regex(/^[a-f0-9]{64}$/), revision: z.string().uuid() });
export type Root = z.infer<typeof rootSchema>;

export async function rootFor(db: Db) {
  const record = await db.commandExecution.findUnique({ where: { key: STUDY_ORGANIZATION_KEY } });
  if (!record?.resultJson) return null;
  try { return rootSchema.parse(JSON.parse(record.resultJson)); } catch { throw httpError("Revisa la carpeta de Organización", 409); }
}

export function organizedDriveName(name: string, id?: string) {
  const safe = name.normalize("NFC").replace(/[\/\\\p{Cc}\p{Cf}]/gu, " ").replace(/^\.+/, "").replace(/\s+/g, " ").trim() || "Carpeta";
  let bounded = "";
  for (const char of safe) { if (Buffer.byteLength(bounded + char) > 140) break; bounded += char; }
  return bounded + (id ? ` · ${digest(id).slice(0, 10)}` : "");
}
type Scope = { kind: "user" | "causa" | "site"; id: string; name: string; clientId: string | null; clientName: string };
export function organizationSteps(scope: Scope, userId: string) {
  if (scope.kind === "user") return [{ id: "users", name: "Usuarios" }, { id: `user:${userId}`, name: organizedDriveName(scope.name, userId) }];
  return [
    { id: "clientes", name: "Clientes" },
    { id: `client:${scope.clientId || userId}`, name: organizedDriveName(scope.clientName, scope.clientId || userId) },
    { id: `group:${scope.kind}`, name: scope.kind === "causa" ? "Causas" : "Espacios de trabajo" },
    { id: `${scope.kind}:${scope.id}`, name: organizedDriveName(scope.name, scope.id) },
  ];
}

export function organizationNodeKey(root: string, parent: string, step: string) {
  return `drive-organization-node:${digest(canonicalJson({ root, parent, step }))}`;
}

export async function organizedCaseDestination(causaId: string, userId: string, account: ManagedDriveAccount, db: Db) {
  const root = await rootFor(db);
  if (!root || root.connectionId !== account.connectionId || root.bindingRevision !== account.bindingRevision) throw httpError("Revisa la Organización de la cuenta compartida.", 409);
  const cause = await db.causa.findUniqueOrThrow({ where: { id: causaId }, select: { titulo: true, rit: true, clienteId: true, cliente: { select: { razonSocial: true } } } });
  const steps = organizationSteps({ kind: "causa", id: causaId, name: [cause.rit, cause.titulo].filter(Boolean).join(" — "), clientId: cause.clienteId, clientName: cause.cliente?.razonSocial || "Sin cliente" }, userId);
  const revision = digest(canonicalJson({ root, steps }));
  return { root, steps, revision, name: steps[steps.length - 1].name };
}

// Only receipts for this case's exact path authorize a new binding. Folder names alone are ambiguous.
export async function verifyOrganizedCaseFolder(causaId: string, userId: string, account: ManagedDriveAccount, folderId: string, db: Db) {
  const destination = await organizedCaseDestination(causaId, userId, account, db);
  let parent = destination.root.folderId;
  const lineage: { id: string; parent: string }[] = [];
  for (const step of destination.steps) {
    const key = organizationNodeKey(destination.root.folderId, parent, step.id);
    const record = await db.commandExecution.findUnique({ where: { key }, select: { resultJson: true, status: true } });
    const id = record?.status === "completed" && record.resultJson ? JSON.parse(record.resultJson).folderId : null;
    if (typeof id !== "string") throw httpError("Prepara la carpeta de esta causa en Organización.", 409);
    lineage.push({ id, parent }); parent = id;
  }
  if (parent !== folderId) throw httpError("El destino debe ser la carpeta organizada de esta causa.", 409);
  const io = { openTransport: account.openTransport };
  await inspectChosenDriveFolder(destination.root.folderId, null, io);
  for (const node of lineage) {
    const folder = await inspectChosenDriveFolder(node.id, null, io);
    if (!folder.parents.includes(node.parent)) throw httpError("Una carpeta fue movida en Drive. Revisa la Organización.", 409);
  }
  return destination.revision;
}
