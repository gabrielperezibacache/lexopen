/**
 * HTTP sidecar PJUD (worker scrape estilo CausaMonitor).
 * CausaMonitor: app Next + API + worker Redis concurrency 5.
 * LexOpen: web Next + este sidecar Playwright + cola Postgres `PjudSyncJob`.
 *
 * Endpoints: GET /health, POST /causas/lookup, POST /mis-causas, POST /causas/buscar,
 *            POST /online/probe, POST /salas/fetch
 *
 * Run: npm run pjud:scraper
 * Env: PORT, PJUD_SCRAPER_KEY, CAPTCHA_*, PJUD_PUBLIC_SCRAPE=1 (auto si no set)
 */

import http from "node:http";
import { URL } from "node:url";
import {
  publicScrapeEnabled,
  publicScrapeReady,
  scrapeCausaByRol,
  scrapeCausasByRut,
  scrapeMisCausasWithClaveUnica,
  PjudScrapeError,
} from "@/lib/pjud/public-scrape";
import {
  captchaSolverConfigured,
  captchaSolverStatusPublic,
} from "@/lib/pjud/captcha-solver";
import {
  fetchSalasPortalHtml,
  probePjudOnline,
} from "@/lib/pjud/online-probe";
import { parseSalasTablaHtml } from "@/lib/pjud/salas";

if (process.env.PJUD_PUBLIC_SCRAPE !== "0") {
  process.env.PJUD_PUBLIC_SCRAPE = process.env.PJUD_PUBLIC_SCRAPE || "1";
}

const PORT = Number(process.env.PORT || 8787);
/** Loopback by default — ClaveÚnica passwords must not hit a LAN-exposed bind. */
const BIND =
  process.env.PJUD_SCRAPER_BIND?.trim() ||
  process.env.HOSTNAME?.trim() ||
  "127.0.0.1";
const MAX_BODY = 2 * 1024 * 1024;

function authOk(req: http.IncomingMessage) {
  const key = process.env.PJUD_SCRAPER_KEY?.trim();
  if (!key) {
    // Fail-closed in production: require a shared secret with the web service.
    return process.env.NODE_ENV !== "production";
  }
  const header = req.headers.authorization || "";
  return header === `Bearer ${key}`;
}

async function readJson(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY) throw new Error("Body demasiado grande");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function send(
  res: http.ServerResponse,
  status: number,
  body: unknown
) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function serializeMovimiento(m: {
  externalId: string;
  titulo: string;
  detalle?: string | null;
  fecha: Date;
  referencia?: string | null;
  cuaderno?: string | null;
  folio?: string | null;
  etapa?: string | null;
  tramite?: string | null;
  esReceptor?: boolean;
  documentoRef?: string | null;
}) {
  return {
    id: m.externalId.replace(/^(scrape|pjud|demo):/, ""),
    titulo: m.titulo,
    detalle: m.detalle,
    fecha: m.fecha.toISOString().slice(0, 10),
    referencia: m.referencia,
    cuaderno: m.cuaderno,
    folio: m.folio,
    etapa: m.etapa,
    tramite: m.tramite,
    esReceptor: Boolean(m.esReceptor),
    documentoRef: m.documentoRef,
  };
}

