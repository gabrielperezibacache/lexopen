package oauth

import (
	"strings"
)

func LexOpenMicrosoftFileScopes(raw []string) ([]string, bool) {
	seen := map[string]bool{}
	for _, value := range raw {
		scope := strings.ToLower(value)
		scope = strings.TrimPrefix(scope, "https://graph.microsoft.com/")
		if seen[scope] || scope != "offline_access" && scope != "files.read" && scope != "user.read" {
			return nil, false
		}
		seen[scope] = true
	}
	if !seen["files.read"] || !seen["user.read"] {
		return nil, false
	}
	return []string{"Files.Read", "User.Read"}, true
}
func lexopenCloudProvider(p Provider, app App) Provider {
	if app.Provider == "microsoft" && app.Settings["oauth_public_client"] == "true" {
		p.Scopes = []string{"offline_access", "User.Read", "Files.Read"}
	}
	return p
}
