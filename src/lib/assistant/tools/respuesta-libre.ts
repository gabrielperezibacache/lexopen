import { secureTool } from "@/lib/assistant/secure-tool";
import { z } from "zod";
import { askLlm, legalSystemPrompt } from "@/lib/integrations/llm";
import { altazorConversationInstructions } from "@/lib/altazor/system-prompt";
import type { AssistantTool } from "./types";

import { STAFF_ROLES } from "@/lib/auth/roles";

export const respuestaLibreSchema = z.object({
  texto: z.string().trim().min(1).max(8000),
});
export type RespuestaLibreInput = z.infer<typeof respuestaLibreSchema>;

/** Marker authority is supplied by verified citations, never by uploaded text. */
export function assistantReferencesValid(body: string, references: Array<{ marker: string; quote: string }> = []) {
  const allowed = new Set(references.map(reference => reference.marker));
  if ([...body.matchAll(/\[(?:\^)?(R\d+)\]/g)].some(match => !allowed.has(match[1]))) return false;
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const quoted = /(?:“([^”]+)”|«([^»]+)»|"([^"\n]+)")\s*[,;:.]?\s*\[(?:\^)?(R\d+)\]/g;
  const prefixed = /\[(?:\^)?(R\d+)\]\s*[,;:.]?\s*(?:“([^”]+)”|«([^»]+)»|"([^"\n]+)")/g;
  const proven = (marker: string, quote: string) => references.some(reference => reference.marker === marker && normalize(reference.quote).includes(normalize(quote)));
  for (const match of body.matchAll(quoted)) if (!proven(match[4], match[1] || match[2] || match[3])) return false;
  for (const match of body.matchAll(prefixed)) if (!proven(match[1], match[2] || match[3] || match[4])) return false;
  for (const match of body.matchAll(/^>\s*(.+?)\s*\[(?:\^)?(R\d+)\]/gm)) if (!proven(match[2], match[1])) return false;
  return true;
}

/** Fallback conversacional: ninguna herramienta específica aplicó al pedido. */
export const respuestaLibreTool: AssistantTool<RespuestaLibreInput> = secureTool({
  id: "respuesta.libre",
  description: "Responde libremente con el copiloto cuando ninguna herramienta específica aplica",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: respuestaLibreSchema,
  preview(input) {
    return `Responder con el copiloto: «${input.texto.slice(0, 140)}${
      input.texto.length > 140 ? "…" : ""
    }»`;
  },
  async execute(input, ctx) {
    ctx.signal?.throwIfAborted();
    await ctx.authorizeContext?.();
    const result = await askLlm({
      messages: [
        { role: "system", content: legalSystemPrompt({ utilityHint: ctx.scope ? altazorConversationInstructions(ctx.scope.causaId ? "case" : "personal") : undefined }) },
        ...(ctx.history || []),
        // Shared transport limits each message to 12,000 characters. Separate
        // bounded data blocks preserve the final instruction and all windows.
        ...(ctx.context ? Array.from({ length: Math.ceil(Math.min(ctx.context.length, 32_000) / 10_000) }, (_, index) => ({ role: "user" as const, content: `<<<CONTEXTO_NO_CONFIABLE parte ${index + 1}>>>\n${ctx.context!.slice(index * 10_000, (index + 1) * 10_000)}\n<<<FIN_CONTEXTO_NO_CONFIABLE>>>` })) : []),
        { role: "user", content: input.texto },
      ],
      userId: ctx.userId,
      causaId: ctx.scope?.causaId || undefined,
      signal: ctx.signal,
      expectedDestination: ctx.expectedDestination,
      utilityLabel: "assistant.respuesta_libre",
    });
    if (ctx.scope && result.source !== "llm") return { ok: false, message: "note" in result && result.note || "El proveedor no produjo una respuesta de IA. Revise la conexión antes de volver a enviar." };
    if (!result.content) {
      return {
        ok: false,
        message: result.note || "El copiloto no pudo responder en este momento.",
      };
    }
    if (ctx.scope && !assistantReferencesValid(result.content, ctx.validatedReferences)) return { ok: false, message: "La respuesta incluyó una referencia o cita literal que no se pudo cotejar con las fuentes seleccionadas. Revise la selección antes de reintentar." };
    return {
      ok: true,
      message: result.content,
      card: { type: "respuesta-libre", source: result.source },
    };
  },
});
