package chat

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/desktop"
	"github.com/madkoding/kitties/internal/kitty"
	"regexp"
)

const ComputerUsePolicyVersion = "v1"

var ErrComputerPolicy = errors.New("computer-use: policy is not applied or no longer matches this desktop")
var ErrComputerBudget = errors.New("computer-use: action or consultation limit reached; person assistance is required")
var ErrComputerHeld = errors.New("computer-use: the person controls this desktop; no action was executed")
var ErrComputerOutcomeUnknown = errors.New("computer-use: action outcome is not confirmed; no automatic retry is allowed")
var ErrComputerPending = errors.New("computer-use: another action is waiting for the person's decision")
var computerBinding = regexp.MustCompile(`^[a-f0-9]{64}$`)
var computerManagedName = regexp.MustCompile(`^altazor-[a-f0-9]{22}$`)

type ComputerPolicyState struct {
	Applied           bool   `json:"applied"`
	OutcomeUnknown    bool   `json:"outcome_unknown"`
	ChatID            string `json:"chat_id"`
	Kitty             string `json:"kitty"`
	Binding           string `json:"binding"`
	Revision          uint64 `json:"revision"`
	Mode              string `json:"mode"`
	AllowInput        bool   `json:"allow_input"`
	AllowBrowser      bool   `json:"allow_browser"`
	AllowApps         bool   `json:"allow_apps"`
	MaxActions        int    `json:"max_actions"`
	MaxConsultations  int    `json:"max_consultations"`
	ActionsUsed       int    `json:"actions_used"`
	ConsultationsUsed int    `json:"consultations_used"`
	GUIEffectsUnknown bool   `json:"gui_effects_unknown"`
}
type ComputerPolicyUpdate struct {
	Kitty            string `json:"kitty"`
	Binding          string `json:"binding"`
	ExpectedRevision uint64 `json:"expected_revision"`
	Mode             string `json:"mode"`
	AllowInput       *bool  `json:"allow_input"`
	AllowBrowser     *bool  `json:"allow_browser"`
	AllowApps        *bool  `json:"allow_apps"`
	MaxActions       int    `json:"max_actions"`
	MaxConsultations int    `json:"max_consultations"`
}
type ComputerApprovalClaim struct {
	ChatID         string `json:"chat_id"`
	Kitty          string `json:"kitty"`
	Binding        string `json:"binding"`
	PolicyRevision uint64 `json:"policy_revision"`
	ActionHash     string `json:"action_hash"`
}
type computerCompletion struct {
	out string
	err error
}

// This terminal record is committed together with the reservation clear, so a
// crash cannot erase which exact automatic action returned success. It contains
// no process output and grants no authority to execute or replay anything.
type ComputerExecutionReceipt struct {
	State          string         `json:"state"`
	Action         string         `json:"action"`
	Args           map[string]any `json:"args"`
	ChatID         string         `json:"chat_id"`
	Kitty          string         `json:"kitty"`
	Binding        string         `json:"binding"`
	PolicyRevision uint64         `json:"policy_revision"`
	ActionHash     string         `json:"action_hash"`
}
type computerWait struct {
	id, chat, kitty string
	ctx             context.Context
	done            chan computerCompletion
	index           int
}

