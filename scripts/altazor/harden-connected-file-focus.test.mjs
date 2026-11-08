import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hardenConnectedFileFocus,rewriteConnectedFileFocus} from './harden-connected-file-focus.mjs';
import {PINNED_COMMIT} from './harden-connectors.mjs';
assert.match(rewriteConnectedFileFocus('internal/chat/chat.go','allowed := s.fleet.Connectors().Descriptions(k.Connectors)'),/lexopenSelectedConnectorDescriptions/);
assert.match(rewriteConnectedFileFocus('internal/gateway/gateway.go','out["lexopen_file_task_focus"] = "v1"'),/lexopen_connected_file_focus/);
assert.throws(()=>rewriteConnectedFileFocus('internal/chat/chat.go','allowed := s.fleet.Connectors().Descriptions(k.Connectors)allowed := s.fleet.Connectors().Descriptions(k.Connectors)'),/no longer matches/);
assert.throws(()=>rewriteConnectedFileFocus('unknown',''),/Not a pinned/);
const root=await mkdtemp(join(tmpdir(),'lexopen-focus13-test-'));
try{await writeFile(join(root,'.lexopen-source-commit'),PINNED_COMMIT);await writeFile(join(root,'.lexopen-oauth-alias-create'),'v1');await mkdir(join(root,'internal/chat'),{recursive:true});const file=join(root,'internal/chat/lexopen_connector_file_focus.go');await writeFile(file,'drift');await assert.rejects(()=>hardenConnectedFileFocus(root),/source differs/);assert.equal(await readFile(file,'utf8'),'drift');await assert.rejects(()=>lstat(join(root,'.lexopen-connected-file-focus')),{code:'ENOENT'});await writeFile(join(root,'.lexopen-source-commit'),'wrong');await assert.rejects(()=>hardenConnectedFileFocus(root),/exact Go12/)}finally{await rm(root,{recursive:true,force:true})}
console.log('Connected-file focus hardener PASS: exact Go12, selection boundary, fixed native contract, drift preflight and no partial drift mutation.');
