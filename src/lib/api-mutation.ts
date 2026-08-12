import { withCsrfHeaders } from "@/lib/client-csrf";

/**
 * Client-side helper for mutating API calls: surfaces errors and only
 * runs success callbacks when the response is OK.
 */
export async function apiMutation<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const headers = withCsrfHeaders(init?.headers);
    const res = await fetch(input, { ...init, headers });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      return {
        ok: false,
        error:
          (data && typeof data === "object" && "error" in data && data.error) ||
          `Error ${res.status}`,
        status: res.status,
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Error de red", status: 0 };
  }
}
