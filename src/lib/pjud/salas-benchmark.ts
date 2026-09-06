import { applySalaMatchesToCartera, parseSalasTablaHtml } from "./salas";
import { prisma } from "../db";

async function runBenchmark() {
  console.log("Setting up benchmark data...");
  // Create 500 causas
  const causas = await Promise.all(
    Array.from({ length: 500 }).map((_, i) =>
      prisma.causa.create({
        data: {
          titulo: `Causa ${i}`,
          rit: `C-${i}-2024`,
          tribunal: "Corte de Apelaciones de Santiago",
          pjudMonitoreoActivo: true,
          estado: "activa",
          materia: "civil",
        },
      })
    )
  );

  // Generate agenda matching these causas
  let html = "<table><tr><th>ROL</th><th>Carátula</th><th>Fecha</th><th>Sala</th><th>Corte</th></tr>";
  for (let i = 0; i < 500; i++) {
    html += `<tr><td>C-${i}-2024</td><td>Pérez con Soto</td><td>15/08/2026</td><td>Sala ${i}</td><td>Corte de Apelaciones de Santiago</td></tr>`;
  }
  html += "</table>";
  const agenda = parseSalasTablaHtml(html);

  console.log("Running benchmark (transaction)...");
  const start = performance.now();
  await applySalaMatchesToCartera(agenda);
  const end = performance.now();

  console.log(`Time taken: ${(end - start).toFixed(2)}ms`);

  // Cleanup
  await prisma.causa.deleteMany({
    where: {
      id: { in: causas.map(c => c.id) }
    }
  });
}

runBenchmark().catch(console.error).finally(() => process.exit(0));
