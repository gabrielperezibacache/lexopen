import {createHash} from 'node:crypto';
import {lstat,readFile,realpath,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PINNED_COMMIT} from './harden-connectors.mjs';
const originals={'internal/connector/lexopen_cloud_file.go':'20148c8f116dcfb0deb80e42488a479f5a3cd5d228dd0547457d069bc5274e16','internal/gateway/gateway.go':'75c91c275f5596da38586bfe932f6d19457031bbe7d3ce629edad8f872fd827d'};
const additions=[['internal/connector/lexopen_cloud_metadata.go','cloud-metadata.go'],['internal/connector/lexopen_cloud_metadata_test.go','cloud-metadata_test.go'],['internal/gateway/lexopen_cloud_metadata_test.go','cloud-metadata-gateway_test.go']];
const templates=join(dirname(fileURLToPath(import.meta.url)),'patches');
const hash=value=>createHash('sha256').update(value).digest('hex');
export function rewriteCloudMetadata(path,source){
 if(path==='internal/connector/lexopen_cloud_file.go'){const before='func lexopenCloudRender(kind, action string, raw []byte) (string, bool) {';if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error('Pinned cloud metadata renderer no longer matches');return source.slice(0,source.indexOf(before))+'func lexopenCloudRender(kind, action string, raw []byte) (string, bool) {\n return lexopenTypedCloudMetadata(kind,action,raw)\n}\n'}
 if(path==='internal/gateway/gateway.go'){const before='out["lexopen_connected_file_focus"] = "v1"';if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error('Pinned cloud metadata health source no longer matches');return source.replace(before,before+'\n out["lexopen_cloud_metadata"] = "v1"')}
 throw new Error('Not a pinned cloud metadata source');
}
export async function hardenCloudMetadata(directory){
 const root=await realpath(directory);if((await readFile(join(root,'.lexopen-source-commit'),'utf8')).trim()!==PINNED_COMMIT||(await readFile(join(root,'.lexopen-connected-file-focus'),'utf8')).trim()!=='v1')throw new Error('Cloud metadata requires the exact Go13 source');if(await lstat(join(root,'.lexopen-cloud-metadata')).catch(e=>{if(e.code==='ENOENT')return null;throw e}))throw new Error('Cloud metadata already applied');const pending=[];
 for(const[path,expected]of Object.entries(originals)){const file=join(root,path),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error('Cloud metadata sources must be regular files');const source=await readFile(file,'utf8');if(hash(source)!==expected)throw new Error('Pinned cloud metadata source differs');pending.push([file,rewriteCloudMetadata(path,source)])}
 for(const[target,template]of additions){const file=join(root,target);if(await realpath(dirname(file))!==dirname(file))throw new Error('Cloud metadata directory must not be a symlink');if(await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e}))throw new Error('Cloud metadata addition exists');pending.push([file,await readFile(join(templates,template),'utf8')])}
 for(const[file,source]of pending)await writeFile(file,source,{mode:0o600});await writeFile(join(root,'.lexopen-cloud-metadata'),'v1\n',{flag:'wx',mode:0o600});return{source:PINNED_COMMIT,cloudMetadata:'v1',files:pending.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error('Usage: node scripts/altazor/harden-cloud-metadata.mjs <Go13-source>');console.log(JSON.stringify(await hardenCloudMetadata(process.argv[2])))}
