package approvals
import("errors";"reflect";"crypto/sha256";"encoding/hex";"github.com/madkoding/kitties/internal/connector")
var ErrMetadataActionBusy=errors.New("another action is waiting for this chat and desktop")
type MetadataReceipt struct {
 State string `json:"state"`
 RequestID string `json:"request_id"`
 ChatID string `json:"chat_id"`
 Kitty string `json:"kitty"`
 Connector string `json:"connector"`
 Kind string `json:"kind"`
 Action string `json:"action"`
 ApprovalID string `json:"approval_id"`
 Target map[string]any `json:"target"`
 SHA256 string `json:"sha256"`
 Bytes int `json:"bytes"`
}
func lexopenMetadataApproval(a Approval)bool{return (a.Kind=="dropbox"||a.Kind=="microsoft-365")&&(a.Action=="list"||a.Action=="search")&&!a.FileStageReady&&a.StructuredReceipt==nil}
// RequestMetadataAction reserves one exact request. It is not executable until its
// original user turn is durably present in the corresponding chat.
func (s *Store) RequestMetadataAction(a Approval) (*Approval, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if a.RequestID == "" || a.RequestHash == "" || a.Chat == "" || a.MetadataStageReady || a.MetadataReceipt!=nil || !lexopenMetadataApproval(a) {
		return nil, ErrFileActionInvalid
	}
	for _, p := range s.d.Approvals {
		if p.Chat == a.Chat && p.RequestID == a.RequestID {
			if p.RequestHash != a.RequestHash {
				return nil, ErrFileActionConflict
			}
			c := *p
			return &c, nil
		}
	}
	for _,p:=range s.d.Approvals {if p.Chat==a.Chat&&p.Kitty==a.Kitty&&p.Status==Pending{return nil,ErrMetadataActionBusy}}
	if len(s.d.Approvals) >= 10000 {
		return nil, ErrFileActionInvalid
	}
	next, err := s.stageSnapshot()
	if err != nil {
		return nil, err
	}
	a.ID, a.Status, a.At = s.id(), Pending, s.now()
	a.MetadataStageReady = false
	next.Approvals = append(next.Approvals, &a)
	if err = s.commitFileStage(next); err != nil {
		return nil, err
	}
	c := a
	return &c, nil
}

func (s *Store) ReadyMetadataAction(id string) (*Approval, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next, err := s.stageSnapshot()
	if err != nil {
		return nil, err
	}
	for _, a := range next.Approvals {
		if a.ID == id && a.RequestID != "" && lexopenMetadataApproval(*a) {
			if !a.MetadataStageReady {
				a.MetadataStageReady = true
				if err = s.commitFileStage(next); err != nil {
					return nil, err
				}
			}
			c := *a
			return &c, nil
		}
	}
	return nil, ErrFileActionInvalid
}


func(s *Store)DoneMetadataAction(id,result,errorText string,receipt *MetadataReceipt)error{
 s.mu.Lock();defer s.mu.Unlock();next,e:=s.stageSnapshot();if e!=nil{return e};for _,a:=range next.Approvals{if a.ID==id&&a.Status==Approved&&a.RequestID!=""&&a.MetadataStageReady&&lexopenMetadataApproval(*a){a.Result,a.Error=result,errorText;sum:=sha256.Sum256([]byte(result));a.MetadataReceipt=nil;target:=map[string]any{};for k,v:=range a.Args{if k!="action"{target[k]=v}};if errorText==""&&receipt!=nil&&receipt.State=="metadata_ready"&&receipt.ApprovalID==id&&receipt.RequestID==a.RequestID&&receipt.ChatID==a.Chat&&receipt.Kitty==a.Kitty&&receipt.Connector==a.Connector&&receipt.Kind==a.Kind&&receipt.Action==a.Action&&reflect.DeepEqual(receipt.Target,target)&&connector.LexOpenValidateMetadataTargetResult(a.Kind,a.Action,result,target)&&receipt.SHA256==hex.EncodeToString(sum[:])&&receipt.Bytes==len([]byte(result)){a.MetadataReceipt=receipt};if a.Error==""&&a.MetadataReceipt==nil{a.Error="The metadata response was not verified."};return s.commitFileStage(next)}};return ErrFileActionInvalid
}
