package gateway

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/madkoding/kitties/internal/oauth"
)

var lexopenPersistentName = regexp.MustCompile(`^altazor-(google|github|dropbox)-[a-f0-9]{16}$`)

type lexopenOAuthImport struct {
	Kind         string     `json:"kind"`
	ClientID     string     `json:"client_id"`
	ClientSecret string     `json:"client_secret"`
	AccessToken  string     `json:"access_token"`
	RefreshToken string     `json:"refresh_token"`
	ExpiresAt    *time.Time `json:"expires_at"`
	Scopes       []string   `json:"scopes"`
	Account      string     `json:"account,omitempty"`
}

func lexopenSafeText(value string, maximum int, required bool) bool {
	return (!required || value != "") && len(value) <= maximum && utf8.ValidString(value) &&
		strings.TrimSpace(value) == value && !strings.ContainsFunc(value, unicode.IsControl)
}

func (body lexopenOAuthImport) validate(name string, now time.Time) (oauth.App, oauth.Credentials, bool) {
	match := lexopenPersistentName.FindStringSubmatch(name)
	if len(match) != 2 {
		return oauth.App{}, oauth.Credentials{}, false
	}
	provider := match[1]
	kind := provider
	if provider == "google" {
		kind = "google-workspace"
	}
	if body.Kind != kind || !lexopenSafeText(body.ClientID, 2048, true) ||
		!lexopenSafeText(body.ClientSecret, 4096, true) || !lexopenSafeText(body.AccessToken, 8192, true) ||
		!lexopenSafeText(body.RefreshToken, 8192, provider != "github") || !lexopenSafeText(body.Account, 200, false) {
		return oauth.App{}, oauth.Credentials{}, false
	}
	scopes := append([]string(nil), body.Scopes...)
	sort.Strings(scopes)
	want := map[string][]string{"github": {"read:user"}, "dropbox": {"account_info.read", "files.content.read", "files.metadata.read"}}
	if provider == "google" {
		if len(scopes) != 1 || (scopes[0] != "https://www.googleapis.com/auth/drive.readonly" && scopes[0] != "https://www.googleapis.com/auth/drive.metadata.readonly") {
			return oauth.App{}, oauth.Credentials{}, false
		}
	} else if strings.Join(scopes, " ") != strings.Join(want[provider], " ") {
		return oauth.App{}, oauth.Credentials{}, false
	}
	expiry := now.Add(100 * 365 * 24 * time.Hour)
	if body.ExpiresAt != nil {
		if !body.ExpiresAt.After(now) || body.ExpiresAt.After(now.Add(366*24*time.Hour)) || body.RefreshToken == "" {
			return oauth.App{}, oauth.Credentials{}, false
		}
		expiry = body.ExpiresAt.UTC()
	} else if provider != "github" || body.RefreshToken != "" {
		return oauth.App{}, oauth.Credentials{}, false
	}
	app := oauth.App{Provider: provider, Kind: kind, ClientID: body.ClientID, ClientSecret: body.ClientSecret,
		Settings: map[string]string{"oauth_scopes": strings.Join(scopes, " ")}}
	credentials := oauth.Credentials{AccessToken: body.AccessToken, RefreshToken: body.RefreshToken, Expiry: expiry, Account: body.Account}
	return app, credentials, true
}

func lexopenOAuthError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Cache-Control", "no-store")
	reply(w, status, map[string]any{"ok": false, "code": code, "error": "No se pudo completar la conexión de la cuenta."})
}

func (s *Server) handleLexopenEasyOAuth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	address, _, err := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(address)
	provided, bearer := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if err != nil || ip == nil || !ip.IsLoopback() || !bearer || s.token == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(s.token)) != 1 {
		lexopenOAuthError(w, http.StatusForbidden, "oauth_import_forbidden")
		return
	}
	var body lexopenOAuthImport
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32768))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		lexopenOAuthError(w, http.StatusBadRequest, "oauth_import_invalid")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		lexopenOAuthError(w, http.StatusBadRequest, "oauth_import_invalid")
		return
	}
	name := r.PathValue("name")
	app, credentials, valid := body.validate(name, time.Now())
	if !valid {
		lexopenOAuthError(w, http.StatusBadRequest, "oauth_import_invalid")
		return
	}
	if s.fleet.OAuth() == nil {
		lexopenOAuthError(w, http.StatusServiceUnavailable, "oauth_unavailable")
		return
	}
	if err := s.fleet.OAuth().ImportCredentials(name, app, credentials); err != nil {
		lexopenOAuthError(w, http.StatusServiceUnavailable, "oauth_unavailable")
		return
	}
	reply(w, http.StatusOK, map[string]any{"name": name, "kind": body.Kind, "persistent": true, "auto_refresh": body.RefreshToken != ""})
}

func lexopenConnectorTestFailure(w http.ResponseWriter, err error) {
	code, message := "oauth_unavailable", "La cuenta no está disponible temporalmente. Puedes volver a comprobarla."
	if oauth.ReconnectRequired(err) {
		code, message = "oauth_reconnect_required", "La autorización de la cuenta debe renovarse."
	}
	w.Header().Set("Cache-Control", "no-store")
	reply(w, http.StatusOK, map[string]any{"ok": false, "tested": true, "code": code, "error": message})
}
