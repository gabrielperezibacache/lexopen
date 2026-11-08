import { createHash } from "node:crypto";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import { dirname,join,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates=join(dirname(fileURLToPath(import.meta.url)),"patches");
const originals={
  "internal/chat/approve.go":"f41ff25d1fa23f336d5b67e7df0a2df926e86db46affb2728889f3c6b7e37542",
  "internal/gateway/gateway.go":"644c8ae94a299f76d771c1cb45d7b428b27e06260ed064a904f21a7f626c831f",
};
const hash=value=>createHash("sha256").update(value).digest("hex");
function once(source,before,after){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error("Pinned readable file result source no longer matches");return source.replace(before,after);}
export function rewriteReadableFileResults(path,source){
  if(path==="internal/chat/approve.go")return once(source,'turn.Text = "Approved and done: " + ap.Summary + "\\n" + firstLine(res.Output)','if text, ok := lexopenReadableFileApproval(ap, res); ok { turn.Text = text } else { turn.Text = "Approved and done: " + ap.Summary + "\\n" + firstLine(res.Output) }');
  if(path==="internal/gateway/gateway.go")return once(source,'out["lexopen_native_file_actions"] = "v1"','out["lexopen_native_file_actions"] = "v1"; out["lexopen_readable_file_results"] = "v1"');
  throw new Error("Not a pinned readable file result source");
}
export async function hardenReadableFileResults(directory){
  const root=await realpath(directory);
  if((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-native-file-actions"),"utf8")).trim()!=="v1")throw new Error("Readable file results require the exact native-file-actions hardened public source");
  if(await lstat(join(root,".lexopen-readable-file-results")).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Readable file result hardening already exists");
  const changes=[];
  for(const[path,expected]of Object.entries(originals)){
    const file=join(root,path),stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error("Pinned sources must be regular owned files");
    const source=await readFile(file,"utf8");if(hash(source)!==expected)throw new Error("Pinned readable file result source differs");changes.push([file,rewriteReadableFileResults(path,source)]);
  }
  const extra=[];
  for(const name of["readable-file-results.go","readable-file-results_test.go"]){
    const file=join(root,"internal/chat",name==="readable-file-results.go"?"lexopen_readable_file_results.go":"lexopen_readable_file_results_test.go");
    if(await lstat(file).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Readable file result additions already exist");extra.push([file,await readFile(join(templates,name),"utf8")]);
  }
  for(const[file,source]of changes)await writeFile(file,source);for(const[file,source]of extra)await writeFile(file,source,{flag:"wx",mode:0o600});
  await writeFile(join(root,".lexopen-readable-file-results"),"v1\n",{flag:"wx",mode:0o600});return{source:PINNED_COMMIT,readableFileResults:"v1",files:changes.length+extra.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error("Usage: node scripts/altazor/harden-readable-file-results.mjs <native-file-actions-hardened-source-directory>");console.log(JSON.stringify(await hardenReadableFileResults(process.argv[2])));}
