package connector

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func cloudMetadataFixture(t *testing.T, service, action string, body any) (map[string]any, []any) {
	t.Helper()
	raw, e := json.Marshal(body)
	if e != nil {
		t.Fatal(e)
	}
	text, handled := lexopenCloudRender(service, action, raw)
	if !handled || len(text) > 3500 {
		t.Fatal("metadata not handled/bounded")
	}
	var result map[string]any
	if json.Unmarshal([]byte(text), &result) != nil {
		t.Fatal("metadata not JSON", text)
	}
	if len(result) != 7 || result["schema"] != "lexopen-cloud-metadata.v1" || result["service"] != service || result["action"] != action || result["page_only"] != true || result["exhaustive"] != false {
		t.Fatal("metadata envelope lost source or bounded semantics", result)
	}
	rows, ok := result["items"].([]any)
	if !ok || len(rows) > 50 {
		t.Fatal("invalid item array")
	}
	if _, ok = result["items_truncated"].(bool); !ok {
		t.Fatal("missing truncation flag")
	}
	return result, rows
}
func TestLexOpenCloudMetadataDropboxFolderAndFileTypesAreExplicit(t *testing.T) {
	body := map[string]any{"entries": []any{map[string]any{".tag": "folder", "name": "Carpeta.pdf", "path_display": "/Carpeta.pdf", "size": 42, "preview_url": "https://secret.invalid/fixture", "sharing_info": map[string]any{"secret": "private"}}, map[string]any{".tag": "file", "name": "Documento.PDF", "path_display": "/Curso/Documento.PDF", "size": 1234, "server_modified": "2026-01-02T03:04:05Z", "client_modified": "private-client-time", "id": "secret-id-omitted", "media_info": map[string]any{"secret": "private"}}, map[string]any{"name": "unknown.pdf", "path_lower": "/unknown.pdf", "size": 55}}, "has_more": true, "cursor": "private-cursor"}
	result, rows := cloudMetadataFixture(t, "dropbox", "list", body)
	if len(rows) != 3 || result["items_truncated"] != false {
		t.Fatal("valid page changed")
	}
	folder := rows[0].(map[string]any)
	file := rows[1].(map[string]any)
	unknown := rows[2].(map[string]any)
	if folder["kind"] != "folder" || folder["size"] != nil || folder["mimeType"] != nil || file["kind"] != "file" || file["size"] != float64(1234) || file["modified_at"] != "2026-01-02T03:04:05Z" || unknown["kind"] != "unknown" || unknown["size"] != nil {
		t.Fatal("metadata inferred type from filename/size or lost fields", rows)
	}
	raw, _ := json.Marshal(result)
	for _, secret := range []string{"secret.invalid", "private", "cursor", "has_more", "sharing_info", "secret-id", "client_modified"} {
		if strings.Contains(string(raw), secret) {
			t.Fatal("metadata extra escaped projection")
		}
	}
}
func TestLexOpenCloudMetadataDropboxSearchSupportsTaggedV2AndDirectMetadata(t *testing.T) {
	body := map[string]any{"matches": []any{map[string]any{"metadata": map[string]any{".tag": "metadata", "metadata": map[string]any{".tag": "folder", "name": "Concurso.pdf", "path_display": "/Concurso.pdf"}}, "highlight_spans": []any{"private-highlight"}}, map[string]any{"metadata": map[string]any{".tag": "metadata", "metadata": map[string]any{".tag": "file", "name": "Acta.pdf", "path_lower": "/acta.pdf", "size": 99}}}, map[string]any{"metadata": map[string]any{".tag": "file", "name": "Legacy.pdf", "path_display": "/Legacy.pdf", "size": 100}}, map[string]any{"metadata": map[string]any{".tag": "other"}}, map[string]any{"metadata": map[string]any{".tag": "metadata", "metadata": map[string]any{"name": "Unknown.pdf"}}}}, "cursor": "private-search-cursor", "has_more": true}
	result, rows := cloudMetadataFixture(t, "dropbox", "search", body)
	if len(rows) != 4 || result["items_truncated"] != true {
		t.Fatal("search wrappers lost or hidden dropped row")
	}
	want := []string{"folder", "file", "file", "unknown"}
	for i, row := range rows {
		if row.(map[string]any)["kind"] != want[i] {
			t.Fatal("search type confused", rows)
		}
	}
	raw, _ := json.Marshal(result)
	if strings.Contains(string(raw), "private") || strings.Contains(string(raw), "highlight") {
		t.Fatal("search extra data leaked")
	}
}
func TestLexOpenCloudMetadataCapsRowsAndBytesWithoutClaimingExhaustive(t *testing.T) {
	entries := []any{}
	for i := 0; i < 51; i++ {
		entries = append(entries, map[string]any{".tag": "file", "name": "a.pdf"})
	}
	result, rows := cloudMetadataFixture(t, "dropbox", "list", map[string]any{"entries": entries})
	if len(rows) != 50 || result["items_truncated"] != true {
		t.Fatal("50 item cap not surfaced")
	}
	entries = []any{}
	for i := 0; i < 10; i++ {
		entries = append(entries, map[string]any{".tag": "file", "name": strings.Repeat("x", 650) + ".pdf", "path_display": "/" + strings.Repeat("p", 1400)})
	}
	result, rows = cloudMetadataFixture(t, "dropbox", "list", map[string]any{"entries": entries})
	if len(rows) >= 10 || result["items_truncated"] != true {
		t.Fatal("byte cap not surfaced")
	}
	_, rows = cloudMetadataFixture(t, "dropbox", "list", map[string]any{"entries": []any{}})
	if len(rows) != 0 {
		t.Fatal("empty page invented items")
	}
}
func TestLexOpenCloudMetadataRejectsInvalidScalarTypesAndLinks(t *testing.T) {
	entries := []any{map[string]any{".tag": "file", "name": "negative.pdf", "size": -1, "path_display": "https://private.invalid/file"}, map[string]any{".tag": "file", "name": "fraction.pdf", "size": 1.5, "server_modified": "private-not-date"}, map[string]any{".tag": "file", "name": "huge.pdf", "size": float64(9007199254740992)}, map[string]any{".tag": "folder", "name": "nested/file.pdf"}, map[string]any{".tag": "file", "name": true}, map[string]any{".tag": "file", "name": "control\n.pdf"}}
	result, rows := cloudMetadataFixture(t, "dropbox", "list", map[string]any{"entries": entries})
	if len(rows) != 3 || result["items_truncated"] != true {
		t.Fatal("invalid metadata not omitted")
	}
	for _, row := range rows {
		item := row.(map[string]any)
		if item["size"] != nil || item["modified_at"] != nil || item["path"] != nil {
			t.Fatal("invalid optional scalar projected")
		}
	}
}
func TestLexOpenCloudMetadataMicrosoftKeepsSafeFixtureAndExplicitKinds(t *testing.T) {
	body := map[string]any{"value": []any{map[string]any{"id": "EXACT!123", "name": "Contrato.pdf", "size": 42, "file": map[string]any{"mimeType": "application/pdf"}, "lastModifiedDateTime": "2026-01-02T03:04:05Z", "@microsoft.graph.downloadUrl": "private-signed-url"}, map[string]any{"id": "FOLDER", "name": "Carpeta.pdf", "folder": map[string]any{"childCount": 2}, "size": 9}, map[string]any{"id": "UNKNOWN", "name": "Unknown.pdf", "size": 4}, map[string]any{"id": "CONFLICT", "name": "Conflict.pdf", "file": map[string]any{"mimeType": "application/pdf"}, "folder": map[string]any{}}}, "@odata.nextLink": "private-next"}
	result, rows := cloudMetadataFixture(t, "microsoft-365", "list", body)
	if len(rows) != 4 || result["items_truncated"] != false {
		t.Fatal("MS page changed")
	}
	want := []string{"file", "folder", "unknown", "unknown"}
	for i, row := range rows {
		item := row.(map[string]any)
		if item["kind"] != want[i] || i > 0 && (item["size"] != nil || item["mimeType"] != nil) {
			t.Fatal("MS inferred file or folder", rows)
		}
	}
	raw, _ := json.Marshal(result)
	if strings.Contains(string(raw), "private") || strings.Contains(string(raw), "lastModifiedDateTime") || strings.Contains(string(raw), "childCount") {
		t.Fatal("MS metadata extra escaped")
	}
	_, single := cloudMetadataFixture(t, "microsoft-365", "request", body["value"].([]any)[0])
	if len(single) != 1 || single[0].(map[string]any)["id"] != "EXACT!123" {
		t.Fatal("MS selected metadata request lost")
	}
}
func TestLexOpenCloudMetadataActualDropboxListAndSearchUseOneBoundedRequest(t *testing.T) {
	old := httpDo
	defer func() { httpDo = old }()
	for _, action := range []string{"list", "search"} {
		calls := 0
		httpDo = func(req *http.Request) (*http.Response, error) {
			calls++
			if req.URL.String() != "https://api.dropboxapi.com/2/files/"+map[string]string{"list": "list_folder", "search": "search_v2"}[action] || req.Method != "POST" {
				t.Fatal("metadata request escaped existing endpoint")
			}
			body := `{"entries":[{".tag":"folder","name":"Carpeta.pdf","path_display":"/Carpeta.pdf"},{".tag":"file","name":"Acta.pdf","path_display":"/Acta.pdf","size":123}],"has_more":true,"cursor":"private"}`
			if action == "search" {
				body = `{"matches":[{"metadata":{".tag":"metadata","metadata":{".tag":"file","name":"Acta.pdf","path_display":"/Acta.pdf","size":123}}}],"has_more":true,"cursor":"private"}`
			}
			return cloudResponse(200, body, ""), nil
		}
		c, e := Build("dropbox", Settings{"token": "fixture-only", "oauth_lexopen_cloud_files": "v1"}, "")
		if e != nil {
			t.Fatal(e)
		}
		args := map[string]any{"action": action, "limit": "5"}
		if action == "search" {
			args["query"] = ".pdf"
		}
		out, e := c.Call(context.Background(), args)
		if e != nil || calls != 1 {
			t.Fatal("metadata action failed or paginated", e)
		}
		var envelope map[string]any
		if json.Unmarshal([]byte(out), &envelope) != nil || envelope["schema"] != LexOpenCloudMetadataSchema || strings.Contains(out, "private") {
			t.Fatal("actual action used legacy untyped renderer", out)
		}
	}
}
func TestLexOpenCloudMetadataMalformedResponsesNeverFallbackToPrivateRawData(t *testing.T) {
	for _, service := range []string{"dropbox", "microsoft-365"} {
		for _, body := range []string{`{"private":`, `null`, `{"error":"private-secret"}`, `{"entries":true,"value":true}`} {
			out, handled := lexopenCloudRender(service, "list", []byte(body))
			if !handled || out != "Read response unavailable." || strings.Contains(out, "private") {
				t.Fatal("malformed result leaked/fell back", service, out)
			}
		}
	}
	for _, tc := range []struct{ service, action string }{{"dropbox", "download_file"}, {"dropbox", "request"}, {"google-workspace", "list"}} {
		if _, handled := lexopenCloudRender(tc.service, tc.action, []byte(`{"secret":"private"}`)); handled {
			t.Fatal("nonmetadata contract changed")
		}
	}
}
