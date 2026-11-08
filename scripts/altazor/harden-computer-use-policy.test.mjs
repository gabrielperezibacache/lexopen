import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hardenComputerUsePolicy,rewriteComputerUsePolicy} from './harden-computer-use-policy.mjs';
import {PINNED_COMMIT} from './harden-connectors.mjs';
assert.match(rewriteComputerUsePolicy('internal/approvals/approvals.go','type Approval struct {'),/ComputerAction \*ComputerActionBinding/);
assert.throws(()=>rewriteComputerUsePolicy('internal/approvals/approvals.go','type Approval struct {type Approval struct {'),/no longer matches/);
assert.throws(()=>rewriteComputerUsePolicy('not-pinned','anything'),/Not a pinned/);
const root=await mkdtemp(join(tmpdir(),'lexopen-computer-policy-test-'));
try{await writeFile(join(root,'.lexopen-source-commit'),PINNED_COMMIT);await writeFile(join(root,'.lexopen-cloud-file-oauth'),'v1\n');await mkdir(join(root,'internal/chat'),{recursive:true});const file=join(root,'internal/chat/chat.go');await writeFile(file,'type Session struct {');await assert.rejects(()=>hardenComputerUsePolicy(root),/Pinned computer-use source differs/);assert.equal(await readFile(file,'utf8'),'type Session struct {');await assert.rejects(()=>lstat(join(root,'.lexopen-computer-use-policy')),{code:'ENOENT'});await writeFile(join(root,'.lexopen-source-commit'),'wrong');await assert.rejects(()=>hardenComputerUsePolicy(root),/exact Go10/);}finally{await rm(root,{recursive:true,force:true})}
console.log('Computer-use hardener PASS: pinned Go10 prerequisite, whole-tree drift preflight, exact single replacement, no partial drift edits.');
