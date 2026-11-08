import { createHash } from "node:crypto";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import { dirname,join,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates=join(dirname(fileURLToPath(import.meta.url)),"patches");
const originals={
  "internal/chat/chat.go":"8a1bab7971ddcb51f11fe91eb43f468a161fdaf7d061de787c6b8417137331bb",
  "internal/gateway/gateway.go":"d97241012486ab06723b2eb065d4e7219895d88f93fc478e57390eab81d7c7fd",
};
const hash=value=>createHash("sha256").update(value).digest("hex");
function once(source,before,after){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error("Pinned connector file focus source no longer matches");return source.replace(before,after);}
export function rewriteConnectorFileFocus(path,source){
  if(path==="internal/chat/chat.go"){
    source=once(source,"\tnative   bool\n","\tnative   bool\n\tfileFocus bool\n");
    source=once(source,"allowed := s.fleet.Connectors().Descriptions(k.Connectors)","allowed := s.fleet.Connectors().Descriptions(k.Connectors)\n\tfileFocus := s.lexopenFileToolFocus(id, k, allowed)");
    source=once(source,'system += "\\n" + desktop.Catalogue()','if fileFocus { system += "\\n" + lexopenFileTaskCatalogue } else { system += "\\n" + desktop.Catalogue() }');
    source=once(source,"tools = s.toolSet(k, allowed)","tools = lexopenFocusFileTools(s.toolSet(k, allowed), fileFocus)");
    source=once(source,"native: native, reply: reply","native: native, fileFocus: fileFocus, reply: reply");
    return once(source,"da := desktop.Action{Name: a.name, Args: a.args, Raw: a.raw}",`da := desktop.Action{Name: a.name, Args: a.args, Raw: a.raw}
			if p.fileFocus && lexopenBrowserFileAction(da.Name) {
				reason := "This native connected file task does not offer browser navigation. Use the selected connector and wait for approval; then use the verified local file with run, launch or document tools. No browser action was executed."
				s.appendStep(id, index, Step{At:s.now(), Action:a.name, Args:a.args, Error:reason})
				outs = append(outs, outcome{action:a, err:reason})
				continue
			}`);
  }
  if(path==="internal/gateway/gateway.go")return once(source,'out["lexopen_native_file_tools"] = "v1"','out["lexopen_native_file_tools"] = "v1"; out["lexopen_file_task_focus"] = "v1"');
  throw new Error("Not a pinned connector file focus source");
}
export async function hardenConnectorFileFocus(directory){
  const root=await realpath(directory);
  if((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-native-connector-schema"),"utf8")).trim()!=="v1")throw new Error("Connector file focus requires the exact native-schema hardened public source");
  if(await lstat(join(root,".lexopen-connector-file-focus")).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Connector file focus hardening already exists");
  const changes=[];
  for(const[path,expected]of Object.entries(originals)){
    const file=join(root,path),stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error("Pinned sources must be regular owned files");
    const source=await readFile(file,"utf8");if(hash(source)!==expected)throw new Error("Pinned connector file focus source differs");
    changes.push([file,rewriteConnectorFileFocus(path,source)]);
  }
  const extra=[];
  for(const name of["connector-file-focus.go","connector-file-focus_test.go"]){
    const file=join(root,"internal/chat",name==="connector-file-focus.go"?"lexopen_connector_file_focus.go":"lexopen_connector_file_focus_test.go");
    if(await lstat(file).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Connector file focus additions already exist");
    extra.push([file,await readFile(join(templates,name),"utf8")]);
  }
  for(const[file,source]of changes)await writeFile(file,source);
  for(const[file,source]of extra)await writeFile(file,source,{flag:"wx",mode:0o600});
  await writeFile(join(root,".lexopen-connector-file-focus"),"v1\n",{flag:"wx",mode:0o600});
  return{source:PINNED_COMMIT,fileTaskFocus:"v1",files:changes.length+extra.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error("Usage: node scripts/altazor/harden-connector-file-focus.mjs <native-schema-hardened-source-directory>");console.log(JSON.stringify(await hardenConnectorFileFocus(process.argv[2])));}
