import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates=join(dirname(fileURLToPath(import.meta.url)),"patches");
const originals={
  "internal/chat/actions.go":"bf701758879cf6d1c50677fdab26f6c7f98af8c2359d8ea1d664bcfb50972db5",
  "internal/gateway/gateway.go":"79da7577fb1818f707926948409fc79813d81289cb5dc30bd9b08c05e51d3787",
};
const hash=value=>createHash("sha256").update(value).digest("hex");
function once(source,before,after){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error("Pinned native connector schema source no longer matches");return source.replace(before,after);}
export function rewriteNativeConnectorSchema(path,source){
  if(path==="internal/chat/actions.go")return once(source,'for _, name := range sortedKeys(allowed) {\n\t\ttools = append(tools, provider.Tool{Name: prefixConnector + name, Description: allowed[name],','for _, name := range sortedKeys(allowed) {\n\t\tif tool, ok := s.lexopenNativeConnectorTool(name); ok { tools = append(tools, tool); continue }\n\t\ttools = append(tools, provider.Tool{Name: prefixConnector + name, Description: allowed[name],');
  if(path==="internal/gateway/gateway.go")return once(source,'out["lexopen_vision_context"] = "v1"','out["lexopen_vision_context"] = "v1"; out["lexopen_native_file_tools"] = "v1"');
  throw new Error("Not a pinned native connector schema file");
}
export async function hardenNativeConnectorSchema(directory){
  const root=await realpath(directory);
  if((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-vision-context"),"utf8")).trim()!=="v1")throw new Error("Native connector schema requires the exact vision-context hardened public source");
  if(await lstat(join(root,".lexopen-native-connector-schema")).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Native connector schema hardening already exists");
  const changes=[];
  for(const[path,expected]of Object.entries(originals)){
    const file=join(root,path),stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error("Pinned sources must be regular owned files");
    const source=await readFile(file,"utf8");if(hash(source)!==expected)throw new Error("Pinned native connector schema source differs");
    changes.push([file,rewriteNativeConnectorSchema(path,source)]);
  }
  const extra=[];
  for(const name of["native-connector-schema.go","native-connector-schema_test.go"]){
    const file=join(root,"internal/chat",name==="native-connector-schema.go"?"lexopen_native_connector_schema.go":"lexopen_native_connector_schema_test.go");
    if(await lstat(file).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Native connector schema additions already exist");
    extra.push([file,await readFile(join(templates,name),"utf8")]);
  }
  for(const[file,source]of changes)await writeFile(file,source);
  for(const[file,source]of extra)await writeFile(file,source,{flag:"wx",mode:0o600});
  await writeFile(join(root,".lexopen-native-connector-schema"),"v1\n",{flag:"wx",mode:0o600});
  return{source:PINNED_COMMIT,nativeFileTools:"v1",files:changes.length+extra.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error("Usage: node scripts/altazor/harden-native-connector-schema.mjs <vision-context-hardened-source-directory>");console.log(JSON.stringify(await hardenNativeConnectorSchema(process.argv[2])));}
