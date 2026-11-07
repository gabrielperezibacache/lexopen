/** Real browser and private workspace APIs with fictitious evidence and no model calls. */
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { academicReferenceAppendix } from "../src/lib/altazor/academic-output";
import type { AltazorSourceSnapshot } from "../src/lib/altazor/resources";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), storage = process.env.STORAGE_PATH;
if (new URL(process.env.DATABASE_URL!).toString() !== database || !storage || !path.isAbsolute(storage) || [process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Use a disposable local database and storage");
const db = new PrismaClient({ datasources: { db: { url: database } } });
test.use({ colorScheme: "dark", actionTimeout: 15_000 });
test.afterAll(async () => { await db.$disconnect(); });

test("Mesa de revisión distingue vacíos y respaldo, conserva el trabajo privado y abre el editor", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const tag = randomUUID(), userIds = [`${tag}-review-owner`, `${tag}-review-foreign`];
  const email = `academic-review-${tag}@example.invalid`, title = "Manuscrito académico ficticio", foreignTitle = "Trabajo ajeno reservado";
  const objective = "Distinguir fuentes y límites de una hipótesis jurídica ficticia.";
  const origin = new URL(testInfo.project.use.baseURL as string).origin, blocked: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    blocked.push(url.hostname); return route.abort("blockedbyclient");
  });
  try {
    const password = await hash("lexopen", 10);
    const [owner, other] = await Promise.all(userIds.map((id, index) => db.user.create({ data: {
      id, email: index ? `academic-review-foreign-${tag}@example.invalid` : email, password, name: "Profesional ficticio", role: "abogado",
    } })));
    const foreign = await db.altazorAcademicWorkspace.create({ data: {
      ownerId: other.id, requestId: randomUUID(), title: foreignTitle, kind: "research", briefJson: JSON.stringify({ objective: "Objetivo ajeno reservado" }),
    } });
    await loginAs(page, owner.email);
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
    expect(csrf).toBeTruthy();
    const headers = { Origin: origin, [CSRF_HEADER]: csrf! };
    const created = await page.request.post("/api/altazor/academic", { headers, data: { title, kind: "research", requestId: randomUUID() } });
    expect(created.status(), await created.text()).toBe(201);
    const { id: workspaceId } = await created.json() as { id: string };
    const blank = await page.request.post("/api/altazor/academic", { headers, data: { title: "Trabajo ficticio sin objetivo", kind: "research", requestId: randomUUID() } });
    expect(blank.status()).toBe(201);
    const { id: blankId } = await blank.json() as { id: string };
    const queued = await db.altazorAcademicArtifact.create({ data: {
      workspaceId: blankId, title: "Encargo ficticio por ejecutar", mode: "academic_writing",
      requestId: randomUUID(), inputSha256: tag,
    } });
    expect((await page.request.get(`/api/altazor/academic/${foreign.id}`)).status()).toBe(404);

    const sources = [];
    for (const [index, quote] of ["Una hipótesis requiere pasajes contrastables.", "La síntesis debe identificar los límites de cada conclusión."].entries()) {
      const bookTitle = `Lectura académica ficticia ${index + 1}`;
      const imported = await page.request.post("/api/books", { headers, multipart: {
        requestId: randomUUID(), title: bookTitle,
        file: { name: `lectura-${index}.txt`, mimeType: "text/plain", buffer: Buffer.from(quote) },
      } });
      expect(imported.status(), await imported.text()).toBe(201);
      const { book } = await imported.json() as { book: { id: string; revision: number } };
      const fragment = await db.libraryBookFragment.findFirstOrThrow({ where: { bookId: book.id }, orderBy: { ordinal: "asc" } });
      sources.push({ book, input: { kind: "book" as const, bookId: book.id, fragmentId: fragment.id, quote } });
    }
    const saved = await page.request.patch(`/api/altazor/academic/${workspaceId}`, { headers, data: {
      expectedRevision: 1, title, brief: { objective, task: "literature_review" }, sources: sources.map(source => source.input),
      matrix: {
        dimensions: [{ id: "finding", label: "Hallazgo", type: "text" }],
        rows: [
          { id: "review-source", title: "Hallazgo con respaldo", included: true, cells: { finding: { value: "Conclusión con una fuente", source: sources[0].input } } },
          { id: "review-gap", title: "Vacío de evidencia", included: true, cells: { finding: { value: "Afirmación pendiente de cotejo" } } },
        ],
      },
    } });
    expect(saved.status(), await saved.text()).toBe(200);
    const proofs = JSON.parse((await db.altazorAcademicWorkspace.findUniqueOrThrow({ where: { id: workspaceId } })).sourcesJson) as AltazorSourceSnapshot[];
    expect(proofs).toHaveLength(2);
    const fixtures = [
      { title: "Primera propuesta ficticia", status: "proposed", body: "## Pasaje cotejable\n\nTexto ficticio respaldado [R1].\n\n## Inferencia pendiente\n\nTexto ficticio aún por revisar [R9].", proofs: proofs.slice(0, 1) },
      { title: "Manuscrito ficticio revisado", status: "reviewed", body: "## Hipótesis\n\nTexto ficticio revisado [R1].\n\n## Alcance\n\nLímites revisados [^R2].", proofs },
    ];
    for (const fixture of fixtures) {
      fixture.body += academicReferenceAppendix(fixture.proofs);
      await db.altazorAcademicArtifact.create({ data: {
        title: fixture.title, status: fixture.status, body: fixture.body, sourceSnapshotsJson: JSON.stringify(fixture.proofs),
        bodySha256: createHash("sha256").update(fixture.body).digest("hex"), inputSha256: tag, requestId: randomUUID(), workspaceId, mode: "literature_review",
      } });
    }

    await page.goto("/academico");
    const academic = page.getByRole("region", { name: "Desarrollo académico", exact: true });
    await expect(academic.getByRole("button", { name: new RegExp(title) })).toBeVisible();
    const projectSearch = academic.getByRole("searchbox", { name: "Buscar por título", exact: true });
    await projectSearch.fill("MANUSCRITO ACADEMICO");
    await expect(academic.getByRole("button", { name: new RegExp(title) })).toBeVisible();
    await expect(academic.getByRole("button", { name: /Trabajo ficticio sin objetivo/ })).toHaveCount(0);
    await projectSearch.fill("Título inexistente");
    await expect(academic.getByText("No hay trabajos con ese título.")).toBeVisible();
    await academic.getByRole("button", { name: "Limpiar búsqueda" }).click();
    await expect(projectSearch).toBeFocused();
    await expect(academic.getByRole("button", { name: /Trabajo ficticio sin objetivo/ })).toBeVisible();
    await academic.getByRole("button", { name: "Mesa de revisión", exact: true }).click();
    const report = academic.getByRole("region", { name: "Mesa de revisión académica", exact: true });
    await expect(report).toBeVisible();
    const work = report.getByRole("combobox", { name: /Trabajo que quieres revisar/ });
    await expect(work).toBeVisible();
    await expect(work.locator(`option[value="${foreign.id}"]`)).toHaveCount(0);
    await work.selectOption(blankId);
    await expect(report.getByText("Falta definir el objetivo", { exact: true })).toBeVisible();
    await report.getByRole("button", { name: "Definir objetivo", exact: true }).click();
    const objectiveInput = academic.getByRole("textbox", { name: "Tu objetivo o texto de trabajo", exact: true });
    await expect(objectiveInput).toBeVisible();
    const pendingObjective = "Objetivo ficticio escrito mientras el encargo anterior seguía guardado.";
    await objectiveInput.fill(pendingObjective);
    await academic.getByRole("button", { name: "Detener", exact: true }).click();
    await expect(academic.getByText("Preparación detenida.", { exact: true })).toBeVisible();
    await expect(objectiveInput).toHaveValue(pendingObjective);
    expect((await db.altazorAcademicArtifact.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe("cancelled");
    await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
    await academic.getByRole("button", { name: "Mesa de revisión", exact: true }).click();
    await work.selectOption(workspaceId);
    const sourceReport = report.getByRole("region", { name: "Fuentes y matriz", exact: true });
    const manuscripts = report.getByRole("region", { name: "Propuestas y manuscritos", exact: true });
    await expect(sourceReport.getByText("Pasajes disponibles", { exact: true }).locator("..").getByText("2", { exact: true })).toBeVisible();
    await expect(report.getByText("Falta definir el objetivo", { exact: true })).toHaveCount(0);
    await expect(sourceReport.getByText("Lecturas incluidas sin un pasaje vinculado", { exact: true })).toBeVisible();
    await expect(sourceReport.getByText("Vacío de evidencia", { exact: true })).toBeVisible();
    for (const [index, fixture] of fixtures.entries()) {
      const item = manuscripts.getByRole("listitem").filter({ hasText: fixture.title });
      await expect(item).toContainText(index ? "Revisado" : "Por revisar");
      await expect(item).toContainText(`${index + 1} de 2 secciones con pasajes vinculados.`);
    }
    const proposed = manuscripts.getByRole("listitem").filter({ hasText: fixtures[0].title });
    const reviewed = manuscripts.getByRole("listitem").filter({ hasText: fixtures[1].title });
    await reviewed.getByText("Pasajes citados por sección", { exact: true }).click();
    for (const [index, title] of ["Hipótesis", "Alcance"].entries()) {
      const section = reviewed.getByRole("heading", { name: title, exact: true }).locator("..");
      await section.getByText(`R${index + 1} · ${proofs[index].title}`, { exact: true }).click();
      await expect(section.getByText(proofs[index].text, { exact: true })).toBeVisible();
      await expect(section.getByRole("link", { name: "Abrir pasaje en la fuente", exact: true })).toHaveAttribute("href", proofs[index].href);
    }
    await proposed.getByText("Una sección sin pasajes vinculados", { exact: true }).click();
    await expect(proposed.getByText("Inferencia pendiente", { exact: true })).toBeVisible();
    await expect(proposed).toContainText("Marcadores sin pasaje asociado R9");
    if (process.env.LEXOPEN_ACADEMIC_REVIEW_SCREENSHOT === "1") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath("mesa-revision-1440.png") });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await proposed.getByRole("button", { name: "Abrir propuesta", exact: true }).click();
    const prose = academic.getByRole("region", { name: "Editor académico", exact: true }).getByRole("textbox", { name: "Texto de trabajo", exact: true });
    await expect(prose).toHaveValue(fixtures[0].body);
    await expect(prose).toBeFocused();

    expect((await page.request.delete(`/api/books/${sources[0].book.id}`, { headers, data: { revision: sources[0].book.revision } })).status()).toBe(200);
    await academic.getByRole("button", { name: "Mesa de revisión", exact: true }).click();
    await expect(manuscripts.getByText("Sin acceso al respaldo", { exact: true }).locator("..").getByText("2", { exact: true })).toBeVisible();
    await expect(report.getByText(fixtures[0].title, { exact: true })).toHaveCount(0);
    await expect(report.getByRole("button", { name: "Abrir propuesta", exact: true })).toHaveCount(0);
    await expect(report.getByText("Pasajes citados por sección", { exact: true })).toHaveCount(0);
    await expect(report.getByText(proofs[0].text, { exact: true })).toHaveCount(0);
    await academic.getByRole("button", { name: "Mis trabajos", exact: true }).click();
    await academic.getByLabel("Nombre del trabajo", { exact: true }).fill(`${title} actualizado`);
    await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
    const retained = await db.altazorAcademicWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(retained.title).toBe(`${title} actualizado`);
    expect(JSON.parse(retained.sourcesJson)).toEqual(proofs);
    expect(blocked).toEqual([]);
  } finally {
    const books = await db.libraryBook.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.libraryBook.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.activity.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    for (const book of books) {
      if (!/^book_[a-f0-9]{40}$/.test(book.id)) throw Error("Unexpected fixture book identifier");
      await rm(path.join(storage!, "library-books", book.id), { recursive: true, force: true });
    }
  }
});
