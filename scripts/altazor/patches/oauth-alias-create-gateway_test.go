package gateway

import (
	"encoding/json"
	"github.com/madkoding/kitties/internal/config"
	"github.com/madkoding/kitties/internal/orchestrator"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func lexopenNewAliasGateway(t *testing.T) (*Server, *orchestrator.Manager, config.Config) {
	t.Helper()
	cfg := config.Defaults()
	cfg.DataDir = t.TempDir()
	cfg.Providers = map[string]config.Provider{"local": {Kind: "ollama", Model: "fixture"}}
	cfg.DefaultProvider = "local"
	cfg.Connectors = map[string]config.Connector{}
	fleet, e := orchestrator.New(cfg)
	if e != nil {
		t.Fatal(e)
	}
	return New(fleet, &fakeChats{}, "fixture-gateway-token", "fixture"), fleet, cfg
}
func lexopenNewAliasBody(provider string) map[string]any {
	body := lexopenOAuthBody()
	body["kind"] = provider
	switch provider {
	case "google":
		body["kind"] = "google-workspace"
	case "github":
		body["scopes"] = []string{"read:user"}
		delete(body, "expires_at")
		body["refresh_token"] = ""
	case "dropbox":
		body["scopes"] = []string{"account_info.read", "files.content.read", "files.metadata.read"}
		delete(body, "client_secret")
		body["public_client"] = true
	case "microsoft":
		body["kind"] = "microsoft-365"
		body["scopes"] = []string{"Files.Read", "User.Read"}
		delete(body, "client_secret")
		body["public_client"] = true
	}
	return body
}
func TestLexOpenPersistentOAuthNewAliasGatewayImportWithoutPlaceholder(t *testing.T) {
	for _, provider := range []string{"google", "github", "dropbox", "microsoft"} {
		t.Run(provider, func(t *testing.T) {
			server, fleet, cfg := lexopenNewAliasGateway(t)
			name := "altazor-" + provider + "-0123456789abcdef"
			if _, exists := fleet.Connectors().Get(name); exists {
				t.Fatal("fixture alias preexists")
			}
			r := lexopenOAuthRequest(server, "/v1/lexopen/easy-oauth/"+name, lexopenNewAliasBody(provider), "127.0.0.1:1234", "fixture-gateway-token")
			if r.Code != 200 {
				t.Fatal("first import rejected", r.Code, r.Body.String())
			}
			var receipt map[string]any
			if json.Unmarshal(r.Body.Bytes(), &receipt) != nil || len(receipt) != 4 || receipt["name"] != name || receipt["persistent"] != true || receipt["auto_refresh"] != (provider != "github") {
				t.Fatal("first-import receipt invalid")
			}
			if strings.Contains(r.Body.String(), "fixture-private-") {
				t.Fatal("response exposes credential")
			}
			cfg.Connectors = map[string]config.Connector{}
			again, e := orchestrator.New(cfg)
			if e != nil {
				t.Fatal(e)
			}
			app, e := again.OAuthApp(name)
			if e != nil || app.Provider != provider || app.ClientID != "fixture-private-client" {
				t.Fatal("first import not durable", e)
			}
		})
	}
}
func TestLexOpenPersistentOAuthNewAliasGatewayPersistenceFailureRedacted(t *testing.T) {
	server, fleet, cfg := lexopenNewAliasGateway(t)
	if e := os.Mkdir(filepath.Join(cfg.DataDir, "settings.json"), 0700); e != nil {
		t.Fatal(e)
	}
	name := "altazor-dropbox-0123456789abcdef"
	r := lexopenOAuthRequest(server, "/v1/lexopen/easy-oauth/"+name, lexopenNewAliasBody("dropbox"), "127.0.0.1:1234", "fixture-gateway-token")
	if r.Code != 503 || strings.Contains(r.Body.String(), "fixture-private-") || strings.Contains(r.Body.String(), cfg.DataDir) {
		t.Fatal("failure response disclosed private data or accepted import")
	}
	if _, exists := fleet.Connectors().Get(name); exists {
		t.Fatal("failed import registered partial alias")
	}
	if _, exists := fleet.Config().Connectors[name]; exists {
		t.Fatal("failed import created partial config")
	}
}

func TestLexOpenPersistentOAuthNewAliasHealthCapability(t *testing.T) {
	server, _, _ := lexopenNewAliasGateway(t)
	req := httptest.NewRequest("GET", "/v1/health", nil)
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	var health map[string]any
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &health) != nil || health["lexopen_oauth_alias_create"] != "v1" {
		t.Fatal("native alias creation capability missing")
	}
}
