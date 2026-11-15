import assert from "node:assert/strict";
import {smokeTotpCode,smokeAuthenticate,smokeEnrollTotp} from "./host-smoke-auth.mjs";
const secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
assert.equal(smokeTotpCode(secret,59000),"287082");assert.equal(smokeTotpCode(secret,1111111109000),"081804");
const oldFetch=globalThis.fetch;let enabled=false;const actions=[];
globalThis.fetch=async(raw,init={})=>{
 const pathname=new URL(raw).pathname,headers=new Headers(init.headers),body=init.body?JSON.parse(init.body):{};
 if(pathname==="/login")return new Response("login",{headers:{"Set-Cookie":"lexopen_csrf=fictitious-csrf; Path=/"}});
 assert.equal(headers.get("origin"),"http://127.0.0.1:3000");assert.equal(headers.get("x-csrf-token"),"fictitious-csrf");assert.match(headers.get("cookie"),/lexopen_csrf=fictitious-csrf/);
 const user={id:"fictitious-admin",email:"installer-fixture@example.test"};
 if(pathname==="/api/auth/login")return Response.json(enabled?{needsTotp:true}:{user},{headers:{"Set-Cookie":enabled?"lexopen_totp_pending=fictitious-pending; Path=/":"lexopen_session=fictitious-session; Path=/"}});
 actions.push(body.action);
 if(body.action==="setup"){assert.match(headers.get("cookie"),/lexopen_session=/);return Response.json({secret},{headers:{"Set-Cookie":"lexopen_totp_enrollment=fictitious-enrollment; Path=/"}});}
 if(body.action==="confirm"){assert.match(headers.get("cookie"),/lexopen_totp_enrollment=/);enabled=true;return Response.json({ok:true},{headers:{"Set-Cookie":"lexopen_session=rotated-session; Path=/"}});}
 assert.equal(body.action,"verify-login");assert.equal(body.rememberDevice,false);assert.match(headers.get("cookie"),/lexopen_totp_pending=/);return Response.json({user},{headers:{"Set-Cookie":"lexopen_session=verified-session; Path=/"}});
};
try{
 const original=await smokeAuthenticate("http://127.0.0.1:3000","fictitious-password");
 assert.equal(await smokeEnrollTotp("http://127.0.0.1:3000",original),secret);assert.match(original.headers().Cookie,/lexopen_session=rotated-session/);
 const restored=await smokeAuthenticate("http://127.0.0.1:3000","fictitious-password",secret);assert.equal(restored.userId,original.userId);assert.match(restored.headers().Cookie,/lexopen_session=verified-session/);assert.deepEqual(actions,["setup","confirm","verify-login"]);
 enabled=false;await assert.rejects(smokeAuthenticate("http://127.0.0.1:3000","fictitious-password",secret),/original second factor/);
}finally{globalThis.fetch=oldFetch;}
console.log("Native smoke authentication: RFC 6238, CSRF/cookie rotation, enrolment, restored second factor and lost-factor rejection passed.");
