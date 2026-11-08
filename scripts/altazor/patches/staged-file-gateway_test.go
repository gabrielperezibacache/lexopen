package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/madkoding/kitties/internal/chat"
	"github.com/madkoding/kitties/internal/kitty"
)

type lexopenStagedChats struct{*lexopenAsyncChats;stageCalls int;stageErr error;last chat.StagedFileAction;chatID string}
func(c *lexopenStagedChats)StageFileAction(_ context.Context,id string,body chat.StagedFileAction)(chat.StagedFileActionResult,error){c.stageCalls++;c.last=body;c.chatID=id;if c.stageErr!=nil{return chat.StagedFileActionResult{},c.stageErr};return chat.StagedFileActionResult{State:"pending",ApprovalID:"exact-approval",RequestID:body.RequestID},nil}
func stagedGatewayFixture()(*Server,*lexopenStagedChats){c:=&lexopenStagedChats{lexopenAsyncChats:&lexopenAsyncChats{fakeChats:&fakeChats{sessions:map[string]*chat.Session{}}}};return New(&fakeFleet{kitties:map[string]*kitty.Kitty{}},c,"fixture-token","fixture"),c}
func stagedGatewayBody()map[string]any{return map[string]any{"request_id":"exact-request","kitty":"owned","connector":"altazor-google-0123456789abcdef","action":"download_file","args":map[string]any{"id":"user-exact-id"},"text":"Descarga el archivo que seleccioné."}}

func TestLexOpenStagedFileGatewayCapabilityAndSafePendingReceipt(t *testing.T){
	s,c:=stagedGatewayFixture();r:=httptest.NewRecorder();req:=httptest.NewRequest("GET","/v1/health",nil);s.ServeHTTP(r,req)
	var health map[string]any;json.Unmarshal(r.Body.Bytes(),&health);if health["lexopen_staged_file_actions"]!="v1"{t.Fatal("missing concrete capability")}
	r=lexopenOAuthRequest(s,"/v1/lexopen/chats/exact-chat/file-actions",stagedGatewayBody(),"127.0.0.1:1234","fixture-token")
	var result map[string]any;json.Unmarshal(r.Body.Bytes(),&result)
	if r.Code!=http.StatusOK||len(result)!=3||result["state"]!="pending"||result["approval_id"]!="exact-approval"||result["request_id"]!="exact-request"||c.stageCalls!=1||c.chatID!="exact-chat"||c.last.Text!="Descarga el archivo que seleccioné."{t.Fatal("lost stage binding or leaked unrelated data")}
	if r.Header().Get("Cache-Control")!="no-store"{t.Fatal("pending action may be cached")}
}

func TestLexOpenStagedFileGatewayBoundaryAndNoLegacyFallback(t *testing.T){
	for _,tc:=range []struct{remote,token string;body any;want int}{
		{"127.0.0.1:1234","",stagedGatewayBody(),401},
		{"192.0.2.1:1234","fixture-token",stagedGatewayBody(),403},
		{"127.0.0.1:1234","wrong",stagedGatewayBody(),401},
		{"127.0.0.1:1234","fixture-token",`{"request_id":"x","token":"forbidden"}`,400},
		{"127.0.0.1:1234","fixture-token",`{} {}`,400},
		{"127.0.0.1:1234","fixture-token",strings.Repeat("x",33000),400},
	}{s,c:=stagedGatewayFixture();r:=lexopenOAuthRequest(s,"/v1/lexopen/chats/exact-chat/file-actions",tc.body,tc.remote,tc.token);if r.Code!=tc.want||c.stageCalls!=0{t.Fatal("untrusted or malformed request reached service")}}
	legacy:=New(&fakeFleet{kitties:map[string]*kitty.Kitty{}},&fakeChats{},"fixture-token","fixture");r:=lexopenOAuthRequest(legacy,"/v1/lexopen/chats/exact-chat/file-actions",stagedGatewayBody(),"127.0.0.1:1234","fixture-token");if r.Code!=503{t.Fatal("unsupported gateway fell back to inference")}
}

func TestLexOpenStagedFileGatewaySanitizesErrorsAndClassifiesConflicts(t *testing.T){
	for _,tc:=range []struct{err error;status int;code string}{{chat.ErrAsyncConflict,409,"file_action_conflict"},{chat.ErrBusy,409,"file_action_busy"},{chat.ErrStagedFileInvalid,400,"file_action_invalid"},{errors.New("DO_NOT_EXPOSE_PROVIDER_SECRET"),503,"file_action_unavailable"}}{
		s,c:=stagedGatewayFixture();c.stageErr=tc.err;r:=lexopenOAuthRequest(s,"/v1/lexopen/chats/exact-chat/file-actions",stagedGatewayBody(),"127.0.0.1:1234","fixture-token");var out map[string]any;json.Unmarshal(r.Body.Bytes(),&out);if r.Code!=tc.status||out["code"]!=tc.code||strings.Contains(r.Body.String(),"DO_NOT_EXPOSE"){t.Fatal("incorrect classification or unsanitized error")}
	}
}
