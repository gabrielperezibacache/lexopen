package connector

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestLexOpenPersistentOAuthGoogleCheckUsesOnlyDrivePermission(t *testing.T) {
	old := httpDo
	t.Cleanup(func() { httpDo = old })
	calls := 0
	httpDo = func(req *http.Request) (*http.Response, error) {
		calls++
		if req.Method != "GET" || req.URL.String() != "https://www.googleapis.com/drive/v3/about?fields=user(permissionId)" || req.Header.Get("Authorization") != "Bearer fixture-refreshed-access" {
			t.Fatal("OAuth check exceeded approved Drive read")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"user":{"permissionId":"fixture-account"}}`))}, nil
	}
	c, err := Build("google-workspace", WithTokenSource(Settings{"oauth_access_token": "fixture-stale-access", "oauth_refresh_token": "fixture-private-refresh"}, func(context.Context) (string, error) { return "fixture-refreshed-access", nil }), "")
	if err != nil {
		t.Fatal(err)
	}
	account, err := c.(Checker).Check(context.Background())
	if err != nil || account != "fixture-account" || calls != 1 {
		t.Fatal("Drive-only OAuth check failed")
	}
}
