/** Exercise the exact browser-side streaming function with a fake local transport. */
import assert from "node:assert/strict";
import { withManualPjudInteraction } from "./manual-interaction-policy";
import { attachDocumentoBytesFromPage, pjudCaptchaAutoSolveAllowed, pjudDocumentDownloadsAllowed } from "./public-scrape";
import type { PjudFetchedMovimiento } from "./types";

async function main() {
  const previous = process.env.PJUD_DOC_DOWNLOADS, previousFetch = globalThis.fetch, locationDescriptor = Object.getOwnPropertyDescriptor(globalThis,"location");
  process.env.PJUD_DOC_DOWNLOADS = "1";
  const origin = "https://oficinajudicialvirtual.pjud.cl";
  Object.defineProperty(globalThis,"location",{ configurable:true,value:{ origin } });
  let requests = 0, cancelled = 0, readers = 0, chunksRead = 0, responseStatus = 401;
  let mode: "normal" | "invalid-pdf" | "oversized-header" | "oversized-stream" = "normal";
  const bytes = Buffer.from("%PDF-1.4\n" + "x".repeat(341));
  globalThis.fetch = async (input, options) => {
    requests++; assert.equal(new URL(String(input)).origin, origin); assert.equal(options?.redirect,"error"); assert.equal(options?.credentials,"include");
    let index = 0;
    return { ok: responseStatus === 200, headers: new Headers({ "content-type":"application/pdf", ...(mode === "oversized-header" ? { "content-length": String(21 * 1024 * 1024) } : {}) }), body: {
      cancel: async () => { cancelled++; },
      getReader: () => { readers++; return { read: async () => {
        if (mode === "oversized-stream") { index++; chunksRead++; return index > 30 ? { done:true } : { done:false,value:new Uint8Array(1024 * 1024) }; }
        return index++ ? { done:true } : { done:false,value:new Uint8Array(mode === "invalid-pdf" ? Buffer.from("Sesión no disponible. " + "x".repeat(341)) : bytes) };
      }, cancel: async () => { cancelled++; }, releaseLock: () => undefined }; },
    } } as unknown as Response;
  };
  const page = { url: () => `${origin}/indexN.php`, evaluate: async (work: (args: { href:string;maximum:number })=>Promise<unknown>, args: { href:string;maximum:number }) => work(args) } as unknown as Parameters<typeof attachDocumentoBytesFromPage>[0];
  const rows: PjudFetchedMovimiento[] = Array.from({ length:10 },(_,index)=>({ externalId:`fixture-${index}`,titulo:"Synthetic resolution",fecha:new Date(),fuente:"pjud",documentoRef:`${origin}/f-${index}.pdf` }));
  try {
    await withManualPjudInteraction(async()=>{ assert.equal(pjudDocumentDownloadsAllowed(),false); await attachDocumentoBytesFromPage(page,rows,{limit:2,delayMs:0}); });
    assert.equal(requests,0);
    await withManualPjudInteraction(async()=>{ assert.equal(pjudDocumentDownloadsAllowed(),true); assert.equal(pjudCaptchaAutoSolveAllowed(),false); const result=await attachDocumentoBytesFromPage(page,rows,{limit:2,delayMs:0}); assert.ok(result.every(row=>!row.documentoBytes)); },{downloadDocuments:true});
    assert.equal(requests,2,"failed attempts consume the bounded batch budget"); assert.equal(readers,0); assert.equal(cancelled,2);
    responseStatus=200;
    const result=await withManualPjudInteraction(()=>attachDocumentoBytesFromPage(page,rows,{limit:2,delayMs:0}),{downloadDocuments:true});
    assert.equal(result.filter(row=>row.documentoBytes).length,2); assert.equal(requests,4);
    mode="invalid-pdf";
    const invalid=await withManualPjudInteraction(()=>attachDocumentoBytesFromPage(page,rows,{limit:1,delayMs:0}),{downloadDocuments:true});
    assert.equal(invalid[0].documentoBytes,undefined,"a response advertised as PDF is not stored without the PDF signature");
    assert.equal(invalid[0].documentoRef,rows[0].documentoRef,"the original reference remains available when the download fails validation");
    mode="oversized-header"; const beforeHeader=readers;
    await withManualPjudInteraction(()=>attachDocumentoBytesFromPage(page,rows,{limit:1,delayMs:0}),{downloadDocuments:true});
    assert.equal(readers,beforeHeader,"advertised oversized bodies are cancelled before a reader is acquired");
    mode="oversized-stream";
    const oversized=await withManualPjudInteraction(()=>attachDocumentoBytesFromPage(page,rows,{limit:1,delayMs:0}),{downloadDocuments:true});
    assert.equal(oversized[0].documentoBytes,undefined); assert.equal(chunksRead,21,"a lengthless oversized response must be cancelled at the first chunk beyond 20 MiB");
    mode="normal";
    const aggregate=await withManualPjudInteraction(()=>attachDocumentoBytesFromPage(page,rows,{limit:10,delayMs:0,maxTotalBytes:500}),{downloadDocuments:true});
    assert.equal(aggregate.reduce((sum,row)=>sum+(row.documentoBytes?.length||0),0),350,"captured originals also respect the total batch byte budget");
    const beforeForeign=requests;
    await withManualPjudInteraction(()=>attachDocumentoBytesFromPage(page,[{...rows[0],documentoRef:"https://other.pjud.cl/foreign.pdf"}],{limit:1,delayMs:0}),{downloadDocuments:true});
    assert.equal(requests,beforeForeign,"authenticated documents never copy cookies to a different origin");
    process.env.PJUD_DOC_DOWNLOADS="0";
    await withManualPjudInteraction(()=>attachDocumentoBytesFromPage(page,rows,{limit:2,delayMs:0}),{downloadDocuments:true});
    assert.equal(requests,beforeForeign,"the Host kill switch always wins");
    console.log("Manual document streaming: opt-in, CAPTCHA isolation, bounded failures, same-origin cookies, header preflight, lengthless overflow cancellation and aggregate byte cap passed (no browser/network).");
  } finally {
    globalThis.fetch=previousFetch;
    if(locationDescriptor)Object.defineProperty(globalThis,"location",locationDescriptor);else Reflect.deleteProperty(globalThis,"location");
    if(previous===undefined)delete process.env.PJUD_DOC_DOWNLOADS;else process.env.PJUD_DOC_DOWNLOADS=previous;
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
