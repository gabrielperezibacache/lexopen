package gateway

import (
	"github.com/madkoding/kitties/internal/config"
	"github.com/madkoding/kitties/internal/orchestrator"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestLexOpenCloudPublicImportExplicitAndScopesBound(t *testing.T) {
	expiry := time.Now().Add(time.Hour)
	for _, provider := range []string{"dropbox", "microsoft"} {
		kind := provider
		scopes := []string{"account_info.read", "files.content.read", "files.metadata.read"}
		if provider == "microsoft" {
			kind = "microsoft-365"
			scopes = []string{"offline_access", "https://graph.microsoft.com/User.Read", "https://graph.microsoft.com/Files.Read"}
		}
		body := lexopenOAuthImport{Kind: kind, ClientID: "fixture-public-client", PublicClient: true, AccessToken: "fixture-access", RefreshToken: "fixture-refresh", ExpiresAt: &expiry, Scopes: scopes}
		name := "altazor-" + provider + "-0123456789abcdef"
		app, _, valid := body.validate(name, time.Now())
		if !valid || app.ClientSecret != "" || app.Settings["oauth_public_client"] != "true" || app.Settings["oauth_lexopen_cloud_files"] != "v1" {
			t.Fatal("public import rejected")
		}
		body.ClientSecret = "must-not-travel"
		if _, _, valid = body.validate(name, time.Now()); valid {
			t.Fatal("public client imported secret")
		}
		body.ClientSecret = ""
		body.PublicClient = false
		if _, _, valid = body.validate(name, time.Now()); valid {
			t.Fatal("implicit public import allowed")
		}
		body.PublicClient = true
		body.RefreshToken = ""
		if _, _, valid = body.validate(name, time.Now()); valid {
			t.Fatal("public client without refresh accepted")
		}
	}
	google := lexopenOAuthImport{Kind: "google-workspace", ClientID: "fixture", PublicClient: true, AccessToken: "fixture", RefreshToken: "fixture", ExpiresAt: &expiry, Scopes: []string{"https://www.googleapis.com/auth/drive.readonly"}}
	if _, _, ok := google.validate("altazor-google-0123456789abcdef", time.Now()); ok {
		t.Fatal("Google secret requirement weakened")
	}
	ms := lexopenOAuthImport{Kind: "microsoft-365", ClientID: "fixture", PublicClient: true, AccessToken: "fixture", RefreshToken: "fixture", ExpiresAt: &expiry, Scopes: []string{"Files.ReadWrite.All", "User.Read"}}
	if _, _, ok := ms.validate("altazor-microsoft-0123456789abcdef", time.Now()); ok {
		t.Fatal("Microsoft broad scopes imported")
	}
	server, _ := stagedGatewayFixture()
	req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	req.Header.Set("Authorization", "Bearer fixture-token")
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"lexopen_cloud_file_oauth":"v1"`) {
		t.Fatal("cloud capability absent")
	}
}
func TestLexOpenCloudImportPersistsPublicIdentityWithoutSecretAcrossRestart(t *testing.T) {
	cfg := config.Defaults()
	cfg.DataDir = t.TempDir()
	cfg.Providers = map[string]config.Provider{"local": {Kind: "ollama", Model: "fixture"}}
	cfg.DefaultProvider = "local"
	cfg.Connectors = map[string]config.Connector{"altazor-microsoft-0123456789abcdef": {Kind: "microsoft-365"}, "altazor-dropbox-0123456789abcdef": {Kind: "dropbox"}}
	fleet, e := orchestrator.New(cfg)
	if e != nil {
		t.Fatal(e)
	}
	server := New(fleet, &fakeChats{}, "fixture-gateway-token", "fixture")
	for _, provider := range []string{"dropbox", "microsoft"} {
		body := lexopenOAuthBody()
		kind := provider
		scopes := []string{"account_info.read", "files.content.read", "files.metadata.read"}
		if provider == "microsoft" {
			kind = "microsoft-365"
			scopes = []string{"Files.Read", "User.Read"}
		}
		body["kind"] = kind
		body["client_secret"] = ""
		body["public_client"] = true
		body["scopes"] = scopes
		name := "altazor-" + provider + "-0123456789abcdef"
		r := lexopenOAuthRequest(server, "/v1/lexopen/easy-oauth/"+name, body, "127.0.0.1:1234", "fixture-gateway-token")
		if r.Code != 200 || strings.Contains(r.Body.String(), "fixture-private-") {
			t.Fatal("public import failed or exposed credentials", provider, r.Code)
		}
		again, e := orchestrator.New(cfg)
		if e != nil {
			t.Fatal(e)
		}
		app, e := again.OAuthApp(name)
		if e != nil || app.Provider != provider || app.Kind != kind || app.ClientSecret != "" || app.Settings["oauth_public_client"] != "true" || app.Settings["oauth_lexopen_cloud_files"] != "v1" {
			t.Fatal("public policy lost after restart")
		}
		creds, e := again.OAuthCredentials(name)
		if e != nil || creds.RefreshToken != "fixture-private-refresh" {
			t.Fatal("public refresh lost after restart")
		}
	}
}
