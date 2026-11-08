import { createHash } from "node:crypto";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import { dirname,join,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates=join(dirname(fileURLToPath(import.meta.url)),"patches");
const originals={
  "internal/connector/connector.go":"bb7c8457ee73f85c6ae58c1bea876ce070231b1472dfa9407f5a5455f3f6bca4",
  "internal/connector/catalog.go":"2d8b1f2a0ee2579c01f3938f9a559030484f1d5643f47771b5235a48755bf016",
  "internal/chat/lexopen_readable_file_results.go":"bfb6728828690d747736f98d4cd9e02049b2f2136c6339c5e1bd6bfa66a6ec9f",
  "internal/chat/lexopen_connector_file_focus.go":"7caf978c348a1db996dedc729c3c7bea9e6780c2525885d38872b5c289bffe7c",
  "internal/chat/lexopen_native_file_actions.go":"405d905bd4a23ef30649d66d776449b3636c112946c0067f249bf82c8d21dc8a",
  "internal/gateway/gateway.go":"40b689e22a1debe126737fd9ca9541cf28e8a933babfbb541bca6f452bdbf8fa",
};
const hash=value=>createHash("sha256").update(value).digest("hex");
function once(source,before,after){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error("Pinned compact file result source no longer matches");return source.replace(before,after);}
export function rewriteCompactFileResults(path,source){
  if(path==="internal/connector/connector.go"){
    source=once(source,'\tOutput string `json:"output"`','\tOutput string `json:"output"`\n\tOutputTruncated bool `json:"outputTruncated,omitempty"`');
    source=once(source,'\tvar out string\n\tvar err error','\tctx, fileOutputState := lexopenBeginFileOutput(ctx, call.Name, res.Kind, call.Args)\n\tvar out string\n\tvar err error');
    return once(source,'\tres.Output = clip(out, 4000)','\tif fileOutputState != nil {\n\t\tres.Output, res.OutputTruncated = lexopenBoundFileOutput(out, 10000)\n\t\tres.OutputTruncated = res.OutputTruncated || fileOutputState.truncated\n\t} else { res.Output = clip(out, 4000) }');
  }
  if(path==="internal/connector/catalog.go")return once(source,'\tif out, ok := readRender(a.kind.Name, action, raw); ok {','\tif out, ok := lexopenEasyAPIRead(ctx, a.kind.Name, action, args, raw); ok { return out, "", nil, nil }\n\tif out, ok := readRender(a.kind.Name, action, raw); ok {');
  if(path==="internal/chat/lexopen_readable_file_results.go")return once(source,'data:=[]rune(res.Output);end:=len(data);truncated:=false','data:=[]rune(res.Output);end:=len(data);truncated:=res.OutputTruncated');
  if(path==="internal/chat/lexopen_connector_file_focus.go")return once(source,'List/search with the native request action; download the selected complete file with download_file.','When the person supplied an exact owner/repository and file path, or a Drive file id or official Drive/Docs link, call the per-action download_file tool directly with those exact target fields. Do not list or search first to reconfirm an explicit target. List/search with request only when the target is missing. The per-action functions fix the action themselves: never send an action argument to them. A returned page is not an exhaustive account inventory; never infer absence or substitute another file from it.');
  if(path==="internal/chat/lexopen_native_file_actions.go")return once(source,'REQUIRED id comes from the listing.','REQUIRED id comes from the person\'s explicit official Drive/Docs link or a selected listing. Use an explicit id directly without listing the account first.');
  if(path==="internal/gateway/gateway.go")return once(source,'out["lexopen_readable_file_results"] = "v1"','out["lexopen_readable_file_results"] = "v1"; out["lexopen_compact_file_results"] = "v1"');
  throw new Error("Not a pinned compact file result source");
}
export async function hardenCompactFileResults(directory){
  const root=await realpath(directory);
  if((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-readable-file-results"),"utf8")).trim()!=="v1")throw new Error("Compact file results require the exact readable-file-results hardened public source");
  if(await lstat(join(root,".lexopen-compact-file-results")).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Compact file result hardening already exists");
  const changes=[];
  for(const[path,expected]of Object.entries(originals)){
    const file=join(root,path),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error("Pinned sources must be regular owned files");
    const source=await readFile(file,"utf8");if(hash(source)!==expected)throw new Error("Pinned compact file result source differs");changes.push([file,rewriteCompactFileResults(path,source)]);
  }
  const extra=[];
  for(const[name,packageName]of[["compact-file-results.go","connector"],["compact-file-results_test.go","connector"],["compact-file-results-chat_test.go","chat"]]){
    const file=join(root,"internal",packageName,`lexopen_${name.replaceAll("-","_")}`);
    if(await lstat(file).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Compact file result additions already exist");extra.push([file,await readFile(join(templates,name),"utf8")]);
  }
  for(const[file,source]of changes)await writeFile(file,source);for(const[file,source]of extra)await writeFile(file,source,{flag:"wx",mode:0o600});
  await writeFile(join(root,".lexopen-compact-file-results"),"v1\n",{flag:"wx",mode:0o600});return{source:PINNED_COMMIT,compactFileResults:"v1",files:changes.length+extra.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error("Usage: node scripts/altazor/harden-compact-file-results.mjs <readable-file-results-hardened-source-directory>");console.log(JSON.stringify(await hardenCompactFileResults(process.argv[2])));}
