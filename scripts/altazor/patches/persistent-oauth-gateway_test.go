package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/madkoding/kitties/internal/config"
	"github.com/madkoding/kitties/internal/oauth"
	"github.com/madkoding/kitties/internal/orchestrator"
)

func lexopenOAuthServer(t *testing.T) (*Server, *orchestrator.Manager) {
	t.Helper()
	cfg := config.Defaults()
	cfg.DataDir = t.TempDir()
	cfg.Providers = map[string]config.Provider{"local": {Kind: "ollama", Model: "fixture"}}
	cfg.DefaultProvider = "local"
	cfg.Connectors = map[string]config.Connector{"altazor-google-0123456789abcdef": {Kind: "google-workspace", Token: "old-static"}, "altazor-github-0123456789abcdef": {Kind: "github", Token: "old-static"}, "altazor-dropbox-0123456789abcdef": {Kind: "dropbox", Token: "old-static"}}
	fleet, err := orchestrator.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	return New(fleet, &fakeChats{}, "fixture-gateway-token", "fixture"), fleet
}

func lexopenOAuthBody() map[string]any {
	return map[string]any{"kind": "google-workspace", "client_id": "fixture-private-client", "client_secret": "fixture-private-secret", "access_token": "fixture-private-access", "refresh_token": "fixture-private-refresh", "expires_at": time.Now().Add(time.Hour).UTC().Format(time.RFC3339), "scopes": []string{"https://www.googleapis.com/auth/drive.readonly"}}
}

func lexopenOAuthRequest(server *Server, path string, body any, remote, token string) *httptest.ResponseRecorder {
	var raw []byte
	if text, ok := body.(string); ok {
		raw = []byte(text)
	} else if body != nil {
		raw, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.RemoteAddr = remote
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, req)
	return recorder
}

func TestLexOpenPersistentOAuthImportAndSafeReceipt(t *testing.T) {
	server, fleet := lexopenOAuthServer(t)
	name := "altazor-google-0123456789abcdef"
	r := lexopenOAuthRequest(server, "/v1/lexopen/easy-oauth/"+name, lexopenOAuthBody(), "127.0.0.1:43210", "fixture-gateway-token")
	if r.Code != 200 {
		t.Fatal("import failed")
	}
	var receipt map[string]any
	if err := json.Unmarshal(r.Body.Bytes(), &receipt); err != nil {
		t.Fatal(err)
	}
	if len(receipt) != 4 || receipt["persistent"] != true || receipt["auto_refresh"] != true || receipt["name"] != name || receipt["kind"] != "google-workspace" {
		t.Fatal("unsafe import receipt")
	}
	if strings.Contains(r.Body.String(), "fixture-private-") {
		t.Fatal("credential returned to caller")
	}
	credentials, err := fleet.OAuthCredentials(name)
	if err != nil || credentials.RefreshToken != "fixture-private-refresh" {
		t.Fatal("refresh missing")
	}
	if r.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("credential operation can be cached")
	}
}

