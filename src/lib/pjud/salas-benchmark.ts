import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../testing/disposable-db";

async function runBenchmark() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  if (process.env.LEXOPEN_RUN_BENCHMARK !== "1" || !new URL(url).pathname.includes("benchmark")) {
    throw new Error("Use LEXOPEN_RUN_BENCHMARK=1 y una base desechable benchmark_test/e2e");
  }
  if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).toString() !== url) {
    throw new Error("DATABASE_URL debe coincidir con la base desechable del benchmark");
  }
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../db");
  const { applySalaMatchesToCartera, parseSalasTablaHtml } = await import("./salas");
  const suffix = randomUUID();
  let ids: string[] = [];
  try {
    const causas = await prisma.causa.createManyAndReturn({
      data: Array.from({ length: 500 }, (_, i) => ({ titulo: `Benchmark ${suffix}-${i}`, rit: `C-${i}-2024`, tribunal: "Corte de Apelaciones de Santiago", pjudMonitoreoActivo: true, estado: "activa", materia: "civil" })),
      select: { id: true },
    });
    ids = causas.map((c) => c.id);
    let html = "<table><tr><th>ROL</th><th>Carátula</th><th>Fecha</th><th>Sala</th><th>Corte</th></tr>";
    for (let i = 0; i < 500; i++) html += `<tr><td>C-${i}-2024</td><td>Fixture</td><td>15/08/2026</td><td>Sala ${i}</td><td>Corte de Apelaciones de Santiago</td></tr>`;
    const agenda = parseSalasTablaHtml(html + "</table>");
    const start = performance.now();
    const result = await applySalaMatchesToCartera(agenda, { causaIds: ids });
    console.log(JSON.stringify({ scanned: result.scanned, matched: result.matched, elapsedMs: performance.now() - start }));
  } finally {
    try { if (ids.length) await prisma.causa.deleteMany({ where: { id: { in: ids } } }); }
    finally { await prisma.$disconnect(); }
  }
}

runBenchmark().catch((error) => { console.error(error.message); process.exitCode = 1; });
