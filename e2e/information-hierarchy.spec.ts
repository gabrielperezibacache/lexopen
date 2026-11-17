import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { addCivilDays, santiagoDateKey } from "../src/lib/chile-time";
import { loginAs } from "./helpers";

const db = new PrismaClient({
  datasources: {
    db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) },
  },
});
const tag = randomUUID();
let ownerId = "",
  causeId = "";
const email = `information-${tag}@example.test`;
test.beforeAll(async () => {
  const template = await db.user.findUniqueOrThrow({
    where: { email: "abogado@estudio.cl" },
  });
  ownerId = (
    await db.user.create({
      data: {
        name: "Profesional ficticio",
        email,
        password: template.password,
        role: "abogado",
      },
    })
  ).id;
  causeId = (
    await db.causa.create({
      data: {
        titulo: `Causa ficticia ${tag}`,
        tribunal: "Tribunal ficticio",
        materia: "civil",
        acceso: "equipo",
        abogadoId: ownerId,
      },
    })
  ).id;
  const today = santiagoDateKey(new Date());
  await db.plazo.createMany({
    data: Array.from({ length: 106 }, (_, index) => ({
      titulo: `Próximo ${index} ${tag}`,
      causaId: causeId,
      responsableId: ownerId,
      fechaLimite: new Date(
        `${index === 105 ? addCivilDays(today, 7) : today}T00:00:00Z`,
      ),
    })),
  });
});
test.afterAll(async () => {
  try {
    if (causeId) await db.causa.deleteMany({ where: { id: causeId } });
    if (ownerId) {
      await db.auditEvent.deleteMany({ where: { actorId: ownerId } });
      await db.user.deleteMany({ where: { id: ownerId } });
    }
  } finally {
    await db.$disconnect();
  }
});

test("jornada y próximos plazos coinciden; el formulario conserva el borrador al plegarse", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await loginAs(page, email);
  const upcoming = page
    .getByTestId("day-overview")
    .getByRole("link", { name: /Próximos plazos/ });
  await expect(upcoming.locator("strong")).toHaveText("106");
  await expect(page.getByTestId("inicio-composer")).toBeVisible();
  await upcoming.click();
  await page.waitForLoadState("networkidle");
  await expect(
    page
      .getByText("106 plazos en esta vista", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  const first = await page.request.get(
    "/api/plazos?vista=proximos&mes=2000-01&limit=100",
  );
  expect(first.status()).toBe(200);
  expect(first.headers()["x-total-count"]).toBe("106");
  const rows = await first.json();
  expect(rows).toHaveLength(100);
  const next = await page.request.get(
    `/api/plazos?vista=proximos&mes=2000-01&limit=100&after=${encodeURIComponent(first.headers()["x-next-cursor"])}`,
  );
  const rest = await next.json();
  expect(rest).toHaveLength(6);
  expect(new Set([...rows, ...rest].map((row) => row.id)).size).toBe(106);
  await page.getByRole("link", { name: "Ver siguientes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Registrar cumplimiento", exact: true }),
  ).toHaveCount(6);
  await page
    .getByRole("link", { name: "Registrar un plazo", exact: true })
    .click();
  const title = page.getByLabel("Título", { exact: true });
  await expect(title).toBeVisible();
  await title.fill("Borrador conservado");
  const summary = page.locator("#registrar-plazo > summary");
  await summary.click();
  await expect(title).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(title).toHaveValue("Borrador conservado");
  await summary.click();
  await page
    .getByRole("link", { name: "Registrar un plazo", exact: true })
    .click();
  await expect(title).toBeVisible();
  await expect(title).toHaveValue("Borrador conservado");
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll("main *")]
      .filter(
        (element) => element.getBoundingClientRect().right > innerWidth + 1,
      )
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        width: element.getBoundingClientRect().width,
        text: element.textContent?.slice(0, 60),
      }))
      .slice(0, 12),
  }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.width + 1,
  );
  await page.goto("/documentos?q=sin-resultados-ficticios-" + tag);
  await expect(
    page.getByRole("heading", { name: "Sin resultados", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Quitar filtros", exact: true }),
  ).toBeVisible();
});

test("revisión visual de los apartados en escritorio y móvil", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "chromium",
    "Visual captures in Chromium; interactions run in all three engines.",
  );
  test.setTimeout(180_000);
  await loginAs(page, "abogado@estudio.cl");
  const cause = await db.causa.findFirstOrThrow({
    where: { abogado: { email: "abogado@estudio.cl" } },
    orderBy: { createdAt: "asc" },
  });
  const routes = {
    inicio: "/inicio",
    causas: "/mis-causas",
    ficha: `/causas/${cause.id}`,
    expediente: `/causas/${cause.id}/expediente`,
    documentos: "/documentos",
    plazos: "/plazos",
    configuracion: "/configuracion",
    biblioteca: "/biblioteca",
    tareas: "/tareas",
    calendario: "/calendario",
    fuentes: "/jurisprudencia",
    clientes: "/clientes",
    mensajes: "/mensajes",
    finanzas: "/facturacion",
  };
  for (const [mode, size] of [
    ["desktop", { width: 1366, height: 900 }],
    ["mobile", { width: 360, height: 800 }],
  ] as const) {
    await page.setViewportSize(size);
    for (const [name, path] of Object.entries(routes)) {
      if (name === "configuracion") await loginAs(page, "socio@estudio.cl");
      if (name === "biblioteca") await loginAs(page, "abogado@estudio.cl");
      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response?.status(), path).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name} ${mode}`,
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`${name}-${mode}.png`),
        animations: "disabled",
      });
    }
  }
});
