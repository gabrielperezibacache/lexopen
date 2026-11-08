import {createHash} from 'node:crypto';
import {lstat,readFile,realpath,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PINNED_COMMIT} from './harden-connectors.mjs';
const original='internal/orchestrator/lexopen_persistent_oauth.go';
const originals={ [original]:'981bf38bbe4e87252fa03cec0b468e0faf6d6c306a9ae15a7b06a201a0f0bf60', 'internal/gateway/gateway.go':'d50bd8b3f7859e4101e716ecfba0462c676f119fe572440b1366441e700ff29e' };
const additions=[['internal/orchestrator/lexopen_oauth_alias_create_test.go','oauth-alias-create-store_test.go'],['internal/gateway/lexopen_oauth_alias_create_test.go','oauth-alias-create-gateway_test.go']];
const templates=join(dirname(fileURLToPath(import.meta.url)),'patches');
const hash=text=>createHash('sha256').update(text).digest('hex');
export function rewriteOAuthAliasCreate(source,path=original){
 if(path==='internal/gateway/gateway.go'){const before='\tif err != nil {\n\t\tout["containers_error"] = err.Error()';if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error('Pinned OAuth account creation health source no longer matches');return source.replace(before,'\tif s.fleet.OAuth()!=nil { out["lexopen_oauth_alias_create"]="v1" }\n'+before)}
 if(path!==original)throw new Error('Not a pinned OAuth account creation source');
 const edits=[['\tcurrent, ok := m.cfg.Connectors[name]\n\tif !ok {\n\t\treturn ErrNotFound\n\t}', '\tcurrent, ok := m.cfg.Connectors[name]\n\tif !ok {\n\t\t// Only an explicit, provider-bound import can create the account.\n\t\t// Refresh writes still require a connector that already exists.\n\t\tif app == nil { return ErrNotFound }\n\t\tcurrent = config.Connector{Kind: app.Kind}\n\t}'],['\tm.cfg.Connectors[name] = candidate','\tif m.cfg.Connectors == nil { m.cfg.Connectors = make(map[string]config.Connector) }\n\tm.cfg.Connectors[name] = candidate']];
 for(const[before,after]of edits){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error('Pinned OAuth account creation source no longer matches');source=source.replace(before,after)}return source;
}
export async function hardenOAuthAliasCreate(directory){
 const root=await realpath(directory);if((await readFile(join(root,'.lexopen-source-commit'),'utf8')).trim()!==PINNED_COMMIT||(await readFile(join(root,'.lexopen-computer-use-policy'),'utf8')).trim()!=='v1')throw new Error('OAuth account creation requires the exact Go11 source');
 if(await lstat(join(root,'.lexopen-oauth-alias-create')).catch(e=>{if(e.code==='ENOENT')return null;throw e}))throw new Error('OAuth account creation already applied');
 const pending=[];
 for(const[path,expected]of Object.entries(originals)){const file=join(root,path),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error('OAuth account creation source must be a regular file');const source=await readFile(file,'utf8');if(hash(source)!==expected)throw new Error('Pinned OAuth account creation source differs');pending.push([file,rewriteOAuthAliasCreate(source,path)])}
 for(const[target,template]of additions){const path=join(root,target);if(await realpath(dirname(path))!==dirname(path))throw new Error('OAuth account creation addition directory must not be a symlink');if(await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e}))throw new Error('OAuth account creation addition already exists');pending.push([path,await readFile(join(templates,template),'utf8')])}
 for(const[path,text]of pending)await writeFile(path,text,{mode:0o600});await writeFile(join(root,'.lexopen-oauth-alias-create'),'v1\n',{mode:0o600,flag:'wx'});return{source:PINNED_COMMIT,oauthAliasCreate:'v1',files:pending.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error('Usage: node scripts/altazor/harden-oauth-alias-create.mjs <Go11-source>');console.log(JSON.stringify(await hardenOAuthAliasCreate(process.argv[2])))}
