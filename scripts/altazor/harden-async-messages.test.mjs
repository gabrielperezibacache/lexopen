import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenAsyncMessages, rewriteAsyncMessages } from "./harden-async-messages.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const chat = rewriteAsyncMessages("internal/chat/chat.go", [
  '\tWorking bool `json:"working,omitempty"`',
  '\tSummaryUpTo int    `json:"summary_up_to,omitempty"`',
  '\t\ts.sessions[sess.ID] = &sess',
  '\tc.Turns = append([]Turn(nil), sess.Turns...)',
  '\t\tc.Turns = nil',
  '\tif sess.Working() {',
  '\twindow := sess.Turns[min(sess.SummaryUpTo, len(sess.Turns)):]\n',
].join("\n"));
assert.match(chat, /AsyncPending bool/);
assert.match(chat, /s\.interruptAsync\(&sess\)/);
assert.match(chat, /copyAsyncRequests\(sess\.AsyncRequests\)/);
assert.match(chat, /!turn\.AsyncPending/);
const gateway = rewriteAsyncMessages("internal/gateway/gateway.go", [
  '\ts.mux.Handle("POST /v1/chats/{id}/messages", api(s.handleSend))',
  'case errors.Is(err, chat.ErrBusy),',
  'case errors.Is(err, attach.ErrRefused):',
  '\t\t"kitties": len(s.fleet.List()), "containers": has}\n',
].join("\n"));
assert.match(gateway, /messages\/async/);
assert.match(gateway, /chat\.ErrAsyncConflict/);
assert.match(gateway, /chat\.ErrAsyncInvalid/);
assert.match(gateway, /s\.chats\.\(asyncChats\); ok/);
assert.match(gateway, /out\["lexopen_async_messages"\] = chat\.AsyncMessagesVersion/);
assert.throws(() => rewriteAsyncMessages("internal/chat/chat.go", "different source"), /no longer matches/);
const root = await mkdtemp(join(tmpdir(), "lexopen-async-patch-test-"));
try {
  await writeFile(join(root, ".lexopen-source-commit"), PINNED_COMMIT);
  await writeFile(join(root, ".lexopen-connector-gate"), "v1\n");
  await mkdir(join(root, "internal/chat"), { recursive: true });
  await writeFile(join(root, "internal/chat/chat.go"), "modified");
  await assert.rejects(() => hardenAsyncMessages(root), /Pinned source differs/);
  assert.equal(await readFile(join(root, "internal/chat/chat.go"), "utf8"), "modified");
  await writeFile(join(root, ".lexopen-source-commit"), "wrong");
  await assert.rejects(() => hardenAsyncMessages(root), /exact public source commit/);
} finally { await rm(root, { recursive: true, force: true }); }
console.log("Pinned async hardening: durable cancellable acceptance, strict capability, source drift refused.");
