package chat

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/kitty"
)

const StagedFileActionsVersion="v1"
var ErrStagedFileInvalid=errors.New("the requested file action is not valid")
var ErrStagedFileUnavailable=errors.New("the file action could not be saved safely")

type StagedFileAction struct{
	RequestID string `json:"request_id"`
	Kitty string `json:"kitty"`
	Connector string `json:"connector"`
	Action string `json:"action"`
	Args map[string]any `json:"args"`
	Text string `json:"text,omitempty"`
}
type StagedFileActionResult struct{
	State string `json:"state"`
	ApprovalID string `json:"approval_id"`
	RequestID string `json:"request_id"`
}

func stagedFileState(ap *approvals.Approval)StagedFileActionResult{
	state:="pending"
	if ap.Status==approvals.Rejected{state="rejected"}else if ap.StructuredReceipt!=nil{state="desktop_verified"}else if ap.Error!=""{state="failed"}else if ap.Status==approvals.Approved{state="unknown"}
	return StagedFileActionResult{State:state,ApprovalID:ap.ID,RequestID:ap.RequestID}
}

// StageFileAction does not call a model or an external service. It only binds an
// exact, validated read to one native user turn and the existing approval gate.
func(s *Service)StageFileAction(ctx context.Context,id string,body StagedFileAction)(StagedFileActionResult,error){
	if ctx.Err()!=nil{return StagedFileActionResult{},ErrStagedFileUnavailable}
	if !asyncIdentifier.MatchString(id)||!asyncIdentifier.MatchString(body.RequestID)||body.Action!="download_file"||body.Kitty==""||!utf8.ValidString(body.Text)||len(body.Text)>16000||len(body.Args)>5{return StagedFileActionResult{},ErrStagedFileInvalid}
	k,err:=s.fleet.Get(body.Kitty);if err!=nil||k.ID!=body.Kitty||!k.Desktop||k.Status!=kitty.StatusRunning{return StagedFileActionResult{},ErrStagedFileInvalid}
	google,github:=lexopenEasyGoogleName.MatchString(body.Connector),lexopenEasyGithubName.MatchString(body.Connector)
	if !google&&!github{return StagedFileActionResult{},ErrStagedFileInvalid}
	args:=map[string]any{"action":"download_file"};for key,value:=range body.Args{if key=="action"{return StagedFileActionResult{},ErrStagedFileInvalid};args[key]=value}
	a:=action{kind:"connector",name:body.Connector,args:args}
	if s.lexopenPreflightEasyFile(k,a)!=nil{return StagedFileActionResult{},ErrStagedFileInvalid}
	c,registered:=s.fleet.Connectors().Get(body.Connector);kinder,typed:=c.(connector.Kinder);if !registered||!typed{return StagedFileActionResult{},ErrStagedFileInvalid};kind:=kinder.Kind()
	if s.approvals==nil{return StagedFileActionResult{},ErrStagedFileUnavailable}
	lock:=s.lockFor(id);lock.Lock();defer lock.Unlock()
	s.mu.Lock();defer s.mu.Unlock()
	sess,exists:=s.sessions[id];if !exists||len(sess.Members)!=1||sess.Members[0]!=k.ID{return StagedFileActionResult{},ErrStagedFileInvalid}
	if sess.Working()||s.tasks[id]!=nil{return StagedFileActionResult{},ErrBusy}
	bound:=struct{Chat,Kitty,Connector,Action,Text,Goal string;Args map[string]any}{id,k.ID,body.Connector,body.Action,body.Text,sess.Goal,args}
	raw,_:=json.Marshal(bound);sum:=sha256.Sum256(raw);hash:=hex.EncodeToString(sum[:])
	verdict:=s.approvals.Check(k.ID,body.Connector,body.Action,connector.RiskOfCall(kind,args).String(),k.Approvals,s.demandOf(k))
	if verdict.Blocked{return StagedFileActionResult{},ErrStagedFileInvalid}
	ap,err:=s.approvals.RequestFileAction(approvals.Approval{Kitty:k.ID,KittyName:k.Name,Connector:body.Connector,Kind:kind,Action:body.Action,Args:args,Summary:approvals.Summarise(body.Connector,body.Action,args),Risk:connector.RiskOfCall(kind,args).String(),Chat:id,Goal:sess.Goal,RequestID:body.RequestID,RequestHash:hash})
	if errors.Is(err,approvals.ErrFileActionConflict){return StagedFileActionResult{},ErrAsyncConflict};if err!=nil{return StagedFileActionResult{},ErrStagedFileUnavailable}
	if ap.FileStageReady{return stagedFileState(ap),nil}
	found:=false;for _,turn:=range sess.Turns{if turn.FileRequestID==body.RequestID{found=true;break}}
	if !found{
		text:=strings.TrimSpace(body.Text);if text==""{text="Descargar el archivo seleccionado."}
		candidate:=*sess;candidate.Turns=append(append([]Turn(nil),sess.Turns...),Turn{At:s.now(),From:"user",Text:text,FileRequestID:body.RequestID},Turn{At:s.now(),From:k.Name,Kitty:k.ID,Text:"La descarga está preparada y espera tu autorización.",FileRequestID:body.RequestID,Approvals:[]ApprovalRef{{ID:ap.ID,Connector:ap.Connector,Action:ap.Action,Summary:ap.Summary}}});candidate.UpdatedAt=s.now()
		committed,saveErr:=s.saveAsync(&candidate);if committed{s.sessions[id]=&candidate;sess=&candidate};if saveErr!=nil{return StagedFileActionResult{},ErrStagedFileUnavailable}
		s.emitLocked(Event{Type:"turn",Session:id,Index:len(sess.Turns)-2,Turn:&sess.Turns[len(sess.Turns)-2]});s.emitLocked(Event{Type:"turn",Session:id,Index:len(sess.Turns)-1,Turn:&sess.Turns[len(sess.Turns)-1]})
	}
	ap,err=s.approvals.ReadyFileAction(ap.ID);if err!=nil{return StagedFileActionResult{},ErrStagedFileUnavailable}
	return stagedFileState(ap),nil
}

func(s *Service)lexopenPrepareStagedApproval(ap *approvals.Approval,approve bool)(func(),error){
	if ap.RequestID==""||!approve{return func(){},nil}
	if !ap.FileStageReady{return nil,ErrStagedFileInvalid}
	lock:=s.lockFor(ap.Chat);lock.Lock()
	fail:=func(err error)(func(),error){lock.Unlock();return nil,err}
	sess,err:=s.Get(ap.Chat);if err!=nil||len(sess.Members)!=1||sess.Members[0]!=ap.Kitty{return fail(ErrStagedFileInvalid)}
	s.mu.RLock();busy:=sess.Working()||s.tasks[ap.Chat]!=nil;s.mu.RUnlock();if busy{return fail(ErrBusy)}
	k,err:=s.fleet.Get(ap.Kitty);if err!=nil||!k.Desktop||k.Status!=kitty.StatusRunning||s.lexopenPreflightEasyFile(k,action{kind:"connector",name:ap.Connector,args:ap.Args})!=nil{return fail(ErrStagedFileInvalid)}
	return lock.Unlock,nil
}
