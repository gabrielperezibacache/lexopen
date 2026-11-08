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

const StagedMetadataActionsVersion = "v1"

var ErrStagedMetadataInvalid = errors.New("the requested metadata action is not valid")
var ErrStagedMetadataUnavailable = errors.New("the metadata action could not be saved safely")

type StagedMetadataAction struct {
	RequestID string         `json:"request_id"`
	Kitty     string         `json:"kitty"`
	Connector string         `json:"connector"`
	Action    string         `json:"action"`
	Args      map[string]any `json:"args"`
	Text      string         `json:"text,omitempty"`
}
type StagedMetadataActionResult struct {
	State      string `json:"state"`
	ApprovalID string `json:"approval_id"`
	RequestID  string `json:"request_id"`
}

func stagedMetadataState(ap *approvals.Approval) StagedMetadataActionResult {
	state := "pending"
	if ap.Status == approvals.Rejected {
		state = "rejected"
	} else if ap.MetadataReceipt != nil {
		state = "metadata_ready"
	} else if ap.Error != "" {
		state = "failed"
	} else if ap.Status == approvals.Approved {
		state = "unknown"
	}
	return StagedMetadataActionResult{State: state, ApprovalID: ap.ID, RequestID: ap.RequestID}
}

// StageMetadataAction does not call a model or an external service. It only binds an
// exact, validated read to one native user turn and the existing approval gate.
func (s *Service) StageMetadataAction(ctx context.Context, id string, body StagedMetadataAction) (StagedMetadataActionResult, error) {
	if ctx.Err() != nil {
		return StagedMetadataActionResult{}, ErrStagedMetadataUnavailable
	}
	if !asyncIdentifier.MatchString(id)||!asyncIdentifier.MatchString(body.RequestID)||body.Kitty==""||!utf8.ValidString(body.Text)||len(body.Text)>16000||!lexopenMetadataStageArgs(body.Connector,body.Action,body.Args){return StagedMetadataActionResult{},ErrStagedMetadataInvalid}
	k, err := s.fleet.Get(body.Kitty)
	if err != nil || k.ID != body.Kitty || !k.Desktop || k.Status != kitty.StatusRunning {
		return StagedMetadataActionResult{}, ErrStagedMetadataInvalid
	}

	args:=map[string]any{"action":body.Action}
	for key, value := range body.Args {
		if key == "action" {
			return StagedMetadataActionResult{}, ErrStagedMetadataInvalid
		}
		args[key] = value
	}
	a := action{kind: "connector", name: body.Connector, args: args}
	if s.lexopenPreflightCloudFile(k, a) != nil {
		return StagedMetadataActionResult{}, ErrStagedMetadataInvalid
	}
	c, registered := s.fleet.Connectors().Get(body.Connector)
	kinder, typed := c.(connector.Kinder)
	if !registered || !typed {
		return StagedMetadataActionResult{}, ErrStagedMetadataInvalid
	}
	kind := kinder.Kind()
	if s.approvals == nil {
		return StagedMetadataActionResult{}, ErrStagedMetadataUnavailable
	}
	lock := s.lockFor(id)
	lock.Lock()
	defer lock.Unlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, exists := s.sessions[id]
	if !exists || len(sess.Members) != 1 || sess.Members[0] != k.ID {
		return StagedMetadataActionResult{}, ErrStagedMetadataInvalid
	}
	if sess.Working() || s.tasks[id] != nil {
		return StagedMetadataActionResult{}, ErrBusy
	}
	bound := struct {
		Domain,RequestID,Chat, Kitty, Connector, Action, Text, Goal string
		Args                                       map[string]any
	}{"metadata-v1",body.RequestID,id, k.ID, body.Connector, body.Action, body.Text, sess.Goal, args}
	raw, _ := json.Marshal(bound)
	sum := sha256.Sum256(raw)
	hash := hex.EncodeToString(sum[:])
	verdict := s.approvals.Check(k.ID, body.Connector, body.Action, connector.RiskOfCall(kind, args).String(), k.Approvals, s.demandOf(k))
	if verdict.Blocked {
		return StagedMetadataActionResult{}, ErrStagedMetadataInvalid
	}
	ap, err := s.approvals.RequestMetadataAction(approvals.Approval{Kitty: k.ID, KittyName: k.Name, Connector: body.Connector, Kind: kind, Action: body.Action, Args: args, Summary: approvals.Summarise(body.Connector, body.Action, args), Risk: connector.RiskOfCall(kind, args).String(), Chat: id, Goal: sess.Goal, RequestID: body.RequestID, RequestHash: hash})
	if errors.Is(err,approvals.ErrMetadataActionBusy){return StagedMetadataActionResult{},ErrBusy}
	if errors.Is(err, approvals.ErrFileActionConflict) {
		return StagedMetadataActionResult{}, ErrAsyncConflict
	}
	if err != nil {
		return StagedMetadataActionResult{}, ErrStagedMetadataUnavailable
	}
	if ap.MetadataStageReady {
		result:=stagedMetadataState(ap);if result.State=="metadata_ready"&&!lexopenHasMetadataTurn(sess,ap){result.State="unknown"};return result,nil
	}
	found := false
	for _, turn := range sess.Turns {
		if turn.MetadataRequestID == body.RequestID {
			found = true
			break
		}
	}
	if !found {
		text := strings.TrimSpace(body.Text)
		if text == "" {
			text = "Consultar los metadatos seleccionados."
		}
		candidate := *sess
		candidate.Turns = append(append([]Turn(nil), sess.Turns...), Turn{At: s.now(), From: "user", Text: text, MetadataRequestID: body.RequestID}, Turn{At: s.now(), From: k.Name, Kitty: k.ID, Text: "La consulta exacta está preparada y espera tu autorización.", MetadataRequestID: body.RequestID, Approvals: []ApprovalRef{{ID: ap.ID, Connector: ap.Connector, Action: ap.Action, Summary: ap.Summary}}})
		candidate.UpdatedAt = s.now()
		committed, saveErr := s.saveAsync(&candidate)
		if committed {
			s.sessions[id] = &candidate
			sess = &candidate
		}
		if saveErr != nil {
			return StagedMetadataActionResult{}, ErrStagedMetadataUnavailable
		}
		s.emitLocked(Event{Type: "turn", Session: id, Index: len(sess.Turns) - 2, Turn: &sess.Turns[len(sess.Turns)-2]})
		s.emitLocked(Event{Type: "turn", Session: id, Index: len(sess.Turns) - 1, Turn: &sess.Turns[len(sess.Turns)-1]})
	}
	ap, err = s.approvals.ReadyMetadataAction(ap.ID)
	if err != nil {
		return StagedMetadataActionResult{}, ErrStagedMetadataUnavailable
	}
	result:=stagedMetadataState(ap);if result.State=="metadata_ready"&&!lexopenHasMetadataTurn(sess,ap){result.State="unknown"};return result,nil
}


func lexopenMetadataStageArgs(name,act string,args map[string]any)bool{
 kind:=lexopenCloudKind(name);if kind==""||(act!="list"&&act!="search")||len(args)<1||len(args)>2{return false};for key:=range args{if key!="limit"&&(key!="query"||act!="search"){return false}};limit,ok:=args["limit"].(string);if !ok||limit==""{return false};all:=map[string]any{"action":act};for k,v:=range args{all[k]=v};return connector.LexOpenValidateCloudFileCall(kind,all)==nil
}