export function createScraperServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname.replace(/\/$/, "") || "/";

      if (req.method === "GET" && (path === "/health" || path === "/")) {
        const ready = publicScrapeReady();
        return send(res, 200, {
          ok: true,
          status: "ok",
          service: "lexopen-pjud-scraper",
          timestamp: new Date().toISOString(),
          // CausaMonitor-shaped health fields (api.causamonitor.com/api/health)
          workerRunning: ready,
          worker: {
            running: ready,
            role: "ojv-guest-scrape",
          },
          scrapeEnabled: publicScrapeEnabled(),
          scrapeReady: ready,
          captcha: captchaSolverConfigured(),
          captchaProviders: captchaSolverStatusPublic(),
        });
      }

      if (!authOk(req)) {
        return send(res, 401, { error: "Unauthorized" });
      }

      if (req.method === "POST" && path === "/causas/lookup") {
        const body = await readJson(req);
        const rit = String(body.rit || "").trim();
        const ruc = body.ruc ? String(body.ruc).trim() : null;
        const tribunal = String(body.tribunal || "").trim();
        if ((!rit && !ruc) || !tribunal) {
          return send(res, 400, { error: "rit/ruc y tribunal requeridos" });
        }
        const result = await scrapeCausaByRol({
          id: "sidecar",
          rit: rit || null,
          ruc,
          tribunal,
          titulo: rit || ruc || "causa",
          caratula: null,
        });
        return send(res, 200, {
          sala: result.sala,
          note: result.note,
          movimientos: result.movimientos.map(serializeMovimiento),
        });
      }

      if (req.method === "POST" && path === "/mis-causas") {
        const body = await readJson(req);
        const rut = String(body.rut || "").trim();
        const password = String(body.password || "");
        if (!rut || !password) {
          return send(res, 400, { error: "rut y password requeridos" });
        }
        // Respect explicit kill-switch; otherwise allow when absent (sidecar is opted-in by call).
        if (process.env.PJUD_CLAVEUNICA_SCRAPE?.trim() === "0") {
          return send(res, 409, {
            error:
              "Automatización ClaveÚnica deshabilitada (PJUD_CLAVEUNICA_SCRAPE=0).",
          });
        }
        const causas = await scrapeMisCausasWithClaveUnica({
          rut,
          password,
          optedIn: true,
        });
        return send(res, 200, { causas });
      }

      if (req.method === "POST" && path === "/causas/buscar") {
        const body = await readJson(req);
        const rut = String(body.rut || "").trim();
        if (!rut) return send(res, 400, { error: "rut requerido" });
        const causas = await scrapeCausasByRut(rut);
        return send(res, 200, { causas });
      }

      if (req.method === "POST" && path === "/online/probe") {
        const body = await readJson(req);
        const probe = await probePjudOnline({
          skipOjv: Boolean(body.skipOjv),
          skipSalas: Boolean(body.skipSalas),
          timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
        });
        return send(res, probe.ok ? 200 : 503, probe);
      }

      if (req.method === "POST" && path === "/salas/fetch") {
        const body = await readJson(req);
        const fetched = await fetchSalasPortalHtml({
          url: body.url ? String(body.url) : undefined,
        });
        if (fetched.restricted) {
          return send(res, 200, {
            ok: false,
            restricted: true,
            status: fetched.status,
            url: fetched.url,
            agenda: [],
            note: "Portal salas restringido desde este host; pegue HTML en /api/pjud/salas.",
          });
        }
        const agenda = parseSalasTablaHtml(fetched.html, {
          corteDefault: body.corteDefault
            ? String(body.corteDefault)
            : undefined,
        });
        return send(res, 200, {
          ok: true,
          restricted: false,
          status: fetched.status,
          url: fetched.url,
          agenda: agenda.slice(0, 100),
          count: agenda.length,
        });
      }

      return send(res, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof PjudScrapeError ? error.status || 502 : 500;
      return send(res, status, { error: message });
    }
  });
}

export function startScraperServer(port = PORT, bind = BIND) {
  const server = createScraperServer();
  const host = bind || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    const key = process.env.PJUD_SCRAPER_KEY?.trim();
    if (!key) {
      throw new Error(
        "PJUD_SCRAPER_KEY es obligatorio si el scraper no enlaza loopback"
      );
    }
  }
  server.listen(port, host, () => {
    console.log(
      `[pjud-scraper] listening on ${host}:${port} scrapeReady=${publicScrapeReady()}`
    );
  });
  return server;
}

const entry = process.argv[1] || "";
const isDirectEntry =
  /(^|[\\/])scraper-server\.(ts|js|mjs)$/.test(entry) ||
  /(^|[\\/])pjud-scraper-worker\.(mjs|js)$/.test(entry);
if (isDirectEntry) {
  startScraperServer();
}
