import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { driveOrigin } from "./config";
import { driveExpiry,driveProviderJson,driveToken,exactDriveScopes } from "./transport";
async function main(){
  assert.equal(exactDriveScopes("https://www.googleapis.com/auth/drive.readonly"),true);
  for(const scope of [undefined,"https://www.googleapis.com/auth/drive.metadata.readonly","https://www.googleapis.com/auth/drive.readonly openid","https://www.googleapis.com/auth/drive"])assert.equal(exactDriveScopes(scope),false);
  for(const origin of ["https://example.test/path","https://example.test?token=x","http://example.test","https://u:p@example.test"])assert.throws(()=>driveOrigin(origin));
  assert.equal(driveOrigin("http://127.0.0.1:3357"),"http://127.0.0.1:3357");
  for(const expiry of [null,0,59,86401,Infinity,"3600"])assert.throws(()=>driveExpiry(expiry));assert.throws(()=>driveToken("a\nb"));
  await assert.rejects(driveProviderJson("https://fixture.invalid",{},async(_url,init)=>{assert.equal(init?.redirect,"error");return new Response("x".repeat(65537));}));
  Object.assign(globalThis,{AsyncLocalStorage});const original={NODE_ENV:process.env.NODE_ENV,LEXOPEN_OPEN_ACCESS:process.env.LEXOPEN_OPEN_ACCESS};
  try{Object.assign(process.env,{NODE_ENV:"production",LEXOPEN_OPEN_ACCESS:"0"});const{NextRequest}=await import("next/server"),{proxy}=await import("@/proxy");const root="http://127.0.0.1:3357/api/personal-connectors/google-drive";
    assert.equal((await proxy(new NextRequest(`${root}/oauth/callback?state=fictitious`))).headers.get("x-middleware-next"),"1","external-browser callback can stage without a cookie");
    assert.equal((await proxy(new NextRequest(`${root}/oauth/callback`,{method:"POST"}))).status,401);
    for(const path of ["/oauth/start","/oauth/complete","/setup",""])assert.equal((await proxy(new NextRequest(root+path))).status,401,"activation and tokens remain session guarded");
  }finally{for(const[key,value]of Object.entries(original))if(value===undefined)delete process.env[key];else process.env[key]=value;}
  console.log("Personal Drive unit: exact scopes, safe origin, bounded provider, external-cookie-free GET callback and protected activation/setup passed.");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
