import { z } from "zod";

/** Only files created/uploaded inside this container's working directory are readable. */
export const computerReadSchema = z.object({
  source: z.enum(["browser", "document"]),
  path: z.string().min(1).max(500).optional(),
  offset: z.number().int().min(0).max(2_000_000).default(0),
  limit: z.number().int().min(1000).max(12000).default(6000),
  query: z.string().trim().max(160).default(""),
  elementOffset: z.number().int().min(0).max(2000).default(0),
  elementLimit: z.number().int().min(1).max(80).default(40),
}).strict().superRefine((value, context) => {
  if (value.source === "document" && (!value.path || value.path.startsWith("/") || value.path.includes("\\") || value.path.split("/").some(part => !part || part.startsWith(".")) || /[\u0000-\u001f]/.test(value.path))) {
    context.addIssue({ code: "custom", message: "Elige una ruta relativa de archivo dentro del espacio de trabajo del contenedor.", path: ["path"] });
  }
  if (value.source === "browser" && value.path !== undefined) context.addIssue({ code: "custom", message: "La lectura del navegador no recibe una ruta de archivo.", path: ["path"] });
});
export type ComputerReadRequest = z.input<typeof computerReadSchema>;

const readingUrl = z.string().max(1000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
}, "La lectura sólo incluye enlaces sin credenciales ni parámetros de acceso.");
export const computerReadingSchema = z.object({
  version: z.literal("v1"), source: z.enum(["browser", "document"]), title: z.string().max(200), url: readingUrl.optional(),
  text: z.string().max(12000), totalChars: z.number().int().min(0).max(2_000_000), offset: z.number().int().min(0).max(2_000_000), nextOffset: z.number().int().min(0).max(2_000_000).nullable(),
  items: z.array(z.object({ ref: z.number().int().min(1).max(2000), role: z.string().max(80), label: z.string().max(160), url: readingUrl.optional(), disabled: z.boolean().optional(), checked: z.boolean().optional(), sensitive: z.boolean().optional() }).strict()).max(80),
  elementOffset: z.number().int().min(0).max(2000), nextElementOffset: z.number().int().min(0).max(2000).nullable(),
  method: z.enum(["dom", "pdf-text", "office-text", "plain-text"]), redacted: z.literal(true), warning: z.string().max(300).optional(),
}).strict();
export type ComputerReading = z.infer<typeof computerReadingSchema>;
