package connector

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"testing/iotest"
)

func TestLexOpenSelectedFileReadsUseOfficialEndpointsAndKeepCompleteBytes(t *testing.T) {
	old := httpDo
	t.Cleanup(func(){ httpDo = old })
	calls := 0
	httpDo = func(req *http.Request) (*http.Response, error) {
		calls++
		if req.Method != "GET" || req.Header.Get("Authorization") != "Bearer fixture-read-token" { t.Fatal("not a signed read") }
		switch calls {
		case 1:
			if req.URL.String() != "https://www.googleapis.com/drive/v3/files/fixture_123?alt=media" { t.Fatal("unexpected Drive download") }
		case 2:
			if req.URL.Path != "/drive/v3/files/fixture_123/export" || req.URL.Query().Get("mimeType") != "text/plain" { t.Fatal("unexpected Google document export") }
		case 3:
			if req.URL.Path != "/repos/person/project/contents/docs/Café.md" || req.URL.Query().Get("ref") != "main" || req.Header.Get("Accept") != "application/vnd.github.raw+json" { t.Fatal("unexpected GitHub read") }
		default: t.Fatal("unexpected external request")
		}
		return &http.Response{StatusCode:200, Header:http.Header{}, Body:io.NopCloser(strings.NewReader("fixture complete bytes")), ContentLength:22}, nil
	}
	google, _ := Build("google-workspace", Settings{"token":"fixture-read-token"}, "")
	github, _ := Build("github", Settings{"token":"fixture-read-token"}, "")
	for _, tc := range []struct{ c Connector; args map[string]any; name string }{
		{google, map[string]any{"action":"download_file", "id":"fixture_123", "name":"Resolución.pdf"}, "Resolución.pdf"},
		{google, map[string]any{"action":"download_file", "id":"fixture_123", "format":"text"}, "drive-document.txt"},
		{github, map[string]any{"action":"download_file", "repo":"person/project", "path":"docs/Café.md", "ref":"main"}, "Café.md"},
	} {
		text, name, data, err := tc.c.(Filer).CallFile(context.Background(), tc.args)
		if err != nil || name != tc.name || string(data) != "fixture complete bytes" || !strings.Contains(text, "sha256=") || !strings.Contains(text,"22 bytes") || strings.Contains(text,"fixture-read-token") { t.Fatalf("file contract: %v %q %q", err, name, text) }
	}
	if calls != 3 { t.Fatal("missing reads") }
}

func TestLexOpenFileReadsRejectUnreviewableTargetsBeforeNetworking(t *testing.T) {
	old := httpDo
	t.Cleanup(func(){ httpDo = old })
	httpDo = func(*http.Request) (*http.Response, error) { t.Fatal("invalid target reached network"); return nil, nil }
	google, _ := Build("google-workspace", Settings{"token":"fixture"}, "")
	github, _ := Build("github", Settings{"token":"fixture"}, "")
	for _, args := range []map[string]any{
		{"action":"download_file", "id":"../other"},
		{"action":"download_file", "id":"fixture", "format":"html"},
		{"action":"download_file", "id":"fixture", "name":"../outside.pdf"},
		{"action":"download_file", "id":"fixture", "name":".bashrc"},
	} { if _, _, _, err := google.(Filer).CallFile(context.Background(), args); err == nil { t.Fatal("accepted unsafe Drive read") } }
	for _, args := range []map[string]any{
		{"action":"download_file", "repo":"person/../project", "path":"README.md"},
		{"action":"download_file", "repo":"person/project", "path":"../outside"},
		{"action":"download_file", "repo":"person/project", "path":"docs/%2e%2e/outside"},
		{"action":"download_file", "repo":"person/project", "path":"README.md", "name":"x\nignored"},
	} { if _, _, _, err := github.(Filer).CallFile(context.Background(), args); err == nil { t.Fatal("accepted unsafe GitHub read") } }
}

func TestLexOpenFileReadsNeverKeepPartialOrOversizedFiles(t *testing.T) {
	old := httpDo
	t.Cleanup(func(){ httpDo = old })
	google, _ := Build("google-workspace", Settings{"token":"fixture"}, "")
	for _, tc := range []struct{ status int; size int64; body io.Reader }{
		{206, 3, strings.NewReader("abc")},
		{200, (4<<20)+1, strings.NewReader("abc")},
		{200, 10, strings.NewReader("abc")},
		{200, -1, strings.NewReader(strings.Repeat("x", (4<<20)+1))},
		{200, -1, iotest.ErrReader(io.ErrUnexpectedEOF)},
	} {
		httpDo = func(*http.Request) (*http.Response, error) { return &http.Response{StatusCode:tc.status, Header:http.Header{}, ContentLength:tc.size, Body:io.NopCloser(tc.body)}, nil }
		if text, name, data, err := google.(Filer).CallFile(context.Background(), map[string]any{"action":"download_file", "id":"fixture"}); err == nil || name != "" || len(data) != 0 || text != "" { t.Fatal("partial file became an artifact") }
	}
}
