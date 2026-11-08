package gateway

import (
	"context"
	"github.com/madkoding/kitties/internal/kitty"
	"net/http/httptest"
	"strings"
	"testing"
)

type lexopenReadingFleet struct {
	*fakeFleet
	argv []string
}

func (f *lexopenReadingFleet) Exec(_ context.Context, _ string, argv ...string) (string, error) {
	f.argv = argv
	return `{"version":"v1","source":"browser","redacted":true,"text":"fixture"}`, nil
}
func TestLexOpenSemanticReadUsesFixedContainerHelper(t *testing.T) {
	f := &lexopenReadingFleet{fakeFleet: &fakeFleet{kitties: map[string]*kitty.Kitty{"fixture": {ID: "fixture", Desktop: true}}}}
	server := &Server{fleet: f}
	request := httptest.NewRequest("POST", "/v1/kitties/fixture/read", strings.NewReader(`{"source":"browser","query":"needle"}`))
	request.SetPathValue("ref", "fixture")
	response := httptest.NewRecorder()
	server.handleLexopenRead(response, request)
	if response.Code != 200 || len(f.argv) != 3 || f.argv[0] != "lexopen-read" || f.argv[1] != "browser" || f.argv[2] != "--query=needle" {
		t.Fatalf("reader: status=%d argv=%v", response.Code, f.argv)
	}
	f.argv = nil
	request = httptest.NewRequest("POST", "/v1/kitties/fixture/read", strings.NewReader(`{"source":"document","path":"../private"}`))
	request.SetPathValue("ref", "fixture")
	response = httptest.NewRecorder()
	server.handleLexopenRead(response, request)
	if response.Code != 400 || f.argv != nil {
		t.Fatal("unsafe document path reached container")
	}
}
