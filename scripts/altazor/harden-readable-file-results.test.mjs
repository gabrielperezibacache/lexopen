import assert from "node:assert/strict";
import { mkdtemp,mkdir,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenReadableFileResults,rewriteReadableFileResults } from "./harden-readable-file-results.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const original='turn.Text = "Approved and done: " + ap.Summary + "\\n" + firstLine(res.Output)';
const result=rewriteReadableFileResults("internal/chat/approve.go",original);
assert.match(result,/lexopenReadableFileApproval\(ap, res\)/);assert.ok(result.includes(original));
assert.match(rewriteReadableFileResults("internal/gateway/gateway.go",'out["lexopen_native_file_actions"] = "v1"'),/lexopen_readable_file_results/);
assert.throws(()=>rewriteReadableFileResults("internal/chat/approve.go","changed"),/no longer matches/);
const root=await mkdtemp(join(tmpdir(),"lexopen-readable-file-results-test-"));
try{
  await writeFile(join(root,".lexopen-source-commit"),PINNED_COMMIT);await writeFile(join(root,".lexopen-native-file-actions"),"v1\n");
  await mkdir(join(root,"internal/chat"),{recursive:true});await writeFile(join(root,"internal/chat/approve.go"),"changed");
  await assert.rejects(()=>hardenReadableFileResults(root),/Pinned readable file result source differs/);assert.equal(await readFile(join(root,"internal/chat/approve.go"),"utf8"),"changed");
}finally{await rm(root,{recursive:true,force:true});}
console.log("Readable approved file results: exact source, full bounded external data and advanced fallback preserved PASS.");
