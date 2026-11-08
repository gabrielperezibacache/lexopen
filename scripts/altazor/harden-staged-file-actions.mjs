import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates = join(dirname(fileURLToPath(import.meta.url)), "patches");
const originals = {
  "internal/chat/approve.go": "3efea7fff7cc686a7c28250c11427404fe9e8dada703bcfcab1669f2760bc766",
  "internal/chat/chat.go": "4e1e861e5f0f1907cfaa4e4186436b143d107993bc75bb1381d97e4744a11e0b",
  "internal/approvals/approvals.go": "9b31dc0c95efb388173efbc2c3b726bcc7d4429915b8a90286926b70d02379ed",
  "internal/gateway/gateway.go": "90d85829fe6fb4266058d85a01076625c2c225cd7ef2c171f36ea874643a2629",
  "internal/connector/connector.go": "055e0e6b958ee30e483057de79183a5dca58000254b1be06a11f233202f0925f",
};
const additions = [
  ["internal/connector/lexopen_staged_file_receipt.go", "staged-file-receipt.go"],
  ["internal/approvals/lexopen_staged_file_store.go", "staged-file-store.go"],
  ["internal/approvals/lexopen_staged_file_store_test.go", "staged-file-store_test.go"],
  ["internal/chat/lexopen_staged_file_actions.go", "staged-file-chat.go"],
  ["internal/chat/lexopen_staged_file_inspect.go", "staged-file-inspect.go"],
  ["internal/chat/lexopen_staged_file_actions_test.go", "staged-file-chat_test.go"],
  ["internal/gateway/lexopen_staged_file_actions.go", "staged-file-gateway.go"],
  ["internal/gateway/lexopen_staged_file_actions_test.go", "staged-file-gateway_test.go"],
];
const hash = value => createHash("sha256").update(value).digest("hex");
function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error("Pinned staged file source no longer matches");
  return source.replace(before, after);
}
export function rewriteStagedFileActions(path, source) {
  if (path === "internal/connector/connector.go") return once(source, "type Result struct {", "type Result struct {\n\tStructuredReceipt *FileReceipt `json:\"structured_receipt,omitempty\"`");
  if (path === "internal/approvals/approvals.go") {
    source = once(source, "type Approval struct {", "type Approval struct {\n\tRequestID string `json:\"request_id,omitempty\"`\n\tRequestHash string `json:\"request_hash,omitempty\"`\n\tFileStageReady bool `json:\"file_stage_ready,omitempty\"`\n\tStructuredReceipt *connector.FileReceipt `json:\"structured_receipt,omitempty\"`");
    source = once(source, 'if p.Status == Pending && p.Kitty == a.Kitty', 'if p.RequestID == "" && p.Chat == a.Chat && p.Status == Pending && p.Kitty == a.Kitty');
    source = once(source, 'if drop > 0 && a.Status != Pending {', 'if drop > 0 && a.Status != Pending && a.RequestID == "" {');
    return once(source, '\tif a.Status != Pending {', '\tif a.RequestID != "" && !a.FileStageReady { return nil, ErrFileActionInvalid }\n\tif a.Status != Pending {');
  }
  if (path === "internal/chat/chat.go") return once(source, "type Turn struct {", "type Turn struct {\n\tFileRequestID string `json:\"file_request_id,omitempty\"`");
  if (path === "internal/chat/approve.go") {
    source = once(source, '\tap, err := s.approvals.Decide(id, approve, reason, always)', '\tstaged, err := s.approvals.Get(id)\n\tif err != nil { return nil, err }\n\tunlock, err := s.lexopenPrepareStagedApproval(staged, approve)\n\tif err != nil { return nil, err }; defer unlock()\n\tap, err := s.approvals.Decide(id, approve, reason, always)');
    source = once(source, '\t\ts.lexopenDeliverApprovedDownload(ctx, k, ap.Args, &res)\n\t\ts.approvals.Done(id, res.Output, res.Err)', '\t\tif ap.RequestID != "" {\n\t\t\ts.lexopenDeliverStagedDownload(ctx, k, ap, &res)\n\t\t\tif err := s.approvals.DoneFileAction(id, res.Output, res.Err, res.StructuredReceipt); err != nil { return nil, ErrStagedFileUnavailable }\n\t\t\tap.StructuredReceipt = res.StructuredReceipt\n\t\t} else {\n\t\t\ts.lexopenDeliverApprovedDownload(ctx, k, ap.Args, &res)\n\t\t\ts.approvals.Done(id, res.Output, res.Err)\n\t\t}');
    return source;
  }
  if (path === "internal/gateway/gateway.go") {
    source = once(source, '\ts.mux.Handle("POST /v1/lexopen/easy-oauth/{name}", api(s.handleLexopenEasyOAuth))', '\ts.mux.Handle("POST /v1/lexopen/easy-oauth/{name}", api(s.handleLexopenEasyOAuth))\n\ts.mux.Handle("POST /v1/lexopen/chats/{id}/file-actions", api(s.handleLexopenStageFile))');
    return once(source, '\t\tout["lexopen_persistent_oauth"] = "v1"', '\t\tout["lexopen_persistent_oauth"] = "v1"\n\t\tif _, ok := s.chats.(stagedFileChats); ok { out["lexopen_staged_file_actions"] = chat.StagedFileActionsVersion }');
  }
  throw new Error("Not a pinned staged file source");
}
export async function hardenStagedFileActions(directory) {
  const root = await realpath(directory);
  if ((await readFile(join(root, ".lexopen-source-commit"), "utf8")).trim() !== PINNED_COMMIT || (await readFile(join(root, ".lexopen-persistent-oauth"), "utf8")).trim() !== "v1") throw new Error("Staged actions require the persistent OAuth hardened public source");
  if (await lstat(join(root, ".lexopen-staged-file-actions")).catch(e => { if (e.code === "ENOENT") return null; throw e; })) throw new Error("Staged file actions already exist");
  const changes = [];
  for (const [path, expected] of Object.entries(originals)) {
    const file = join(root, path), stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) throw new Error("Pinned sources must be regular files");
    const source = await readFile(file, "utf8");
    if (hash(source) !== expected) throw new Error("Pinned staged file source differs: " + path);
    changes.push([file, rewriteStagedFileActions(path, source)]);
  }
  for (const [target, template] of additions) {
    const file = join(root, target);
    if (await lstat(file).catch(e => { if (e.code === "ENOENT") return null; throw e; })) throw new Error("Staged file addition already exists");
    changes.push([file, await readFile(join(templates, template), "utf8")]);
  }
  for (const [file, source] of changes) await writeFile(file, source, { mode: 0o600 });
  await writeFile(join(root, ".lexopen-staged-file-actions"), "v1\n", { flag: "wx", mode: 0o600 });
  return { source: PINNED_COMMIT, stagedFileActions: "v1", files: changes.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/altazor/harden-staged-file-actions.mjs <persistent-oauth-hardened-source-directory>");
  console.log(JSON.stringify(await hardenStagedFileActions(process.argv[2])));
}
