package approvals

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/madkoding/kitties/internal/connector"
)

func fileStageFixture()Approval{return Approval{Kitty:"owned",Connector:"altazor-google-0123456789abcdef",Kind:"google-workspace",Action:"download_file",Args:map[string]any{"action":"download_file","id":"exact-id"},Chat:"chat-one",RequestID:"request-one",RequestHash:"hash-one"}}

func TestLexOpenFileStageScopeIdempotencyAndReadyGate(t *testing.T){
	path:=filepath.Join(t.TempDir(),"approvals.json");s,err:=Open(path);if err!=nil{t.Fatal(err)}
	a:=fileStageFixture();first,err:=s.RequestFileAction(a);if err!=nil{t.Fatal(err)}
	if _,err=s.Decide(first.ID,true,"",false);!errors.Is(err,ErrFileActionInvalid){t.Fatal("uncommitted user turn was executable")}
	repeat,err:=s.RequestFileAction(a);if err!=nil||repeat.ID!=first.ID{t.Fatal("retry duplicated pending action")}
	a.RequestHash="other-target";if _,err=s.RequestFileAction(a);!errors.Is(err,ErrFileActionConflict){t.Fatal("same identifier accepted another target")}
	a=fileStageFixture();a.Chat="chat-two";second,err:=s.RequestFileAction(a);if err!=nil||second.ID==first.ID{t.Fatal("reused another chat's approval")}
	if _,err=s.ReadyFileAction(first.ID);err!=nil{t.Fatal(err)}
	if _,err=s.Decide(first.ID,true,"",false);err!=nil{t.Fatal(err)}
	if _,err=s.Decide(first.ID,true,"",false);err==nil{t.Fatal("replayed approved action")}
	reopened,err:=Open(path);if err!=nil{t.Fatal(err)};repeat,err=reopened.RequestFileAction(fileStageFixture());if err!=nil||repeat.ID!=first.ID||repeat.Status!=Approved{t.Fatal("restart lost durable idempotency")}
}

func TestLexOpenFileStageDiskFailureDoesNotCommitMemoryOrReceipt(t *testing.T){
	dir:=t.TempDir();path:=filepath.Join(dir,"approvals.json");s,_:=Open(path)
	if err:=os.Mkdir(path,0700);err!=nil{t.Fatal(err)}
	if _,err:=s.RequestFileAction(fileStageFixture());err==nil||len(s.d.Approvals)!=0{t.Fatal("failed reserve committed memory")}
	if err:=os.Remove(path);err!=nil{t.Fatal(err)}
	ap,err:=s.RequestFileAction(fileStageFixture());if err!=nil{t.Fatal(err)};if _,err=s.ReadyFileAction(ap.ID);err!=nil{t.Fatal(err)};if _,err=s.Decide(ap.ID,true,"",false);err!=nil{t.Fatal(err)}
	if err=os.Remove(path);err!=nil{t.Fatal(err)};if err=os.Mkdir(path,0700);err!=nil{t.Fatal(err)}
	r:=&connector.FileReceipt{State:"desktop_verified",RequestID:ap.RequestID,ApprovalID:ap.ID,ChatID:ap.Chat,Kitty:ap.Kitty,Connector:ap.Connector}
	if err=s.DoneFileAction(ap.ID,"verified","",r);err==nil{t.Fatal("failed receipt write reported success")}
	stored,_:=s.Get(ap.ID);if stored.StructuredReceipt!=nil{t.Fatal("failed receipt was visible in memory")}
}

func TestLexOpenFileStageReceiptPersistsAndRejectsUnboundEvidence(t *testing.T){
	path:=filepath.Join(t.TempDir(),"approvals.json");s,_:=Open(path);ap,_:=s.RequestFileAction(fileStageFixture());s.ReadyFileAction(ap.ID);s.Decide(ap.ID,true,"",false)
	r:=&connector.FileReceipt{State:"desktop_verified",RequestID:ap.RequestID,ApprovalID:ap.ID,ChatID:ap.Chat,Kitty:ap.Kitty,Connector:ap.Connector,Bytes:12,SHA256:"fixture-hash"}
	bad:=*r;bad.ChatID="another-chat";if err:=s.DoneFileAction(ap.ID,"","",&bad);err!=nil{t.Fatal(err)};got,_:=s.Get(ap.ID);if got.StructuredReceipt!=nil||got.Error==""{t.Fatal("foreign evidence accepted")}
	if err:=s.DoneFileAction(ap.ID,"verified","",r);err!=nil{t.Fatal(err)};reopened,_:=Open(path);got,_=reopened.Get(ap.ID)
	if got.StructuredReceipt==nil||got.StructuredReceipt.Bytes!=12||got.Error!=""{t.Fatal("verified evidence was not durable")}
}
