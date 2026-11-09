import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { encryptGoogleToken } from "./google-crypto";
import { resolveStudyDriveAccount } from "./google-study-drive";
import { connectStudyGmail, studyGmailToken, STUDY_GMAIL_REFERENCE } from "./google-study-mail";
import type { DriveWriteCommand } from "@/lib/altazor/connectors/drive-management";
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), ids: string[] = [], prior = await prisma.integrationConfig.findUnique({ where: { provider: "google" } });
  let counter = 0, posts = 0, loseAck = false;
  const remote = new Map<string, { metadata: Record<string, unknown>; bytes: Buffer }>();
  const token = "fictitious-shared-access-token";
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.hostname, "www.googleapis.com"); assert.equal(init?.redirect, "error"); assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    if (url.pathname.endsWith("/generateIds")) return Response.json({ ids: [`GeneratedSharedId_${++counter}`] });
    if (init?.method === "POST") {
      posts++; let metadata: Record<string, unknown>, bytes = Buffer.alloc(0);
      if (typeof init.body === "string") metadata = JSON.parse(init.body);
      else {
        const raw = Buffer.from(init.body as Uint8Array), boundary = /boundary=(.+)$/.exec(new Headers(init.headers).get("content-type")!)![1];
        const chunks = raw.toString("latin1").split(`--${boundary}`);
        metadata = JSON.parse(chunks[1].split("\r\n\r\n")[1].trim());
        bytes = Buffer.from(chunks[2].split("\r\n\r\n")[1].slice(0, -2), "latin1");
      }
      const id = String(metadata.id); remote.set(id, { metadata: { ...metadata, trashed: false, size: String(bytes.length), md5Checksum: createHash("md5").update(bytes).digest("hex") }, bytes });
      if (loseAck) { loseAck = false; throw Error("lost shared response"); }
      return Response.json({ id });
    }
    const id = url.pathname.split("/").at(-1)!, file = remote.get(id);
    if (!file) return new Response("missing", { status: 404 });
    return url.searchParams.get("alt") === "media" ? new Response(new Uint8Array(file.bytes)) : Response.json(file.metadata);
  };
  try {
    const owner = await prisma.user.create({ data: { name: "Shared admin", email: `${tag}@shared.invalid`, role: "admin", password: "not-a-login" } }); ids.push(owner.id);
    const staff = await prisma.user.create({ data: { name: "Shared staff", email: `${tag}-staff@shared.invalid`, role: "abogado", password: "not-a-login" } }); ids.push(staff.id);
    const config = { scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"], syncDrive: true, syncCalendar: true, accessToken: encryptGoogleToken(token), refreshToken: encryptGoogleToken("fictitious-shared-refresh"), tokenExpiresAt: Date.now() + 3600_000, connectedEmail: "study@example.invalid" };
    await prisma.integrationConfig.upsert({ where: { provider: "google" }, create: { provider: "google", enabled: true, configJson: JSON.stringify(config) }, update: { enabled: true, configJson: JSON.stringify(config) } });
    const account = await resolveStudyDriveAccount(owner, prisma, fetcher);
    assert.equal(account.source, "study");
    const folder: DriveWriteCommand = { action: "create_folder", request_id: "1".repeat(64), context_key: "2".repeat(64), folder_id: "RootFolderShared123", bindingRevision: account.bindingRevision, name: "Client folder", confirmed: true };
    const created = await account.command(folder); assert.equal(created.action, "create_folder"); assert.equal(posts, 1);
    assert.equal((await account.command(folder)).file_id, created.file_id); assert.equal(posts, 1, "repeated command only reads its reserved object");
    const content = Buffer.from("Exact shared file bytes ñ");
    const upload: DriveWriteCommand = { ...folder, action: "upload_file", request_id: "3".repeat(64), name: "document.txt", mime: "text/plain", content_base64: content.toString("base64"), sha256: createHash("sha256").update(content).digest("hex") };
    loseAck = true; await assert.rejects(account.command(upload), /lost shared response/);
    const { content_base64: _discard, ...expected } = upload; void _discard;
    const recovered = await account.reconcile(upload.request_id, { ...expected, expected_bytes: content.length });
    assert.equal(recovered?.state, "drive_verified"); assert.equal(posts, 2, "lost confirmation is never reposted");
    const copy = [...remote.values()].find(row => row.metadata.name === "document.txt")!;
    copy.bytes = Buffer.from("tampered");
    await assert.rejects(account.reconcile(upload.request_id, expected), /bytes/);
    const records = await prisma.commandExecution.findMany({ where: { ownerId: owner.id } });
    assert.ok(records.every(row => !row.resultJson?.includes(token) && !row.resultJson?.includes(content.toString("base64"))));
    await assert.rejects(connectStudyGmail(staff.id), (e: unknown) => (e as { status?: number }).status === 403);
    assert.equal(await connectStudyGmail(owner.id), true);
    const mailbox = await prisma.mailboxAccount.findUniqueOrThrow({ where: { userId: owner.id } });
    assert.equal(mailbox.oauthRefreshEnc, STUDY_GMAIL_REFERENCE); assert.equal(mailbox.oauthAccessEnc, null);
    assert.equal(await studyGmailToken(owner.id, "study@example.invalid"), token);
    await assert.rejects(studyGmailToken(staff.id, "study@example.invalid"));
    await prisma.integrationConfig.update({ where: { provider: "google" }, data: { enabled: false } });
    await assert.rejects(account.assertActive()); await assert.rejects(studyGmailToken(owner.id, "study@example.invalid"));
    console.log("Shared Google PG: one encrypted grant, reserved Drive IDs, no duplicate POST, exact recovered bytes, no copied tokens, admin-only shared inbox and disconnect revocation OK; no real Google");
  } finally {
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (prior) await prisma.integrationConfig.update({ where: { provider: "google" }, data: { enabled: prior.enabled, configJson: prior.configJson } }); else await prisma.integrationConfig.deleteMany({ where: { provider: "google" } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
