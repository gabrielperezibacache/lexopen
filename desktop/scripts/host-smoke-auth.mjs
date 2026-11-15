/** Isolated native-test HTTP client. Values remain in memory and are never logged. */
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
export function smokeTotpCode(secret, now=Date.now()) {
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";
  for(const character of secret.replace(/=+$/, "")){const value=alphabet.indexOf(character);assert(value>=0);bits+=value.toString(2).padStart(5,"0");}
  const bytes=[];for(let at=0;at+8<=bits.length;at+=8)bytes.push(parseInt(bits.slice(at,at+8),2));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
  const digest=createHmac("sha1",Buffer.from(bytes)).update(counter).digest(),offset=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,"0");
}
function expectHttp(response,status){if(response.status!==status)throw Object.assign(new Error("Native test HTTP request failed"),{code:`HTTP_${response.status}`});}
export async function smokeAuthenticate(url,password,totpSecret){
  const address=new URL(url);assert(["127.0.0.1","localhost","[::1]"].includes(address.hostname));
  const cookies=new Map();
  const accept=response=>{for(const line of response.headers.getSetCookie()){const pair=line.split(";",1)[0],at=pair.indexOf("=");cookies.set(pair.slice(0,at),pair.slice(at+1));}};
  const headers=()=>({Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join("; "),Origin:url,"x-csrf-token":cookies.get("lexopen_csrf")});
  const page=await fetch(`${url}/login`);expectHttp(page,200);accept(page);assert(cookies.get("lexopen_csrf"));
  const login=await fetch(`${url}/api/auth/login`,{method:"POST",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({email:"installer-fixture@example.test",password})});
  expectHttp(login,200);accept(login);let body=await login.json();
  if(totpSecret){
    assert.equal(body.needsTotp,true,"Restored account must still require its original second factor");
    const verified=await fetch(`${url}/api/auth/totp`,{method:"POST",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({action:"verify-login",code:smokeTotpCode(totpSecret),rememberDevice:false})});
    expectHttp(verified,200);accept(verified);body=await verified.json();
  }else assert.equal(body.needsTotp,undefined);
  assert.equal(body.user.email,"installer-fixture@example.test");assert(body.user.id);
  return {headers,accept,userId:body.user.id};
}
export async function smokeEnrollTotp(url,auth){
  const prepared=await fetch(`${url}/api/auth/totp`,{method:"POST",headers:{...auth.headers(),"Content-Type":"application/json"},body:JSON.stringify({action:"setup"})});
  expectHttp(prepared,200);auth.accept(prepared);const enrollment=await prepared.json();assert(typeof enrollment.secret==="string");
  const confirmed=await fetch(`${url}/api/auth/totp`,{method:"POST",headers:{...auth.headers(),"Content-Type":"application/json"},body:JSON.stringify({action:"confirm",code:smokeTotpCode(enrollment.secret)})});
  expectHttp(confirmed,200);auth.accept(confirmed);return enrollment.secret;
}
