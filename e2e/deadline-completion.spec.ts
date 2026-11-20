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
    const missingOriginal = await prisma.documento.create({
      data: {
        nombre: `Texto sin original ${tag}.pdf`,
        tipo: "otro",
        causaId: cause.id,
        autorId: user.id,
        contenido: "Sólo texto extraído, sin original PDF",
        mimeType: "application/pdf",
      },
    });
    await prisma.plazo.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        titulo: `Plazo ${String(i).padStart(3, "0")}`,
        causaId: cause.id,
        responsableId: user.id,
        fechaLimite: new Date("2088-11-20T00:00:00Z"),
        esFatal: true,
      })),
    });
    await loginAs(page, user.email);
    await authenticateApiRequests(page);
    await page.goto(`/plazos?mes=2088-11&causaId=${cause.id}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .getByText("105 plazos en esta vista", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
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
    const card = page.locator("div.panel").filter({
      has: page.getByRole("heading", { name: target.titulo, exact: true }),
    });
    // An explicit destination must remain reachable even when it is beyond the first window.
    await card.getByRole("link", { name: target.titulo, exact: true }).click();
    await expect(page.getByRole("heading", { name: target.titulo, level: 1 })).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(`/plazos/${target.id}`);
    const back = page.getByRole("link", { name: "Volver a plazos" });
    const origin = new URL((await back.getAttribute("href"))!, page.url());
    expect(origin.searchParams.get("causaId")).toBe(cause.id);
    expect(origin.searchParams.get("after")).toBe(firstResponse.headers()["x-next-cursor"]);
    expect(origin.hash).toBe(`#plazo-${target.id}`);
    await back.click();
    await expect(page).toHaveURL(origin.href);
    await expect(card.getByRole("heading", { level: 2, name: target.titulo, exact: true })).toBeVisible();
    await expect(card).toBeInViewport();
    await card
      .getByRole("button", { name: "Registrar cumplimiento", exact: true })
      .click();
    await card.getByLabel("Tipo de respaldo").selectOption("document");
    await card.getByLabel("Buscar documento de la causa").fill(tag);
    await card.getByRole("button", { name: "Buscar", exact: true }).click();
    await card
      .getByLabel("Documento de la causa", { exact: true })
      .selectOption(missingOriginal.id);
    await card
      .getByRole("button", { name: "Confirmar cumplimiento", exact: true })
      .click();
    await expect(card.getByRole("alert")).toContainText(
      "El original del respaldo no está disponible",
    );
    expect(
      await prisma.plazoStateEvent.count({ where: { plazoId: target.id } }),
    ).toBe(0);
    await card
      .getByLabel("Documento de la causa", { exact: true })
      .selectOption(doc.id);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card
      .getByRole("group", { name: "Respaldo del cumplimiento" })
      .scrollIntoViewIfNeeded();
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
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/calendario?vista=mes&ym=2088-11&tipo=plazo");
    await page.getByTestId("cal-day-2088-11-20").getByRole("link", { name: /Ver los \d+ plazos/ }).click();
    const fromAgenda = page.locator(`#agenda-plazo-${target.id}`);
    await expect(fromAgenda).toContainText("Fatal");
    await expect(fromAgenda).toContainText(user.name);
    await fromAgenda.click();
    await expect(page.getByRole("heading", { name: target.titulo, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`#plazo-${target.id}`)).toContainText(user.name);
    await page.getByRole("link", { name: "Volver al calendario" }).click();
    await expect(fromAgenda).toBeInViewport();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator(`#movil-plazo-${target.id}`).click();
    await expect(page.getByRole("heading", { name: target.titulo, level: 1 })).toBeVisible({ timeout: 30_000 });
    const calendarReturn = page.getByRole("link", { name: "Volver al calendario" });
    await expect(calendarReturn).toHaveAttribute("href", `/calendario?vista=agenda&ym=2088-11&tipo=plazo#movil-plazo-${target.id}`);
    await calendarReturn.click();
    await expect(page.locator(`#movil-plazo-${target.id}`)).toBeInViewport();
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: outsider.id } });
    await page.goto(`/plazos/${target.id}`);
    await expect(page.getByRole("heading", { name: "Página no encontrada", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: target.titulo, exact: true })).toHaveCount(0);
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

