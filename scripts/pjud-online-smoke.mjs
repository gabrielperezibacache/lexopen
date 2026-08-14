#!/usr/bin/env node
/**
 * Smoke online PJUD: browser + OJV guest + salas portal + sidecar health.
 *
 * Uso:
 *   npm run pjud:online
 *   npm run pjud:online -- --sidecar http://127.0.0.1:8787
 *   npm run pjud:online -- --skip-ojv
 *   npm run pjud:online -- --skip-claveunica
 *
 * Sin CAPTCHA_SOLVER_* el scrape de causas no corre; este smoke valida
 * conectividad, arranque de browser y (salvo --skip-claveunica) que OJV
 * abre el formulario OIDC real de ClaveÚnica (no el portal marketing).
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const sidecarArgIdx = process.argv.indexOf("--sidecar");
const sidecarUrl =
  (sidecarArgIdx >= 0 && process.argv[sidecarArgIdx + 1]) ||
  process.env.PJUD_SCRAPER_URL ||
  "http://127.0.0.1:8787";

function parseFlag(name) {
  return args.has(name);
}

async function fetchJson(url, init) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(init?.timeoutMs || 120_000),
        redirect: "error",
      });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { res, body };
}

async function runTsxProbe() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      [
        "tsx",
        path.join(root, "scripts/pjud-online-probe-run.ts"),
        ...(parseFlag("--skip-ojv") ? ["--skip-ojv"] : []),
        ...(parseFlag("--skip-salas") ? ["--skip-salas"] : []),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PJUD_PUBLIC_SCRAPE: process.env.PJUD_PUBLIC_SCRAPE || "1",
        },
        shell: process.platform === "win32",
      }
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, out, err });
    });
    child.on("error", reject);
  });
}

async function main() {
  console.log("[pjud-online] smoke start");
  const failures = [];

  // 1) Sidecar health (if up)
  try {
    const { res, body } = await fetchJson(`${sidecarUrl.replace(/\/$/, "")}/health`, {
      timeoutMs: 5_000,
    });
    if (res.ok && body.ok) {
      console.log(
        `[pjud-online] sidecar health ok scrapeReady=${body.scrapeReady} captcha=${body.captcha}`
      );
    } else {
      failures.push(`sidecar health HTTP ${res.status}`);
      console.warn("[pjud-online] sidecar health unexpected", body);
    }
  } catch (error) {
    console.warn(
      `[pjud-online] sidecar no responde en ${sidecarUrl} (${error instanceof Error ? error.message : error}) — continuo con probe in-process`
    );
  }

  // 2) In-process online probe (browser + OJV + salas)
  console.log("[pjud-online] probe browser/OJV/salas…");
  const probe = await runTsxProbe();
  const lastLine = probe.out
    .trim()
    .split(/\n/)
    .filter(Boolean)
    .at(-1);
  let probeJson = null;
  try {
    probeJson = lastLine ? JSON.parse(lastLine) : null;
  } catch {
    probeJson = null;
  }
  if (probeJson) {
    console.log(
      `[pjud-online] browser=${probeJson.browser?.ok ? "ok" : "fail"} channel=${probeJson.browser?.channel || "-"}`
    );
    console.log(
      `[pjud-online] ojv=${probeJson.ojv?.ok ? "ok" : "fail"} status=${probeJson.ojv?.status ?? "-"} guest=${probeJson.ojv?.guestEntry} form=${probeJson.ojv?.consultaForm} captchaLikely=${probeJson.ojv?.captchaLikely}`
    );
    console.log(
      `[pjud-online] salas=${probeJson.salas?.ok ? "ok" : "fail"} restricted=${probeJson.salas?.restricted} note=${probeJson.salas?.note || probeJson.salas?.error || ""}`
    );
    if (!probeJson.browser?.ok) failures.push("browser launch failed");
    if (!parseFlag("--skip-ojv") && !probeJson.ojv?.ok) {
      failures.push(`ojv unreachable: ${probeJson.ojv?.error || "status"}`);
    }
  } else {
    failures.push("probe JSON missing");
    console.error(probe.err || probe.out);
  }
  if (probe.code !== 0 && probe.code !== 2) {
    failures.push(`probe exit ${probe.code}`);
    if (probe.err) console.error(probe.err.slice(0, 2000));
  }

  // 2b) ClaveÚnica OIDC form (no credentials) — catches marketing-link regressions
  if (!parseFlag("--skip-claveunica")) {
    console.log("[pjud-online] probe ClaveÚnica OIDC form…");
    const cu = await new Promise((resolve, reject) => {
      const child = spawn(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["tsx", path.join(root, "scripts/pjud-claveunica-form-probe.ts")],
        {
          cwd: root,
          env: { ...process.env },
          shell: process.platform === "win32",
        }
      );
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d.toString();
      });
      child.stderr.on("data", (d) => {
        err += d.toString();
      });
      child.on("exit", (code) => {
        resolve({ code: code ?? 1, out, err });
      });
      child.on("error", reject);
    });
    if (cu.code === 0) {
      console.log("[pjud-online] claveunica form ok");
    } else {
      failures.push("claveunica OIDC form probe failed");
      console.error((cu.err || cu.out).slice(0, 2500));
    }
  }

  // 3) Sidecar /online/probe if auth allows (dev without key)
  try {
    const key = process.env.PJUD_SCRAPER_KEY?.trim();
    const headers = {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    };
    const { res, body } = await fetchJson(
      `${sidecarUrl.replace(/\/$/, "")}/online/probe`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          skipOjv: parseFlag("--skip-ojv"),
          skipSalas: true,
        }),
        timeoutMs: 120_000,
      }
    );
    if (res.status === 401) {
      console.warn(
        "[pjud-online] sidecar /online/probe 401 (defina PJUD_SCRAPER_KEY si el sidecar la exige)"
      );
    } else if (res.ok || res.status === 503) {
      console.log(
        `[pjud-online] sidecar probe browser=${body.browser?.ok} ojv=${body.ojv?.ok}`
      );
      assert.equal(typeof body.ok, "boolean");
    } else {
      console.warn(`[pjud-online] sidecar probe HTTP ${res.status}`, body);
    }
  } catch (error) {
    console.warn(
      `[pjud-online] sidecar /online/probe skip: ${error instanceof Error ? error.message : error}`
    );
  }

  if (failures.length) {
    console.error("[pjud-online] FAIL:", failures.join("; "));
    process.exit(1);
  }
  console.log("[pjud-online] OK");
  if (!process.env.CAPTCHA_SOLVER_API_KEY) {
    console.log(
      "[pjud-online] nota: sin CAPTCHA_SOLVER_* no se prueba lookup de causas live."
    );
  }
}

main().catch((error) => {
  console.error("[pjud-online]", error);
  process.exit(1);
});
