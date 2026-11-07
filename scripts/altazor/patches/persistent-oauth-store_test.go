package orchestrator

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/madkoding/kitties/internal/config"
	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/oauth"
)

func TestLexOpenPersistentOAuthStoreSurvivesRestartAndHidesCredentials(t *testing.T) {
	name := "altazor-google-0123456789abcdef"
	cfg := testConfig(t)
	cfg.Connectors[name] = config.Connector{Kind: "google-workspace", Token: "old-static", Settings: map[string]string{"token": "old-static-setting", connector.TokenSavedAt: "old-stamp", oauth.KeyAccount: "old-account"}}
	m, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	app := oauth.App{Provider: "google", Kind: "google-workspace", ClientID: "fixture-private-client", ClientSecret: "fixture-private-secret", Settings: map[string]string{"oauth_scopes": "https://www.googleapis.com/auth/drive.readonly"}}
	credentials := oauth.Credentials{AccessToken: "fixture-private-access", RefreshToken: "fixture-private-refresh", Expiry: time.Now().Add(-time.Minute)}
	if err := m.OAuth().ImportCredentials(name, app, credentials); err != nil {
		t.Fatal(err)
	}
	if m.cfg.Connectors[name].Token != "" || m.cfg.Connectors[name].Settings["token"] != "" || m.cfg.Connectors[name].Settings[oauth.KeyAccount] != "" {
		t.Fatal("legacy token or identity retained")
	}
	st, err := os.Stat(m.settingsPath())
	if err != nil || st.Mode().Perm() != 0o600 {
		t.Fatal("credential file must be private")
	}
	again, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	got, err := again.OAuthCredentials(name)
	if err != nil || got.AccessToken != credentials.AccessToken || got.RefreshToken != credentials.RefreshToken {
		t.Fatal("credentials lost after restart")
	}
	view := again.Settings()
	raw, _ := json.Marshal(view)
	for _, secret := range []string{app.ClientID, app.ClientSecret, credentials.AccessToken, credentials.RefreshToken, "old-static"} {
		if strings.Contains(string(raw), secret) {
			t.Fatal("private credential projected")
		}
	}
	found := false
	for _, v := range view.Connectors {
		if v.Name == name {
			found = true
			if !v.PersistentOAuth || !v.AutoRefresh || !v.SignedIn || v.NeedsSignIn {
				t.Fatal("expired access token wrongly requests a new sign-in")
			}
		}
	}
	if !found {
		t.Fatal("managed account missing")
	}
}

func TestLexOpenPersistentOAuthStoreWriteFailurePreservesMemoryAndRegistry(t *testing.T) {
	name := "altazor-github-0123456789abcdef"
	cfg := testConfig(t)
	cfg.Connectors[name] = config.Connector{Kind: "github", Token: "keep-old-static", Settings: map[string]string{"token": "keep-old-setting"}}
	m, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := m.connectors.Get(name)
	original := m.cfg.Connectors[name]
	if err := os.Mkdir(m.settingsPath(), 0o700); err != nil {
		t.Fatal(err)
	}
	app := oauth.App{Provider: "github", Kind: "github", ClientID: "fixture-id", ClientSecret: "fixture-secret", Settings: map[string]string{"oauth_scopes": "read:user"}}
	err = m.OAuth().ImportCredentials(name, app, oauth.Credentials{AccessToken: "must-not-save", Expiry: time.Now().Add(time.Hour)})
	if err == nil {
		t.Fatal("write failure accepted")
	}
	after, _ := m.connectors.Get(name)
	if before != after || m.cfg.Connectors[name].Token != original.Token || m.cfg.Connectors[name].Settings["token"] != "keep-old-setting" || m.cfg.Connectors[name].Settings[oauth.KeyAccess] != "" {
		t.Fatal("failed persistence changed active account")
	}
	if _, ok := m.overlay.Connectors[name]; ok {
		t.Fatal("failed persistence changed overlay")
	}
}

func TestLexOpenPersistentOAuthStoreRejectsNameKindMismatch(t *testing.T) {
	name := "altazor-google-0123456789abcdef"
	cfg := testConfig(t)
	cfg.Connectors[name] = config.Connector{Kind: "github", Token: "keep"}
	m, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.OAuth().ImportCredentials(name, oauth.App{Provider: "google", Kind: "google-workspace"}, oauth.Credentials{AccessToken: "not-saved"}); err == nil {
		t.Fatal("kind changed during import")
	}
	if m.cfg.Connectors[name].Token != "keep" {
		t.Fatal("mismatched import changed original")
	}
}
