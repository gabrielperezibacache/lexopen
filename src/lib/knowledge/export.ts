import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { readCaseKnowledge } from "./cases";
import { renderChronologyCsv, renderKnowledgeMarkdown, type KnowledgeExportQuery } from "./export-render";

/** Re-resolves source access, quotations and originals on every download. */
export async function exportCaseKnowledge(causaId: string, user: CausaAccessUser, query: KnowledgeExportQuery, format: "markdown" | "csv", client: PrismaClient = prisma) {
  const snapshot = await readCaseKnowledge(causaId, user, query, client);
  const generatedAt = new Date().toISOString();
  return format === "csv" ? renderChronologyCsv(snapshot, query, generatedAt) : renderKnowledgeMarkdown(snapshot, query, generatedAt);
}
