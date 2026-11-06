import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export const PINNED_COMMIT = "6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3";
export const CONNECTOR_GATE = "v1";
const gateTests = `package chat

import (
  "context"
  "testing"
  "github.com/madkoding/kitties/internal/approvals"
  "github.com/madkoding/kitties/internal/connector"
)

func TestLexOpenGateIgnoresAutoAndRejectsModelRuleChanges(t *testing.T) {
  s, sa, posts, _, _ := gated(t)
  if _, err := s.SetApprovalRule("ana", "hook", "*", "ask"); err != nil { t.Fatal(err) }
  k, _ := s.fleet.Get("ana")
  for _, mode := range []string{"none", "auto", "off", "remove", "never", "ask"} {
    got := s.runLimit("", action{args: map[string]any{"connector":"hook", "mode":mode}}, k, map[string]string{"hook":"hook"}, &Turn{})
    if got.err == "" { t.Fatalf("model changed permissions with %s", mode) }
    if mode := s.approvals.ModeOf(k.ID, "hook", "*"); mode != approvals.ModeAsk { t.Fatalf("rule changed: %s", mode) }
  }
  if _, err := s.SetApprovalRule("ana", "hook", "*", "auto"); err != nil { t.Fatal(err) }
  sa.replies = []string{"@connector hook {\\"text\\":\\"fixture\\"}", "Waiting"}
  sess, _ := s.Create("", []string{"ana"})
  turns, err := s.Send(context.Background(), sess.ID, "fixture")
  if err != nil || *posts != 0 || len(turns[0].Approvals) != 1 { t.Fatalf("not held: %v posts=%d turns=%+v", err, *posts, turns) }
  list, _ := s.ListApprovals(approvals.Pending)
  if _, err := s.DecideApproval(context.Background(), list[0].ID, true, "", false); err != nil || *posts != 1 { t.Fatalf("approve: %v posts=%d",err,*posts) }
  if _, err := s.DecideApproval(context.Background(), list[0].ID, true, "", false); err == nil || *posts != 1 { t.Fatal("approval was replayed") }
}

func TestLexOpenReadRequiresApprovalAndMissingStoreFailsClosed(t *testing.T) {
  s, _, posts, _, _ := gated(t)
  k, _ := s.fleet.Get("ana")
  weather, err := connector.Build("weather", connector.Settings{}, "")
  if err != nil { t.Fatal(err) }
  s.fleet.Connectors().Add("weather", weather)
  turn := &Turn{}
  _, held := s.gate("fixture-chat", k, action{name:"weather",args:map[string]any{"action":"forecast","place":"Santiago"}}, turn)
  if !held || len(turn.Approvals) != 1 || *posts != 0 { t.Fatal("read escaped the gate") }
  s.SetApprovals(nil)
  got, held := s.gate("fixture-chat", k, action{name:"hook",args:map[string]any{"text":"fixture"}}, &Turn{})
  if !held || got.err == "" || *posts != 0 { t.Fatal("missing approval store failed open") }
}
`;
const googleTokenTests = `package connector

import (
  "context"
  "io"
  "net/http"
  "strings"
  "testing"
)

func TestLexOpenGoogleManualTokenSignsReadsAndRejectsWrites(t *testing.T) {
  kind, _ := LookupKind("google-workspace")
  settings := Settings{"token":"fictitious-google-read-only-access-token"}
  if !kind.KeySet(settings) || kind.AuthOf(settings, false) != AuthToken { t.Fatal("manual token requires an OAuth app") }
  found := false
  for _, field := range kind.Fields {
    if field.Name == "token" { found = field.Secret && !field.Required && field.Key == keyToken }
  }
  if !found { t.Fatal("manual token must be an optional secret account key") }
  old := httpDo
  t.Cleanup(func() { httpDo = old })
  calls := 0
  httpDo = func(req *http.Request) (*http.Response, error) {
    calls++
    if req.Header.Get("Authorization") != "Bearer " + settings["token"] { t.Fatal("Google request did not use the typed token") }
    if req.Method != http.MethodGet { t.Fatal("temporary token made a write request") }
    body := "{}"
    switch req.URL.Path {
    case "/gmail/v1/users/me/messages": body = "{\\"messages\\":[]}"
    case "/calendar/v3/calendars/primary/events": body = "{\\"items\\":[]}"
    case "/drive/v3/about":
      if req.URL.Query().Get("fields") != "user(permissionId)" { t.Fatal("unexpected Drive fields") }
      body = "{\\"user\\":{\\"permissionId\\":\\"fictitious-permission-id\\"}}"
    default: t.Fatalf("unexpected Google path: %s", req.URL.Path)
    }
    return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
  }
  c, err := Build("google-workspace", WithTokenSource(settings, func(context.Context) (string,error) { t.Fatal("typed token unexpectedly used OAuth"); return "",nil }), "")
  if err != nil { t.Fatal(err) }
  account, err := c.(Checker).Check(context.Background())
  if err != nil || account != "fictitious-permission-id" { t.Fatalf("check: %v %s", err, account) }
  for _, args := range []map[string]any{
    {"action":"list_mail"},
    {"action":"list_events"},
    {"action":"request", "path":"/drive/v3/about", "query":map[string]any{"fields":"user(permissionId)"}},
  } { if _, err := c.Call(context.Background(), args); err != nil { t.Fatal(err) } }
  before := calls
  for _, args := range []map[string]any{
    {"action":"send_mail", "to":"fixture@example.invalid", "text":"fictitious content"},
    {"action":"request", "method":"POST", "path":"/drive/v3/files", "body":map[string]any{"name":"never created"}},
    {"action":"request", "method":"DELETE", "path":"/drive/v3/files/fictitious-id"},
  } { if _, err := c.Call(context.Background(), args); err == nil || !strings.Contains(err.Error(), "only permits reading") { t.Fatalf("write was not blocked: %v", err) } }
  if calls != before { t.Fatal("rejected write reached Google") }
}

func TestLexOpenGoogleOAuthRemainsAvailableWithoutManualToken(t *testing.T) {
  old := httpDo
  t.Cleanup(func() { httpDo = old })
  httpDo = func(req *http.Request) (*http.Response, error) {
    if req.Header.Get("Authorization") != "Bearer fictitious-oauth-access-token" { t.Fatal("registered-app OAuth contract changed") }
    if req.URL.Path == "/gmail/v1/users/me/profile" {
      if req.Method != http.MethodGet { t.Fatal("registered-app check changed") }
      return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("{\\"emailAddress\\":\\"fixture@example.invalid\\"}"))}, nil
    }
    if req.Method != http.MethodPost { t.Fatal("registered-app action changed") }
    return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("{\\"id\\":\\"fictitious-message\\"}"))}, nil
  }
  c, err := Build("google-workspace", WithTokenSource(Settings{}, func(context.Context) (string,error) { return "fictitious-oauth-access-token",nil }), "")
  if err != nil { t.Fatal(err) }
  account, err := c.(Checker).Check(context.Background())
  if err != nil || account != "fixture@example.invalid" { t.Fatal("registered-app account check changed") }
  if _, err := c.Call(context.Background(), map[string]any{"action":"send_mail", "to":"fixture@example.invalid", "text":"synthetic transport only"}); err != nil { t.Fatal(err) }
}
`;
const dropboxTests = `package connector

import (
  "context"
  "encoding/json"
  "io"
  "net/http"
  "strings"
  "testing"
  "testing/iotest"
)

func TestLexOpenDropboxReadsOnlyThroughApprovedEndpoints(t *testing.T) {
  old := httpDo
  t.Cleanup(func() { httpDo = old })
  calls := 0
  httpDo = func(req *http.Request) (*http.Response, error) {
    calls++
    if req.Method != "POST" || req.Header.Get("Authorization") != "Bearer fixture-dropbox" { t.Fatalf("unexpected Dropbox request: %s %s", req.Method, req.URL) }
    body := "{}"
    switch req.URL.String() {
    case "https://api.dropboxapi.com/2/users/get_current_account": body = "{\\"email\\":\\"fixture@example.invalid\\"}"
    case "https://api.dropboxapi.com/2/files/list_folder": body = "{\\"entries\\":[]}"
    case "https://api.dropboxapi.com/2/files/search_v2": body = "{\\"matches\\":[]}"
    case "https://content.dropboxapi.com/2/files/download":
      arg := req.Header.Get("Dropbox-API-Arg")
      if strings.ContainsAny(arg, "é📄") { t.Fatalf("non-ASCII request header: %q", arg) }
      var value struct { Path string }
      if err := json.Unmarshal([]byte(arg), &value); err != nil || value.Path != "/Café📄.pdf" { t.Fatalf("invalid Dropbox path: %v %q", err, value.Path) }
      body = "fixture PDF bytes"
    default: t.Fatalf("request escaped the Dropbox read endpoints: %s", req.URL)
    }
    return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body)), ContentLength: int64(len(body))}, nil
  }
  c, err := Build("dropbox", Settings{"token":"fixture-dropbox"}, "")
  if err != nil { t.Fatal(err) }
  if _, err := c.(Checker).Check(context.Background()); err != nil { t.Fatal(err) }
  for _, args := range []map[string]any{{"action":"list"}, {"action":"search", "query":"fixture"}} {
    if _, err := c.Call(context.Background(), args); err != nil { t.Fatal(err) }
  }
  if _, name, data, err := c.(Filer).CallFile(context.Background(), map[string]any{"action":"read", "path":"/Café📄.pdf"}); err != nil || name != "Café📄.pdf" || string(data) != "fixture PDF bytes" { t.Fatalf("download failed: %v", err) }
  for _, action := range []string{"upload", "share_link", "request"} {
    if _, err := c.Call(context.Background(), map[string]any{"action":action, "path":"/2/files/delete_v2", "method":"POST"}); err == nil { t.Fatalf("allowed unsupported Dropbox action %s", action) }
  }
  if calls != 4 { t.Fatalf("expected four read requests, got %d", calls) }
}

func TestLexOpenDropboxDownloadRequiresCompleteBoundedBody(t *testing.T) {
  const capBytes = 4 << 20
  old := httpDo
  t.Cleanup(func() { httpDo = old })
  c, err := Build("dropbox", Settings{"token":"fixture-dropbox"}, "")
  if err != nil { t.Fatal(err) }
  for _, tc := range []struct {
    name string
    status int
    length int64
    body io.Reader
    success bool
  }{
    {"exact cap", http.StatusOK, capBytes, strings.NewReader(strings.Repeat("x", capBytes)), true},
    {"exact cap without length", http.StatusOK, -1, strings.NewReader(strings.Repeat("x", capBytes)), true},
    {"declared over cap", http.StatusOK, capBytes + 1, strings.NewReader(""), false},
    {"stream over cap", http.StatusOK, -1, strings.NewReader(strings.Repeat("x", capBytes + 1)), false},
    {"interrupted stream", http.StatusOK, -1, io.MultiReader(strings.NewReader("partial"), iotest.ErrReader(io.ErrUnexpectedEOF)), false},
    {"premature EOF", http.StatusOK, 10, strings.NewReader("short"), false},
    {"partial HTTP response", http.StatusPartialContent, 7, strings.NewReader("partial"), false},
  } {
    t.Run(tc.name, func(t *testing.T) {
      httpDo = func(req *http.Request) (*http.Response, error) {
        if req.URL.String() != "https://content.dropboxapi.com/2/files/download" { t.Fatalf("unexpected endpoint: %s", req.URL) }
        return &http.Response{StatusCode: tc.status, Header: http.Header{}, Body: io.NopCloser(tc.body), ContentLength: tc.length}, nil
      }
      text, name, data, err := c.(Filer).CallFile(context.Background(), map[string]any{"action":"read", "path":"/Resolución.pdf"})
      if tc.success {
        if err != nil || name != "Resolución.pdf" || len(data) != capBytes || data[capBytes-1] != 'x' { t.Fatalf("complete download failed: %v, bytes=%d", err, len(data)) }
        return
      }
      if err == nil || name != "" || text != "" || data != nil { t.Fatalf("incomplete download produced a result: %q, %q, bytes=%d, err=%v", text, name, len(data), err) }
    })
  }
}
`;
const originals = {
  "internal/chat/limit.go": "860c0c96adfa350eab15801543c1471baf0ff077c7c0cca846906df264aa8d95",
  "internal/chat/approve.go": "2155d330c1a3b4c87278857c6b15e240b309dc756cfdd7ad020a5c6546f51106",
  "internal/gateway/gateway.go": "d39393bbb377e15cbdf01fdc2650524128c81fe91fabff19f68ca5b668f3a740",
  "internal/connector/catalog.go": "35e3a8c86b985059788f9156ed257183b3b6b032deb104353d17fe8d3203a985",
  "internal/connector/check.go": "8f31816ef9dbddb4f10c749878bda583567c59617196b96100871e641b3a2d09",
  "internal/connector/media.go": "3e468531e6a1bd5b00d91ba6c0819b66dd0322c6e9f762ad519a20ed3de301e9",
  "internal/connector/fullapi.go": "32dc42de5e3c7b99cd2f963feea553b5ab570a9a59d286cfef42e152d9d642a5",
};
const hash = value => createHash("sha256").update(value).digest("hex");
function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error("Pinned connector gate source no longer matches");
  return source.replace(before, after);
}

