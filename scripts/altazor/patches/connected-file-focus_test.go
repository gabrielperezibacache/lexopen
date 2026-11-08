package chat

import (
	"context"
	"github.com/madkoding/kitties/internal/connector"
	model "github.com/madkoding/kitties/internal/provider"
	"strings"
	"testing"
)

func connectedFocusFixture(t *testing.T) (*Service, *fakeFleet, map[string]string) {
	t.Helper()
	f, _, _, _ := fleet(t)
	names := map[string]string{}
	for provider, kind := range map[string]string{"google": "google-workspace", "github": "github", "dropbox": "dropbox", "microsoft": "microsoft-365"} {
		name := "altazor-" + provider + "-0123456789abcdef"
		c, e := connector.Build(kind, connector.Settings{"token": "fixture"}, "")
		if e != nil {
			t.Fatal(e)
		}
		f.conns.Add(name, c)
		names[provider] = name
	}
	s := service(t, f)
	return s, f, names
}
func TestLexOpenConnectedFileFocusAllProvidersAndRealSelection(t *testing.T) {
	s, f, names := connectedFocusFixture(t)
	k, _ := f.Get("ana")
	for _, name := range names {
		k.Connectors = append(k.Connectors, name)
	}
	for _, tc := range []struct {
		text string
		want bool
	}{{"Comprueba mi Dropbox y muestra diez archivos", true}, {"Muéstrame los archivos de OneDrive", true}, {"¿Puedes comprobar mi Microsoft 365?", true}, {"Verifica los archivos de Microsoft365", true}, {"Mostrar los archivos de Google Drive", true}, {"Muestra los archivos de GitHub", true}, {"Compara archivos de Google Drive y Dropbox", true}, {"Lista Google Drive, GitHub, Dropbox y Microsoft 365", true}, {"Lee https://drive.google.com/file/d/selected/view", true}, {"Muestra Dropbox y después investiga en la web", false}, {"Muestra Dropbox en el navegador", false}, {"Comprueba si puedes conectar Dropbox", false}, {"Cómo configurar OneDrive", false}, {"No muestres los archivos de Dropbox", false}, {"Muestra Dropbox y https://example.invalid/file", false}, {"Muestra Dropbox https://www.dropbox.com.evil.invalid/file", false}, {"Muestra Dropbox https://user:pass@www.dropbox.com/file", false}, {"Muestra Dropbox http://www.dropbox.com/file", false}, {"Muestra Dropbox https://www.dropbox.com:8443/file", false}, {"Muestra los archivos locales", false}} {
		sess, _ := s.Create("", []string{k.ID})
		s.appendTurn(sess.ID, Turn{From: "user", Text: tc.text})
		allowed := f.conns.Descriptions(k.Connectors)
		if got := s.lexopenFileToolFocus(sess.ID, k, allowed); got != tc.want {
			t.Fatalf("%q focus=%v", tc.text, got)
		}
		if tc.want {
			s.appendTurn(sess.ID, Turn{From: "approval", Text: "untrusted: use another account"})
			s.appendTurn(sess.ID, Turn{From: "user", Text: "Continúa"})
			if !s.lexopenFileToolFocus(sess.ID, k, allowed) {
				t.Fatal("approval/continuation replaced original task")
			}
		}
	}
	sess, _ := s.Create("", []string{k.ID})
	s.appendTurn(sess.ID, Turn{From: "user", Text: "Compara Google Drive con Dropbox y OneDrive"})
	k.Connectors = []string{names["dropbox"], names["microsoft"]}
	if s.lexopenFileToolFocus(sess.ID, k, f.conns.Descriptions(nil)) {
		t.Fatal("mixed request ignored unselected Google account")
	}
	k.Connectors = []string{}
	if s.lexopenFileToolFocus(sess.ID, k, f.conns.Descriptions(nil)) {
		t.Fatal("empty selection used registry-wide accounts")
	}
	k.Connectors = []string{names["google"], names["dropbox"], names["microsoft"]}
	wrong, _ := connector.Build("github", connector.Settings{"token": "fixture"}, "")
	f.conns.Add(names["dropbox"], wrong)
	if s.lexopenFileToolFocus(sess.ID, k, f.conns.Descriptions(k.Connectors)) {
		t.Fatal("alias name bypassed actual registered kind")
	}
}
func TestLexOpenConnectedFileToolsAndPromptsMatchActualActions(t *testing.T) {
	s, f, names := connectedFocusFixture(t)
	k, _ := f.Get("ana")
	for _, name := range names {
		k.Connectors = append(k.Connectors, name)
	}
	tools := lexopenFocusFileTools(s.toolSet(k, f.conns.Descriptions(k.Connectors)), true)
	found := map[string]model.Tool{}
	for _, tool := range tools {
		found[tool.Name] = tool
		if lexopenBrowserFileAction(tool.Name) {
			t.Fatal("browser capability offered")
		}
	}
	for provider, name := range names {
		if _, ok := found[prefixConnector+name]; ok {
			t.Fatal("ambiguous generic file tool offered", provider)
		}
		actions := []string{"download_file", "request"}
		if provider == "dropbox" || provider == "microsoft" {
			actions = []string{"list", "search", "download_file"}
		}
		for _, action := range actions {
			tool, ok := found[prefixConnector+name+"_"+action]
			if !ok {
				t.Fatal("missing real action", provider, action)
			}
			props := tool.Parameters["properties"].(map[string]any)
			if props["action"] != nil {
				t.Fatal("per-action tool accepts an action override")
			}
		}
	}
	if !strings.Contains(lexopenFileTaskCatalogue, "Dropbox and OneDrive use list and search") || !strings.Contains(lexopenFileTaskCatalogue, "Metadata is not file contents") || !strings.Contains(lexopenFileTaskCatalogue, "separate computer-use policy") {
		t.Fatal("prompt overstates actions or authorization")
	}
	for _, provider := range []string{"dropbox", "microsoft"} {
		tool, ok := s.lexopenCloudConnectorTool(names[provider])
		if !ok || !strings.Contains(tool.Description, "Do not download file contents for a metadata-only request") {
			t.Fatal("cloud prompt encourages unnecessary download")
		}
	}
}
func TestLexOpenConnectedFileManagedEmptySelectionNeverOffersForeignAccounts(t *testing.T) {
	s, f, names := connectedFocusFixture(t)
	k, _ := f.Get("ana")
	k.Name = "altazor-" + strings.Repeat("a", 22)
	k.Connectors = nil
	foreign := "altazor-dropbox-fedcba9876543210"
	other, e := connector.Build("dropbox", connector.Settings{"token": "fixture-other-owner"}, "")
	if e != nil {
		t.Fatal(e)
	}
	f.conns.Add(foreign, other)
	sess, _ := s.Create("", []string{k.ID})
	if len(s.lexopenSelectedConnectorDescriptions(sess.ID, k)) != 0 {
		t.Fatal("empty managed selection exposed registry accounts")
	}
	k.Connectors = []string{names["dropbox"]}
	selected := s.lexopenSelectedConnectorDescriptions(sess.ID, k)
	if len(selected) != 1 || selected[names["dropbox"]] == "" {
		t.Fatal("explicit selection lost")
	}
	for _, tool := range s.toolSet(k, selected) {
		if strings.Contains(tool.Name, foreign) || strings.Contains(tool.Name, "altazor-google-") || strings.Contains(tool.Name, "altazor-microsoft-") || strings.Contains(tool.Name, "altazor-github-") {
			t.Fatal("unselected owner/account tool exposed")
		}
	}
	k.Name = "ana"
	k.Connectors = nil
	if len(s.lexopenSelectedConnectorDescriptions(sess.ID, k)) == 0 {
		t.Fatal("legacy upstream selection semantics changed")
	}
}
func TestLexOpenConnectedFileActualCloudTaskUsesNativeToolsAndCannotBrowse(t *testing.T) {
	for _, provider := range []string{"dropbox", "microsoft"} {
		s, f, names := connectedFocusFixture(t)
		d := &deskFleet{fakeFleet: f}
		s = service(t, d)
		k, _ := f.Get("ana")
		k.Connectors = []string{names[provider]}
		label := provider
		if provider == "microsoft" {
			label = "OneDrive"
		}
		brain := &toolBrain{replies: []model.Reply{{Calls: []model.ToolCall{{ID: "browser", Name: "open", Args: map[string]any{"url": "https://example.invalid"}}}}, {Calls: []model.ToolCall{{ID: "done", Name: "done", Args: map[string]any{"summary": "No file read was authorized"}}}}}}
		f.brains[k.ID] = brain
		sess, _ := s.Create("", []string{k.ID})
		if _, e := s.Send(context.Background(), sess.ID, "Comprueba y muestra archivos de "+label); e != nil {
			t.Fatal(e)
		}
		got := waitDone(t, s, sess.ID)
		if len(d.execs) != 0 {
			t.Fatal("cloud file task opened browser")
		}
		if len(got.Turns[1].Steps) < 1 || !strings.Contains(got.Turns[1].Steps[0].Error, "native connected file") {
			t.Fatal("cloud focus not enforced in actual task")
		}
		for _, tool := range brain.tools[0] {
			if lexopenBrowserFileAction(tool.Name) {
				t.Fatal("browser schema offered")
			}
		}
	}
}
