import { z } from "zod";
import { askLlm, legalSystemPrompt } from "@/lib/integrations/llm";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const respuestaLibreSchema = z.object({
  texto: z.string().trim().min(1).max(8000),
});
export type RespuestaLibreInput = z.infer<typeof respuestaLibreSchema>;

/** Fallback conversacional: ninguna herramienta específica aplicó al pedido. */
export const respuestaLibreTool: AssistantTool<RespuestaLibreInput> = {
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
    const result = await askLlm({
      messages: [
        { role: "system", content: legalSystemPrompt() },
        { role: "user", content: input.texto },
      ],
      userId: ctx.userId,
      utilityLabel: "assistant.respuesta_libre",
    });
    if (!result.content) {
      return {
        ok: false,
        message: result.note || "El copiloto no pudo responder en este momento.",
      };
    }
    return {
      ok: true,
      message: result.content,
      card: { type: "respuesta-libre", source: result.source },
    };
  },
};
