import {createHash} from "node:crypto";
import {lstat,readFile,realpath,writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {PINNED_COMMIT} from "./harden-connectors.mjs";

const templates=join(dirname(fileURLToPath(import.meta.url)),"patches");
const originals={
  "internal/oauth/oauth.go":"8e5f08a9f2504f9f4e5f804c21a5e9f1b385daead3f74eb216ab1372d9f9b6fa",
  "internal/orchestrator/orchestrator.go":"94a7830e2a164b1539ae76117ed4e290b8661609a2befe4b702d3f539c2f3487",
  "internal/orchestrator/settings.go":"79c1a5d6786ec2afe7e58762f53131d8f804db3e003396bcad105f8cc036ce76",
  "internal/gateway/gateway.go":"87fc9f2a894157b269b71c659ef970ade511f0c4eeb5b2e5054fefeb6f928223",
  "internal/connector/check.go":"88c42004fdccdc514228902aea293346198674285a54ec043445ba6eb6a7bdfc",
};
const hash=value=>createHash("sha256").update(value).digest("hex");
function once(source,before,after){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw Error("Pinned persistent OAuth source no longer matches");return source.replace(before,after);}
export function rewritePersistentOAuth(path,source){
  if(path==="internal/oauth/oauth.go"){
    source=once(source,"\tstore Store\n","\tstore Store\n\tcredentialMu sync.Mutex\n");
    source=once(source,"func (m *Manager) Exchange(ctx context.Context, state, code string) (string, error) {","func (m *Manager) exchangeUnlocked(ctx context.Context, state, code string) (string, error) {");
    source=once(source,"func (m *Manager) Token(ctx context.Context, connector string) (string, error) {","func (m *Manager) tokenUnlocked(ctx context.Context, connector string) (string, error) {");
    source=once(source,"return m.refresh(ctx, connector, creds)","return m.refreshUnlocked(ctx, connector, creds)");
    source=once(source,"func (m *Manager) refresh(ctx context.Context, connector string, creds Credentials) (string, error) {","func (m *Manager) refreshUnlocked(ctx context.Context, connector string, creds Credentials) (string, error) {");
    source=once(source,'return Credentials{}, fmt.Errorf("%s did not answer: %w", p.Label, err)','if lexopenPersistentApp(app) { return Credentials{}, ErrUnavailable }; return Credentials{}, fmt.Errorf("%s did not answer: %w", p.Label, err)');
    source=once(source,'\t\tmsg := answer.Description','\t\tif failure := lexopenTokenFailure(app, resp.StatusCode, answer.Error); failure != nil { return Credentials{}, failure }\n\t\tmsg := answer.Description');
    source=once(source,'ExpiresIn    int    `json:"expires_in"`','ExpiresIn    int    `json:"expires_in"`\n\t\tScope any `json:"scope"`');
    source=once(source,'\tttl := time.Duration(answer.ExpiresIn) * time.Second','\tif err := lexopenValidateTokenScope(app, answer.Scope); err != nil { return Credentials{}, err }\n\tttl := time.Duration(answer.ExpiresIn) * time.Second');
    return once(source,'if answer.AccessToken == "" {\n\t\treturn Credentials{}, fmt.Errorf("%s returned no token", p.Label)','if answer.AccessToken == "" {\n\t\tif lexopenPersistentApp(app) { return Credentials{}, ErrUnavailable }\n\t\treturn Credentials{}, fmt.Errorf("%s returned no token", p.Label)');
  }
  if(path==="internal/orchestrator/orchestrator.go"){
    const match=source.match(/func \(m \*Manager\) SaveOAuthCredentials\(name string, creds oauth\.Credentials\) error \{[\s\S]*?\n\}/);
    if(!match||!match[0].includes("creds.ToSettings(c.Settings)")||!match[0].includes("return m.saveSettings()"))throw Error("Pinned OAuth store no longer matches");
    return once(source,match[0],"func (m *Manager) SaveOAuthCredentials(name string, creds oauth.Credentials) error {\n\treturn m.lexopenSaveOAuthCredentials(name, nil, creds)\n}");
  }
  if(path==="internal/orchestrator/settings.go"){
    source=once(source,'TokenExpires string `json:"token_expires,omitempty"`','TokenExpires string `json:"token_expires,omitempty"`\n\tPersistentOAuth bool `json:"persistent_oauth,omitempty"`\n\tAutoRefresh bool `json:"auto_refresh"`');
    source=once(source,'if secret[k] || strings.HasPrefix(k, "oauth_") || k == connector.TokenSavedAt {','if secret[k] || strings.HasPrefix(k, "oauth_") || k == connector.TokenSavedAt || (all["oauth_lexopen_persistent"] == "v1" && (k == "client_id" || k == "client_secret")) {');
    return once(source,'Auth: kind.AuthOf(all, signedIn), TokenExpires: expires}','Auth: kind.AuthOf(all, signedIn), TokenExpires: expires, PersistentOAuth: all["oauth_lexopen_persistent"] == "v1", AutoRefresh: all["oauth_lexopen_persistent"] == "v1" && creds.RefreshToken != ""}');
  }
  if(path==="internal/connector/check.go")return once(source,'\t\treturn get("https://gmail.googleapis.com/gmail/v1/users/me/profile", nil)','\t\tif strings.TrimSpace(s["oauth_access_token"]) != "" { return get("https://www.googleapis.com/drive/v3/about?fields=user(permissionId)", nil) }\n\t\treturn get("https://gmail.googleapis.com/gmail/v1/users/me/profile", nil)');
  if(path==="internal/gateway/gateway.go"){
    for(const handler of ["handleOAuthRedirect","handleOAuthStart"])source=once(source,`func (s *Server) ${handler}(w http.ResponseWriter, r *http.Request) {`,`func (s *Server) ${handler}(w http.ResponseWriter, r *http.Request) {\n\tif lexopenPersistentName.MatchString(r.PathValue("name")) { lexopenOAuthError(w, http.StatusForbidden, "oauth_use_host_connection"); return }`);
    source=once(source,'s.mux.Handle("GET /v1/providers", api(s.handleProviders))','s.mux.Handle("POST /v1/lexopen/easy-oauth/{name}", api(s.handleLexopenEasyOAuth))\n\ts.mux.Handle("GET /v1/providers", api(s.handleProviders))');
    source=once(source,'out["lexopen_compact_file_results"] = "v1"','out["lexopen_compact_file_results"] = "v1"; out["lexopen_persistent_oauth"] = "v1"');
    return once(source,'reply(w, http.StatusOK, map[string]any{"ok": false, "tested": true, "error": err.Error()})','if lexopenPersistentName.MatchString(r.PathValue("name")) { lexopenConnectorTestFailure(w, err) } else { reply(w, http.StatusOK, map[string]any{"ok": false, "tested": true, "error": err.Error()}) }');
  }
  throw Error("Not a pinned persistent OAuth file");
}
export async function hardenPersistentOAuth(directory){
  const root=await realpath(directory);
  if((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-compact-file-results"),"utf8")).trim()!=="v1")throw Error("Persistent OAuth requires exact compact-file-results source");
  if(await lstat(join(root,".lexopen-persistent-oauth")).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw Error("Persistent OAuth already applied");
  const changes=[];
  for(const[path,expected]of Object.entries(originals)){
    const file=join(root,path),stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw Error("Pinned sources must be regular owned files");
    const source=await readFile(file,"utf8");if(hash(source)!==expected)throw Error("Pinned persistent OAuth source differs");changes.push([file,rewritePersistentOAuth(path,source)]);
  }
  const extra=[];
  for(const[name,pkg,dest]of[
    ["persistent-oauth.go","oauth","lexopen_persistent.go"],["persistent-oauth_test.go","oauth","lexopen_persistent_test.go"],
    ["persistent-oauth-store.go","orchestrator","lexopen_persistent_oauth.go"],["persistent-oauth-store_test.go","orchestrator","lexopen_persistent_oauth_test.go"],
    ["persistent-oauth-gateway.go","gateway","lexopen_persistent_oauth.go"],["persistent-oauth-gateway_test.go","gateway","lexopen_persistent_oauth_test.go"],
    ["persistent-oauth-connector_test.go","connector","lexopen_persistent_oauth_test.go"],
  ]){
    const file=join(root,"internal",pkg,dest);
    if(await lstat(file).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw Error("Persistent OAuth additions already exist");
    extra.push([file,await readFile(join(templates,name),"utf8")]);
  }
  for(const[file,source]of changes)await writeFile(file,source);
  for(const[file,source]of extra)await writeFile(file,source,{flag:"wx",mode:0o600});
  await writeFile(join(root,".lexopen-persistent-oauth"),"v1\n",{flag:"wx",mode:0o600});
  return{source:PINNED_COMMIT,persistentOAuth:"v1",files:changes.length+extra.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw Error("Usage: node scripts/altazor/harden-persistent-oauth.mjs <compact-results-source>");console.log(JSON.stringify(await hardenPersistentOAuth(process.argv[2])));}
