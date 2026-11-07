import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates = join(dirname(fileURLToPath(import.meta.url)), "patches");
const originals = {
  "internal/connector/reads.go": "9661a76f9015370f8ac6ae46fc9d53933d4cf3b11bb7a65aa0cde436eda5d776",
  "internal/connector/catalog.go": "1b7c099581da506f51a737c8f812b69aae08dc7600c84d75b5322d64d425e1de",
  "internal/gateway/gateway.go": "ebb31256fdc334f7ade7e5f57743a3cb606525e4a18322e239a024f9157fc783",
  "internal/chat/approve.go": "232eec569a68949c0eefd6527910977b407ed7db1ac60f4fc12c51134f2fe98f",
};
const hash = value => createHash("sha256").update(value).digest("hex");
function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error("Pinned file-reading source no longer matches");
  return source.replace(before, after);
}
export function rewriteReadFiles(path, source) {
  if (path === "internal/connector/reads.go") {
    source = once(source, "return githubReads()", 'return merged(githubReads(), lexopenReadFiles("github"))');
    source = once(source, "return merged(googleReads(), googlePersonal())", 'return merged(merged(googleReads(), googlePersonal()), lexopenReadFiles("google-workspace"))');
    return once(source, "func readActions(kind string) []Action {", "func lexopenLegacyReadActions(kind string) []Action {");
  }
  if (path === "internal/connector/catalog.go") {
    source = once(source, 'return "saved as " + req.file, req.file, raw, nil', 'if action == "download_file" { return lexopenFileReceipt(req, raw), req.file, raw, nil }\n\t\treturn "saved as " + req.file, req.file, raw, nil');
    return once(source, 'if r.url == dropboxContent + "/files/download" && resp.StatusCode >= 200 && resp.StatusCode < 300 {', 'if (r.file != "" || r.url == dropboxContent + "/files/download") && resp.StatusCode >= 200 && resp.StatusCode < 300 {');
  }
  if (path === "internal/gateway/gateway.go") return once(source, 'out["lexopen_async_messages"] = chat.AsyncMessagesVersion', 'out["lexopen_async_messages"] = chat.AsyncMessagesVersion; out["lexopen_file_reads"] = "v1"');
  if (path === "internal/chat/approve.go") return once(source, 's.approvals.Done(id, res.Output, res.Err)', 's.lexopenDeliverApprovedDownload(ctx, k, ap.Args, &res)\n\t\ts.approvals.Done(id, res.Output, res.Err)');
  throw new Error("Not a pinned file-reading source");
}
export async function hardenReadFiles(directory) {
  const root = await realpath(directory);
  if ((await readFile(join(root, ".lexopen-source-commit"), "utf8")).trim() !== PINNED_COMMIT || (await readFile(join(root, ".lexopen-connector-gate"), "utf8")).trim() !== "v1" || (await readFile(join(root, ".lexopen-async-messages"), "utf8")).trim() !== "v1") throw new Error("File reading requires the exact connector and async hardened public source");
  const changes = [];
  for (const [path, expected] of Object.entries(originals)) {
    const file = join(root, path), stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) throw new Error("Pinned sources must be regular owned files");
    const source = await readFile(file, "utf8");
    if (hash(source) !== expected) throw new Error("Pinned file-reading source differs; start from a fresh connector-hardened archive");
    changes.push([file, rewriteReadFiles(path, source)]);
  }
  const extra = [];
  for (const [target, name] of [["internal/connector/lexopen_read_files.go", "read-files.go"], ["internal/connector/lexopen_read_files_test.go", "read-files_test.go"], ["internal/chat/lexopen_read_files.go", "read-files-desktop.go"], ["internal/chat/lexopen_read_files_test.go", "read-files-desktop_test.go"]]) {
    const file = join(root, target);
    if (await lstat(file).catch(error => { if (error.code === "ENOENT") return null; throw error; })) throw new Error("File-reading source additions already exist");
    extra.push([file, await readFile(join(templates, name), "utf8")]);
  }
  for (const [file, source] of changes) await writeFile(file, source);
  for (const [file, source] of extra) await writeFile(file, source, { flag:"wx", mode:0o600 });
  await writeFile(join(root, ".lexopen-file-reads"), "v1\n", { flag:"wx", mode:0o600 });
  return { source:PINNED_COMMIT, fileReads:"v1", files:changes.length + extra.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/altazor/harden-read-files.mjs <connector-hardened-source-directory>");
  console.log(JSON.stringify(await hardenReadFiles(process.argv[2])));
}
