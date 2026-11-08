package orchestrator

import (
	"encoding/json"
	"errors"
	"github.com/madkoding/kitties/internal/config"
	"github.com/madkoding/kitties/internal/oauth"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func lexopenNewAliasFixture(provider string) (string, oauth.App, oauth.Credentials) {
	kind := provider
	scope := "read:user"
	secret := "fixture-create-secret"
	refresh := "fixture-create-refresh"
	settings := map[string]string{}
	switch provider {
	case "google":
		kind = "google-workspace"
		scope = "https://www.googleapis.com/auth/drive.readonly"
	case "dropbox":
		scope = "account_info.read files.content.read files.metadata.read"
		secret = ""
		settings["oauth_public_client"] = "true"
		settings["oauth_lexopen_cloud_files"] = "v1"
	case "microsoft":
		kind = "microsoft-365"
		scope = "Files.Read User.Read"
		secret = ""
		settings["oauth_public_client"] = "true"
		settings["oauth_lexopen_cloud_files"] = "v1"
	}
	settings["oauth_scopes"] = scope
	if provider == "github" {
		refresh = ""
	}
	return "altazor-" + provider + "-0123456789abcdef", oauth.App{Provider: provider, Kind: kind, ClientID: "fixture-create-client", ClientSecret: secret, Settings: settings}, oauth.Credentials{AccessToken: "fixture-create-access", RefreshToken: refresh, Expiry: time.Now().Add(time.Hour).Truncate(time.Second), Account: "fixture-create-account"}
}
func TestLexOpenPersistentOAuthNewAliasAtomicCreationAndRestart(t *testing.T) {
	for _, provider := range []string{"google", "github", "dropbox", "microsoft"} {
		t.Run(provider, func(t *testing.T) {
			cfg := testConfig(t)
			cfg.Connectors = map[string]config.Connector{}
			m, e := New(cfg)
			if e != nil {
				t.Fatal(e)
			}
			name, app, creds := lexopenNewAliasFixture(provider)
			if _, exists := m.connectors.Get(name); exists {
				t.Fatal("fixture alias must actually be absent")
			}
			if e = m.OAuth().ImportCredentials(name, app, creds); e != nil {
				t.Fatal("authorized first import failed", e)
			}
			if value, exists := m.cfg.Connectors[name]; !exists || value.Kind != app.Kind || value.Token != "" {
				t.Fatal("first import not in config")
			}
			if _, exists := m.overlay.Connectors[name]; !exists {
				t.Fatal("first import not persisted in overlay")
			}
			if _, exists := m.connectors.Get(name); !exists {
				t.Fatal("first import not registered")
			}
			st, e := os.Stat(m.settingsPath())
			if e != nil || st.Mode().Perm() != 0600 {
				t.Fatal("new credential settings not private")
			}
			cfg.Connectors = map[string]config.Connector{}
			again, e := New(cfg)
			if e != nil {
				t.Fatal(e)
			}
			got, e := again.OAuthCredentials(name)
			if e != nil || got.AccessToken != creds.AccessToken || got.RefreshToken != creds.RefreshToken || got.Account != creds.Account || !got.Expiry.Equal(creds.Expiry) {
				t.Fatal("new alias did not survive empty-config restart", e)
			}
			found, e := again.OAuthApp(name)
			if e != nil || found.Kind != app.Kind || found.Provider != provider || found.ClientID != app.ClientID || found.ClientSecret != app.ClientSecret {
				t.Fatal("new alias identity lost", e)
			}
			raw, _ := json.Marshal(again.Settings())
			for _, secret := range []string{app.ClientID, "fixture-create-secret", creds.AccessToken, "fixture-create-refresh"} {
				if strings.Contains(string(raw), secret) {
					t.Fatal("private first-import field projected")
				}
			}
		})
	}
}
func TestLexOpenPersistentOAuthNewAliasWriteFailureHasNoPartialState(t *testing.T) {
	for _, provider := range []string{"google", "github", "dropbox", "microsoft"} {
		t.Run(provider, func(t *testing.T) {
			cfg := testConfig(t)
			cfg.Connectors = nil
			m, e := New(cfg)
			if e != nil {
				t.Fatal(e)
			}
			name, app, creds := lexopenNewAliasFixture(provider)
			if e = os.Mkdir(m.settingsPath(), 0700); e != nil {
				t.Fatal(e)
			}
			e = m.OAuth().ImportCredentials(name, app, creds)
			if e == nil {
				t.Fatal("failed persistence accepted")
			}
			if _, exists := m.cfg.Connectors[name]; exists {
				t.Fatal("failed import created config alias")
			}
			if _, exists := m.overlay.Connectors[name]; exists {
				t.Fatal("failed import created overlay alias")
			}
			if _, exists := m.connectors.Get(name); exists {
				t.Fatal("failed import registered alias")
			}
			temps, _ := filepath.Glob(filepath.Join(filepath.Dir(m.settingsPath()), ".oauth-settings-*"))
			if len(temps) != 0 {
				t.Fatal("failed import left credential temporary")
			}
			for _, secret := range []string{app.ClientID, "fixture-create-secret", creds.AccessToken, "fixture-create-refresh"} {
				if strings.Contains(e.Error(), secret) {
					t.Fatal("persistence failure disclosed a credential")
				}
			}
		})
	}
}
func TestLexOpenPersistentOAuthNewAliasRequiresExplicitBoundImport(t *testing.T) {
	cfg := testConfig(t)
	cfg.Connectors = map[string]config.Connector{}
	m, e := New(cfg)
	if e != nil {
		t.Fatal(e)
	}
	name, app, creds := lexopenNewAliasFixture("dropbox")
	if e = m.SaveOAuthCredentials(name, creds); !errors.Is(e, ErrNotFound) {
		t.Fatal("refresh path created missing alias", e)
	}
	for _, bad := range []struct {
		name string
		app  oauth.App
	}{{"unmanaged", app}, {"altazor-google-0123456789abcdef", app}, {name, oauth.App{Provider: "dropbox", Kind: "github"}}, {name, oauth.App{Provider: "unknown", Kind: "dropbox"}}, {name, oauth.App{Provider: "dropbox", Kind: "shell"}}} {
		if e = m.OAuth().ImportCredentials(bad.name, bad.app, creds); e == nil {
			t.Fatal("unbound first import accepted")
		}
	}
	if len(m.cfg.Connectors) != 0 || len(m.overlay.Connectors) != 0 || len(m.connectors.Names()) != 0 {
		t.Fatal("rejected first import changed state")
	}
}
