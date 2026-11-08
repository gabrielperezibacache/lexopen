import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

export const ASYNC_MESSAGES = "v1";
const templates = join(dirname(fileURLToPath(import.meta.url)), "patches");
const originals = {
  "internal/chat/chat.go": "f2d95a708969c3fe74a93b1e6527c82dc98a7b29202fef926e9d55cb3910565c",
  // Exact output of the connector hardener on the pinned public archive.
  "internal/gateway/gateway.go": "0a6313a35fc1196709904a89d37d65d109ead101accf016e36ae47983aaeaa08",
};
const additions = {
  "internal/chat/lexopen_async.go": "async-messages.go",
  "internal/chat/lexopen_async_test.go": "async-messages_test.go",
  "internal/gateway/lexopen_async.go": "gateway-async-messages.go",
  "internal/gateway/lexopen_async_test.go": "gateway-async-messages_test.go",
};
const hash = value => createHash("sha256").update(value).digest("hex");
function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error("Pinned asynchronous message source no longer matches");
  return source.replace(before, after);
}

export function rewriteAsyncMessages(path, source) {
  if (path === "internal/chat/chat.go") {
    source = once(source, '\tWorking bool `json:"working,omitempty"`', '\tWorking bool `json:"working,omitempty"`\n\tAsyncPending bool `json:"async_pending,omitempty"`');
    source = once(source, '\tSummaryUpTo int    `json:"summary_up_to,omitempty"`', '\tSummaryUpTo int    `json:"summary_up_to,omitempty"`\n\tAsyncRequests map[string]AsyncRequest `json:"lexopen_async_requests,omitempty"`');
    source = once(source, '\t\ts.sessions[sess.ID] = &sess\n', '\t\tif s.interruptAsync(&sess) {\n\t\t\tif _, err := s.saveAsync(&sess); err != nil { return err }\n\t\t}\n\t\ts.sessions[sess.ID] = &sess\n');
    source = once(source, '\tc.Turns = append([]Turn(nil), sess.Turns...)\n', '\tc.Turns = append([]Turn(nil), sess.Turns...)\n\tc.AsyncRequests = copyAsyncRequests(sess.AsyncRequests)\n');
    source = once(source, '\t\tc.Turns = nil\n', '\t\tc.Turns = nil\n\t\tc.AsyncRequests = nil\n');
    source = once(source, '\tif sess.Working() {\n', '\tif sess.Working() || s.tasks[id] != nil {\n');
    return once(source, '\twindow := sess.Turns[min(sess.SummaryUpTo, len(sess.Turns)):]\n', '\twindow := sess.Turns[min(sess.SummaryUpTo, len(sess.Turns)):]\n\t// The durable acceptance marker is UI state, never an assistant response to the model.\n\tfiltered := make([]Turn, 0, len(window))\n\tfor _, turn := range window { if !turn.AsyncPending { filtered = append(filtered, turn) } }\n\twindow = filtered\n');
  }
  if (path === "internal/gateway/gateway.go") {
    source = once(source, '\ts.mux.Handle("POST /v1/chats/{id}/messages", api(s.handleSend))', '\ts.mux.Handle("POST /v1/chats/{id}/messages", api(s.handleSend))\n\ts.mux.Handle("POST /v1/chats/{id}/messages/async", api(s.handleSendAsync))');
    source = once(source, 'case errors.Is(err, chat.ErrBusy),', 'case errors.Is(err, chat.ErrAsyncConflict), errors.Is(err, chat.ErrBusy),');
    source = once(source, 'case errors.Is(err, attach.ErrRefused):', 'case errors.Is(err, chat.ErrAsyncInvalid), errors.Is(err, attach.ErrRefused):');
    return once(source, '\t\t"kitties": len(s.fleet.List()), "containers": has}\n', '\t\t"kitties": len(s.fleet.List()), "containers": has}\n\tif _, ok := s.chats.(asyncChats); ok { out["lexopen_async_messages"] = chat.AsyncMessagesVersion }\n');
  }
  throw new Error("Not a pinned asynchronous message file");
}

export async function hardenAsyncMessages(directory) {
  const root = await realpath(directory);
  if ((await readFile(join(root, ".lexopen-source-commit"), "utf8")).trim() !== PINNED_COMMIT) throw new Error("Asynchronous hardening requires the exact public source commit");
  if ((await readFile(join(root, ".lexopen-connector-gate"), "utf8")).trim() !== "v1") throw new Error("Apply the connector hardener before asynchronous hardening");
  if (await lstat(join(root, ".lexopen-async-messages")).catch(error => { if (error.code === "ENOENT") return null; throw error; })) throw new Error("Asynchronous hardening marker already exists");
  const changes = [];
  for (const [path, expected] of Object.entries(originals)) {
    const file = join(root, path), stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) throw new Error("Pinned source must be an owned regular file");
    const source = await readFile(file, "utf8");
    if (hash(source) !== expected) throw new Error("Pinned source differs; extract and harden a fresh public source archive");
    changes.push([file, rewriteAsyncMessages(path, source)]);
  }
  const extra = [];
  for (const [path, name] of Object.entries(additions)) {
    const file = join(root, path);
    if (await lstat(file).catch(error => { if (error.code === "ENOENT") return null; throw error; })) throw new Error("Asynchronous source additions already exist");
    extra.push([file, await readFile(join(templates, name), "utf8")]);
  }
  // Validate all pins and addition paths before the first mutation.
  for (const [file, source] of changes) await writeFile(file, source);
  for (const [file, source] of extra) await writeFile(file, source, { flag: "wx", mode: 0o600 });
  await writeFile(join(root, ".lexopen-async-messages"), ASYNC_MESSAGES + "\n", { flag: "wx", mode: 0o600 });
  return { source: PINNED_COMMIT, asyncMessages: ASYNC_MESSAGES, files: changes.length + extra.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/altazor/harden-async-messages.mjs <fresh-connector-hardened-public-source-directory>");
  console.log(JSON.stringify(await hardenAsyncMessages(process.argv[2])));
}
