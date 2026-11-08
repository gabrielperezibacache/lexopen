package oauth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
)

var ErrReconnectRequired = errors.New("the account must be connected again")
var ErrUnavailable = errors.New("the account service is temporarily unavailable")

func (m *Manager) Token(ctx context.Context, name string) (string, error) {
	m.credentialMu.Lock()
	defer m.credentialMu.Unlock()
	return m.tokenUnlocked(ctx, name)
}

func (m *Manager) Exchange(ctx context.Context, state, code string) (string, error) {
	m.credentialMu.Lock()
	defer m.credentialMu.Unlock()
	return m.exchangeUnlocked(ctx, state, code)
}

// ImportCredentials serializes an application+credential replacement with every
// refresh. The store performs one atomic write, never two partially saved edits.
func (m *Manager) ImportCredentials(name string, app App, credentials Credentials) error {
	m.credentialMu.Lock()
	defer m.credentialMu.Unlock()
	store, ok := m.store.(interface {
		ImportOAuthCredentials(string, App, Credentials) error
	})
	if !ok {
		return ErrUnavailable
	}
	if err := store.ImportOAuthCredentials(name, app, credentials); err != nil {
		return err
	}
	m.mu.Lock()
	for state, pending := range m.pending {
		if pending.connector == name {
			delete(m.pending, state)
		}
	}
	m.mu.Unlock()
	return nil
}

// refresh rechecks the saved generation while holding the credential lock. A
// rotated token or a new import can never be overwritten by a stale request.
func (m *Manager) refresh(ctx context.Context, name string, previous Credentials) (string, error) {
	m.credentialMu.Lock()
	defer m.credentialMu.Unlock()
	current, err := m.store.OAuthCredentials(name)
	if err != nil {
		return "", err
	}
	if current != previous && current.AccessToken != "" && m.now().Add(time.Minute).Before(current.Expiry) {
		return current.AccessToken, nil
	}
	return m.refreshUnlocked(ctx, name, current)
}

func lexopenPersistentApp(app App) bool { return app.Settings["oauth_lexopen_persistent"] == "v1" }

func lexopenValidateTokenScope(app App, raw any) error {
	if !lexopenPersistentApp(app) || raw == nil {
		return nil
	}
	text, ok := raw.(string)
	if !ok || len(text) > 8192 {
		return ErrReconnectRequired
	}
	parts := strings.FieldsFunc(text, func(r rune) bool { return r == ',' || unicode.IsSpace(r) })
	want := strings.Fields(app.Settings["oauth_scopes"])
	seen := map[string]bool{}
	for _, scope := range parts {
		if seen[scope] {
			return ErrReconnectRequired
		}
		seen[scope] = true
	}
	if len(want) == 0 || len(parts) != len(want) {
		return ErrReconnectRequired
	}
	for _, scope := range want {
		if !seen[scope] {
			return ErrReconnectRequired
		}
	}
	return nil
}

func lexopenTokenFailure(app App, status int, code any) error {
	if !lexopenPersistentApp(app) {
		return nil
	}
	value, _ := code.(string)
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "invalid_grant", "invalid_token", "token_revoked", "access_denied":
		return ErrReconnectRequired
	}
	if status == 401 {
		return ErrReconnectRequired
	}
	return ErrUnavailable
}

// ReconnectRequired is safe to use at an HTTP boundary; it does not expose a
// provider's body, which may contain reflected access or refresh tokens.
func ReconnectRequired(err error) bool {
	return errors.Is(err, ErrReconnectRequired) || strings.HasPrefix(fmt.Sprint(err), "HTTP 401:")
}
