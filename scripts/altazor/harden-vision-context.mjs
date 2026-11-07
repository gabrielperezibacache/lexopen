import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates=join(dirname(fileURLToPath(import.meta.url)),"patches");
const originals={
  "internal/chat/chat.go":"cf5a2d9642557064ed2e64f58d12d2182a2097d5412fbc4f84d12a05a3e92017",
  "internal/gateway/gateway.go":"c96200108b0f32f5824d985152de0b54c7acc6462dceeb3fc7c81e59afcebd4d",
};
const hash=value=>createHash("sha256").update(value).digest("hex");
function once(source,before,after){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error("Pinned vision context source no longer matches");return source.replace(before,after);}
export function rewriteVisionContext(path,source){
  if(path==="internal/chat/chat.go"){
    source=once(source,"func ask(ctx context.Context, brain provider.Client, native bool, messages []provider.Message, tools []provider.Tool) (provider.Reply, error) {","func ask(ctx context.Context, brain provider.Client, native bool, messages []provider.Message, tools []provider.Tool) (provider.Reply, error) {\n\tmessages = lexopenInferenceMessages(brain, messages)");
    return once(source,"fitContext(trimHistory(st.messages, s.MaxTurns*2), provider.ContextWindow(p.brain))","fitContext(trimHistory(lexopenInferenceMessages(p.brain, st.messages), s.MaxTurns*2), provider.ContextWindow(p.brain))");
  }
  if(path==="internal/gateway/gateway.go")return once(source,'out["lexopen_file_reads"] = "v1"','out["lexopen_file_reads"] = "v1"; out["lexopen_vision_context"] = "v1"');
  throw new Error("Not a pinned vision context file");
}
export async function hardenVisionContext(directory){
  const root=await realpath(directory);
  if((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-file-reads"),"utf8")).trim()!=="v1")throw new Error("Vision context requires the exact file-read hardened public source");
  if(await lstat(join(root,".lexopen-vision-context")).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Vision context hardening already exists");
  const changes=[];
  for(const[path,expected]of Object.entries(originals)){
    const file=join(root,path),stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error("Pinned sources must be regular owned files");
    const source=await readFile(file,"utf8");if(hash(source)!==expected)throw new Error("Pinned vision context source differs");
    changes.push([file,rewriteVisionContext(path,source)]);
  }
  const extra=[];
  for(const name of["vision-context.go","vision-context_test.go"]){
    const file=join(root,"internal/chat",name==="vision-context.go"?"lexopen_vision_context.go":"lexopen_vision_context_test.go");
    if(await lstat(file).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw new Error("Vision context additions already exist");
    extra.push([file,await readFile(join(templates,name),"utf8")]);
  }
  for(const[file,source]of changes)await writeFile(file,source);
  for(const[file,source]of extra)await writeFile(file,source,{flag:"wx",mode:0o600});
  await writeFile(join(root,".lexopen-vision-context"),"v1\n",{flag:"wx",mode:0o600});
  return{source:PINNED_COMMIT,visionContext:"v1",files:changes.length+extra.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error("Usage: node scripts/altazor/harden-vision-context.mjs <file-read-hardened-source-directory>");console.log(JSON.stringify(await hardenVisionContext(process.argv[2])));}