func (s *Service) lexopenManagedComputer(id string, k *kitty.Kitty) bool {
	if k == nil {
		return false
	}
	if computerManagedName.MatchString(k.Name) {
		return true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess := s.sessions[id]
	return sess != nil && sess.ComputerPolicy != nil
}
func (s *Service) lexopenManagedMachine(id string, k *kitty.Kitty, actions []action) bool {
	if !s.lexopenManagedComputer(id, k) {
		return false
	}
	for _, a := range actions {
		if a.kind == "machine" {
			return true
		}
	}
	return false
}
func (s *Service) computerSessionLocked(id, kittyID, binding string) (*Session, *kitty.Kitty, error) {
	if !asyncIdentifier.MatchString(id) || !asyncIdentifier.MatchString(kittyID) || !computerBinding.MatchString(binding) {
		return nil, nil, ErrComputerPolicy
	}
	sess := s.sessions[id]
	if sess == nil || len(sess.Members) != 1 || sess.Members[0] != kittyID {
		return nil, nil, ErrComputerPolicy
	}
	k, e := s.fleet.Get(kittyID)
	if e != nil || !k.Desktop || k.ID != kittyID {
		return nil, nil, ErrComputerPolicy
	}
	if sess.ComputerPolicy != nil && (sess.ComputerPolicy.Kitty != kittyID || sess.ComputerPolicy.Binding != binding) {
		return nil, nil, ErrComputerPolicy
	}
	return sess, k, nil
}
func defaultComputerPolicy(id, kittyID, binding string) ComputerPolicyState {
	return ComputerPolicyState{ChatID: id, Kitty: kittyID, Binding: binding, Mode: "supervised", MaxActions: 100, MaxConsultations: 20}
}
func (s *Service) ComputerPolicy(id, kittyID, binding string) (ComputerPolicyState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, _, e := s.computerSessionLocked(id, kittyID, binding)
	if e != nil {
		return ComputerPolicyState{}, e
	}
	if sess.ComputerPolicy == nil {
		return defaultComputerPolicy(id, kittyID, binding), nil
	}
	return *sess.ComputerPolicy, nil
}

// Only policy snapshots and counters are replaced; existing chat pointers stay
// valid for the synchronous API. Persistence commits before execution or ACK.
func (s *Service) saveComputerPolicyLocked(sess *Session, state ComputerPolicyState) error {
	return s.saveComputerSnapshotLocked(sess, state, nil)
}
func (s *Service) saveComputerSnapshotLocked(sess *Session, state ComputerPolicyState, execution *ComputerExecutionReceipt) error {
	candidate := *sess
	copy := state
	candidate.ComputerPolicy = &copy
	if execution != nil {
		candidate.ComputerExecution = execution
	}
	committed, e := s.saveAsync(&candidate)
	if committed {
		sess.ComputerPolicy = candidate.ComputerPolicy
		sess.ComputerExecution = candidate.ComputerExecution
	}
	if e != nil {
		return ErrComputerPolicy
	}
	return nil
}
func (s *Service) reserveComputerExecutionLocked(sess *Session, p ComputerPolicyState, a desktop.Action) error {
	if !p.OutcomeUnknown {
		return s.saveComputerPolicyLocked(sess, p)
	}
	meta := computerActionBinding(sess.ID, &kitty.Kitty{ID: p.Kitty}, p, a, desktop.ComputerDecision{})
	raw, _ := json.Marshal(a.Args)
	var args map[string]any
	_ = json.Unmarshal(raw, &args)
	receipt := &ComputerExecutionReceipt{State: "pending", Action: a.Name, Args: args, ChatID: sess.ID, Kitty: p.Kitty, Binding: p.Binding, PolicyRevision: p.Revision, ActionHash: meta.ActionHash}
	return s.saveComputerSnapshotLocked(sess, p, receipt)
}
func (s *Service) SetComputerPolicy(id string, input ComputerPolicyUpdate) (ComputerPolicyState, error) {
	if input.Mode != "supervised" && input.Mode != "intelligent" && input.Mode != "autonomous" || input.AllowInput == nil || input.AllowBrowser == nil || input.AllowApps == nil || input.MaxActions < 1 || input.MaxActions > 1000 || input.MaxConsultations < 1 || input.MaxConsultations > 100 || input.ExpectedRevision > 1<<52 {
		return ComputerPolicyState{}, ErrComputerPolicy
	}
	s.computerMu.Lock()
	defer s.computerMu.Unlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, _, e := s.computerSessionLocked(id, input.Kitty, input.Binding)
	if e != nil || s.approvals == nil {
		return ComputerPolicyState{}, ErrComputerPolicy
	}
	if sess.ComputerPolicy != nil && sess.ComputerPolicy.OutcomeUnknown {
		return ComputerPolicyState{}, ErrComputerOutcomeUnknown
	}
	if sess.Working() || s.tasks[id] != nil || s.computerWaiting[id] != nil {
		return ComputerPolicyState{}, ErrBusy
	}
	state := defaultComputerPolicy(id, input.Kitty, input.Binding)
	if sess.ComputerPolicy != nil {
		state = *sess.ComputerPolicy
	}
	if state.Revision != input.ExpectedRevision {
		return ComputerPolicyState{}, ErrComputerPolicy
	}
	state.Applied = true
	state.Revision++
	state.Mode = input.Mode
	state.AllowInput = *input.AllowInput
	state.AllowBrowser = *input.AllowBrowser
	state.AllowApps = *input.AllowApps
	state.MaxActions = input.MaxActions
	state.MaxConsultations = input.MaxConsultations
	state.ActionsUsed = 0
	state.ConsultationsUsed = 0
	state.GUIEffectsUnknown = state.AllowInput || state.AllowBrowser
	if e = s.saveComputerPolicyLocked(sess, state); e != nil {
		return ComputerPolicyState{}, e
	}
	return state, nil
}
func (s *Service) computerStateLocked(id string, k *kitty.Kitty) (*Session, ComputerPolicyState, error) {
	sess := s.sessions[id]
	if !k.Desktop || sess == nil || len(sess.Members) != 1 || sess.Members[0] != k.ID {
		return nil, ComputerPolicyState{}, ErrComputerPolicy
	}
	if sess.ComputerPolicy == nil {
		return sess, defaultComputerPolicy(id, k.ID, ""), nil
	}
	return sess, *sess.ComputerPolicy, nil
}
func computerDecision(p ComputerPolicyState, a desktop.Action) (desktop.ComputerDecision, error) {
	return desktop.ClassifyComputerUse(a, desktop.ComputerUsePolicy{Mode: p.Mode, AllowInput: p.AllowInput, AllowBrowser: p.AllowBrowser, AllowApps: p.AllowApps})
}
func computerActionBinding(id string, k *kitty.Kitty, p ComputerPolicyState, a desktop.Action, d desktop.ComputerDecision) *approvals.ComputerActionBinding {
	raw, _ := json.Marshal(map[string]any{"action": a.Name, "args": a.Args, "binding": p.Binding, "chat_id": id, "kitty": k.ID, "policy_revision": p.Revision})
	sum := sha256.Sum256(raw)
	return &approvals.ComputerActionBinding{Version: "v1", Binding: p.Binding, PolicyRevision: p.Revision, Category: d.Category, Reason: d.Reason, EffectUnknown: d.EffectUnknown, ActionHash: hex.EncodeToString(sum[:]), ActionJSON: string(raw)}
}

// A pending execution is durable before a possible effect. A crash leaves the
// desktop uncertain; a new task or policy cannot erase that evidence.
func (s *Service) computerFinishLocked(id string, clear bool, completed bool) error {
	if !clear {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sess := s.sessions[id]
	if sess == nil || sess.ComputerPolicy == nil {
		return ErrComputerPolicy
	}
	p := *sess.ComputerPolicy
	p.OutcomeUnknown = false
	var receipt *ComputerExecutionReceipt
	if sess.ComputerExecution != nil {
		copy := *sess.ComputerExecution
		copy.State = "not_executed"
		if completed {
			copy.State = "completed"
		}
		receipt = &copy
	}
	return s.saveComputerSnapshotLocked(sess, p, receipt)
}
func (s *Service) computerPhysical(ctx context.Context, id string, index int, k *kitty.Kitty, a desktop.Action, d desktop.ComputerDecision) (string, error, bool) {
	if ctx.Err() != nil {
		return "", ctx.Err(), false
	}
	if h, ok := s.fleet.(holder); ok && h.Held(k.ID) {
		return "", ErrComputerHeld, false
	}
	if a.Name != "machine" {
		if e := s.ensureMachine(ctx, id, index, k); e != nil {
			return "", ErrComputerOutcomeUnknown, !d.Observation && !d.LocalRead
		}
	}
	if d.LocalRead {
		out, e := desktop.ReadComputerLocal(ctx, s.runner(), k.ID, a)
		return out, e, true
	}
	if a.Name == "machine" {
		out := s.runMachine(ctx, action{kind: "machine", name: "machine", args: a.Args}, k)
		if out.err != "" {
			return "", errors.New("computer-use: machine action could not be confirmed"), !d.Observation
		}
		return out.text, nil, !d.Observation
	}
	out, e := desktop.Run(ctx, s.runner(), k.ID, a)
	return out, e, !d.Observation
}
func (s *Service) lexopenRunComputer(ctx context.Context, id string, index int, k *kitty.Kitty, a desktop.Action) (string, error) {
	if !s.lexopenManagedComputer(id, k) {
		return desktop.Run(ctx, s.runner(), k.ID, a)
	}
	s.computerMu.Lock()
	s.mu.Lock()
	sess, p, e := s.computerStateLocked(id, k)
	if e != nil {
		s.mu.Unlock()
		s.computerMu.Unlock()
		return "", e
	}
	d, e := computerDecision(p, a)
	if e != nil {
		s.mu.Unlock()
		s.computerMu.Unlock()
		return "", e
	}
	if !d.Observation && !d.LocalRead && p.OutcomeUnknown {
		s.mu.Unlock()
		s.computerMu.Unlock()
		return "", ErrComputerOutcomeUnknown
	}
	if !d.Observation && !p.Applied {
		s.mu.Unlock()
		s.computerMu.Unlock()
		return "", ErrComputerPolicy
	}
	if s.computerWaiting[id] != nil {
		s.mu.Unlock()
		s.computerMu.Unlock()
		return "", ErrComputerPending
	}
	if !d.Observation && p.ActionsUsed >= p.MaxActions {
		s.mu.Unlock()
		s.computerMu.Unlock()
		return "", ErrComputerBudget
	}
	if d.Automatic {
		if !d.Observation {
			p.ActionsUsed++
			if !d.LocalRead {
				p.OutcomeUnknown = true
			}
			e = s.reserveComputerExecutionLocked(sess, p, a)
		}
		s.mu.Unlock()
		if e != nil {
			s.computerMu.Unlock()
			return "", e
		}
		out, runErr, attempted := s.computerPhysical(ctx, id, index, k, a, d)
		finishErr := s.computerFinishLocked(id, !d.Observation && !d.LocalRead && (runErr == nil || !attempted), runErr == nil)
		s.computerMu.Unlock()
		if finishErr != nil {
			return "", finishErr
		}
		if runErr != nil {
			return "", ErrComputerOutcomeUnknown
		}
		return out, nil
	}
	if s.approvals == nil || p.ConsultationsUsed >= p.MaxConsultations {
		s.mu.Unlock()
		s.computerMu.Unlock()
		return "", ErrComputerBudget
	}
	p.ConsultationsUsed++
	e = s.saveComputerPolicyLocked(sess, p)
	s.mu.Unlock()
	if e != nil {
		s.computerMu.Unlock()
		return "", e
	}
	meta := computerActionBinding(id, k, p, a, d)
	ap, e := s.approvals.RequestComputerAction(approvals.Approval{Kitty: k.ID, KittyName: k.Name, Connector: approvals.ComputerConnector, Kind: approvals.ComputerKind, Chat: id, Action: a.Name, Args: a.Args, Summary: "Computer use: " + a.Name + "; " + d.Reason, Risk: "always", ComputerAction: meta})
	if e != nil {
		s.computerMu.Unlock()
		return "", ErrComputerPolicy
	}
	wait := &computerWait{id: ap.ID, chat: id, kitty: k.ID, ctx: ctx, done: make(chan computerCompletion, 1), index: index}
	if s.computerWaiting == nil {
		s.computerWaiting = map[string]*computerWait{}
	}
	s.computerWaiting[id] = wait
	s.computerMu.Unlock()
	s.edit(id, index, func(t *Turn) {
		t.Approvals = append(t.Approvals, ApprovalRef{ID: ap.ID, Connector: approvals.ComputerConnector, Action: a.Name, Summary: ap.Summary})
	})
	s.appendStep(id, index, Step{At: s.now(), Action: "computer_approval", Args: map[string]any{"approval_id": ap.ID, "action": a.Name}, Result: "Waiting for the person's one-use decision; no action has executed."})
	select {
	case result := <-wait.done:
		return result.out, result.err
	case <-ctx.Done():
		s.computerMu.Lock()
		if s.computerWaiting[id] == wait {
			delete(s.computerWaiting, id)
		}
		s.computerMu.Unlock()
		return "", ctx.Err()
	}
}
func (s *Service) DecideComputerUseApproval(ctx context.Context, id string, approve bool, reason string, always bool, claim ComputerApprovalClaim) (*approvals.Approval, error) {
	if always || s.approvals == nil {
		return nil, approvals.ErrComputerApproval
	}
	s.computerMu.Lock()
	defer s.computerMu.Unlock()
	ap, e := s.approvals.Get(id)
	if e != nil || !approvals.ValidComputerAction(ap) {
		return nil, approvals.ErrComputerApproval
	}
	meta := ap.ComputerAction
	if claim.ChatID != ap.Chat || claim.Kitty != ap.Kitty || claim.Binding != meta.Binding || claim.PolicyRevision != meta.PolicyRevision || claim.ActionHash != meta.ActionHash {
		return nil, approvals.ErrComputerApproval
	}
	s.mu.Lock()
	sess, k, e := s.computerSessionLocked(ap.Chat, ap.Kitty, meta.Binding)
	if e != nil {
		s.mu.Unlock()
		return nil, e
	}
	p := defaultComputerPolicy(ap.Chat, ap.Kitty, meta.Binding)
	if sess.ComputerPolicy != nil {
		p = *sess.ComputerPolicy
	}
	wait := s.computerWaiting[ap.Chat]
	if approve && (!p.Applied || p.OutcomeUnknown || p.Revision != meta.PolicyRevision || wait == nil || wait.id != id || wait.ctx.Err() != nil || p.ActionsUsed >= p.MaxActions) {
		s.mu.Unlock()
		return nil, ErrComputerPolicy
	}
	da := desktop.Action{Name: ap.Action, Args: ap.Args}
	d, e := computerDecision(p, da)
	if e != nil {
		s.mu.Unlock()
		return nil, e
	}
	if h, ok := s.fleet.(holder); approve && ok && h.Held(k.ID) {
		s.mu.Unlock()
		return nil, ErrComputerHeld
	}
	if approve {
		p.ActionsUsed++
		if !d.LocalRead && !d.Observation {
			p.OutcomeUnknown = true
		}
		if e = s.reserveComputerExecutionLocked(sess, p, da); e != nil {
			s.mu.Unlock()
			return nil, e
		}
	}
	s.mu.Unlock()
	decided, e := s.approvals.DecideComputerAction(id, approve, reason)
	if e != nil {
		if approve && !d.LocalRead && !d.Observation {
			_ = s.computerFinishLocked(ap.Chat, true, false)
		}
		return nil, e
	}
	state := "rejected"
	attempted, completed := false, false
	out := "The person rejected this action."
	var runErr error
	if approve {
		runCtx, cancel := context.WithCancel(ctx)
		stop := context.AfterFunc(wait.ctx, cancel)
		out, runErr, attempted = s.computerPhysical(runCtx, ap.Chat, wait.index, k, da, d)
		stop()
		cancel()
		state = "executed"
		completed = runErr == nil
		if runErr != nil {
			state = "unknown"
		}
	}
	evidence := approvals.ComputerActionResult{State: state, Attempted: attempted, Completed: completed, ActionHash: meta.ActionHash, PolicyRevision: meta.PolicyRevision, Binding: meta.Binding, ChatID: ap.Chat, Kitty: ap.Kitty}
	safeResult, safeError := "The requested computer action completed.", ""
	if !approve {
		safeResult = "The person rejected this computer action."
	} else if runErr != nil {
		safeResult = "The computer action outcome is not confirmed; it will not be repeated automatically."
		safeError = "computer_action_unknown"
	}
	saved, saveErr := s.approvals.DoneComputerAction(id, safeResult, safeError, evidence)
	// Keep the execution reservation until its terminal evidence is durable.
	// A receipt-write failure after execution must not permit a new task to retry.
	if saveErr == nil && approve && !d.Observation && !d.LocalRead && (runErr == nil || !attempted) {
		saveErr = s.computerFinishLocked(ap.Chat, true, runErr == nil)
	}
	if wait != nil && wait.id == id {
		delete(s.computerWaiting, ap.Chat)
		if !approve {
			wait.done <- computerCompletion{err: errors.New("computer-use: the person rejected this action")}
		} else if saveErr != nil {
			wait.done <- computerCompletion{err: ErrComputerPolicy}
		} else if runErr != nil {
			wait.done <- computerCompletion{err: ErrComputerOutcomeUnknown}
		} else {
			wait.done <- computerCompletion{out: out}
		}
	}
	if saveErr != nil {
		return nil, ErrComputerPolicy
	}
	_ = decided
	return saved, nil
}
