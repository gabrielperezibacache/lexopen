import { expect, test } from "@playwright/test";

async function login(
  page: import("@playwright/test").Page,
  email: string
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("lexopen");
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("un usuario del estudio puede iniciar sesión y abrir causas", async ({
  page,
}) => {
  await login(page, "socio@estudio.cl");

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
  await expect(page.getByRole("heading", { name: "Estado del Host" })).toBeVisible();

  await page.goto("/causas");
  await expect(page).toHaveURL(/\/causas$/);
  await expect(
    page.getByRole("heading", { name: "Causas judiciales" })
  ).toBeVisible();
  await expect(page.getByText("C-4521-2025")).toBeVisible();

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
  await login(page, "cliente@andes.cl");

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

  await page.goto("/causas");
  await expect(page).toHaveURL(/\/portal$/);
  await expect(
    page.getByRole("heading", { name: "Portal del cliente" })
  ).toBeVisible();
});

test("una ruta protegida redirige al login sin sesión", async ({ page }) => {
  await page.goto("/causas");

  await expect(page).toHaveURL(/\/login\?next=.*causas/);
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" })
  ).toBeVisible();
});