func TestLexOpenPersistentOAuthBoundaryAndScopeValidation(t *testing.T) {
	server, fleet := lexopenOAuthServer(t)
	name := "altazor-google-0123456789abcdef"
	path := "/v1/lexopen/easy-oauth/" + name
	for _, test := range []struct {
		name          string
		alter         func(map[string]any)
		remote, token string
		want          int
	}{
		{"no bearer", func(map[string]any) {}, "127.0.0.1:1234", "", 401},
		{"not loopback", func(map[string]any) {}, "192.0.2.15:1234", "fixture-gateway-token", 403},
		{"broad scope", func(v map[string]any) { v["scopes"] = []string{"https://www.googleapis.com/auth/drive"} }, "127.0.0.1:1234", "fixture-gateway-token", 400},
		{"duplicate scope", func(v map[string]any) {
			v["scopes"] = []string{"https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.readonly"}
		}, "127.0.0.1:1234", "fixture-gateway-token", 400},
		{"missing refresh", func(v map[string]any) { v["refresh_token"] = "" }, "127.0.0.1:1234", "fixture-gateway-token", 400},
		{"expired", func(v map[string]any) { v["expires_at"] = time.Now().Add(-time.Minute).Format(time.RFC3339) }, "127.0.0.1:1234", "fixture-gateway-token", 400},
		{"unknown field", func(v map[string]any) { v["endpoint"] = "https://fixture.invalid" }, "127.0.0.1:1234", "fixture-gateway-token", 400},
		{"kind mismatch", func(v map[string]any) { v["kind"] = "github" }, "127.0.0.1:1234", "fixture-gateway-token", 400},
		{"control in secret", func(v map[string]any) { v["client_secret"] = "fixture\nsecret" }, "127.0.0.1:1234", "fixture-gateway-token", 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			body := lexopenOAuthBody()
			test.alter(body)
			r := lexopenOAuthRequest(server, path, body, test.remote, test.token)
			if r.Code != test.want {
				t.Fatalf("status=%d want=%d", r.Code, test.want)
			}
			if strings.Contains(r.Body.String(), "fixture-private-") {
				t.Fatal("secret in rejection")
			}
		})
	}
	if fleet.Config().Connectors[name].Token != "old-static" {
		t.Fatal("rejected import changed account")
	}
	raw, _ := json.Marshal(lexopenOAuthBody())
	r := lexopenOAuthRequest(server, path, string(raw)+"{}", "127.0.0.1:1234", "fixture-gateway-token")
	if r.Code != 400 {
		t.Fatal("trailing JSON accepted")
	}
}

func TestLexOpenPersistentOAuthGithubNoExpiryAndNativeRoutesCannotBroadenScopes(t *testing.T) {
	server, _ := lexopenOAuthServer(t)
	body := lexopenOAuthBody()
	body["kind"] = "github"
	body["refresh_token"] = ""
	body["expires_at"] = nil
	body["scopes"] = []string{"read:user"}
	r := lexopenOAuthRequest(server, "/v1/lexopen/easy-oauth/altazor-github-0123456789abcdef", body, "127.0.0.1:1234", "fixture-gateway-token")
	var receipt map[string]any
	_ = json.Unmarshal(r.Body.Bytes(), &receipt)
	if r.Code != 200 || receipt["persistent"] != true || receipt["auto_refresh"] != false {
		t.Fatal("long-lived OAuth incorrectly claims refresh")
	}
	for _, route := range []string{"start", "redirect"} {
		req := httptest.NewRequest(http.MethodPost, "/v1/oauth/altazor-google-0123456789abcdef/"+route, nil)
		if route == "redirect" {
			req.Method = http.MethodGet
		}
		req.RemoteAddr = "127.0.0.1:1234"
		req.Header.Set("Authorization", "Bearer fixture-gateway-token")
		rr := httptest.NewRecorder()
		server.ServeHTTP(rr, req)
		if rr.Code != 403 || !strings.Contains(rr.Body.String(), "oauth_use_host_connection") {
			t.Fatal("native flow bypassed approved read scopes")
		}
	}
}

type lexopenOAuthFailureFleet struct {
	*fakeFleet
	err error
}

func (f *lexopenOAuthFailureFleet) TestConnector(context.Context, string) (string, error) {
	return "", f.err
}

func TestLexOpenPersistentOAuthTestFailuresDoNotLeakOrRequestReconnectForTransientErrors(t *testing.T) {
	for _, test := range []struct {
		err  error
		code string
	}{{oauth.ErrReconnectRequired, "oauth_reconnect_required"}, {errors.New("HTTP 401: reflected-private-token"), "oauth_reconnect_required"}, {errors.New("HTTP 503: reflected-private-token"), "oauth_unavailable"}, {errors.New("network reflected-private-token"), "oauth_unavailable"}} {
		server := New(&lexopenOAuthFailureFleet{fakeFleet: &fakeFleet{}, err: test.err}, &fakeChats{}, "fixture-gateway-token", "fixture")
		r := lexopenOAuthRequest(server, "/v1/settings/connectors/altazor-google-0123456789abcdef/test", nil, "127.0.0.1:1234", "fixture-gateway-token")
		var value map[string]any
		_ = json.Unmarshal(r.Body.Bytes(), &value)
		if r.Code != 200 || value["ok"] != false || value["tested"] != true || value["code"] != test.code || strings.Contains(r.Body.String(), "reflected-private") {
			t.Fatal("unsafe connector failure classification")
		}
	}
}
