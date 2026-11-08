package chat

import (
	"strings"
	"testing"
	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/connector"
)

func TestLexOpenReadableResultPreservesUpstreamTruncation(t *testing.T){
	args:=map[string]any{"action":"request","path":"/user/repos","query":map[string]any{"visibility":"public"}}
	ap:=&approvals.Approval{Connector:"altazor-github-0123456789abcdef",Kind:"github",Action:"request",Args:args}
	text,ok:=lexopenReadableFileApproval(ap,connector.Result{Kind:"github",Output:"partial response",OutputTruncated:true})
	if !ok||!strings.Contains(text,`truncated="true"`)||!strings.Contains(text,"partial response"){t.Fatal("upstream truncation was hidden by the readable wrapper")}
}
