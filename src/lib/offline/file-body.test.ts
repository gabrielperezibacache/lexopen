import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { parseOfflineFileBody } from "./file-body";
import { decodeContent, encodeContent } from "./file-sources";
import { MAX_OFFLINE_FILE_REQUEST_BYTES } from "./file-schemas";
const status=(n:number)=>(e:unknown)=>(e as {status?:number}).status===n;
async function main(){
  const text="Texto íntegro Ñ 漢字", sha256=createHash("sha256").update(text).digest("hex");
  const data={requestId:randomUUID(),kind:"documento",action:"create",target:{type:"cause",id:"fixture",folderId:null,expectedVersion:"a".repeat(64)},fields:{name:"Prueba.txt",type:"otro",path:null,tags:"",confidential:false,privileged:false},content:{mode:"text",text,sha256,mimeType:"text/plain"}};
  const request=(body:string)=>new Request("http://localhost/api/offline/files",{method:"POST",body});
  assert.equal((await parseOfflineFileBody(request(JSON.stringify(data)))).content.sha256,sha256);
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_OFFLINE_FILE_REQUEST_BYTES));c.enqueue(new Uint8Array([1]));c.close();}});
  await assert.rejects(parseOfflineFileBody(new Request("http://localhost/api/offline/files",{method:"POST",body:stream,duplex:"half"} as RequestInit & {duplex:"half"})),status(413));
  await assert.rejects(parseOfflineFileBody(request('{"')),status(400));
  const good=Buffer.from("original");const digest=createHash("sha256").update(good).digest("hex");
  assert.equal(decodeContent({mode:"binary",base64:good.toString("base64"),size:good.length,sha256:digest,mimeType:"application/pdf"}).toString(),"original");
  assert.throws(()=>decodeContent({mode:"binary",base64:good.toString("base64").replace(/=$/,""),size:good.length,sha256:digest,mimeType:"application/pdf"}),status(422));
  assert.throws(()=>decodeContent({mode:"binary",base64:good.toString("base64"),size:good.length+1,sha256:digest,mimeType:"application/pdf"}),status(422));
  assert.throws(()=>decodeContent({mode:"text",text:"alterado",sha256:digest,mimeType:"text/plain"}),status(422));
  assert.equal(encodeContent(Buffer.from([65,0,66]), "text/plain").mode, "binary", "NUL-bearing originals remain byte-exact binary attachments");
  console.log("Offline file body PASS: chunked and declared bounds, malformed JSON, exact UTF-8, canonical base64, length and digest verification.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
