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
test.use({ colorScheme: "dark" });
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
    await academic.getByRole("button", { name: "Mesa de revisión", exact: true }).click();
    const report = academic.getByRole("region", { name: "Mesa de revisión académica", exact: true });
    await expect(report).toBeVisible();
    const work = report.getByLabel("Trabajo que quieres revisar", { exact: true });
    await expect(work.locator(`option[value="${foreign.id}"]`)).toHaveCount(0);
    await work.selectOption(blankId);
    await expect(report.getByText("Falta definir el objetivo", { exact: true })).toBeVisible();
    await report.getByRole("button", { name: "Definir objetivo", exact: true }).click();
    await expect(academic.getByLabel("Tu objetivo o texto de trabajo", { exact: true })).toBeVisible();
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
    await expect(proposed).toContainText("Una sección sin pasajes vinculados");
    await expect(proposed).toContainText("Marcadores sin pasaje asociado R9");
    if (process.env.LEXOPEN_ACADEMIC_REVIEW_SCREENSHOT === "1") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath("mesa-revision-1440.png") });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await proposed.getByRole("button", { name: "Abrir propuesta", exact: true }).click();
    await expect(academic.getByRole("region", { name: "Editor académico", exact: true }).getByRole("textbox", { name: "Texto de trabajo", exact: true })).toHaveValue(fixtures[0].body);

    expect((await page.request.delete(`/api/books/${sources[0].book.id}`, { headers, data: { revision: sources[0].book.revision } })).status()).toBe(200);
    await academic.getByRole("button", { name: "Mesa de revisión", exact: true }).click();
    await expect(manuscripts.getByText("Sin acceso al respaldo", { exact: true }).locator("..").getByText("2", { exact: true })).toBeVisible();
    await expect(report.getByText(fixtures[0].title, { exact: true })).toHaveCount(0);
    await expect(report.getByRole("button", { name: "Abrir propuesta", exact: true })).toHaveCount(0);
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
