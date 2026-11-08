import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { verifyDriveWriteReceipt, type DriveWriteCommand } from "./drive-management";
import { caseDriveCommandSchema } from "@/lib/integrations/case-drive";

const bytes = Buffer.from("Synthetic document snapshot"), hash = createHash("sha256").update(bytes).digest("hex"), alias = `altazor-google-${"a".repeat(16)}`;
const command: DriveWriteCommand = { request_id: "request_fixture", context_key: "b".repeat(64), bindingRevision: "c".repeat(64), action: "upload_file", folder_id: "Folder_fixture_123", name: "Memorando.txt", mime: "text/plain", content_base64: bytes.toString("base64"), sha256: hash, confirmed: true };
const receipt = { schema: "lexopen-drive-write.v1", state: "drive_verified", request_id: command.request_id, context_key: command.context_key, account_revision: command.bindingRevision, alias, action: command.action, folder_id: command.folder_id, parent_id: command.folder_id, file_id: "Uploaded_fixture_123", name: command.name, mime: command.mime, bytes: bytes.length, sha256: hash };
test("a Drive copy receipt binds exact account, case context, destination and original bytes", () => {
  assert.deepEqual(verifyDriveWriteReceipt(receipt, command, alias), receipt);
  for (const change of [{ alias: alias + "x" }, { account_revision: "d".repeat(64) }, { context_key: "d".repeat(64) }, { folder_id: "Other_folder_123" }, { parent_id: "Other_folder_123" }, { request_id: "different" }, { bytes: bytes.length + 1 }, { sha256: "d".repeat(64) }, { action: "save_version" }, { mime: "application/pdf" }, { previous_file_id: "Other_file_123" }]) assert.throws(() => verifyDriveWriteReceipt({ ...receipt, ...change }, command, alias));
});
test("saving a version preserves the identified old object and exact revision", () => {
  const version = { ...command, action: "save_version" as const, file_id: "Previous_file_123", expected_version: "17" };
  const result = { ...receipt, action: "save_version", previous_file_id: version.file_id, previous_version: "17" };
  assert.deepEqual(verifyDriveWriteReceipt(result, version, alias), result);
  assert.deepEqual(verifyDriveWriteReceipt(result, { ...version, content_base64: undefined, expected_bytes: bytes.length }, alias), result);
  for (const change of [{ previous_file_id: "Wrong_file_123" }, { previous_version: "18" }, { file_id: version.file_id }]) assert.throws(() => verifyDriveWriteReceipt({ ...result, ...change }, version, alias));
});
test("folder creation at root requires a real verified parent and no invented file content", () => {
  const folder: DriveWriteCommand = { ...command, action: "create_folder", folder_id: "root", mime: undefined, content_base64: undefined, sha256: undefined };
  const result = { ...receipt, action: "create_folder", folder_id: "root", parent_id: "Actual_root_123", mime: "application/vnd.google-apps.folder", bytes: 0, sha256: undefined };
  assert.deepEqual(verifyDriveWriteReceipt(result, folder, alias), result);
  assert.throws(() => verifyDriveWriteReceipt({ ...result, parent_id: undefined }, folder, alias));
  assert.throws(() => verifyDriveWriteReceipt({ ...result, sha256: hash }, folder, alias));
});
test("case commands require a reviewed account/case/source snapshot and reject raw URLs or content", () => {
  const input = { action: "upload-document", requestId: "fixture-request", connectionId: "account_fixture", bindingRevision: "a".repeat(64), caseRevision: "b".repeat(64), documentoId: "doc_fixture", documentVersion: 3, sourceSha256: hash, confirmed: true };
  assert.equal(caseDriveCommandSchema.safeParse(input).success, true);
  for (const change of [{ caseRevision: undefined }, { documentVersion: undefined }, { sourceSha256: undefined }, { confirmed: false }, { url: "https://www.googleapis.com" }, { content_base64: bytes.toString("base64") }]) assert.equal(caseDriveCommandSchema.safeParse({ ...input, ...change }).success, false);
  assert.equal(caseDriveCommandSchema.safeParse({ action: "reconcile", requestId: input.requestId, connectionId: input.connectionId, bindingRevision: input.bindingRevision, confirmed: true }).success, true);
});
test("Drive names respect the motor's UTF-8 boundary and reject hidden file names before claiming", () => {
  const input = { action: "create-folder", requestId: "fixture-request", connectionId: "account_fixture", bindingRevision: "a".repeat(64), caseRevision: "b".repeat(64), confirmed: true };
  for (const nombre of ["a".repeat(180), "ñ".repeat(90), "📚".repeat(45), "Investigación jurídica"]) assert.equal(caseDriveCommandSchema.safeParse({ ...input, nombre }).success, true);
  for (const nombre of ["ñ".repeat(91), "📚".repeat(46), ".oculto", " .oculto "]) assert.equal(caseDriveCommandSchema.safeParse({ ...input, nombre }).success, false);
});


test("Drive receipts reject unexpected private fields before returning any result", () => {
  for (const key of ["access_token", "refresh_token", "client_secret", "provider_response"]) {
    assert.throws(() => verifyDriveWriteReceipt({ ...receipt, [key]: "fictitious-private-value" }, command, alias), error => (error as { code?: string }).code === "drive_receipt_invalid");
  }
});
