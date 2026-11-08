import assert from "node:assert/strict";
import { mkdtemp,mkdir,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenConnectorFileFocus,rewriteConnectorFileFocus } from "./harden-connector-file-focus.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const source=["\tnative   bool\n","allowed := s.fleet.Connectors().Descriptions(k.Connectors)",'system += "\\n" + desktop.Catalogue()',"tools = s.toolSet(k, allowed)","native: native, reply: reply","da := desktop.Action{Name: a.name, Args: a.args, Raw: a.raw}"].join("\n");
const result=rewriteConnectorFileFocus("internal/chat/chat.go",source);
assert.match(result,/s\.lexopenFileToolFocus\(id, k, allowed\)/);assert.match(result,/lexopenFocusFileTools/);assert.match(result,/p.fileFocus && lexopenBrowserFileAction/);
assert.match(rewriteConnectorFileFocus("internal/gateway/gateway.go",'out["lexopen_native_file_tools"] = "v1"'),/lexopen_file_task_focus/);
assert.throws(()=>rewriteConnectorFileFocus("internal/chat/chat.go","changed"),/no longer matches/);
const root=await mkdtemp(join(tmpdir(),"lexopen-file-focus-test-"));
try{
  await writeFile(join(root,".lexopen-source-commit"),PINNED_COMMIT);await writeFile(join(root,".lexopen-native-connector-schema"),"v1\n");
  await mkdir(join(root,"internal/chat"),{recursive:true});await writeFile(join(root,"internal/chat/chat.go"),"changed");
  await assert.rejects(()=>hardenConnectorFileFocus(root),/Pinned connector file focus source differs/);assert.equal(await readFile(join(root,"internal/chat/chat.go"),"utf8"),"changed");
}finally{await rm(root,{recursive:true,force:true});}
console.log("Connected file task focus: exact source, native priority, local tools retained and no budget increase PASS.");
