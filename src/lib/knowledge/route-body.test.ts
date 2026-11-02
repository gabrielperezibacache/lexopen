import assert from "node:assert/strict";
import { z } from "zod";
import { parseKnowledgeBody } from "./route-body";
const schema=z.object({statement:z.string()}).strict();
const code=(status:number)=>(error:unknown)=>(error as {status?:number}).status===status;
async function main(){
  const text="Hecho ficticio con ñ, 😀 y cita exacta";
  const valid=new Request("http://fixture.invalid",{method:"POST",body:JSON.stringify({statement:text})});assert.equal((await parseKnowledgeBody(valid,schema)).statement,text);
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(262145));},cancel(){cancelled=true;}});
  await assert.rejects(parseKnowledgeBody(new Request("http://fixture.invalid",{method:"POST",body:stream,duplex:"half"}as RequestInit),schema),code(413));assert.equal(cancelled,true);
  for(const max of [4096,20000,40000,60000]) {
    let stopped=false;
    const chunks=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(max+1));},cancel(){stopped=true;}});
    await assert.rejects(parseKnowledgeBody(new Request("http://fixture.invalid",{method:"POST",body:chunks,duplex:"half"} as RequestInit),schema,max),code(413));assert.equal(stopped,true);
  }
  const declared=new Request("http://fixture.invalid",{method:"POST",headers:{"Content-Length":"999999999"},body:"{}"});await assert.rejects(parseKnowledgeBody(declared,schema),code(413));
  await assert.rejects(parseKnowledgeBody(new Request("http://fixture.invalid",{method:"POST",body:"{"}),schema),code(400));
  await assert.rejects(parseKnowledgeBody(new Request("http://fixture.invalid",{method:"POST",body:Uint8Array.from([123,34,115,116,97,116,101,109,101,110,116,34,58,34,255,34,125])}),schema),code(400));
  await assert.rejects(parseKnowledgeBody(new Request("http://fixture.invalid"),schema),code(400));
  console.log("Knowledge JSON PASS: exact Unicode, bounded declared/chunked bodies, cancellation, strict UTF-8 and invalid JSON");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
