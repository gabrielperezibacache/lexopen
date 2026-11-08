package oauth

import (
 "strings"
 "unicode"
 "unicode/utf8"
)

// Only the provider-bound, expiring application import opts into this contract.
// Legacy static/non-expiring GitHub accounts retain their original behavior.
func lexopenGitHubPersistent(app App) bool {
 return app.Provider=="github" && app.Kind=="github" && lexopenPersistentApp(app) && app.Settings["oauth_lexopen_github_refresh"]=="v1"
}
func lexopenGitHubProvider(p Provider, app App) Provider {
 if lexopenGitHubPersistent(app) {p.Scopes=[]string{"read:user"};p.NoExpiry=false}
 return p
}
func lexopenGitHubTokenText(value string) bool {
 return value!="" && len(value)<=8192 && utf8.ValidString(value) && strings.TrimSpace(value)==value && !strings.ContainsFunc(value,unicode.IsControl)
}
func lexopenGitHubTokenReply(app App, values map[string]string, access,refresh,tokenType string,expires int,scope any) error {
 if !lexopenGitHubPersistent(app) {return nil}
 if app.Settings["oauth_scopes"]!="read:user" || app.ClientID=="" || (app.Settings["oauth_public_client"]=="true" && app.ClientSecret!="") || (app.Settings["oauth_public_client"]!="true" && app.ClientSecret=="") {return ErrReconnectRequired}
 if !lexopenGitHubTokenText(access)||!lexopenGitHubTokenText(refresh)||!strings.EqualFold(tokenType,"bearer")||expires<60||expires>366*24*60*60 {return ErrReconnectRequired}
 if values["grant_type"]=="refresh_token" && (values["scope"]!=""||values["refresh_token"]==""||refresh==values["refresh_token"]) {return ErrReconnectRequired}
 text,ok:=scope.(string);if !ok||text!="read:user" {return ErrReconnectRequired}
 return nil
}
