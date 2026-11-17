import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { buildInicioStatus } from "@/lib/assistant/status";
import { civilDateKey, santiagoMidnight } from "@/lib/chile-time";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { personalDeadlineWhere, upcomingDeadlinePeriod } from "./views";

async function main() {
  assert.equal(
    assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),
    new URL(process.env.DATABASE_URL!).toString(),
  );
  const tag = randomUUID();
  const users: string[] = [];
  const causes: string[] = [];
  try {
    for (const name of ["Responsable", "Otro profesional"]) {
      const user = await prisma.user.create({
        data: {
          name,
          email: `${name}-${tag}@views.invalid`,
          password: "no-login",
          role: "abogado",
        },
      });
      users.push(user.id);
      causes.push(
        (
          await prisma.causa.create({
            data: {
              titulo: name,
              tribunal: "Ficticio",
              materia: "civil",
              acceso: "equipo",
              abogadoId: user.id,
            },
          })
        ).id,
      );
    }
    const actor = { id: users[0], role: "abogado" };
    // Cross a month boundary with both date-only records and legacy instants.
    const now = new Date("2088-11-28T15:00:00Z");
    const period = upcomingDeadlinePeriod(now);
    assert.deepEqual(period, { first: "2088-11-28", through: "2088-12-05" });
    const dates = [
      "2088-11-27T23:59:59Z",
      "2088-11-28T00:00:00Z",
      "2088-11-28T01:00:00Z",
      "2088-11-28T12:00:00Z",
      "2088-12-05T00:00:00Z",
      "2088-12-06T00:00:00Z",
      "2088-12-06T01:00:00Z",
      "2088-12-06T12:00:00Z",
    ];
    for (const value of dates) {
      await prisma.plazo.create({
        data: {
          titulo: value,
          causaId: causes[0],
          responsableId: actor.id,
          fechaLimite: new Date(value),
          esFatal: true,
        },
      });
    }
    // A hidden case, another responsible user and completed work must not count.
    await prisma.plazo.createMany({
      data: [
        {
          titulo: "Oculto",
          causaId: causes[1],
          responsableId: actor.id,
          fechaLimite: santiagoMidnight(period.first),
        },
        {
          titulo: "De otra persona",
          causaId: causes[0],
          responsableId: users[1],
          fechaLimite: santiagoMidnight(period.first),
        },
        {
          titulo: "Cumplido",
          causaId: causes[0],
          responsableId: actor.id,
          fechaLimite: santiagoMidnight(period.first),
          estado: "cumplido",
        },
      ],
    });
    const all = await prisma.plazo.findMany({
      where: {
        causaId: causes[0],
        responsableId: actor.id,
        estado: "pendiente",
      },
    });
    for (const view of ["proximos", "mis-vencidos"] as const) {
      const expected = all.filter((row) => {
        const day = civilDateKey(row.fechaLimite);
        return view === "mis-vencidos"
          ? day < period.first
          : day >= period.first && day <= period.through;
      });
      const rows = await prisma.plazo.findMany({
        where: personalDeadlineWhere(actor, view, now),
      });
      assert.deepEqual(
        rows.map((row) => row.id).sort(),
        expected.map((row) => row.id).sort(),
      );
      const summary = await buildInicioStatus(actor, now);
      assert.equal(
        view === "proximos" ? summary.plazosProximos7d : summary.plazosVencidos,
        expected.length,
      );
      if (view === "proximos")
        assert.equal(summary.plazosFatalesProximos, expected.length);
    }
    console.log(
      "Personal deadline views: civil boundaries, month crossing, responsibility, ACL and summary agree",
    );
  } finally {
    await prisma.causa.deleteMany({ where: { id: { in: causes } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
