import { createHash } from "node:crypto";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import { dirname,join,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates=join(dirname(fileURLToPath(import.meta.url)),"patches");
const originals={
  "internal/chat/actions.go":"8a7ec0b3cb39fa1c18f98e572579337bc92913c1640ffa8da22711635f244cfb",
  "internal/chat/chat.go":"64c6c5fb342ac3b42160d52e0b2e70536b29419e275d354339ac9683156586c2",
  "internal/chat/approve.go":"7a6e16e7e0bb7bf17ddb39e41f1d2f031b1d1804c2bc7cb39d2e9381f85fdb21",
  "internal/chat/lexopen_connector_file_focus.go":"0617ea108ec5e66e40bd25e09afb9a9a0e98a5d6b66739ec531f253e2295129c",
  "internal/gateway/gateway.go":"54e7cf1756f81cd5cb30a6bf7e937149f253274d3f233f40cd298a7c5f039aa0",
};
const hash=value=>createHash("sha256").update(value).digest("hex");
function once(source,before,after){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error("Pinned native file action source no longer matches");return source.replace(before,after);}
export function rewriteNativeFileActions(path,source){
  if(path==="internal/chat/actions.go"){
    source=once(source,"\tcallID string // the native call's id, empty for a text line","\tcallID string // the native call's id, empty for a text line\n\tinvalid string // bounded server-authored preflight feedback; never executed");
    source=once(source,"if tool, ok := s.lexopenNativeConnectorTool(name); ok { tools = append(tools, tool); continue }","if tool, ok := s.lexopenNativeConnectorTool(name); ok { tools = append(tools, s.lexopenNativeFileActionTools(name)...); tools = append(tools, tool); continue }");
    return once(source,'\t\tcase "connector":\n\t\t\tif len(allowed) == 0 {','\t\tcase "connector":\n\t\t\tif a.invalid != "" { out = append(out, outcome{action:a, err:a.invalid}); continue }\n\t\t\tif _, selected := allowed[a.name]; !selected { out = append(out, outcome{action:a, err:"This connection is not selected for the current desktop."}); continue }\n\t\t\tif len(allowed) == 0 {');
  }
  if(path==="internal/chat/chat.go"){
    source=once(source,"actions = fromCalls(reply.Calls)","actions = s.lexopenFromFileCalls(reply.Calls, k, allowed, fileFocus)");
    return once(source,"st.actions, text = fromCalls(answer.Calls), answer.Content","st.actions, text = s.lexopenFromFileCalls(answer.Calls, k, p.allowed, p.fileFocus), answer.Content");
  }
  if(path==="internal/chat/approve.go")return once(source,"kind := kinder.Kind()\n\trisk := connector.RiskOfCall(kind, a.args)","kind := kinder.Kind()\n\tif err := s.lexopenPreflightEasyFile(k, a); err != nil { return outcome{action:a, err:err.Error()}, true }\n\trisk := connector.RiskOfCall(kind, a.args)");
  if(path==="internal/chat/lexopen_connector_file_focus.go")return once(source,"if lexopenBrowserFileAction(tool.Name){continue}","if lexopenBrowserFileAction(tool.Name){continue}\n\t\tbase := strings.TrimPrefix(tool.Name, prefixConnector)\n\t\tif lexopenEasyGoogleName.MatchString(base)||lexopenEasyGithubName.MatchString(base){continue}");
  if(path==="internal/gateway/gateway.go")return once(source,'out["lexopen_file_task_focus"] = "v1"','out["lexopen_file_task_focus"] = "v1"; out["lexopen_native_file_actions"] = "v1"');
  throw new Error("Not a pinned native file action source");
}
export async function hardenNativeFileActions(directory){
  const root=await realpath(directory);
  if((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-connector-file-focus"),"utf8")).trim()!=="v1")throw new Error("Native file actions require the exact file-focus hardened public source");
  if(await lstat(join(root,".lexopen-native-file-actions")).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Native file actions hardening already exists");
  const changes=[];
  for(const[path,expected]of Object.entries(originals)){
    const file=join(root,path),stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error("Pinned sources must be regular owned files");
    const source=await readFile(file,"utf8");if(hash(source)!==expected)throw new Error("Pinned native file action source differs");changes.push([file,rewriteNativeFileActions(path,source)]);
  }
  const extra=[];
  for(const[target,name]of [["internal/chat/lexopen_native_file_actions.go","native-file-actions.go"],["internal/chat/lexopen_native_file_actions_test.go","native-file-actions_test.go"],["internal/connector/lexopen_easy_file_validation.go","easy-file-validation.go"],["internal/connector/lexopen_easy_file_validation_test.go","easy-file-validation_test.go"]]){
    const file=join(root,target);if(await lstat(file).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Native file action additions already exist");extra.push([file,await readFile(join(templates,name),"utf8")]);
  }
  for(const[file,source]of changes)await writeFile(file,source);for(const[file,source]of extra)await writeFile(file,source,{flag:"wx",mode:0o600});
  await writeFile(join(root,".lexopen-native-file-actions"),"v1\n",{flag:"wx",mode:0o600});return{source:PINNED_COMMIT,nativeFileActions:"v1",files:changes.length+extra.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error("Usage: node scripts/altazor/harden-native-file-actions.mjs <file-focus-hardened-source-directory>");console.log(JSON.stringify(await hardenNativeFileActions(process.argv[2])));}
