import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/api";
import { authorizedEvidenceDocument } from "@/lib/evidence/service";
import { getAiUtility } from "@/lib/ai/utilities";
/** Preserve old links as an editable request, never auto-send their run=1 flag. */
export default async function AgentePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireStaff(), raw = await searchParams;
  const param = (key: string) => typeof raw[key] === "string" ? String(raw[key]).slice(0,200) : "";
  if (param("chatId")) redirect(`/agente/archivo?chatId=${encodeURIComponent(param("chatId"))}`);
  const params = new URLSearchParams(), documentId = param("documentoId");
  let causaId = param("causaId");
  if (documentId) {
    const document = await authorizedEvidenceDocument(documentId, user);
    if (document.causaId) { causaId = document.causaId; params.set("documentoId", documentId); }
  }
  if (causaId) params.set("causaId", causaId);
  if (param("utility") || documentId) params.set("intencion", `${getAiUtility(param("utility") || "doc_qa").starter}\nUsa únicamente los pasajes que seleccione. Conserva el resultado como borrador para mi revisión.`);
  redirect(`/inicio${params.size ? `?${params}` : ""}`);
}
