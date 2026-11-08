import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenVisionContext, rewriteVisionContext } from "./harden-vision-context.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const chat=rewriteVisionContext("internal/chat/chat.go",[
  "func ask(ctx context.Context, brain provider.Client, native bool, messages []provider.Message, tools []provider.Tool) (provider.Reply, error) {",
  "fitContext(trimHistory(st.messages, s.MaxTurns*2), provider.ContextWindow(p.brain))",
].join("\n"));
assert.match(chat,/messages = lexopenInferenceMessages\(brain, messages\)/);
assert.match(chat,/trimHistory\(lexopenInferenceMessages\(p.brain, st.messages\)/);
assert.match(rewriteVisionContext("internal/gateway/gateway.go",'out["lexopen_file_reads"] = "v1"'),/lexopen_vision_context/);
assert.throws(()=>rewriteVisionContext("internal/chat/chat.go","changed"),/no longer matches/);
const root=await mkdtemp(join(tmpdir(),"lexopen-vision-context-test-"));
try{
  await writeFile(join(root,".lexopen-source-commit"),PINNED_COMMIT);
  await writeFile(join(root,".lexopen-file-reads"),"v1\n");
  await mkdir(join(root,"internal/chat"),{recursive:true});
  await writeFile(join(root,"internal/chat/chat.go"),"changed");
  await assert.rejects(()=>hardenVisionContext(root),/Pinned vision context source differs/);
  assert.equal(await readFile(join(root,"internal/chat/chat.go"),"utf8"),"changed");
  await writeFile(join(root,".lexopen-vision-context"),"v1\n");
  await assert.rejects(()=>hardenVisionContext(root),/already exists/);
}finally{await rm(root,{recursive:true,force:true});}
console.log("Vision context hardening: exact source, image-aware inference boundary and screenshots preserved PASS.");
