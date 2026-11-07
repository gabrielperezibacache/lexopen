package chat

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/provider"
)

func TestLexOpenPerActionFileToolsRequireTheirTargetsAndDoNotExposeAction(t *testing.T){
	f,_,_,_:=fleet(t);s:=service(t,f);k,_:=f.Get("ana")
	github:="altazor-github-0123456789abcdef";google:="altazor-google-0123456789abcdef"
	h,_:=connector.Build("github",connector.Settings{"token":"fixture"},"");g,_:=connector.Build("google-workspace",connector.Settings{"token":"fixture"},"");f.conns.Add(github,h);f.conns.Add(google,g);k.Connectors=[]string{github,google}
	for _,name:=range []string{github,google}{
		tools:=s.lexopenNativeFileActionTools(name);if len(tools)<2{t.Fatal("missing per-action file tools")}
		for _,tool:=range tools{
			props:=tool.Parameters["properties"].(map[string]any);if props["action"]!=nil{t.Fatal("model can set server-bound action")}
			if strings.HasSuffix(tool.Name,"_download_file"){
				want:=[]string{"id"};if name==github{want=[]string{"repo","path"}}
				if !reflect.DeepEqual(tool.Parameters["required"],want){t.Fatal("download target is optional")}
				if props["state"]!=nil||props["number"]!=nil||props["query"]!=nil{t.Fatal("download tool mixes unrelated arguments")}
			}
		}
	}
	for _,tool:=range lexopenFocusFileTools(s.toolSet(k,f.conns.Descriptions(k.Connectors)),true){if tool.Name==prefixConnector+github||tool.Name==prefixConnector+google{t.Fatal("generic ambiguous account tool offered during file focus")}}
}

func TestLexOpenInvalidFileCallsCreateNoApprovalsAndValidTargetExecutesOnce(t *testing.T){
	f,_,_,_:=fleet(t);s:=service(t,f);k,_:=f.Get("ana")
	name:="altazor-github-0123456789abcdef";other:="altazor-github-fedcba9876543210";reader:=&lexopenSchemaReadRecorder{}
	f.conns.Add(name,reader);f.conns.Add(other,reader);k.Connectors=[]string{name}
	store,err:=approvals.Open(filepath.Join(t.TempDir(),"approvals.json"));if err!=nil{t.Fatal(err)};s.SetApprovals(store)
	sess,_:=s.Create("",[]string{"ana"});allowed:=f.conns.Descriptions(k.Connectors)
	for _,call:=range []provider.ToolCall{
		{ID:"missing",Name:prefixConnector+name+"_download_file",Args:map[string]any{"repo":"person/project","state":"open"}},
		{ID:"conflict",Name:prefixConnector+name+"_download_file",Args:map[string]any{"repo":"person/project","path":"README.md","action":"create_pr"}},
		{ID:"foreign",Name:prefixConnector+other+"_download_file",Args:map[string]any{"repo":"person/project","path":"README.md"}},
		{ID:"unknown",Name:prefixConnector+name+"_delete_file",Args:map[string]any{"repo":"person/project","path":"README.md"}},
		{ID:"generic",Name:prefixConnector+name,Args:map[string]any{"action":"get_file","repo":"person/project","state":"open"}},
	}{
		var turn Turn
		outs:=s.runNonDesktop(context.Background(),sess.ID,s.lexopenFromFileCalls([]provider.ToolCall{call},k,allowed,true),k,allowed,&turn)
		pending,_:=s.ListApprovals(approvals.Pending)
		if len(outs)!=1||outs[0].err==""||len(pending)!=0||len(turn.Approvals)!=0||len(reader.calls)!=0{t.Fatal("invalid call prompted the person or accessed a connector")}
	}
	// Plain-text fallback is validated too, without requesting human correction.
	var invalid Turn
	outs:=s.runNonDesktop(context.Background(),sess.ID,[]action{{kind:"connector",name:name,args:map[string]any{"action":"get_file","repo":"person/project","state":"open"}}},k,allowed,&invalid)
	if len(outs)!=1||!strings.Contains(outs[0].err,"Missing path")||len(invalid.Approvals)!=0{t.Fatal("missing path was not returned to the model before approval")}
	args:=map[string]any{"repo":"person/project","path":"README.md"}
	call:=provider.ToolCall{ID:"valid",Name:prefixConnector+name+"_download_file",Args:args}
	resolved:=s.lexopenFromFileCalls([]provider.ToolCall{call},k,allowed,true)
	if resolved[0].name!=name||resolved[0].args["action"]!="download_file"||args["action"]!=nil{t.Fatal("action was not bound without mutating model arguments")}
	var turn Turn;s.runNonDesktop(context.Background(),sess.ID,resolved,k,allowed,&turn)
	pending,_:=s.ListApprovals(approvals.Pending);if len(pending)!=1||len(reader.calls)!=0{t.Fatal("valid call did not wait for a single approval")}
	if _,err:=s.DecideApproval(context.Background(),pending[0].ID,true,"",false);err!=nil{t.Fatal(err)}
	if len(reader.calls)!=1||reader.calls[0]["path"]!="README.md"||reader.calls[0]["action"]!="download_file"{t.Fatal("approved read lost its exact target")}
	if _,err:=s.DecideApproval(context.Background(),pending[0].ID,true,"",false);err==nil||len(reader.calls)!=1{t.Fatal("approved read replayed")}
}

func TestLexOpenMalformedFileTargetDoesNotAskPerson(t *testing.T){
	f,_,_,_:=fleet(t);s:=service(t,f);k,_:=f.Get("ana")
	name:="altazor-github-0123456789abcdef";c,_:=connector.Build("github",connector.Settings{"token":"fixture-never-used"},"");f.conns.Add(name,c);k.Connectors=[]string{name}
	store,err:=approvals.Open(filepath.Join(t.TempDir(),"approvals.json"));if err!=nil{t.Fatal(err)};s.SetApprovals(store)
	sess,_:=s.Create("",[]string{"ana"});var turn Turn
	outs:=s.runNonDesktop(context.Background(),sess.ID,[]action{{kind:"connector",name:name,args:map[string]any{"action":"get_file","repo":"person/project","state":"open"}}},k,f.conns.Descriptions(k.Connectors),&turn)
	pending,_:=s.ListApprovals(approvals.Pending)
	if len(pending)!=0||len(turn.Approvals)!=0||len(outs)!=1||!strings.Contains(outs[0].err,"Missing path"){t.Fatal("malformed file target asked the person instead of returning a precise local error to the model")}
}
