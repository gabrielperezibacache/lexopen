import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,lstat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hardenCloudMetadata,rewriteCloudMetadata} from './harden-cloud-metadata.mjs';
import {PINNED_COMMIT} from './harden-connectors.mjs';
const sample='func lexopenCloudRender(kind, action string, raw []byte) (string, bool) { old }';
assert.match(rewriteCloudMetadata('internal/connector/lexopen_cloud_file.go',sample),/lexopenTypedCloudMetadata/);assert.match(rewriteCloudMetadata('internal/gateway/gateway.go','out["lexopen_connected_file_focus"] = "v1"'),/lexopen_cloud_metadata/);assert.throws(()=>rewriteCloudMetadata('internal/connector/lexopen_cloud_file.go',sample+sample),/no longer matches/);assert.throws(()=>rewriteCloudMetadata('unknown',sample),/Not a pinned/);
const root=await mkdtemp(join(tmpdir(),'lexopen-cloud-metadata-test-'));
try{await writeFile(join(root,'.lexopen-source-commit'),PINNED_COMMIT);await writeFile(join(root,'.lexopen-connected-file-focus'),'v1');await mkdir(join(root,'internal/connector'),{recursive:true});const path=join(root,'internal/connector/lexopen_cloud_file.go');await writeFile(path,sample);await assert.rejects(()=>hardenCloudMetadata(root),/source differs/);assert.equal(await readFile(path,'utf8'),sample);await assert.rejects(()=>lstat(join(root,'.lexopen-cloud-metadata')),{code:'ENOENT'});await writeFile(join(root,'.lexopen-source-commit'),'wrong');await assert.rejects(()=>hardenCloudMetadata(root),/exact Go13/)}finally{await rm(root,{recursive:true,force:true})}
console.log('Cloud metadata hardener PASS: exact Go13, typed renderer hook, unchanged request/approval paths, full drift preflight.');
