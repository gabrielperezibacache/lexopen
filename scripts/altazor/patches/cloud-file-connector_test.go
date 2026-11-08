package connector

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

func cloudResponse(status int, body, location string) *http.Response {
	h := http.Header{}
	if location != "" {
		h.Set("Location", location)
	}
	return &http.Response{StatusCode: status, Header: h, ContentLength: int64(len(body)), Body: io.NopCloser(strings.NewReader(body))}
}
func TestLexOpenCloudFileValidationRejectsWritesAndForeignPaths(t *testing.T) {
	bad := []map[string]any{{"action": "send_mail"}, {"action": "upload"}, {"action": "create_event"}, {"action": "contacts"}, {"action": "request", "path": "/v1.0/me/messages"}, {"action": "request", "method": "DELETE", "path": "/v1.0/me/drive/items/known"}, {"action": "request", "path": "https://graph.microsoft.com/v1.0/me/drive/root/children"}, {"action": "request", "path": "/v1.0/me/drive/items/known/content"}, {"action": "request", "path": "/v1.0/me/drive/items/../messages"}, {"action": "request", "path": "/v1.0/me/drive/root/children", "query": map[string]any{"$select": "@microsoft.graph.downloadUrl"}}, {"action": "download_file", "id": "known", "token": "not-permitted"}, {"action": "download_file", "id": "../other"}, {"action": "download_file", "id": "known", "drive_id": "foreign"}, {"action": "search", "query": "fixture", "body": "unexpected"}}
	old := lexopenCloudHTTPDo
	defer func() { lexopenCloudHTTPDo = old }()
	calls := 0
	lexopenCloudHTTPDo = func(*http.Request) (*http.Response, error) { calls++; return nil, errors.New("must not reach network") }
	c, e := Build("microsoft-365", Settings{"token": "fixture-token", "oauth_lexopen_cloud_files": "v1"}, "")
	if e != nil {
		t.Fatal(e)
	}
	for _, args := range bad {
		if LexOpenValidateCloudFileCall("microsoft-365", args) == nil {
			t.Fatalf("accepted %v", args)
		}
		if _, e := c.Call(context.Background(), args); e == nil {
			t.Fatalf("executed %v", args)
		}
	}
	if calls != 0 {
		t.Fatal("rejected request obtained external data")
	}
	for _, args := range []map[string]any{{"action": "list"}, {"action": "search", "query": "contrato", "limit": "10"}, {"action": "download_file", "id": "01ITEM!FILE", "name": "ficha.pdf"}, {"action": "request", "path": "/v1.0/me/drive/items/known/children", "query": map[string]any{"$top": "10", "$select": "id,name,size"}}} {
		if e := LexOpenValidateCloudFileCall("microsoft-365", args); e != nil {
			t.Fatal(args, e)
		}
	}
	for _, args := range []map[string]any{{"action": "request", "path": "/2/files/delete_v2"}, {"action": "upload", "path": "/file"}, {"action": "read", "path": "https://evil.test/a"}, {"action": "download_file", "path": "/../escape"}} {
		if LexOpenValidateCloudFileCall("dropbox", args) == nil {
			t.Fatal("Dropbox unsafe call accepted")
		}
	}
}
func TestLexOpenMicrosoftDownloadFollowsOnlySafeCDNWithoutBearer(t *testing.T) {
	old := lexopenCloudHTTPDo
	defer func() { lexopenCloudHTTPDo = old }()
	calls := 0
	secretURL := "https://tenant-my.sharepoint.com/personal/fixture/download?tempauth=synthetic-signed-secret"
	lexopenCloudHTTPDo = func(req *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			if req.URL.Path != "/v1.0/me/drive/items/FILE!123/content" || req.Header.Get("Authorization") != "Bearer fixture-token" {
				t.Fatal("incorrect Graph request")
			}
			return cloudResponse(302, "", secretURL), nil
		}
		if calls != 2 || req.URL.String() != secretURL || req.Header.Get("Authorization") != "" {
			t.Fatal("credential forwarded or redirect repeated")
		}
		return cloudResponse(200, "complete original bytes", ""), nil
	}
	c, _ := Build("microsoft-365", Settings{"token": "fixture-token", "oauth_lexopen_cloud_files": "v1"}, "")
	text, name, data, e := c.(Filer).CallFile(context.Background(), map[string]any{"action": "download_file", "id": "FILE!123", "name": "original.txt"})
	if e != nil || name != "original.txt" || string(data) != "complete original bytes" || calls != 2 || strings.Contains(text, "tempauth") || strings.Contains(text, "synthetic-signed-secret") {
		t.Fatal("complete safe download failed", e)
	}
}
func TestLexOpenMicrosoftDownloadRejectsSSRFPartialOversizedAndSecretErrors(t *testing.T) {
	old := lexopenCloudHTTPDo
	defer func() { lexopenCloudHTTPDo = old }()
	for _, target := range []string{"http://tenant.sharepoint.com/a", "https://evil.test/a", "https://tenant.sharepoint.com.evil.test/a", "https://127.0.0.1/a", "https://user:pass@tenant.sharepoint.com/a", "https://tenant.sharepoint.com:444/a", "https://files.1drv.com/a#token=bad", "file:///private/tmp/a"} {
		calls := 0
		lexopenCloudHTTPDo = func(*http.Request) (*http.Response, error) { calls++; return cloudResponse(302, "", target), nil }
		_, e := lexopenSendMicrosoft(context.Background(), request{method: "GET", url: "https://graph.microsoft.com/v1.0/me/drive/items/ID/content", file: "file.txt", headers: bearer("fixture")})
		if e == nil || calls != 1 || strings.Contains(e.Error(), target) {
			t.Fatal("unsafe redirect requested or leaked")
		}
	}
	for _, mode := range []string{"partial", "oversized", "truncated", "provider-error", "loop"} {
		calls := 0
		lexopenCloudHTTPDo = func(*http.Request) (*http.Response, error) {
			calls++
			if mode == "loop" {
				return cloudResponse(302, "", "https://x.files.1drv.com/loop?secret=fixture"), nil
			}
			r := cloudResponse(200, "data", "")
			switch mode {
			case "partial":
				r.StatusCode = 206
			case "oversized":
				r.ContentLength = (4 << 20) + 1
			case "truncated":
				r.ContentLength = 40
			case "provider-error":
				return nil, errors.New("reflected-signed-secret")
			}
			return r, nil
		}
		data, e := lexopenSendMicrosoft(context.Background(), request{method: "GET", url: "https://graph.microsoft.com/v1.0/me/drive/items/ID/content", file: "file.txt", headers: bearer("fixture")})
		if e == nil || data != nil || strings.Contains(e.Error(), "secret") || calls > 3 {
			t.Fatal("incomplete result or unsafe error accepted", mode)
		}
	}
}
func TestLexOpenMicrosoftMetadataOmitsSignedURLsAndDropboxKeepsUnicodeBytes(t *testing.T) {
	text, ok := lexopenCloudRender("microsoft-365", "list", []byte(`{"value":[{"id":"selected","name":"Contrato.pdf","@microsoft.graph.downloadUrl":"signed-secret","file":{"mimeType":"application/pdf"}}],"@odata.nextLink":"opaque-secret"}`))
	if !ok || !strings.Contains(text, "selected") || strings.Contains(text, "secret") || !strings.Contains(text, `"exhaustive":false`) {
		t.Fatal("metadata leak or false exhaustive result")
	}
	old := httpDo
	defer func() { httpDo = old }()
	httpDo = func(req *http.Request) (*http.Response, error) {
		if req.Header.Get("Authorization") != "Bearer fixture-dropbox" || strings.Contains(req.Header.Get("Dropbox-API-Arg"), "ó") {
			t.Fatal("Dropbox authorization or ASCII API arg changed")
		}
		return cloudResponse(200, "original Dropbox bytes", ""), nil
	}
	c, _ := Build("dropbox", Settings{"token": "fixture-dropbox", "oauth_lexopen_cloud_files": "v1"}, "")
	_, name, data, e := c.(Filer).CallFile(context.Background(), map[string]any{"action": "download_file", "path": "/Curso/Resolución.txt"})
	if e != nil || name != "Resolución.txt" || string(data) != "original Dropbox bytes" {
		t.Fatal("Dropbox complete download failed", e)
	}
}
