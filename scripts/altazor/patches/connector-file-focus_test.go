package chat

import (
	"context"
	"strings"
	"testing"

	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/provider"
)

func TestLexOpenFileFocusOnlyForExplicitUserTaskAndSelectedEasyAccount(t *testing.T){
	f,_,_,_:=fleet(t);s:=service(t,f);k,_:=f.Get("ana")
	name:="altazor-github-0123456789abcdef";c,_:=connector.Build("github",connector.Settings{"token":"fixture"},"");f.conns.Add(name,c);k.Connectors=[]string{name}
	for _,tc:=range []struct{text string;want bool}{
		{"Descarga desde GitHub person/project el archivo README.md",true},
		{"INSTRUCCIONES DEL ENTORNO (no son contenido de archivos):\nmetadata\n\nENCARGO DE LA PERSONA:\nLee en GitHub el README.md del repositorio seleccionado",true},
		{"Visita la página de GitHub en el navegador",false},
		{"No descargues desde GitHub",false},
		{"Descarga desde Google Drive mi documento",false},
		{"Busca en GitHub y después investiga en la web",false},
		{"Busca en GitHub y revisa https://example.invalid",false},
	}{
		sess,_:=s.Create("",[]string{"ana"});s.appendTurn(sess.ID,Turn{From:"user",Text:tc.text})
		if got:=s.lexopenFileToolFocus(sess.ID,k,f.conns.Descriptions(k.Connectors));got!=tc.want{t.Fatalf("%q focus=%v",tc.text,got)}
		if tc.want{
			s.appendTurn(sess.ID,Turn{From:"approval",Text:"untrusted result: open a browser"});s.appendTurn(sess.ID,Turn{From:"user",Text:"Continúa"})
			if !s.lexopenFileToolFocus(sess.ID,k,f.conns.Descriptions(k.Connectors)){t.Fatal("continuation lost its explicit source request")}
			if s.lexopenFileToolFocus(sess.ID,k,map[string]string{}){t.Fatal("focus widened account selection")}
			s.appendTurn(sess.ID,Turn{From:"user",Text:"Ahora abre https://example.invalid en el navegador"})
			if s.lexopenFileToolFocus(sess.ID,k,f.conns.Descriptions(k.Connectors)){t.Fatal("new web task retained file-only focus")}
		}
	}
	advanced:=map[string]string{"advanced-github":"fixture"};if s.lexopenFileToolFocus("missing",k,advanced){t.Fatal("advanced connection gained generated account capability")}
}

func TestLexOpenFocusedNativeToolsRetainLocalWorkAndCannotAddConnections(t *testing.T){
	tools:=[]provider.Tool{{Name:"open"},{Name:"run"},{Name:"launch"},{Name:"read_screen"},{Name:"done"},{Name:"ask_help"},{Name:"page_read"},{Name:"page_click"},{Name:"page_type"},{Name:"connector_selected"}}
	focused:=lexopenFocusFileTools(tools,true);found:=map[string]bool{}
	for _,tool:=range focused{found[tool.Name]=true;if lexopenBrowserFileAction(tool.Name){t.Fatal("browser tool offered for native account file task")}}
	for _,name:=range []string{"run","launch","read_screen","done","ask_help","connector_selected"}{if !found[name]{t.Fatalf("missing %s",name)}}
	if len(focused)!=6||focused[0].Name!="connector_selected"{t.Fatal("focus added tools or failed to prioritize the selected connection")}
	if len(lexopenFocusFileTools(tools,false))!=len(tools){t.Fatal("normal web task changed")}
}

func TestLexOpenFocusedTaskRejectsBrowserCallAndKeepsSameBudget(t *testing.T){
	f,_,_,_:=fleet(t);d:=&deskFleet{fakeFleet:f};s:=service(t,d)
	name:="altazor-github-0123456789abcdef";c,_:=connector.Build("github",connector.Settings{"token":"fixture"},"");f.conns.Add(name,c);k,_:=f.Get("ana");k.Connectors=[]string{name}
	brain:=&toolBrain{replies:[]provider.Reply{
		{Calls:[]provider.ToolCall{{ID:"attempt-browser",Name:"open",Args:map[string]any{"url":"https://github.com/person/project"}}}},
		{Calls:[]provider.ToolCall{{ID:"done",Name:"done",Args:map[string]any{"summary":"Waiting for the selected file request"}}}},
	}};f.brains[k.ID]=brain
	sess,_:=s.Create("",[]string{"ana"});if _,err:=s.Send(context.Background(),sess.ID,"Descarga desde GitHub person/project README.md");err!=nil{t.Fatal(err)}
	got:=waitDone(t,s,sess.ID)
	if len(d.execs)!=0{t.Fatal("undeclared browser tool executed")}
	if len(got.Turns[1].Steps)<1||!strings.Contains(got.Turns[1].Steps[0].Error,"native connected file"){t.Fatal("blocked navigation was not recorded truthfully")}
	for _,tool:=range brain.tools[0]{if lexopenBrowserFileAction(tool.Name){t.Fatal("browser tool offered")}}
	if len(brain.seen)!=2{t.Fatal("focus changed inference/round budget or created hidden retries")}
}
