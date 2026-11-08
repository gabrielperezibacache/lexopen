import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const templates = join(dirname(fileURLToPath(import.meta.url)), "patches");
const originals = {
  "internal/connector/reads.go": "0120c6eb2d7b9cc640f4681969e792549090fd8cf8456038c41376372bb5efc1",
  "internal/connector/lexopen_read_files.go": "04f41d050b0559575f169ca91e660e44b345f6e5dd50eb0e3c0c805ba355cc4a",
  "internal/connector/lexopen_easy_file_validation.go": "b01f6eb4ad924c16f6b50259a97b62761c9a3d3e54ef892a8bfe647d5e874354",
  "internal/connector/catalog.go": "a6853f46a7c96bf6df42293cd018d7ddf5127ab064f19ccfec388507c931aa6c",
  "internal/connector/connector.go": "0f43be901f64d3d686effb0f72fb264a51da3af482264ec9254979451f8450d5",
  "internal/chat/lexopen_native_connector_schema.go": "365ee439e4fad1ceead703f69137f961ced2f0ae0de707b27a79873e9af46228",
  "internal/chat/lexopen_native_file_actions.go": "e13c3ddc97ae49517ac88a29d8fd0d2060e427f354472af645e582c3bb6a88fa",
  "internal/chat/lexopen_connector_file_focus.go": "ba833914e59d32c305e31ac8baad1aa37fe18a4af0b356ac97a67e5b9c7d0525",
  "internal/chat/lexopen_read_files.go": "3caf81cb5320448248f03fe989b63efde25633c971890c34d2c5e93911f853bb",
  "internal/chat/lexopen_readable_file_results.go": "27d0ffde9b715d236cf3bcb951da37f2e3b8e7dde5b3a8d14c745296a9d5ced9",
  "internal/chat/lexopen_staged_file_actions.go": "927bf98738257612c8f4b2f5a1ca29be5e65df0579688a104bcb21d2817a5ddd",
  "internal/chat/lexopen_staged_file_inspect.go": "a152c271e2d76496c6e975ee89da0f5341d35477454e3b1f80b8635d1e0c836a",
  "internal/approvals/lexopen_staged_file_store.go": "62001219e6cb1e2bbfb2b12decb6d882454443183ebee5cfc35b1d0c558ad9e5",
  "internal/gateway/lexopen_persistent_oauth.go": "936e3af183fb7ad96a45b1d2c75057bdcfa4ad8e45d58b843ea3aa3a018ddd0c",
  "internal/orchestrator/lexopen_persistent_oauth.go": "dbca635feaa999113504a51045f1b3acdc3d60e99b69aab4cc3a8791887ba900",
  "internal/oauth/oauth.go": "0365e287b0f1fe9b53a75bef783cf33c1b2c30b341046f9fff2873c15782efbf",
  "internal/oauth/lexopen_persistent.go": "1b2c76824005745e2a32d6f63d99c71c1a7641b0d173c3c281dc1bd5b01b955b",
  "internal/gateway/gateway.go": "a65fb45358a07183c06287161fa3bb07d7d933d13161c42c509db57961c3587b"
};
const changes = {
 "internal/connector/reads.go": [
  ['\tcase "microsoft-365":\n\t\treturn merged(microsoftReads(), microsoftPersonal())', '\tcase "microsoft-365":\n\t\treturn merged(merged(microsoftReads(), microsoftPersonal()),lexopenCloudReadFiles(kind))\n case "dropbox": return lexopenCloudReadFiles(kind)'],
 ],
 "internal/connector/lexopen_read_files.go": [
  ['\tswitch kind {', '\tswitch kind {\n\tcase "dropbox", "microsoft-365": return lexopenCloudReadFiles(kind)'],
 ],
 "internal/connector/lexopen_easy_file_validation.go": [
  ['func LexOpenValidateEasyFileCall(kind string,args map[string]any)error{', 'func LexOpenValidateEasyFileCall(kind string,args map[string]any)error{\n if kind=="dropbox"||kind=="microsoft-365" { return LexOpenValidateCloudFileCall(kind,args) }'],
 ],
 "internal/connector/catalog.go": [
  ['Fields: fApp("entra.microsoft.com (an app registration)"),', 'Fields: signIn(nil,f("token","Temporary Microsoft read-only access token","Prefer the guided public OAuth connection for automatic renewal",false,true),"entra.microsoft.com (an app registration)"),'],
  ['func (a *api) call(ctx context.Context, args map[string]any) (text, name string, data []byte, err error) {', 'func (a *api) call(ctx context.Context, args map[string]any) (text, name string, data []byte, err error) {\n if a.s["oauth_lexopen_cloud_files"]=="v1" { if e:=LexOpenValidateCloudFileCall(a.kind.Name,args);e!=nil{return "","",nil,e} }'],
  ['\tif out, ok := readRender(a.kind.Name, action, raw); ok {', '\tif out,ok:=lexopenCloudRender(a.kind.Name,action,raw);ok{return out,"",nil,nil}\n\tif out, ok := readRender(a.kind.Name, action, raw); ok {'],
  ['\treturn do(ctx, *req)', '\tif a.kind.Name=="microsoft-365" && (a.s["oauth_lexopen_cloud_files"]=="v1"||req.file!="") {if strings.TrimSpace(a.s["token"])!=""{if req.headers==nil{req.headers=map[string]string{}};req.headers["Authorization"]="Bearer "+strings.TrimSpace(a.s["token"])}; return lexopenSendMicrosoft(ctx,*req) }\n\treturn do(ctx, *req)'],
 ],
 "internal/connector/connector.go": [
  ['\tctx, fileOutputState := lexopenBeginFileOutput(ctx, call.Name, res.Kind, call.Args)', '\tif kind:=lexopenCloudGeneratedKind(call.Name);kind!="" { if kind!=res.Kind||LexOpenValidateCloudFileCall(kind,call.Args)!=nil {res.Err="The selected cloud file request is invalid.";return res} }\n\tctx, fileOutputState := lexopenBeginFileOutput(ctx, call.Name, res.Kind, call.Args)'],
 ],
 "internal/chat/lexopen_native_connector_schema.go": [
  ['func(s *Service)lexopenNativeConnectorTool(name string)(provider.Tool,bool){', 'func(s *Service)lexopenNativeConnectorTool(name string)(provider.Tool,bool){\n if lexopenCloudAccount(name){return s.lexopenCloudConnectorTool(name)}'],
 ],
 "internal/chat/lexopen_native_file_actions.go": [
  ['func(s *Service)lexopenNativeFileActionTools(name string)[]provider.Tool{', 'func(s *Service)lexopenNativeFileActionTools(name string)[]provider.Tool{\n if lexopenCloudAccount(name){return s.lexopenCloudActionTools(name)}'],
  ['fileFocus&&(lexopenEasyGoogleName.MatchString(a.name)||lexopenEasyGithubName.MatchString(a.name))', 'fileFocus&&(lexopenCloudAccount(a.name)||lexopenEasyGoogleName.MatchString(a.name)||lexopenEasyGithubName.MatchString(a.name))'],
  ['func(s *Service)lexopenPreflightEasyFile(k *kitty.Kitty,a action)error{', 'func(s *Service)lexopenPreflightEasyFile(k *kitty.Kitty,a action)error{\n if lexopenCloudAccount(a.name){return s.lexopenPreflightCloudFile(k,a)}'],
 ],
 "internal/chat/lexopen_connector_file_focus.go": [
  ['func(s *Service)lexopenFileToolFocus(id string,k *kitty.Kitty,allowed map[string]string)bool{', 'func(s *Service)lexopenFileToolFocus(id string,k *kitty.Kitty,allowed map[string]string)bool{\n if focus,handled:=s.lexopenCloudFileToolFocus(id,k,allowed);handled{return focus}'],
 ],
 "internal/chat/lexopen_read_files.go": [
  ['res.Kind!="google-workspace" && res.Kind!="github"', 'res.Kind!="google-workspace" && res.Kind!="github" && res.Kind!="dropbox" && res.Kind!="microsoft-365"'],
 ],
 "internal/chat/lexopen_readable_file_results.go": [
  ['google:=lexopenEasyGoogleName.MatchString(ap.Connector)&&ap.Kind=="google-workspace"', 'google:=lexopenEasyGoogleName.MatchString(ap.Connector)&&ap.Kind=="google-workspace"\n cloud:=lexopenCloudKind(ap.Connector)==ap.Kind&&lexopenCloudAccount(ap.Connector)'],
  ['if !google&&!github||res.Kind!=ap.Kind', 'if !google&&!github&&!cloud||res.Kind!=ap.Kind'],
  ['case "request","download_file","get_file","list_issues","get_issue":', 'case "request","download_file","get_file","list_issues","get_issue","list","search","read":'],
  ['service:="github";if google{service="google-drive"}', 'service:="github";if google{service="google-drive"};if cloud{service=ap.Kind}'],
 ],
 "internal/chat/lexopen_staged_file_actions.go": [
  ['body.Action != "download_file"', '(body.Action!="download_file"&&!(lexopenEasyDropboxName.MatchString(body.Connector)&&body.Action=="read"))'],
  ['if !google && !github {', 'if !google&&!github&&!lexopenCloudAccount(body.Connector){'],
  ['args := map[string]any{"action": "download_file"}', 'args:=map[string]any{"action":body.Action}'],
 ],
 "internal/chat/lexopen_staged_file_inspect.go": [
  ['Action: "download_file", Target: target', 'Action:ap.Action,Target:target'],
 ],
 "internal/approvals/lexopen_staged_file_store.go": [
  ['a.Action != "download_file"', '(a.Action!="download_file"&&!(a.Kind=="dropbox"&&a.Action=="read"))'],
 ],
 "internal/gateway/lexopen_persistent_oauth.go": [
  ['(google|github|dropbox)', '(google|github|dropbox|microsoft)'],
  ['type lexopenOAuthImport struct {', 'type lexopenOAuthImport struct {\n PublicClient bool `json:"public_client,omitempty"`'],
  ['\tif body.Kind != kind', '\tif provider=="microsoft" {kind="microsoft-365"}\n if body.PublicClient&&(provider!="dropbox"&&provider!="microsoft"||body.ClientSecret!="")||provider=="microsoft"&&!body.PublicClient{return oauth.App{},oauth.Credentials{},false}\n\tif body.Kind != kind'],
  ['!lexopenSafeText(body.ClientSecret, 4096, true)', '!lexopenSafeText(body.ClientSecret, 4096, !body.PublicClient)'],
  ['\tsort.Strings(scopes)', '\tif provider=="microsoft" {var valid bool;scopes,valid=oauth.LexOpenMicrosoftFileScopes(scopes);if !valid{return oauth.App{},oauth.Credentials{},false}}\n\tsort.Strings(scopes)'],
  ['} else if strings.Join(scopes, " ")', '} else if provider=="microsoft" {\n } else if strings.Join(scopes, " ")'],
  ['\tcredentials := oauth.Credentials{', '\tif body.PublicClient {app.Settings["oauth_public_client"]="true"};if provider=="microsoft"||provider=="dropbox"{app.Settings["oauth_lexopen_cloud_files"]="v1"}\n\tcredentials := oauth.Credentials{'],
 ],
 "internal/orchestrator/lexopen_persistent_oauth.go": [
  ['(google|github|dropbox)', '(google|github|dropbox|microsoft)'],
  ['\t\tdelete(candidate.Settings, oauth.KeyAccount)', '\t\tfor _,key:=range []string{"oauth_public_client","oauth_lexopen_cloud_files"}{delete(candidate.Settings,key);if app.Settings[key]!=""{candidate.Settings[key]=app.Settings[key]}}\n\t\tdelete(candidate.Settings, oauth.KeyAccount)'],
 ],
 "internal/oauth/oauth.go": [
  ['\tredirect = RedirectFor(app.Provider, redirect)', '\tp=lexopenCloudProvider(p,app)\n\tredirect = RedirectFor(app.Provider, redirect)'],
  ['\tif secret != "" && !p.Basic {', '\tif app.Settings["oauth_public_client"]=="true" {secret=""}\n\tif secret != "" && !p.Basic {'],
  ['fresh, err := m.token(ctx, p, app, secret, map[string]string{"grant_type": "refresh_token", "refresh_token": creds.RefreshToken, "client_id": clientID})', 'values:=map[string]string{"grant_type":"refresh_token","refresh_token":creds.RefreshToken,"client_id":clientID};if app.Provider=="microsoft"&&app.Settings["oauth_public_client"]=="true"{values["scope"]="User.Read Files.Read"}\n fresh, err := m.token(ctx,p,app,secret,values)'],
 ],
 "internal/oauth/lexopen_persistent.go": [
  ['func lexopenValidateTokenScope(app App, raw any) error {', 'func lexopenValidateTokenScope(app App, raw any) error {\n if app.Provider=="microsoft"&&app.Settings["oauth_public_client"]=="true" {text,ok:=raw.(string);if !ok{return ErrReconnectRequired};if _,valid:=LexOpenMicrosoftFileScopes(strings.Fields(text));!valid{return ErrReconnectRequired};return nil}'],
 ],
 "internal/gateway/gateway.go": [
  ['out["lexopen_staged_file_actions"] = chat.StagedFileActionsVersion', 'out["lexopen_staged_file_actions"] = chat.StagedFileActionsVersion\n out["lexopen_cloud_file_oauth"] = "v1"'],
 ],
};
const additions = [
 ["internal/connector/lexopen_cloud_file.go", "cloud-file-connector.go"],
 ["internal/connector/lexopen_cloud_file_test.go", "cloud-file-connector_test.go"],
 ["internal/oauth/lexopen_cloud_file.go", "cloud-file-oauth.go"],
 ["internal/oauth/lexopen_cloud_file_test.go", "cloud-file-oauth_test.go"],
 ["internal/chat/lexopen_cloud_file.go", "cloud-file-chat.go"],
 ["internal/chat/lexopen_cloud_file_test.go", "cloud-file-chat_test.go"],
 ["internal/gateway/lexopen_cloud_file_test.go", "cloud-file-gateway_test.go"],
];
const hash = value => createHash("sha256").update(value).digest("hex");
export function rewriteCloudFileConnectors(path, source) {
 if (!changes[path]) throw new Error("Not a pinned cloud file source");
 for (const [before, after] of changes[path]) {
  // readActions is a second switch; it receives its own catalogue entries below.
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before) && !(path.endsWith("lexopen_read_files.go") && before === "\tswitch kind {")) throw new Error("Pinned cloud file source no longer matches: " + path);
  source = source.replace(before, after);
 }
 if(path==="internal/connector/catalog.go")source=source.replace('if a.s["oauth_lexopen_cloud_files"]=="v1" {','if a.s["oauth_lexopen_cloud_files"]=="v1" || a.kind.Name=="microsoft-365"&&strings.TrimSpace(a.s["token"])!="" {');
 if (path.endsWith("connector/lexopen_read_files.go")) source=source.replace('base := lexopenLegacyReadActions(kind)', 'base := lexopenLegacyReadActions(kind)\n if kind=="dropbox"||kind=="microsoft-365"{return append(base,Action{Name:"download_file",Help:"download the complete selected cloud file, maximum 4 MiB",Args:[]string{"id (OneDrive)","path (Dropbox)","name (optional)"}})}');
 return source;
}
export async function hardenCloudFileConnectors(directory) {
 const root = await realpath(directory);
 if ((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-staged-file-actions"),"utf8")).trim()!=="v1") throw new Error("Cloud file OAuth requires exact Go9 staged-file source");
 if (await lstat(join(root,".lexopen-cloud-file-oauth")).catch(e=>{if(e.code==="ENOENT")return null;throw e})) throw new Error("Cloud file OAuth already applied");
 const pending=[];
 for(const [path,expected] of Object.entries(originals)){
  const file=join(root,path),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error("Pinned cloud sources must be regular owned files");
  const source=await readFile(file,"utf8");if(hash(source)!==expected)throw new Error("Pinned cloud file source differs: "+path);pending.push([file,rewriteCloudFileConnectors(path,source)]);
 }
 if(Object.keys(originals).length!==Object.keys(changes).length)throw new Error("Incomplete pinned cloud source manifest");
 for(const[target,template]of additions){const file=join(root,target);if(await lstat(file).catch(e=>{if(e.code==="ENOENT")return null;throw e}))throw new Error("Cloud file addition already exists");pending.push([file,await readFile(join(templates,template),"utf8")]);}
 for(const[file,source]of pending)await writeFile(file,source,{mode:0o600});
 await writeFile(join(root,".lexopen-cloud-file-oauth"),"v1\n",{flag:"wx",mode:0o600});
 return{source:PINNED_COMMIT,cloudFileOAuth:"v1",files:pending.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error("Usage: node scripts/altazor/harden-cloud-file-connectors.mjs <Go9-staged-file-source>");console.log(JSON.stringify(await hardenCloudFileConnectors(process.argv[2])));}