test("plazos: causas fuera de las primeras 100, roles internos y páginas de vencidos", async ({
  page,
}) => {
  test.setTimeout(120000);
  const tag = randomUUID(),
    users: string[] = [];
  try {
    const owner = await prisma.user.create({
      data: {
        name: `Autor ${tag}`,
        email: `${tag}@deadline-picker.invalid`,
        password: await hash("lexopen", 10),
        role: "abogado",
      },
    });
    users.push(owner.id);
    const outside = await prisma.user.create({
      data: {
        name: `Ajeno ${tag}`,
        email: `outside-${tag}@deadline-picker.invalid`,
        password: "no-login",
        role: "abogado",
      },
    });
    users.push(outside.id);
    const old = await prisma.causa.create({
      data: {
        titulo: `Expediente antiguo ${tag}`,
        rit: `ANT-${tag}`,
        tribunal: "Ficticio",
        materia: "civil",
        acceso: "equipo",
        abogadoId: owner.id,
        updatedAt: new Date("2000-01-01T00:00:00Z"),
      },
    });
    await prisma.causa.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        titulo: `Reciente ${i} ${tag}`,
        tribunal: "Ficticio",
        materia: "civil",
        acceso: "equipo",
        abogadoId: owner.id,
      })),
    });
    await prisma.causa.create({
      data: {
        titulo: `Ajena ${tag}`,
        rit: `HIDDEN-${tag}`,
        tribunal: "Ficticio",
        materia: "civil",
        acceso: "equipo",
        abogadoId: outside.id,
      },
    });
    for (const role of ["socio", "procurador", "contabilidad"]) {
      const u = await prisma.user.create({
        data: {
          name: `${role} ${tag}`,
          email: `${role}-${tag}@deadline-picker.invalid`,
          password: "no-login",
          role,
        },
      });
      users.push(u.id);
    }
    await loginAs(page, owner.email);
    await page.goto("/plazos?mes=2088-11");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Registrar un plazo", exact: true }).click();
    const method = page.getByLabel("Cómo fijar el vencimiento");
    await expect(method).toHaveValue("manual");
    await method.selectOption("civil");
    await expect(page.getByRole("status").filter({ hasText: "espera revisión profesional" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear plazo" })).toBeDisabled();
    await method.selectOption("manual");
    const select = page.getByLabel("Causa", { exact: true });
    await expect(select.locator(`option[value="${old.id}"]`)).toHaveCount(0);
    const query = page.getByLabel("Buscar causa", { exact: true });
    await query.fill(old.rit!);
    await query
      .locator("..")
      .getByRole("button", { name: "Buscar", exact: true })
      .click();
    await select.selectOption(old.id);
    for (const role of ["socio", "procurador", "contabilidad"])
      await expect(
        page
          .getByLabel("Responsable", { exact: true })
          .getByRole("option", { name: `${role} ${tag}`, exact: true }),
      ).toHaveCount(1);
    await page
      .getByLabel("Título", { exact: true })
      .fill(`Creado por búsqueda ${tag}`);
    await page
      .getByLabel("Fecha límite directa", { exact: true })
      .fill("2088-11-24");
    await page
      .getByRole("button", { name: "Crear plazo", exact: true })
      .click();
    await expect
      .poll(() => prisma.plazo.count({ where: { causaId: old.id } }))
      .toBe(1);
    const blocked = await (
      await page.request.get(`/api/plazos/options?kind=cause&q=HIDDEN-${tag}`)
    ).json();
    expect(blocked.items).toEqual([]);
    await prisma.plazo.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        titulo: `Vencido ${i} ${tag}`,
        causaId: old.id,
        responsableId: owner.id,
        fechaLimite: new Date("2020-01-01T00:00:00Z"),
      })),
    });
    await page.goto(`/plazos?vista=mis-vencidos&causaId=${old.id}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .getByText("105 plazos en esta vista", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Registrar cumplimiento", exact: true }),
    ).toHaveCount(100);
    await page
      .getByRole("link", { name: "Ver siguientes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Registrar cumplimiento", exact: true }),
    ).toHaveCount(5);
  } finally {
    await prisma.causa.deleteMany({ where: { abogadoId: { in: users } } });
    await prisma.commandExecution.deleteMany({
      where: { ownerId: { in: users } },
    });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
});
