import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {hardenPersistentOAuth,rewritePersistentOAuth} from "./harden-persistent-oauth.mjs";

test("Drive-only OAuth checks preserve the legacy non-OAuth branch",()=>{
  const original='\t\treturn get("https://gmail.googleapis.com/gmail/v1/users/me/profile", nil)';
  const rewritten=rewritePersistentOAuth("internal/connector/check.go",original);
  assert.match(rewritten,/oauth_access_token/);
  assert.match(rewritten,/drive\/v3\/about\?fields=user\(permissionId\)/);
  assert.ok(rewritten.endsWith(original));
  assert.throws(()=>rewritePersistentOAuth("internal/connector/check.go",original+original),/no longer matches/);
});

test("credential saves use the common atomic store without retaining the old mutation",()=>{
  const original='func (m *Manager) SaveOAuthCredentials(name string, creds oauth.Credentials) error {\n\tcreds.ToSettings(c.Settings)\n\treturn m.saveSettings()\n}';
  const rewritten=rewritePersistentOAuth("internal/orchestrator/orchestrator.go",original);
  assert.match(rewritten,/return m\.lexopenSaveOAuthCredentials\(name, nil, creds\)/);
  assert.doesNotMatch(rewritten,/ToSettings|m\.saveSettings\(\)/);
  assert.throws(()=>rewritePersistentOAuth("unrecognized.go",original),/Not a pinned/);
});

test("unrecognized source markers are rejected before any source is changed",async()=>{
  const root=await mkdtemp(join(tmpdir(),"lexopen-oauth-hardener-"));
  try{
    await writeFile(join(root,".lexopen-source-commit"),"not-the-pinned-source\n");
    await writeFile(join(root,"sentinel"),"unchanged");
    await assert.rejects(hardenPersistentOAuth(root),/requires exact/);
    assert.equal(await readFile(join(root,"sentinel"),"utf8"),"unchanged");
  }finally{await rm(root,{recursive:true,force:true});}
});
