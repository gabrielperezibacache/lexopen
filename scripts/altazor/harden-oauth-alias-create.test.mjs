import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PINNED_COMMIT} from './harden-connectors.mjs';
import {hardenOAuthAliasCreate,rewriteOAuthAliasCreate} from './harden-oauth-alias-create.mjs';
const sample='\tcurrent, ok := m.cfg.Connectors[name]\n\tif !ok {\n\t\treturn ErrNotFound\n\t}\n\tm.cfg.Connectors[name] = candidate';
assert.match(rewriteOAuthAliasCreate('\tif err != nil {\n\t\tout["containers_error"] = err.Error()','internal/gateway/gateway.go'),/lexopen_oauth_alias_create/);
assert.match(rewriteOAuthAliasCreate(sample),/if app == nil \{ return ErrNotFound \}/);assert.match(rewriteOAuthAliasCreate(sample),/current = config.Connector\{Kind: app.Kind\}/);assert.throws(()=>rewriteOAuthAliasCreate(sample+sample),/no longer matches/);
const root=await mkdtemp(join(tmpdir(),'lexopen-oauth-create-test-'));
try{await writeFile(join(root,'.lexopen-source-commit'),PINNED_COMMIT);await writeFile(join(root,'.lexopen-computer-use-policy'),'v1\n');await mkdir(join(root,'internal/orchestrator'),{recursive:true});const file=join(root,'internal/orchestrator/lexopen_persistent_oauth.go');await writeFile(file,sample);await assert.rejects(()=>hardenOAuthAliasCreate(root),/source differs/);assert.equal(await readFile(file,'utf8'),sample);await assert.rejects(()=>lstat(join(root,'.lexopen-oauth-alias-create')),{code:'ENOENT'});await writeFile(join(root,'.lexopen-source-commit'),'wrong');await assert.rejects(()=>hardenOAuthAliasCreate(root),/exact Go11/)}finally{await rm(root,{recursive:true,force:true})}
console.log('OAuth account creation hardener PASS: exact Go11 pin, atomic import branch only, drift preflight without partial edit.');
