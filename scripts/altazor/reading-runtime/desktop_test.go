package desktop

import (
	"context"
	"reflect"
	"strings"
	"testing"
)

func TestLexOpenBoundedReading(t *testing.T) {
	argv, err := Argv(Action{Name: "page_read", Args: map[string]any{"offset": 9000.0, "query": "a; $(ignored)", "elementOffset": 60.0}})
	if err != nil || !reflect.DeepEqual(argv, []string{"lexopen-read", "browser", "--offset=9000", "--element-offset=60", "--query=a; $(ignored)"}) {
		t.Fatalf("bounded browser args: %v %v", argv, err)
	}
	for _, path := range []string{"../secret", "/etc/passwd", ".browser/Cookies", "uploads/../secret", "uploads/.env", "a\\b"} {
		if _, err := Argv(Action{Name: "document_read", Args: map[string]any{"path": path}}); err == nil {
			t.Fatalf("accepted unsafe path %q", path)
		}
	}
	if _, err := Argv(Action{Name: "page_read", Args: map[string]any{"offset": 1.5}}); err == nil {
		t.Fatal("accepted fractional offset")
	}
	if _, err := Argv(Action{Name: "page_read", Args: map[string]any{"limit": 12001.0}}); err == nil {
		t.Fatal("accepted unbounded read")
	}
	if (Action{Name: "document_read"}).Visual() {
		t.Fatal("document read requested a screenshot")
	}
	out, err := Run(context.Background(), &fakeRunner{out: strings.Repeat("x", 18000)}, "fixture", Action{Name: "document_read", Args: map[string]any{"path": "uploads/fixture.pdf"}})
	if err != nil || len(out) != 18000 {
		t.Fatalf("semantic JSON was cut: %d %v", len(out), err)
	}
}