// Exported separately so a small credential-free fixture can verify the actual rewrites.
export function rewriteConnectorGate(path, source) {
  if (path === "internal/connector/media.go") {
    const first = source.indexOf('\n\t\t"upload": func(s Settings, a map[string]any) (request, error) {', source.indexOf("func makeDropbox("));
    const last = source.indexOf('\n\t}, "list")', first);
    if (first < 0 || last < 0 || !source.slice(first, last).includes('"share_link": func(')) throw new Error("Pinned Dropbox actions no longer match");
    source = source.slice(0, first) + source.slice(last);
    source = once(source, '\n\t"time"\n', '\n\t"time"\n\t"unicode/utf16"\n');
    source = once(source, 'h["Dropbox-API-Arg"] = string(raw)', `var escaped strings.Builder
		for _, r := range string(raw) {
			if r < 0x7f { escaped.WriteRune(r); continue }
			for _, unit := range utf16.Encode([]rune{r}) { fmt.Fprintf(&escaped, "\\\\u%04x", unit) }
		}
		h["Dropbox-API-Arg"] = escaped.String()`);
    source = once(source, 'files in Dropbox: list, search, read, save text files and share a link', 'files in Dropbox: list, search and read');
    const uploadAction = source.match(/\n\t\t\t\t\{Name: "upload", Help: "save a text file \([^\n]+/);
    if (!uploadAction) throw new Error("Pinned Dropbox action description no longer matches");
    source = once(source, uploadAction[0], '');
    source = once(source, '\n\t\t\t\t{Name: "share_link", Help: "a link anyone can open to a file", Args: []string{"path"}},', '');
    return once(source, `
		case "upload":
			var r struct {
				Path string \`json:"path_display"\`
			}
			if json.Unmarshal(data, &r) == nil && r.Path != "" {
				return "saved as " + r.Path
			}`, '');
  }
  if (path === "internal/connector/fullapi.go") return once(source, '\n\t"dropbox":  {root: fixed("https://api.dropboxapi.com"), hosts: []string{"content.dropboxapi.com"}, headers: tokenHeader, docs: "www.dropbox.com/developers/documentation/http/documentation"},', '');
  if (path === "internal/connector/catalog.go") {
    source = once(source, 'Fields: fApp("console.cloud.google.com (a Desktop or Web client)"),', 'Fields: signIn(nil, f("token", "Temporary Google access token (read only)", "Optional: access token from https://developers.google.com/oauthplayground/ using drive.metadata.readonly. Check reads only Drive account metadata. Expires according to Google; no automatic refresh. This mode blocks writes.", false, true), "console.cloud.google.com (a Desktop or Web client)"),');
    source = once(source, 'data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))', `const maxResponseBytes = 4 << 20
	if r.url == dropboxContent + "/files/download" && resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if resp.StatusCode != http.StatusOK {
			return nil, errors.New("Dropbox did not return a complete download")
		}
		if resp.ContentLength > maxResponseBytes {
			return nil, errors.New("Dropbox download exceeds the 4 MiB limit")
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes + 1))
		if err != nil || (resp.ContentLength >= 0 && resp.ContentLength != int64(len(data))) {
			return nil, errors.New("Dropbox download ended before the file was complete")
		}
		if len(data) > maxResponseBytes {
			return nil, errors.New("Dropbox download exceeds the 4 MiB limit")
		}
		return data, nil
	}
	data, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))`);
    return once(source, 'func (a *api) send(ctx context.Context, req *request) ([]byte, error) {', `func (a *api) send(ctx context.Context, req *request) ([]byte, error) {
\t// LexOpen's manually supplied Google access token is a temporary, read-only mode.
\t// Native Google actions do not set their own bearer header, unlike generic requests.
\tif a.kind.Name == "google-workspace" && strings.TrimSpace(a.s["token"]) != "" {
\t\tif req.method != "GET" && req.method != "HEAD" {
\t\t\treturn nil, errors.New("the temporary Google token mode only permits reading; use a registered OAuth app for writing")
\t\t}
\t\tif req.headers == nil { req.headers = map[string]string{} }
\t\treq.headers["Authorization"] = "Bearer " + strings.TrimSpace(a.s["token"])
\t}`);
  }
  if (path === "internal/connector/check.go") {
    return once(source, 'return get("https://gmail.googleapis.com/gmail/v1/users/me/profile", bearer(s["token"]))\n\t}, []string{"emailAddress"}},', `if strings.TrimSpace(s["token"]) != "" {
\t\t\treturn get("https://www.googleapis.com/drive/v3/about?fields=user(permissionId)", bearer(strings.TrimSpace(s["token"])))
\t\t}
\t\treturn get("https://gmail.googleapis.com/gmail/v1/users/me/profile", nil)
\t}, []string{"user.permissionId", "emailAddress"}},`);
  }
  if (path === "internal/chat/limit.go") return `package chat

import "github.com/madkoding/kitties/internal/kitty"

// LexOpen owns connector permissions; model output must never weaken them.
const limitHelp = "Connector permissions are managed by the person in LexOpen."

func (s *Service) limitPrompt(allowed map[string]string) string {
	if len(allowed) == 0 { return "" }
	return "\\nEvery connector action waits for the person's confirmation in LexOpen. You cannot change these permissions. Do not repeat a held action.\\n"
}

func (s *Service) runLimit(id string, a action, k *kitty.Kitty, allowed map[string]string, turn *Turn) outcome {
	return outcome{action: a, err: "connector permissions can only be changed by the person in LexOpen"}
}
`;
  if (path === "internal/chat/approve.go") {
    source = once(source, "if s.approvals == nil {\n\t\treturn outcome{}, false\n\t}", "if s.approvals == nil {\n\t\treturn outcome{action: a, err: \"LexOpen connector approval store is unavailable\"}, true\n\t}");
    source = once(source, "if !found {\n\t\treturn outcome{}, false\n\t}", "if !found {\n\t\treturn outcome{action: a, err: \"LexOpen connector is unavailable\"}, true\n\t}");
    source = once(source, "if !isKind {\n\t\treturn outcome{}, false\n\t}", "if !isKind {\n\t\treturn outcome{action: a, err: \"LexOpen requires a catalogued connector\"}, true\n\t}");
    return once(source, "verdict := s.approvals.Check(k.ID, a.name, action, risk.String(), k.Approvals, s.demandOf(k))", "verdict := s.approvals.Check(k.ID, a.name, action, risk.String(), k.Approvals, s.demandOf(k))\n\t// LexOpen requires a fresh confirmation even for reads, learned trust and auto rules.\n\tif !verdict.Blocked {\n\t\tverdict = approvals.Verdict{Why: \"LexOpen requires confirmation for this connector action\"}\n\t}");
  }
  if (path === "internal/gateway/gateway.go") {
    source = once(source, '\t"net/http"\n\t"strconv"', '\t"net/http"\n\t"runtime"\n\t"strconv"');
    return once(source, 'out := map[string]any{"ok": true, "version": s.version,', 'out := map[string]any{"ok": true, "lexopen_connector_gate": "v1", "lexopen_connector_platform": runtime.GOOS, "lexopen_dropbox_read_gate": true, "version": s.version,');
  }
  throw new Error("Not a pinned connector gate file");
}

export async function hardenConnectors(directory) {
  const root = await realpath(directory);
  const marker = (await readFile(join(root, ".lexopen-source-commit"), "utf8")).trim();
  if (marker !== PINNED_COMMIT) throw new Error("Connector hardening requires the exact public source commit");
  const changes = [];
  for (const [path, expected] of Object.entries(originals)) {
    const file = join(root, path), stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) throw new Error("Pinned source must be an owned regular file");
    const source = await readFile(file, "utf8");
    if (hash(source) !== expected) throw new Error("Pinned source differs; extract a fresh public source archive before hardening");
    changes.push([file, rewriteConnectorGate(path, source)]);
  }
  // All inputs are checked before any file is written. Never run this against a user's gateway data.
  for (const [file, source] of changes) await writeFile(file, source);
  await writeFile(join(root, "internal/chat/lexopen_gate_test.go"), gateTests, { flag: "wx" });
  await writeFile(join(root, "internal/connector/lexopen_google_token_test.go"), googleTokenTests, { flag: "wx" });
  await writeFile(join(root, "internal/connector/lexopen_dropbox_test.go"), dropboxTests, { flag: "wx" });
  await writeFile(join(root, ".lexopen-connector-gate"), CONNECTOR_GATE + "\n");
  return { source: PINNED_COMMIT, connectorGate: CONNECTOR_GATE, files: changes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/altazor/harden-connectors.mjs <fresh-public-source-directory>");
  console.log(JSON.stringify(await hardenConnectors(process.argv[2])));
}
