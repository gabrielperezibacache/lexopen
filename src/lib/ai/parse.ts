/**
 * Extrae JSON de respuestas LLM (fenced ```json o primer objeto/array).
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text?.trim()) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || text).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const obj = candidate.match(/\{[\s\S]*\}/);
    if (obj) {
      try {
        return JSON.parse(obj[0]) as T;
      } catch {
        /* continue */
      }
    }
    const arr = candidate.match(/\[[\s\S]*\]/);
    if (arr) {
      try {
        return JSON.parse(arr[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function ensureMarkdown(content: string) {
  return content.trim() || "Sin contenido.";
}
