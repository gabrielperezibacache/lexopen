package oauth

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func (s *memStore) ImportOAuthCredentials(_ string, app App, credentials Credentials) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.saveErr != nil {
		return s.saveErr
	}
	s.provider, s.kind, s.id, s.secret = app.Provider, app.Kind, app.ClientID, app.ClientSecret
	s.settings = map[string]string{"oauth_lexopen_persistent": "v1", "oauth_scopes": app.Settings["oauth_scopes"]}
	s.creds = credentials
	return nil
}

func TestLexOpenPersistentOAuthConcurrentRefreshRotatesOnce(t *testing.T) {
	store := &memStore{provider: "google", id: "fixture-app", secret: "fixture-secret", settings: map[string]string{"oauth_lexopen_persistent": "v1", "oauth_scopes": "https://www.googleapis.com/auth/drive.readonly"}, creds: Credentials{AccessToken: "old-access", RefreshToken: "old-refresh", Expiry: time.Now().Add(-time.Minute)}}
	m := New(store)
	var calls atomic.Int32
	m.httpDo = func(req *http.Request) (*http.Response, error) {
		calls.Add(1)
		if err := req.ParseForm(); err != nil || req.Form.Get("refresh_token") != "old-refresh" {
			t.Error("unexpected refresh generation")
		}
		time.Sleep(10 * time.Millisecond)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"access_token":"new-access","refresh_token":"rotated-refresh","expires_in":3600}`))}, nil
	}
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			token, err := m.Token(context.Background(), "account")
			if err != nil || token != "new-access" {
				t.Error("refresh failed")
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("refresh calls=%d", calls.Load())
	}
	credentials, _ := store.OAuthCredentials("account")
	if credentials.RefreshToken != "rotated-refresh" {
		t.Fatal("rotation not retained")
	}
}

func TestLexOpenPersistentOAuthImportWinsInFlightRefreshAndInvalidatesFlow(t *testing.T) {
	store := &memStore{provider: "google", id: "old-app", secret: "old-secret", settings: map[string]string{"oauth_lexopen_persistent": "v1"}, creds: Credentials{AccessToken: "old-access", RefreshToken: "old-refresh", Expiry: time.Now().Add(-time.Minute)}}
	m := New(store)
	started, release := make(chan struct{}), make(chan struct{})
	refreshDone, importDone := make(chan error, 1), make(chan error, 1)
	m.pending["stale-state"] = flow{connector: "account"}
	m.httpDo = func(*http.Request) (*http.Response, error) {
		close(started)
		<-release
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"access_token":"old-account-refreshed","refresh_token":"old-account-rotated","expires_in":3600}`))}, nil
	}
	go func() { _, err := m.Token(context.Background(), "account"); refreshDone <- err }()
	<-started
	go func() {
		importDone <- m.ImportCredentials("account", App{Provider: "google", ClientID: "new-app", ClientSecret: "new-secret"}, Credentials{AccessToken: "new-account", RefreshToken: "new-account-refresh", Expiry: time.Now().Add(time.Hour)})
	}()
	close(release)
	if err := <-refreshDone; err != nil {
		t.Fatal(err)
	}
	if err := <-importDone; err != nil {
		t.Fatal(err)
	}
	if token, err := m.Token(context.Background(), "account"); err != nil || token != "new-account" {
		t.Fatal("stale refresh overwrote imported account")
	}
	if _, exists := m.pending["stale-state"]; exists {
		t.Fatal("old authorization flow retained")
	}
	if _, err := m.Exchange(context.Background(), "stale-state", "never-used"); err == nil {
		t.Fatal("old flow replayed")
	}
}

func TestLexOpenPersistentOAuthFailuresAreSanitizedAndDoNotForgetRefresh(t *testing.T) {
	for _, test := range []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"revoked", 400, `{"error":"invalid_grant","error_description":"reflected-secret-access-and-refresh"}`, ErrReconnectRequired},
		{"temporary", 503, `{"error":"server_error","error_description":"reflected-secret-access-and-refresh"}`, ErrUnavailable},
		{"malformed", 200, `{"unexpected":"reflected-secret-access-and-refresh"}`, ErrUnavailable},
		{"scope broadened", 200, `{"access_token":"never-return","expires_in":3600,"scope":"https://www.googleapis.com/auth/drive"}`, ErrReconnectRequired},
		{"scope malformed", 200, `{"access_token":"never-return","expires_in":3600,"scope":["https://www.googleapis.com/auth/drive.readonly"]}`, ErrReconnectRequired},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := &memStore{provider: "google", id: "fixture-id", secret: "fixture-secret", settings: map[string]string{"oauth_lexopen_persistent": "v1", "oauth_scopes": "https://www.googleapis.com/auth/drive.readonly"}, creds: Credentials{AccessToken: "old", RefreshToken: "keep-refresh"}}
			m := manager(store, &answer{code: test.status, body: test.body})
			token, err := m.Token(context.Background(), "account")
			if token != "" || !errors.Is(err, test.want) || strings.Contains(err.Error(), "reflected-secret") {
				t.Fatal("unsafe or misclassified failure")
			}
			credentials, _ := store.OAuthCredentials("account")
			if credentials.RefreshToken != "keep-refresh" || credentials.AccessToken != "old" {
				t.Fatal("failed refresh changed saved credentials")
			}
		})
	}
}

func TestLexOpenPersistentOAuthScopeAndExistingRefreshAreRetained(t *testing.T) {
	store := &memStore{provider: "dropbox", id: "fixture-id", secret: "fixture-secret", settings: map[string]string{"oauth_lexopen_persistent": "v1", "oauth_scopes": "account_info.read files.content.read files.metadata.read"}, creds: Credentials{RefreshToken: "keep-refresh"}}
	m := manager(store, &answer{code: 200, body: `{"access_token":"new-access","expires_in":3600,"scope":"files.metadata.read,account_info.read files.content.read"}`})
	if token, err := m.Token(context.Background(), "account"); err != nil || token != "new-access" {
		t.Fatal("valid refresh rejected")
	}
	credentials, _ := store.OAuthCredentials("account")
	if credentials.RefreshToken != "keep-refresh" {
		t.Fatal("omitted refresh lost old credential")
	}
}
