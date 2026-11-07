package connector

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestLexOpenEasyRepositoryPageSurvivesLegacyClippingWithoutClaimingExhaustiveness(t *testing.T){
	old:=httpDo;t.Cleanup(func(){httpDo=old});calls:=0
	rows:=[]map[string]any{{"full_name":"person/first","private":false,"html_url":"https://github.com/person/first","default_branch":"main","ignored_large_description":strings.Repeat("x",20000)},{"full_name":"person/selected","private":false,"html_url":"https://github.com/person/selected","default_branch":"main"},{"full_name":"person/private","private":true}}
	data,_:=json.Marshal(rows)
	httpDo=func(req *http.Request)(*http.Response,error){calls++;if req.URL.Path!="/user/repos"||req.Method!="GET"{t.Fatal("unexpected request")};return &http.Response{StatusCode:200,Header:http.Header{},Body:io.NopCloser(strings.NewReader(string(data)))},nil}
	c,err:=Build("github",Settings{"token":"fixture-token"},"");if err!=nil{t.Fatal(err)}
	r:=NewRegistry();name:="altazor-github-0123456789abcdef";r.Add(name,c)
	result:=r.Call(context.Background(),Call{Name:name,Args:map[string]any{"action":"request","path":"/user/repos","query":map[string]any{"visibility":"public"}}},[]string{name})
	if result.Err!=""||result.OutputTruncated||!strings.Contains(result.Output,"person/selected")||strings.Contains(result.Output,"person/private")||strings.Contains(result.Output,"ignored_large_description")||strings.Contains(result.Output,"fixture-token"){t.Fatalf("page projection lost verified data or leaked fields: %s",result.Err)}
	var page struct{PageOnly bool `json:"page_only"`;Exhaustive bool `json:"exhaustive"`;Items []any `json:"items"`};if json.Unmarshal([]byte(result.Output),&page)!=nil||!page.PageOnly||page.Exhaustive||len(page.Items)!=2||calls!=1{t.Fatal("page was invalid, exhaustive or silently paginated")}
	// An advanced account retains the original clipped response exactly.
	r.Add("advanced-github",c);advanced:=r.Call(context.Background(),Call{Name:"advanced-github",Args:map[string]any{"action":"request","path":"/user/repos"}},[]string{"advanced-github"})
	if advanced.OutputTruncated||len(advanced.Output)>4003||strings.Contains(advanced.Output,"page_only"){t.Fatal("advanced connector behavior changed")}
}

func TestLexOpenEasyDrivePagePreservesIdsAndPaginationButNotUnrequestedFields(t *testing.T){
	ctx,state:=lexopenBeginFileOutput(context.Background(),"altazor-google-0123456789abcdef","google-workspace",map[string]any{"action":"request","path":"/drive/v3/files"});if state==nil{t.Fatal("missing validated context")}
	raw:=[]byte(`{"files":[{"id":"fixture_id","name":"Syllabus.pdf","mimeType":"application/pdf","webViewLink":"https://drive.google.com/file/d/fixture_id/view","secret_extra":"do-not-copy"}],"nextPageToken":"next-page","incompleteSearch":true}`)
	out,ok:=lexopenEasyAPIRead(ctx,"google-workspace","request",map[string]any{"path":"/drive/v3/files"},raw)
	if !ok||!strings.Contains(out,"fixture_id")||!strings.Contains(out,"next-page")||!strings.Contains(out,`"incompleteSearch":true`)||!strings.Contains(out,`"exhaustive":false`)||strings.Contains(out,"do-not-copy"){t.Fatal("Drive page omitted pagination or copied arbitrary fields")}
}

func TestLexOpenEasyTruncationIsExplicitAtEveryBoundary(t *testing.T){
	ctx,state:=lexopenBeginFileOutput(context.Background(),"altazor-github-0123456789abcdef","github",map[string]any{"action":"request","path":"/user/repos","query":map[string]any{"visibility":"public"}})
	out,ok:=lexopenEasyAPIRead(ctx,"github","request",map[string]any{"path":"/user/repos"},[]byte(`[{"full_name":"partial`))
	if !ok||!state.truncated||!strings.Contains(out,"PARTIAL READ PREVIEW"){t.Fatal("invalid/truncated JSON looked complete")}
	bounded,truncated:=lexopenBoundFileOutput(strings.Repeat("é",12000),10000);if !truncated||!strings.Contains(bounded,"PARTIAL RESULT")||strings.ContainsRune(bounded,'�'){t.Fatal("large read lost truncation or broke UTF-8")}
	for _,tc:=range []struct{name,kind string;args map[string]any}{
		{"advanced-github","github",map[string]any{"action":"request","path":"/user/repos"}},
		{"altazor-github-0123456789abcdef","google-workspace",map[string]any{"action":"request","path":"/drive/v3/files"}},
		{"altazor-github-0123456789abcdef","github",map[string]any{"action":"request","path":"/user/repos","method":"POST"}},
	}{_,state:=lexopenBeginFileOutput(context.Background(),tc.name,tc.kind,tc.args);if state!=nil{t.Fatal("unvalidated account gained the easy read result path")}}
}
