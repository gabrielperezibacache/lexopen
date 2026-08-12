#!/usr/bin/env node
/**
 * Bootstrap LexOpen PJUD scraper sidecar.
 * Usage: node scripts/pjud-scraper-worker.mjs
 * Prefer: npm run pjud:scraper  (tsx)
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "src/lib/pjud/scraper-server.ts");

if (!process.env.PJUD_PUBLIC_SCRAPE) {
  process.env.PJUD_PUBLIC_SCRAPE = "1";
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsx", entry],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
