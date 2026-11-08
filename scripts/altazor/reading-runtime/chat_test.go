package chat

import (
	"context"
	"github.com/madkoding/kitties/internal/kitty"
	"strings"
	"testing"
)

type lexopenReaderRunner struct {
	output      string
	screenshots int
}

func (r *lexopenReaderRunner) Exec(context.Context, string, ...string) (string, error) {
	return r.output, nil
}
func (r *lexopenReaderRunner) Screenshot(context.Context, string) ([]byte, error) {
	r.screenshots++
	return nil, nil
}
func TestLexOpenSemanticReadingBeforeScreenshot(t *testing.T) {
	runner := &lexopenReaderRunner{output: `{"version":"v1","source":"browser","text":"synthetic page","items":[]}`}
	message, ok := lexopenSemanticReading(context.Background(), func(ctx context.Context) (string,error) { return runner.Exec(ctx,"fixture","lexopen-read","browser") })
	if !ok || runner.screenshots != 0 || !strings.Contains(message.Content, "synthetic page") {
		t.Fatal("DOM was not used before images")
	}
	runner.output = `not a semantic reading`
	if _, ok := lexopenSemanticReading(context.Background(), func(ctx context.Context) (string,error) { return runner.Exec(ctx,"fixture","lexopen-read","browser") }); ok {
		t.Fatal("malformed reading suppressed screenshot fallback")
	}
	service := &Service{}
	found := false
	for _, tool := range service.toolSet(&kitty.Kitty{Desktop: true}, nil) {
		if tool.Name == "document_read" {
			found = true
		}
	}
	if !found {
		t.Fatal("document_read is not available to the model")
	}
}
