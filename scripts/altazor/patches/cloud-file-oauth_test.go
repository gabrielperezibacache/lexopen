package oauth

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestLexOpenCloudPublicRefreshNoSecretAndMicrosoftNarrowScopes(t *testing.T) {
	for _, provider := range []string{"dropbox", "microsoft"} {
		scopes := "account_info.read files.content.read files.metadata.read"
		returned := scopes
		if provider == "microsoft" {
			scopes = "Files.Read User.Read"
			returned = "https://graph.microsoft.com/Files.Read https://graph.microsoft.com/User.Read"
		}
		store := &memStore{provider: provider, id: "fixture-public-id", secret: "must-not-be-sent", settings: map[string]string{"oauth_lexopen_persistent": "v1", "oauth_public_client": "true", "oauth_scopes": scopes}, creds: Credentials{RefreshToken: "fixture-refresh", Expiry: time.Now().Add(-time.Hour)}}
		m := New(store)
		calls := 0
		m.httpDo = func(req *http.Request) (*http.Response, error) {
			calls++
			req.ParseForm()
			if req.Form.Has("client_secret") || req.Header.Get("Authorization") != "" || req.Form.Get("client_id") != "fixture-public-id" || req.Form.Get("refresh_token") != "fixture-refresh" {
				t.Fatal("public refresh leaked secret")
			}
			if provider == "microsoft" && req.Form.Get("scope") != "User.Read Files.Read" {
				t.Fatal("Microsoft refresh broadened scopes")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"access_token":"new-access","refresh_token":"rotated-refresh","expires_in":3600,"scope":"` + returned + `"}`))}, nil
		}
		if token, e := m.Token(context.Background(), "fixture"); e != nil || token != "new-access" || calls != 1 {
			t.Fatal("public refresh failed", e)
		}
		got, _ := store.OAuthCredentials("fixture")
		if got.RefreshToken != "rotated-refresh" {
			t.Fatal("refresh rotation lost")
		}
		if provider == "microsoft" {
			auth, e := m.Start("fixture", "http://localhost:3000/api/altazor/connectors/oauth/callback")
			if e != nil {
				t.Fatal(e)
			}
			u, _ := url.Parse(auth)
			if u.Query().Get("scope") != "offline_access User.Read Files.Read" || u.Query().Has("client_secret") {
				t.Fatal("native Microsoft authorization used upstream broad scopes")
			}
		}
	}
}
func TestLexOpenMicrosoftReturnedScopeCannotBroaden(t *testing.T) {
	for _, parts := range [][]string{{"Files.Read", "User.Read"}, {"offline_access", "https://graph.microsoft.com/User.Read", "https://graph.microsoft.com/Files.Read"}} {
		got, ok := LexOpenMicrosoftFileScopes(parts)
		if !ok || !reflect.DeepEqual(got, []string{"Files.Read", "User.Read"}) {
			t.Fatal("valid read scopes rejected")
		}
	}
	for _, raw := range []any{nil, "Files.ReadWrite User.Read", "Files.Read.All User.Read", "Files.Read User.Read Mail.Read", "Files.Read User.Read Files.Read", "https://evil.test/Files.Read User.Read", []string{"Files.Read", "User.Read"}} {
		if e := lexopenValidateTokenScope(App{Provider: "microsoft", Settings: map[string]string{"oauth_lexopen_persistent": "v1", "oauth_public_client": "true"}}, raw); e == nil {
			t.Fatal("missing or broad scope accepted")
		}
	}
}
