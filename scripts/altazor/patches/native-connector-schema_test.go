package chat

import (
	"context"
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/provider"
)

type lexopenSchemaReadRecorder struct{ calls []map[string]any }
func(r *lexopenSchemaReadRecorder)Describe()string{return "fixture public repository reader"}
func(r *lexopenSchemaReadRecorder)Kind()string{return "github"}
func(r *lexopenSchemaReadRecorder)Call(_ context.Context,args map[string]any)(string,error){r.calls=append(r.calls,args);return "fixture file read completed",nil}

func TestLexOpenNativeEasyConnectionsExposeTypedReadOnlyFileArguments(t *testing.T){
	f,_,_,_:=fleet(t);s:=service(t,f);k,_:=f.Get("ana")
	google:="altazor-google-0123456789abcdef";github:="altazor-github-0123456789abcdef"
	g,_:=connector.Build("google-workspace",connector.Settings{"token":"fixture-never-sent"},"");h,_:=connector.Build("github",connector.Settings{"token":"fixture-never-sent"},"")
	f.conns.Add(google,g);f.conns.Add(github,h);f.conns.Add("advanced-github",h)
	k.Connectors=[]string{google,github,"advanced-github"}
	tools:=s.toolSet(k,f.conns.Descriptions(k.Connectors));found:=map[string]provider.Tool{}
	for _,tool:=range tools{found[tool.Name]=tool}
	for _,name:=range []string{google,github}{
		tool,ok:=found[prefixConnector+name];if !ok{t.Fatal("missing connected account tool")}
		if tool.Parameters["additionalProperties"]!=false{t.Fatal("unknown native arguments permitted")}
		props:=tool.Parameters["properties"].(map[string]any)
		for _,field:=range []string{"action","path","name","query","method"}{if props[field]==nil{t.Fatalf("missing %s for %s",field,name)}}
		if props["token"]!=nil||props["headers"]!=nil||props["body"]!=nil||props["url"]!=nil||props["client_secret"]!=nil{t.Fatal("secret or write arguments exposed")}
		if !reflect.DeepEqual(props["method"].(map[string]any)["enum"],[]string{"GET"}){t.Fatal("native request allowed writes")}
		query:=props["query"].(map[string]any);if query["additionalProperties"]!=false{t.Fatal("unbounded query schema")}
		if name==google{if props["id"]==nil||props["format"]==nil{t.Fatal("Drive file id/export format unavailable")}}else{if props["repo"]==nil||props["ref"]==nil{t.Fatal("GitHub repository arguments unavailable")}}
		encoded,_:=json.Marshal(tool);if strings.Contains(string(encoded),"fixture-never-sent"){t.Fatal("credential appeared in native tool")}
	}
	advanced:=found[prefixConnector+"advanced-github"].Parameters
	if advanced["additionalProperties"]!=nil||advanced["properties"].(map[string]any)["repo"]!=nil{t.Fatal("advanced connection contract changed")}
	// A generated-looking name must also match the actual registered kind.
	f.conns.Add(google,h);if _,ok:=s.lexopenNativeConnectorTool(google);ok{t.Fatal("mismatched native kind accepted")}
}

func TestLexOpenNativeFileCallPreservesArgumentsThroughApproval(t *testing.T){
	f,_,_,_:=fleet(t);s:=service(t,f);k,_:=f.Get("ana")
	name:="altazor-github-0123456789abcdef";c:=&lexopenSchemaReadRecorder{}
	f.conns.Add(name,c);k.Connectors=[]string{name}
	store,err:=approvals.Open(filepath.Join(t.TempDir(),"approvals.json"));if err!=nil{t.Fatal(err)};s.SetApprovals(store)
	sess,err:=s.Create("",[]string{"ana"});if err!=nil{t.Fatal(err)}
	args:=map[string]any{"action":"download_file","repo":"person/project","path":"docs/README.md","ref":"review-branch","name":"repository-readme.md"}
	actions:=fromCalls([]provider.ToolCall{{ID:"native-read-1",Name:prefixConnector+name,Args:args}})
	if len(actions)!=1||actions[0].kind!="connector"||!reflect.DeepEqual(actions[0].args,args){t.Fatal("native arguments were dropped")}
	var turn Turn
	outs:=s.runNonDesktop(context.Background(),sess.ID,actions,k,f.conns.Descriptions(k.Connectors),&turn)
	if len(outs)!=1||len(turn.Approvals)!=1||len(turn.Calls)!=0{t.Fatal("file call did not wait for approval")}
	pending,err:=s.ListApprovals(approvals.Pending);if err!=nil||len(pending)!=1{t.Fatal("missing file approval")}
	if pending[0].Action!="download_file"||pending[0].Connector!=name||pending[0].Kitty!=k.ID||pending[0].Chat!=sess.ID||!reflect.DeepEqual(pending[0].Args,args){t.Fatal("approval changed selected file arguments or scope")}
	if len(c.calls)!=0{t.Fatal("native file call executed before approval")}
	if _,err:=s.DecideApproval(context.Background(),pending[0].ID,true,"",false);err!=nil{t.Fatal(err)}
	if len(c.calls)!=1||!reflect.DeepEqual(c.calls[0],args){t.Fatal("approved connector did not receive the exact native arguments")}
	if _,err:=s.DecideApproval(context.Background(),pending[0].ID,true,"",false);err==nil||len(c.calls)!=1{t.Fatal("approved file call replayed")}
}
