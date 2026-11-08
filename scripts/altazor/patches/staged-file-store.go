package approvals

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/madkoding/kitties/internal/connector"
)

var ErrFileActionConflict = errors.New("the file request identifier belongs to another target")
var ErrFileActionInvalid = errors.New("the staged file action is not valid")

// stageSnapshot isolates modifications until their durable replacement succeeds.
func (s *Store) stageSnapshot() (data,error) {
	raw,err:=json.Marshal(s.d); if err!=nil{return data{},err}
	var next data; err=json.Unmarshal(raw,&next);return next,err
}

func(s *Store) commitFileStage(next data)error{
	raw,err:=json.MarshalIndent(next,"","  ");if err!=nil{return err}
	dir:=filepath.Dir(s.path);if err=os.MkdirAll(dir,0700);err!=nil{return err}
	file,err:=os.CreateTemp(dir,".lexopen-file-action-*");if err!=nil{return err}
	name:=file.Name();defer os.Remove(name)
	if err=file.Chmod(0600);err==nil{_,err=file.Write(raw)}
	if err==nil{err=file.Sync()};closeErr:=file.Close();if err==nil{err=closeErr};if err!=nil{return err}
	if err=os.Rename(name,s.path);err!=nil{return err}
	// Rename has committed: memory must reflect disk even if directory fsync fails.
	s.d=next
	d,err:=os.Open(dir);if err!=nil{return err};defer d.Close();return d.Sync()
}

// RequestFileAction reserves one exact request. It is not executable until its
// original user turn is durably present in the corresponding chat.
func(s *Store) RequestFileAction(a Approval)(*Approval,error){
	s.mu.Lock();defer s.mu.Unlock()
	if a.RequestID==""||a.RequestHash==""||a.Chat==""||a.Action!="download_file"{return nil,ErrFileActionInvalid}
	for _,p:=range s.d.Approvals{if p.Chat==a.Chat&&p.RequestID==a.RequestID{
		if p.RequestHash!=a.RequestHash{return nil,ErrFileActionConflict};c:=*p;return &c,nil
	}}
	if len(s.d.Approvals)>=10000{return nil,ErrFileActionInvalid}
	next,err:=s.stageSnapshot();if err!=nil{return nil,err}
	a.ID,a.Status,a.At=s.id(),Pending,s.now();a.FileStageReady=false
	next.Approvals=append(next.Approvals,&a)
	if err=s.commitFileStage(next);err!=nil{return nil,err};c:=a;return &c,nil
}

func(s *Store) ReadyFileAction(id string)(*Approval,error){
	s.mu.Lock();defer s.mu.Unlock()
	next,err:=s.stageSnapshot();if err!=nil{return nil,err}
	for _,a:=range next.Approvals{if a.ID==id&&a.RequestID!=""{
		if !a.FileStageReady{a.FileStageReady=true;if err=s.commitFileStage(next);err!=nil{return nil,err}}
		c:=*a;return &c,nil
	}}
	return nil,ErrFileActionInvalid
}

// DoneFileAction persists the verified receipt before any caller can report it.
// An approved request with no receipt/error is uncertain and is never replayed.
func(s *Store) DoneFileAction(id,result,errorText string,receipt *connector.FileReceipt)error{
	s.mu.Lock();defer s.mu.Unlock()
	next,err:=s.stageSnapshot();if err!=nil{return err}
	for _,a:=range next.Approvals{if a.ID==id&&a.RequestID!=""&&a.Status==Approved{
		a.Result,a.Error=result,errorText;a.StructuredReceipt=nil
		if errorText==""&&receipt!=nil&&receipt.State=="desktop_verified"&&receipt.ApprovalID==id&&receipt.RequestID==a.RequestID&&receipt.ChatID==a.Chat&&receipt.Kitty==a.Kitty&&receipt.Connector==a.Connector{a.StructuredReceipt=receipt}
		if a.Error==""&&a.StructuredReceipt==nil{a.Error="The local file was not verified."}
		return s.commitFileStage(next)
	}}
	return ErrFileActionInvalid
}
