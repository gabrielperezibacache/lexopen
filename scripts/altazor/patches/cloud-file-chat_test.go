package chat

import (
	"context"
	"github.com/madkoding/kitties/internal/provider"
	"strings"
	"testing"
)

func TestLexOpenCloudStagingExactAccountAndLocalReceiptWithoutModel(t *testing.T) {
	for _, service := range []string{"dropbox", "microsoft"} {
		for _, read := range []bool{false, true} {
			if service == "microsoft" && read {
				continue
			}
			s, d, brain, file, id, body := stagedChatFixture(t)
			k, _ := d.Get(body.Kitty)
			kind := service
			if service == "microsoft" {
				kind = "microsoft-365"
			}
			name := "altazor-" + service + "-0123456789abcdef"
			file.kind = kind
			d.conns.Add(name, file)
			k.Connectors = []string{name}
			body.Connector = name
			body.Args = map[string]any{"path": "/Curso/fixture.txt"}
			if service == "microsoft" {
				body.Args = map[string]any{"id": "EXACT!123", "name": "fixture.txt"}
			}
			if read {
				body.Action = "read"
			}
			body.Text = "Descarga el archivo de " + service
			staged, e := s.StageFileAction(context.Background(), id, body)
			if e != nil || staged.State != "pending" || file.calls != 0 {
				t.Fatal("cloud staging failed or executed early", service, e)
			}
			ap, e := s.DecideApproval(context.Background(), staged.ApprovalID, true, "", false)
			if e != nil || ap.StructuredReceipt == nil || ap.StructuredReceipt.Kind != kind || ap.StructuredReceipt.Connector != name || ap.StructuredReceipt.Action != body.Action || ap.StructuredReceipt.FirstLine != "Primera línea jurídica" || file.calls != 1 || len(brain.seen) != 0 {
				t.Fatal("missing verified cloud local receipt", service, e)
			}
			if _, e = s.DecideApproval(context.Background(), staged.ApprovalID, true, "", false); e == nil || file.calls != 1 {
				t.Fatal("cloud approval replayed")
			}
		}
	}
}
func TestLexOpenCloudSchemasAndApprovalRejectWrongNamespace(t *testing.T) {
	s, d, _, file, id, body := stagedChatFixture(t)
	k, _ := d.Get(body.Kitty)
	name := "altazor-microsoft-0123456789abcdef"
	file.kind = "microsoft-365"
	d.conns.Add(name, file)
	k.Connectors = []string{name}
	body.Connector = name
	body.Args = map[string]any{"id": "selected"}
	tool, ok := s.lexopenNativeConnectorTool(name)
	if !ok || tool.Parameters["additionalProperties"] != false {
		t.Fatal("missing narrow native schema")
	}
	props := tool.Parameters["properties"].(map[string]any)
	for _, field := range []string{"token", "client_secret", "headers", "body", "url", "drive_id"} {
		if props[field] != nil {
			t.Fatal("unsafe field surfaced")
		}
	}
	tools := s.lexopenNativeFileActionTools(name)
	if len(tools) != 3 {
		t.Fatal("missing per-action cloud schema")
	}
	calls := s.lexopenFromFileCalls([]provider.ToolCall{{Name: prefixConnector + name + "_download_file", Args: map[string]any{"id": "selected"}}}, k, d.conns.Descriptions(k.Connectors), true)
	if len(calls) != 1 || calls[0].name != name || calls[0].args["action"] != "download_file" {
		t.Fatal("native call lost exact account/action")
	}
	for _, other := range []string{"altazor-microsoft-fedcba9876543210", "altazor-microsoft-0123456789abcdef_download_file", "altazor-microsoft-bad"} {
		body.Connector = other
		if _, e := s.StageFileAction(context.Background(), id, body); e == nil {
			t.Fatal("foreign account staged")
		}
	}
	body.Connector = name
	body.Args = map[string]any{"id": "selected", "method": "DELETE"}
	if _, e := s.StageFileAction(context.Background(), id, body); e == nil {
		t.Fatal("write fields staged")
	}
	s.mu.Lock()
	s.sessions[id].Turns = []Turn{{From: "user", Text: "Descarga el contrato desde OneDrive"}}
	s.mu.Unlock()
	if !s.lexopenFileToolFocus(id, k, d.conns.Descriptions(k.Connectors)) {
		t.Fatal("OneDrive file focus absent")
	}
	k.Connectors = []string{"-"}
	if s.lexopenFileToolFocus(id, k, d.conns.Descriptions(k.Connectors)) {
		t.Fatal("focus widened selected account")
	}
	if strings.Contains(tool.Description, "fixture-private") {
		t.Fatal("private data leaked")
	}
}
