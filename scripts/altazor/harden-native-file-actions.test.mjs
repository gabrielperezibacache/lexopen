import assert from "node:assert/strict";
import { mkdtemp,mkdir,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenNativeFileActions,rewriteNativeFileActions } from "./harden-native-file-actions.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const actions=['\tcallID string // the native call\'s id, empty for a text line','if tool, ok := s.lexopenNativeConnectorTool(name); ok { tools = append(tools, tool); continue }','\t\tcase "connector":\n\t\t\tif len(allowed) == 0 {'].join("\n");
assert.match(rewriteNativeFileActions("internal/chat/actions.go",actions),/a.invalid/);
assert.match(rewriteNativeFileActions("internal/chat/chat.go","actions = fromCalls(reply.Calls)\nst.actions, text = fromCalls(answer.Calls), answer.Content"),/lexopenFromFileCalls/);
assert.match(rewriteNativeFileActions("internal/chat/approve.go","kind := kinder.Kind()\n\trisk := connector.RiskOfCall(kind, a.args)"),/lexopenPreflightEasyFile/);
assert.match(rewriteNativeFileActions("internal/chat/lexopen_connector_file_focus.go","if lexopenBrowserFileAction(tool.Name){continue}"),/lexopenEasyGoogleName/);
assert.match(rewriteNativeFileActions("internal/gateway/gateway.go",'out["lexopen_file_task_focus"] = "v1"'),/lexopen_native_file_actions/);
assert.throws(()=>rewriteNativeFileActions("internal/chat/actions.go","changed"),/no longer matches/);
const root=await mkdtemp(join(tmpdir(),"lexopen-native-file-actions-test-"));
try{
  await writeFile(join(root,".lexopen-source-commit"),PINNED_COMMIT);await writeFile(join(root,".lexopen-connector-file-focus"),"v1\n");
  await mkdir(join(root,"internal/chat"),{recursive:true});await writeFile(join(root,"internal/chat/actions.go"),"changed");
  await assert.rejects(()=>hardenNativeFileActions(root),/Pinned native file action source differs/);assert.equal(await readFile(join(root,"internal/chat/actions.go"),"utf8"),"changed");
}finally{await rm(root,{recursive:true,force:true});}
console.log("Native file actions: local preflight before approval, bound action targets, exact selected account and source drift refusal PASS.");
