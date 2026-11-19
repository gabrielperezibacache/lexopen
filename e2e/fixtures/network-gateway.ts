import { createServer, request as forward } from "node:http";
/** Loopback-only fault injector. Fail real HTTP streams, including service worker traffic. */
export async function networkGateway(target: string) {
  let offline = false, dropPath = "", dropMethod = "PATCH";
  const requests: Array<{ method: string; path: string; body: string }> = [];
  const patches: Array<{ path: string; body: string }> = [];
  const server = createServer(async (req, res) => {
    if (offline) { res.destroy(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks), path = new URL(req.url || "/", target).pathname;
    if (req.method !== "GET") requests.push({ method: req.method || "", path, body: body.toString() });
    if (req.method === "PATCH") patches.push({ path, body: body.toString() });
    const drop = req.method === dropMethod && path === dropPath;
    if (drop) dropPath = "";
    const upstream = forward(new URL(req.url || "/", target), { method: req.method, headers: req.headers }, response => {
      if (drop) {
        response.resume();
        response.once("end", () => {
          // Send partial JSON after server commit. A pre-header socket reset can
          // be retried transparently by Chromium, hiding the lost response.
          res.writeHead(response.statusCode || 200, { "Content-Type": "application/json", "Content-Length": "1000" });
          res.write('{"', () => res.destroy());
        });
        return;
      }
      res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
    });
    upstream.on("error", () => res.destroy()); upstream.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("Loopback gateway did not bind");
  return { origin: `http://127.0.0.1:${address.port}`, patches, requests,
    setOffline(value: boolean) { offline = value; },
    dropNextPatch(path: string) { dropPath = path; dropMethod = "PATCH"; },
    dropNextPost(path: string) { dropPath = path; dropMethod = "POST"; },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
