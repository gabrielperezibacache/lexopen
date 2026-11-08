package chat

import (
	"github.com/madkoding/kitties/internal/kitty"
	"net/url"
	"regexp"
	"strings"
)

var lexopenDropboxMention = regexp.MustCompile(`\bdropbox\b`)
var lexopenMicrosoftMention = regexp.MustCompile(`\b(?:onedrive|microsoft\s*365)\b`)
var lexopenFileSetupQuestion = regexp.MustCompile(`\b(?:como|instrucciones para|ayuda para|pasos para|si puedo|si podria|si se puede|si puedes)\b.{0,40}\b(?:conectar|configurar|iniciar sesion|autorizar|vincular)\b`)
var lexopenExplicitFileBrowser = regexp.MustCompile(`\b(?:en|usando|con)\s+(?:el|un)\s+(?:navegador|browser)\b`)

func lexopenConnectedFileProvider(name string) string {
	switch {
	case lexopenEasyGoogleName.MatchString(name):
		return "google"
	case lexopenEasyGithubName.MatchString(name):
		return "github"
	case lexopenEasyDropboxName.MatchString(name):
		return "dropbox"
	case lexopenEasyMicrosoftName.MatchString(name):
		return "microsoft"
	}
	return ""
}

// Empty legacy selection means all connectors upstream. A dedicated LexOpen
// desktop has an explicit selection; empty must never disclose another account.
func (s *Service) lexopenSelectedConnectorDescriptions(id string, k *kitty.Kitty) map[string]string {
	if k == nil {
		return map[string]string{}
	}
	described := s.fleet.Connectors().Descriptions(k.Connectors)
	if !s.lexopenManagedComputer(id, k) {
		return described
	}
	selected := map[string]string{}
	for _, name := range k.Connectors {
		if value, ok := described[name]; ok && name != "-" {
			selected[name] = value
		}
	}
	return selected
}
func (s *Service) lexopenConnectedFileRequest(id string) string {
	sess, e := s.Get(id)
	if e != nil {
		return ""
	}
	for i := len(sess.Turns) - 1; i >= 0; i-- {
		if sess.Turns[i].From != "user" {
			continue
		}
		request := lexopenUserFileRequest(sess.Turns[i].Text)
		plain := strings.Trim(lexopenPlainRequest(request), ".!¿? ")
		if plain == "continua" || plain == "continuar" || plain == "sigue" || plain == "continue" {
			continue
		}
		return request
	}
	return ""
}
func lexopenFileURLProvider(host string) string {
	switch strings.ToLower(host) {
	case "github.com", "api.github.com", "raw.githubusercontent.com":
		return "github"
	case "drive.google.com", "docs.google.com", "www.googleapis.com":
		return "google"
	case "dropbox.com", "www.dropbox.com":
		return "dropbox"
	case "onedrive.live.com", "1drv.ms":
		return "microsoft"
	}
	if strings.HasSuffix(strings.ToLower(host), ".sharepoint.com") {
		return "microsoft"
	}
	return ""
}
func (s *Service) lexopenConnectedFileToolFocus(id string, k *kitty.Kitty, allowed map[string]string) bool {
	if k == nil || !k.Desktop {
		return false
	}
	text := s.lexopenConnectedFileRequest(id)
	flat := strings.Trim(lexopenPlainRequest(text), ".!¿? ")
	if !lexopenFileImperative.MatchString(flat) || lexopenExtraWebTask.MatchString(flat) || lexopenExplicitFileBrowser.MatchString(flat) || lexopenFileSetupQuestion.MatchString(flat) {
		return false
	}
	requested := map[string]bool{}
	if lexopenDriveMention.MatchString(flat) {
		requested["google"] = true
	}
	if lexopenGithubMention.MatchString(flat) {
		requested["github"] = true
	}
	if lexopenDropboxMention.MatchString(flat) {
		requested["dropbox"] = true
	}
	if lexopenMicrosoftMention.MatchString(flat) {
		requested["microsoft"] = true
	}
	for _, link := range lexopenExternalURL.FindAllString(text, -1) {
		u, e := url.Parse(strings.TrimRight(link, ",.;"))
		if e != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" && u.Port() != "443" {
			return false
		}
		provider := lexopenFileURLProvider(u.Hostname())
		if provider == "" {
			return false
		}
		requested[provider] = true
	}
	if len(requested) == 0 {
		return false
	}
	selected := map[string]bool{}
	for _, name := range k.Connectors {
		if _, ok := allowed[name]; !ok {
			continue
		}
		provider := lexopenConnectedFileProvider(name)
		if provider == "" {
			continue
		}
		if _, ok := s.lexopenNativeConnectorTool(name); ok {
			selected[provider] = true
		}
	}
	for provider := range requested {
		if !selected[provider] {
			return false
		}
	}
	return true
}
