import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("un usuario del estudio puede iniciar sesión y abrir causas", async ({
  page,
}) => {
  await loginAs(page, "socio@estudio.cl");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Hola, María" })
  ).toBeVisible();
  await expect(page.getByText("Inicio del estudio")).toBeVisible();

  const hostStatusResponse = await page.request.get("/api/admin/host-status");
  expect(hostStatusResponse.ok()).toBeTruthy();
  const hostStatus = (await hostStatusResponse.json()) as {
    counts: { users: number; documents: number };
    storage: { mode: string };
  };
  expect(hostStatus.counts.users).toBeGreaterThanOrEqual(4);
  expect(hostStatus.counts.documents).toBeGreaterThan(0);
  expect(["local", "s3", "incomplete"]).toContain(hostStatus.storage.mode);

  await page.goto("/configuracion");
  await expect(
    page.getByRole("heading", { name: "Configuración del estudio" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Usuarios del estudio" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear usuario" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estado del Host" })).toBeVisible();

  await page.goto("/personas");
  await expect(page.getByRole("heading", { name: "Personas" })).toBeVisible();
  await expect(page.getByTestId("people-manager")).toBeVisible();

  await page.goto("/causas");
  await expect(page).toHaveURL(/\/causas$/);
  await expect(
    page.getByRole("heading", { name: "Causas judiciales" })
  ).toBeVisible();
  await expect(page.getByText("C-4521-2025")).toBeVisible();
  const causeRow = page.locator("tr").filter({ hasText: "C-4521-2025" }).first();
  const causeHref = await causeRow
    .locator('a[href^="/causas/"]:not([href*="/editar"])')
    .first()
    .getAttribute("href");
  expect(causeHref).toBeTruthy();
  await page.goto(causeHref!);
  const exportHref = await page
    .getByRole("link", { name: "Exportar movimientos" })
    .getAttribute("href");
  const templateHref = await page
    .getByRole("link", { name: "Descargar plantilla" })
    .getAttribute("href");
  expect(exportHref).toContain("format=csv");
  expect(exportHref).not.toContain("template=1");
  expect(templateHref).toContain("format=csv");
  expect(templateHref).toContain("template=1");
  await expect(page.getByRole("button", { name: "Vista previa" })).toBeVisible();

  const invoicesResponse = await page.request.get("/api/billing/invoices?status=emitida");
  expect(invoicesResponse.ok()).toBeTruthy();
  const invoices = (await invoicesResponse.json()) as Array<{
    id: string;
    clienteId: string;
    totalClp: number;
    paidClp: number;
  }>;
  const openInvoice = invoices.find((invoice) => invoice.totalClp > invoice.paidClp);
  expect(openInvoice).toBeTruthy();

  const exportCsv = await page.request.get(
    `/api/billing/invoices/export?format=csv&id=${openInvoice!.id}`
  );
  expect(exportCsv.ok()).toBeTruthy();
  const csvText = await exportCsv.text();
  expect(csvText).toContain("folioInterno");
  expect(csvText).toContain("rutEmisor");

  const overpayment = await page.request.post("/api/billing/payments", {
    data: {
      invoiceId: openInvoice!.id,
      clienteId: openInvoice!.clienteId,
      amountClp: openInvoice!.totalClp - openInvoice!.paidClp + 1,
      method: "transferencia",
    },
  });
  expect(overpayment.status()).toBe(409);
});

test("un cliente queda limitado al portal y a sus espacios", async ({ page }) => {
  await loginAs(page, "cliente@andes.cl");

  await expect(page).toHaveURL(/\/portal$/);
  await expect(
    page.getByRole("heading", { name: "Portal del cliente" })
  ).toBeVisible();
  await expect(page.getByText("Acceso restringido:")).toBeVisible();
  await expect(page.getByRole("link", { name: "Causas" })).toHaveCount(0);
  expect((await page.request.get("/api/admin/host-status")).status()).toBe(403);

  const sitesResponse = await page.request.get("/api/sites");
  expect(sitesResponse.ok()).toBeTruthy();
  const sitesPayload = (await sitesResponse.json()) as {
    id: string;
    causa?: unknown;
    cliente?: { razonSocial?: string };
  }[];
  expect(sitesPayload.length).toBeGreaterThan(0);
  expect(sitesPayload[0].causa).toBeUndefined();
  expect(sitesPayload[0].cliente).toEqual(
    expect.objectContaining({ razonSocial: expect.any(String) })
  );

  const filesHref = await page
    .getByRole("link", { name: "Ver archivos" })
    .first()
    .getAttribute("href");
  const qaHref = await page
    .getByRole("link", { name: "Ir a Q&A" })
    .first()
    .getAttribute("href");
  expect(filesHref).toBeTruthy();
  expect(qaHref).toBeTruthy();

  await page.goto(filesHref!);
  await expect(page).toHaveURL(/\/sites\/[^/]+\/archivos$/);
  await expect(page.getByRole("button", { name: "Nuevo archivo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nueva carpeta" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "← Portal" })).toBeVisible();

  await page.goto(qaHref!);
  await expect(page).toHaveURL(/\/sites\/[^/]+\/qa$/);
  await expect(
    page.getByRole("checkbox", { name: "Marcar como respuesta oficial" })
  ).toHaveCount(0);

  const siteId = filesHref!.split("/")[2];
  expect(siteId).toBeTruthy();

  expect(
    (await page.request.post(`/api/sites/${siteId}/files`, {
      data: { action: "create-folder", name: "hack" },
    })).status()
  ).toBe(403);
  expect(
    (await page.request.post("/api/messages", {
      data: { receiverId: "x", body: "hola" },
    })).status()
  ).toBe(403);
  expect(
    (await page.request.post(`/api/sites/${siteId}/members`, {
      data: { userId: "x", role: "viewer" },
    })).status()
  ).toBe(403);
  expect(
    (await page.request.post("/api/sites", {
      data: { name: "hack", tipo: "matter" },
    })).status()
  ).toBe(403);
  expect(
    (await page.request.post("/api/auth/impersonate", {
      data: { userId: "x" },
    })).status()
  ).toBe(403);
  expect((await page.request.get(`/api/sites/${siteId}`)).status()).toBe(403);
  expect((await page.request.get("/api/billing/invoices")).status()).toBe(403);
  expect(
    (await page.request.get("/api/billing/invoices/export?format=csv")).status()
  ).toBe(403);

  const messagesPage = await page.goto("/mensajes");
  expect(messagesPage?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Mensajes" })).toBeVisible();

  const searchPage = await page.goto("/buscar");
  expect(searchPage?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Buscar" })).toBeVisible();

  const searchRes = await page.request.get("/api/search?q=andes");
  expect(searchRes.ok()).toBeTruthy();
  const searchBody = (await searchRes.json()) as {
    scope?: string;
    causas?: unknown[];
    files?: unknown[];
  };
  expect(searchBody.scope).toBe("portal");
  expect(searchBody.causas || []).toEqual([]);
  expect(Array.isArray(searchBody.files)).toBe(true);

  await page.goto(`/sites/${siteId}`);
  await expect(page).toHaveURL(/\/portal$/);

  await page.goto("/causas");
  await expect(page).toHaveURL(/\/portal$/);
  await expect(
    page.getByRole("heading", { name: "Portal del cliente" })
  ).toBeVisible();
});

test("una ruta protegida redirige al login sin sesión", async ({ page }) => {
  await page.goto("/causas");

  await expect(page).toHaveURL(/\/login\?next=.*causas/);
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Iniciar sesión|Sign in/i })
  ).toBeVisible();
});
