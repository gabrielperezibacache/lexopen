package orchestrator

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/madkoding/kitties/internal/config"
	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/oauth"
)

var lexopenOAuthName = regexp.MustCompile(`^altazor-(google|github|dropbox)-[a-f0-9]{16}$`)

func (m *Manager) ImportOAuthCredentials(name string, app oauth.App, credentials oauth.Credentials) error {
	if !lexopenOAuthName.MatchString(name) {
		return errors.New("invalid managed account")
	}
	return m.lexopenSaveOAuthCredentials(name, &app, credentials)
}

// SaveOAuthCredentials and imports share this commit path. Nothing visible in
// memory, the registry, or an existing settings map changes before persistence.
func (m *Manager) lexopenSaveOAuthCredentials(name string, app *oauth.App, credentials oauth.Credentials) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	current, ok := m.cfg.Connectors[name]
	if !ok {
		return ErrNotFound
	}
	candidate := current
	candidate.Settings = make(map[string]string, len(current.Settings)+8)
	for key, value := range current.Settings {
		candidate.Settings[key] = value
	}
	if app != nil {
		kind, exists := connector.LookupKind(current.Kind)
		prefix := "altazor-" + app.Provider + "-"
		if !exists || current.Kind != app.Kind || kind.OAuth != app.Provider || !strings.HasPrefix(name, prefix) {
			return errors.New("managed account kind does not match")
		}
		candidate.Settings["client_id"] = app.ClientID
		candidate.Settings["client_secret"] = app.ClientSecret
		candidate.Settings["oauth_lexopen_persistent"] = "v1"
		candidate.Settings["oauth_scopes"] = app.Settings["oauth_scopes"]
		delete(candidate.Settings, oauth.KeyAccount)
	}
	credentials.ToSettings(candidate.Settings)
	// A static token would take precedence over the OAuth token source.
	if app != nil || candidate.Settings["oauth_lexopen_persistent"] == "v1" {
		candidate.Token = ""
		delete(candidate.Settings, "token")
		delete(candidate.Settings, connector.TokenSavedAt)
	}
	next := m.overlay
	next.Connectors = make(map[string]config.Connector, len(m.overlay.Connectors)+1)
	for key, value := range m.overlay.Connectors {
		next.Connectors[key] = value
	}
	next.Connectors[name] = candidate
	data, err := json.MarshalIndent(next, "", "  ")
	if err != nil {
		return err
	}
	directory := filepath.Dir(m.settingsPath())
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	file, err := os.CreateTemp(directory, ".oauth-settings-")
	if err != nil {
		return err
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if err := file.Chmod(0o600); err != nil {
		file.Close()
		return err
	}
	if _, err := file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporary, m.settingsPath()); err != nil {
		return err
	}
	// The rename is the commit point; keep memory consistent with the committed
	// file even on filesystems that do not implement directory synchronization.
	if directoryFile, err := os.Open(directory); err == nil {
		_ = directoryFile.Sync()
		_ = directoryFile.Close()
	}
	m.overlay = next
	m.cfg.Connectors[name] = candidate
	m.connectors.Add(name, m.buildConnector(name, candidate))
	return nil
}
