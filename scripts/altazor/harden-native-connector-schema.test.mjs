import assert from "node:assert/strict";
import { mkdtemp,mkdir,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenNativeConnectorSchema,rewriteNativeConnectorSchema } from "./harden-native-connector-schema.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const source='for _, name := range sortedKeys(allowed) {\n\t\ttools = append(tools, provider.Tool{Name: prefixConnector + name, Description: allowed[name],';
assert.match(rewriteNativeConnectorSchema("internal/chat/actions.go",source),/s\.lexopenNativeConnectorTool\(name\)/);
assert.match(rewriteNativeConnectorSchema("internal/gateway/gateway.go",'out["lexopen_vision_context"] = "v1"'),/lexopen_native_file_tools/);
assert.throws(()=>rewriteNativeConnectorSchema("internal/chat/actions.go","changed"),/no longer matches/);
const root=await mkdtemp(join(tmpdir(),"lexopen-native-file-tools-test-"));
try{
  await writeFile(join(root,".lexopen-source-commit"),PINNED_COMMIT);
  await writeFile(join(root,".lexopen-vision-context"),"v1\n");
  await mkdir(join(root,"internal/chat"),{recursive:true});
  await writeFile(join(root,"internal/chat/actions.go"),"changed");
  await assert.rejects(()=>hardenNativeConnectorSchema(root),/Pinned native connector schema source differs/);
  assert.equal(await readFile(join(root,"internal/chat/actions.go"),"utf8"),"changed");
  await writeFile(join(root,".lexopen-native-connector-schema"),"v1\n");
  await assert.rejects(()=>hardenNativeConnectorSchema(root),/already exists/);
}finally{await rm(root,{recursive:true,force:true});}
console.log("Native connector schemas: exact source, generated-account typed reads and advanced tools preserved PASS.");
