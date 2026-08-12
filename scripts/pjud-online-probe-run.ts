/**
 * Runner CLI for probePjudOnline (used by pjud-online-smoke).
 * npx tsx scripts/pjud-online-probe-run.ts [--skip-ojv] [--skip-salas]
 */
import { probePjudOnline } from "../src/lib/pjud/online-probe";

async function main() {
  const args = new Set(process.argv.slice(2));
  const probe = await probePjudOnline({
    skipOjv: args.has("--skip-ojv"),
    skipSalas: args.has("--skip-salas"),
    timeoutMs: 90_000,
  });
  process.stdout.write(`${JSON.stringify(probe)}\n`);
  const ok = probe.browser.ok && (probe.ojv.ok || args.has("--skip-ojv"));
  process.exit(ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
