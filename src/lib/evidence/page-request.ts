function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Briefly wait for the bounded local PDF renderer; never retry denied or stale evidence. */
export async function requestPdfPage(url: string, signal: AbortSignal, transport: typeof fetch = fetch, wait: typeof pause = pause) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const response = await transport(url, { signal, cache: "no-store" });
    if (response.status === 429 && attempt < 2) {
      await response.body?.cancel();
      await wait(500 * (attempt + 1), signal);
      continue;
    }
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "No se pudo abrir esta página");
    if (!response.headers.get("content-type")?.startsWith("image/png")) throw new Error("La página recibida no es una imagen verificable");
    return response.blob();
  }
}
