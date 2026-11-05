import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { Page } from "playwright";
import { readAuthenticatedPjudDocument } from "./authenticated-document";
async function main() {
  const events=new EventEmitter(),cookieTargets:string[]=[];
  const cookie=(name:string,domain:string,path="/",value="FICTITIOUS")=>({name,domain,path,value,expires:-1,secure:true,httpOnly:true,sameSite:"Lax" as const});
  const page=Object.assign(events,{url:()=>"https://oficinajudicialvirtual.pjud.cl/indexN.php",context:()=>({cookies:async(url:string)=>{cookieTargets.push(url);return[cookie("civil_session","civil.pjud.cl"),cookie("civil_session","civil.pjud.cl","/documents","SPECIFIC"),cookie("boundary","civil.pjud.cl","/documents2"),{...cookie("expired","civil.pjud.cl"),expires:Date.now()/1000-60},cookie("parent_session",".pjud.cl"),cookie("ojv_only","oficinajudicialvirtual.pjud.cl"),cookie("wrong_path","civil.pjud.cl","/private"),cookie("injected","civil.pjud.cl","/","bad\r\nheader")];}})}) as unknown as Pick<Page,"url"|"context"|"once"|"off">;
  const target="https://civil.pjud.cl/documents/fixture.pdf?opaque=FICTITIOUS";
  let requested=0,produced=0,mode:"normal"|"header"|"overflow"|"redirect"|"slow"="normal";
  let address="8.8.8.8";
  const transport:NonNullable<Parameters<typeof readAuthenticatedPjudDocument>[3]>={
    resolve:async()=>[{address,family:4}],
    request:(url,options,onResponse)=>{
      requested++; assert.equal(url.href,target); assert.equal(options.servername,"civil.pjud.cl"); assert.equal(options.agent,false); assert.equal(options.method,"GET");
      const headers=options.headers as Record<string,string>;
      assert.equal(headers.Cookie,"civil_session=SPECIFIC; civil_session=FICTITIOUS; parent_session=FICTITIOUS"); assert.equal(headers["Accept-Encoding"],"identity");
      const pinned=options.lookup as unknown as (hostname:string,options:object,callback:(error:null,address:string,family:number)=>void)=>void;
      pinned("civil.pjud.cl",{},(_error,pinnedAddress,family)=>{assert.equal(pinnedAddress,"8.8.8.8");assert.equal(family,4);});
      const incoming=Object.assign(mode==="slow"?new Readable({read(){}}):Readable.from((async function*(){if(mode==="overflow"){for(let i=0;i<30;i++){produced++;yield Buffer.alloc(1024*1024);}}else{produced++;yield Buffer.from("%PDF-1.4\n"+"x".repeat(341));}})()),{statusCode:mode==="redirect"?302:200,headers:{"content-type":"application/pdf",...(mode==="header"?{"content-length":String(21*1024*1024)}:{}),...(mode==="redirect"?{location:"https://external.invalid/stolen"}:{})}}) as unknown as IncomingMessage;
      const outgoing=new EventEmitter();
      options.signal?.addEventListener("abort",()=>{incoming.destroy();outgoing.emit("error",new Error("cancelled"));},{once:true});
      return Object.assign(outgoing,{end:()=>{queueMicrotask(()=>onResponse(incoming));}}) as unknown as ClientRequest;
    },
  };
  const normal=await readAuthenticatedPjudDocument(page,target,20*1024*1024,transport);
  assert.equal(normal?.bytes.length,350); assert.equal(cookieTargets[0],target); assert.equal(events.listenerCount("close"),0);
  mode="header";produced=0;assert.equal(await readAuthenticatedPjudDocument(page,target,20*1024*1024,transport),null);assert.equal(produced,0,"header rejection must precede consuming any response body");
  mode="overflow";produced=0;assert.equal(await readAuthenticatedPjudDocument(page,target,20*1024*1024,transport),null);assert.ok(produced<=22,"lengthless transport stops at the first oversized chunk plus stream prefetch");
  mode="redirect";const beforeRedirect=requested;assert.equal(await readAuthenticatedPjudDocument(page,target,20*1024*1024,transport),null);assert.equal(requested,beforeRedirect+1,"redirects are never followed with credentials");
  address="127.0.0.1";const beforePrivate=requested;assert.equal(await readAuthenticatedPjudDocument(page,target,20*1024*1024,transport),null);assert.equal(requested,beforePrivate,"private DNS must be rejected before the HTTPS request");
  address="8.8.8.8";mode="slow";const beforeClose=requested;const pending=readAuthenticatedPjudDocument(page,target,20*1024*1024,transport);while(requested===beforeClose)await new Promise(resolve=>setTimeout(resolve,1));events.emit("close");assert.equal(await pending,null);assert.equal(events.listenerCount("close"),0);
  assert.equal(await readAuthenticatedPjudDocument(page,"https://external.invalid/fixture.pdf",20*1024*1024,transport),null);assert.equal(await readAuthenticatedPjudDocument(page,"http://civil.pjud.cl/fixture.pdf",20*1024*1024,transport),null);
  console.log("Authenticated PJUD transport: exact target cookie filtering, public DNS pin/TLS, bounded header/lengthless streams, no redirects, cancellation and no credential persistence passed (synthetic transport).");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
