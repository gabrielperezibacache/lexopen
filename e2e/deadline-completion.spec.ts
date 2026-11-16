import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
test.afterAll(() => prisma.$disconnect());
test("plazos: páginas completas, respaldo documental retenido, historial y móvil", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const tag = randomUUID();
  let userId = "",
    causeId = "",
    otherId = "";
  try {
    const user = await prisma.user.create({
      data: {
        name: "Responsable de prueba",
        email: `${tag}@deadline-ui.invalid`,
        password: await hash("lexopen", 10),
        role: "abogado",
      },
    });
    userId = user.id;
    const cause = await prisma.causa.create({
      data: {
        titulo: `Expediente ${tag}`,
        rit: `D-${tag}`,
        tribunal: "Ficticio",
        materia: "civil",
        abogadoId: user.id,
        acceso: "equipo",
      },
    });
    causeId = cause.id;
    const outsider = await prisma.user.create({
      data: {
        name: "Otra cuenta",
        email: `other-${tag}@deadline-ui.invalid`,
        password: "no-login",
        role: "abogado",
      },
    });
    otherId = outsider.id;
    const doc = await prisma.documento.create({
      data: {
        nombre: `Comprobante ${tag}.txt`,
        tipo: "otro",
        causaId: cause.id,
        autorId: user.id,
        contenido: "Comprobante original",
        mimeType: "text/plain",
      },
    });
    await prisma.plazo.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        titulo: `Plazo ${String(i).padStart(3, "0")}`,
        causaId: cause.id,
        responsableId: user.id,
        fechaLimite: new Date("2088-11-20T00:00:00Z"),
      })),
    });
    await loginAs(page, user.email);
    await authenticateApiRequests(page);
    await page.goto(`/plazos?mes=2088-11&causaId=${cause.id}`);
    await expect(page.getByText("105 plazos en esta vista")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Registrar cumplimiento", exact: true }),
    ).toHaveCount(100);
    await page
      .getByRole("link", { name: "Ver siguientes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Registrar cumplimiento", exact: true }),
    ).toHaveCount(5);
    const firstResponse = await page.request.get(
      `/api/plazos?causaId=${cause.id}&mes=2088-11&limit=100`,
    );
    expect(firstResponse.headers()["x-total-count"]).toBe("105");
    const first = await firstResponse.json();
    expect(Array.isArray(first)).toBe(true);
    const second = await (
      await page.request.get(
        `/api/plazos?causaId=${cause.id}&mes=2088-11&limit=100&after=${firstResponse.headers()["x-next-cursor"]}`,
      )
    ).json();
    expect(second).toHaveLength(5);
    expect(new Set([...first, ...second].map((p) => p.id)).size).toBe(105);
    const target = second[0];
    const card = page
      .locator("div.panel")
      .filter({
        has: page.getByRole("heading", { name: target.titulo, exact: true }),
      });
    await card
      .getByRole("button", { name: "Registrar cumplimiento", exact: true })
      .click();
    await card.getByLabel("Tipo de respaldo").selectOption("document");
    await card.getByLabel("Buscar documento de la causa").fill(tag);
    await card.getByRole("button", { name: "Buscar", exact: true }).click();
    await card
      .getByLabel("Documento de la causa", { exact: true })
      .selectOption(doc.id);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.getByRole("group",{name:"Respaldo del cumplimiento"}).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("plazo-respaldo-360.png") });
    await card
      .getByRole("button", { name: "Confirmar cumplimiento", exact: true })
      .click();
    await expect(
      card.getByRole("link", { name: `Documento: ${doc.nombre} · v1` }),
    ).toBeVisible();
    await prisma.documento.update({
      where: { id: doc.id },
      data: { version: { increment: 1 }, contenido: "Edición posterior" },
    });
    const href = await card
      .getByRole("link", { name: /Documento:/ })
      .getAttribute("href");
    const download = await page.request.get(href!);
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe("Comprobante original");
    expect(download.headers()["cache-control"]).toContain("no-store");
    await card
      .getByRole("button", { name: "Reabrir plazo", exact: true })
      .click();
    await expect
      .poll(() =>
        prisma.plazoStateEvent.count({ where: { plazoId: target.id } }),
      )
      .toBe(2);
    await expect(card.getByText(/cumplido → pendiente/)).toBeVisible();
    const native = await prisma.plazo.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(native.alertaEnviada).toBe(false);
    await prisma.documento.update({
      where: { id: doc.id },
      data: { confidencial: true },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { capabilityRevokes: "doc.confidential.read" },
    });
    await card
      .getByRole("button", { name: "Ver historial del plazo", exact: true })
      .click();
    await expect(
      card.getByText(
        "Documento de respaldo no disponible con los permisos actuales.",
      ),
    ).toBeVisible();
    expect((await page.request.get(href!)).status()).toBe(404);
    expect(
      (
        await apiRequest(page).patch("/api/plazos", {
          data: {
            id: target.id,
            estado: "cumplido",
            expectedVersion: first[0].expectedVersion,
          },
        })
      ).status(),
    ).toBe(409);
  } finally {
    if (causeId) await prisma.causa.deleteMany({ where: { id: causeId } });
    await prisma.commandExecution.deleteMany({
      where: { ownerId: { in: [userId, otherId] } },
    });
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: [userId, otherId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  }
});
