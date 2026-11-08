package connector

import (
	"net/http"
	"testing"
)

func TestLexOpenEasyFilePreflightNeverMakesHTTPRequests(t *testing.T){
	old:=httpDo;t.Cleanup(func(){httpDo=old});calls:=0
	httpDo=func(*http.Request)(*http.Response,error){calls++;t.Fatal("preflight made an HTTP request");return nil,nil}
	for _,tc:=range []struct{kind string;args map[string]any;valid bool}{
		{"github",map[string]any{"action":"get_file","repo":"person/project","state":"open"},false},
		{"github",map[string]any{"action":"download_file","repo":"person/project"},false},
		{"github",map[string]any{"action":"download_file","repo":"person/project","path":"README.md"},true},
		{"github",map[string]any{"action":"download_file","repo":"person/project","path":"../outside"},false},
		{"github",map[string]any{"action":"get_file","repo":"person/project","path":"README.md","state":"open"},false},
		{"github",map[string]any{"action":"get_file","repo":"person/project","path":".gitignore"},true},
		{"google-workspace",map[string]any{"action":"download_file","name":"syllabus.pdf"},false},
		{"google-workspace",map[string]any{"action":"download_file","id":"selected_file","format":"text"},true},
		{"google-workspace",map[string]any{"action":"request","path":"/drive/v3/files","query":map[string]any{"pageSize":20,"q":"trashed = false"}},true},
		{"google-workspace",map[string]any{"action":"request","path":"/drive/v3/files","method":"POST"},false},
		{"google-workspace",map[string]any{"action":"request","path":"/drive/v3/files","query":map[string]any{"access_token":"fixture-never-send"}},false},
		{"google-workspace",map[string]any{"action":"request","path":"/gmail/v1/users/me/messages"},false},
		{"github",map[string]any{"action":"request","path":"/user/repos","query":map[string]any{"visibility":"public","per_page":20}},true},
		{"github",map[string]any{"action":"request","path":"/user/repos","query":map[string]any{"visibility":"private"}},false},
		{"github",map[string]any{"action":"request","path":"/repos/person/project/contents/docs"},true},
		{"github",map[string]any{"action":"request","path":"/repos/person/project/contents/%2e%2e/private"},false},
		{"github",map[string]any{"action":"request","path":"https://api.github.com/user/repos"},false},
		{"github",map[string]any{"action":"create_pr","repo":"person/project"},false},
	}{
		err:=LexOpenValidateEasyFileCall(tc.kind,tc.args);if (err==nil)!=tc.valid{t.Fatalf("kind=%s action=%v valid=%v err=%v",tc.kind,tc.args["action"],tc.valid,err)}
	}
	if calls!=0{t.Fatal("preflight must stay local")}
}
