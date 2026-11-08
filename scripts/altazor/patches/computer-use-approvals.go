package approvals

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
)

const ComputerConnector = "lexopen-computer-use"
const ComputerKind = "computer-use"

var ErrComputerApproval = errors.New("computer-use: approval is invalid, changed or already consumed")
var computerHash = regexp.MustCompile(`^[a-f0-9]{64}$`)

type ComputerActionBinding struct {
	Version        string `json:"version"`
	Binding        string `json:"binding"`
	PolicyRevision uint64 `json:"policy_revision"`
	Category       string `json:"category"`
	Reason         string `json:"reason"`
	EffectUnknown  bool   `json:"effect_unknown"`
	ActionHash     string `json:"action_hash"`
	ActionJSON     string `json:"action_json"`
}
type ComputerActionResult struct {
	State          string `json:"state"`
	Attempted      bool   `json:"attempted"`
	Completed      bool   `json:"completed"`
	ActionHash     string `json:"action_hash"`
	PolicyRevision uint64 `json:"policy_revision"`
	Binding        string `json:"binding"`
	ChatID         string `json:"chat_id"`
	Kitty          string `json:"kitty"`
}

func ValidComputerAction(a *Approval) bool {
	if a == nil || a.Kind != ComputerKind || a.Connector != ComputerConnector || a.ComputerAction == nil || a.Chat == "" || a.Kitty == "" || len(a.Action) > 30 {
		return false
	}
	b := a.ComputerAction
	if b.Version != "v1" || !computerHash.MatchString(b.Binding) || !computerHash.MatchString(b.ActionHash) || b.PolicyRevision < 1 || len(b.ActionJSON) > 20000 {
		return false
	}
	sum := sha256.Sum256([]byte(b.ActionJSON))
	if hex.EncodeToString(sum[:]) != b.ActionHash {
		return false
	}
	var expected struct {
		Action         string         `json:"action"`
		Args           map[string]any `json:"args"`
		Binding        string         `json:"binding"`
		ChatID         string         `json:"chat_id"`
		Kitty          string         `json:"kitty"`
		PolicyRevision uint64         `json:"policy_revision"`
	}
	if json.Unmarshal([]byte(b.ActionJSON), &expected) != nil || expected.Action != a.Action || expected.ChatID != a.Chat || expected.Kitty != a.Kitty || expected.Binding != b.Binding || expected.PolicyRevision != b.PolicyRevision {
		return false
	}
	one, _ := json.Marshal(expected.Args)
	two, _ := json.Marshal(a.Args)
	return string(one) == string(two)
}
func cloneComputerApproval(a *Approval) *Approval {
	raw, _ := json.Marshal(a)
	var out Approval
	json.Unmarshal(raw, &out)
	return &out
}

// Computer approvals never learn auto rules and are committed atomically before
// an executor may start. A restart cannot replay a consumed physical action.
func (s *Store) RequestComputerAction(a Approval) (*Approval, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !ValidComputerAction(&a) {
		return nil, ErrComputerApproval
	}
	if len(s.d.Approvals) >= 10000 {
		return nil, ErrComputerApproval
	}
	next, e := s.stageSnapshot()
	if e != nil {
		return nil, e
	}
	a.ID, a.Status, a.At = s.id(), Pending, s.now()
	a.Always = false
	next.Approvals = append(next.Approvals, cloneComputerApproval(&a))
	if e = s.commitFileStage(next); e != nil {
		return nil, e
	}
	return cloneComputerApproval(&a), nil
}
func (s *Store) DecideComputerAction(id string, approve bool, reason string) (*Approval, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next, e := s.stageSnapshot()
	if e != nil {
		return nil, e
	}
	for _, a := range next.Approvals {
		if a.ID != id {
			continue
		}
		if a.Status != Pending || !ValidComputerAction(a) {
			return nil, ErrComputerApproval
		}
		a.Status = Rejected
		if approve {
			a.Status = Approved
		}
		a.Always = false
		a.Reason = reason
		a.DecidedAt = s.now()
		if e = s.commitFileStage(next); e != nil {
			return nil, e
		}
		return cloneComputerApproval(a), nil
	}
	return nil, ErrComputerApproval
}
func (s *Store) DoneComputerAction(id, result, errorText string, evidence ComputerActionResult) (*Approval, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next, e := s.stageSnapshot()
	if e != nil {
		return nil, e
	}
	for _, a := range next.Approvals {
		if a.ID != id {
			continue
		}
		if !ValidComputerAction(a) || a.Status != Approved && a.Status != Rejected || a.ComputerResult != nil || evidence.ActionHash != a.ComputerAction.ActionHash || evidence.PolicyRevision != a.ComputerAction.PolicyRevision || evidence.Binding != a.ComputerAction.Binding || evidence.ChatID != a.Chat || evidence.Kitty != a.Kitty {
			return nil, ErrComputerApproval
		}
		a.Result, a.Error = result, errorText
		a.ComputerResult = &evidence
		if e = s.commitFileStage(next); e != nil {
			return nil, e
		}
		return cloneComputerApproval(a), nil
	}
	return nil, ErrComputerApproval
}
