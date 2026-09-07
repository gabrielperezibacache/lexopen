import { withCsrfHeaders } from "@/lib/client-csrf";

/**
 * Client-side helper for mutating API calls: surfaces errors and only
 * runs success callbacks when the response is OK.
 */
export async function apiMutation<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; data?: T & { error?: string } }
> {
  try {
    const headers = withCsrfHeaders(init?.headers);
    const res = await fetch(input, { ...init, headers });
    const data = (res.status === 204 ? {} : await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (res.ok && data === null) {
      return { ok: false, error: "El servidor devolvió una respuesta inválida. Recargue y compruebe si se guardaron los cambios.", status: 502 };
    }
    if (!res.ok) {
      return {
        ok: false,
        error:
          (data && typeof data === "object" && "error" in data && typeof data.error === "string" && data.error) ||
          `Error ${res.status}`,
        status: res.status,
        data: data ?? undefined,
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Error de red", status: 0 };
  }
}
