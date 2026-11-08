import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenStagedFileActions, rewriteStagedFileActions } from "./harden-staged-file-actions.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

assert.match(rewriteStagedFileActions("internal/connector/connector.go", "type Result struct {"), /StructuredReceipt/);
assert.match(rewriteStagedFileActions("internal/chat/chat.go", "type Turn struct {"), /FileRequestID/);
const approvals = 'type Approval struct {\nif p.Status == Pending && p.Kitty == a.Kitty\nif drop > 0 && a.Status != Pending {\n\tif a.Status != Pending {';
const rewritten = rewriteStagedFileActions("internal/approvals/approvals.go", approvals);
assert.match(rewritten, /p.Chat == a.Chat/);
assert.match(rewritten, /!a.FileStageReady/);
assert.match(rewriteStagedFileActions("internal/chat/approve.go", '\tap, err := s.approvals.Decide(id, approve, reason, always)\n\t\ts.lexopenDeliverApprovedDownload(ctx, k, ap.Args, &res)\n\t\ts.approvals.Done(id, res.Output, res.Err)'), /DoneFileAction/);
assert.match(rewriteStagedFileActions("internal/gateway/gateway.go", '\ts.mux.Handle("POST /v1/lexopen/easy-oauth/{name}", api(s.handleLexopenEasyOAuth))\n\t\tout["lexopen_persistent_oauth"] = "v1"'), /lexopen_staged_file_actions/);
assert.throws(() => rewriteStagedFileActions("internal/chat/chat.go", "source drift"), /no longer matches/);
const root = await mkdtemp(join(tmpdir(), "lexopen-staged-file-source-test-"));
try {
  await writeFile(join(root, ".lexopen-source-commit"), PINNED_COMMIT);
  await writeFile(join(root, ".lexopen-persistent-oauth"), "v1\n");
  await mkdir(join(root, "internal/chat"), { recursive: true });
  const file = join(root, "internal/chat/approve.go");
  await writeFile(file, "source drift");
  await assert.rejects(() => hardenStagedFileActions(root), /Pinned staged file source differs/);
  assert.equal(await readFile(file, "utf8"), "source drift");
} finally { await rm(root, { recursive: true, force: true }); }
console.log("Staged file hardener: explicit server action, native user binding, approval isolation, typed receipt and source drift refusal PASS.");
