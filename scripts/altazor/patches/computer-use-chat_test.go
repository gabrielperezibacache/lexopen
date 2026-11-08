package chat

import (
	"context"
	"errors"
	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/desktop"
	"github.com/madkoding/kitties/internal/kitty"
	"github.com/madkoding/kitties/internal/provider"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type computerFleetFixture struct {
	*fakeFleet
	mu        sync.Mutex
	calls     []string
	held      bool
	failure   error
	entered   chan struct{}
	release   chan struct{}
	afterExec func()
}

func (f *computerFleetFixture) Exec(ctx context.Context, _ string, argv ...string) (string, error) {
	f.mu.Lock()
	f.calls = append(f.calls, strings.Join(argv, " "))
	err, entered, release, after := f.failure, f.entered, f.release, f.afterExec
	f.mu.Unlock()
	if entered != nil {
		entered <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	if after != nil {
		after()
	}
	return "fixture result", err
}
func (f *computerFleetFixture) Screenshot(context.Context, string) ([]byte, error) {
	return []byte("fixture"), nil
}
func (f *computerFleetFixture) Held(string) bool { f.mu.Lock(); defer f.mu.Unlock(); return f.held }
func (f *computerFleetFixture) count() int       { f.mu.Lock(); defer f.mu.Unlock(); return len(f.calls) }
func computerServiceFixture(t *testing.T) (*Service, *computerFleetFixture, *Session, *kitty.Kitty, *approvals.Store) {
	t.Helper()
	base, _, _, _ := fleet(t)
	k := base.kitties["a1"]
	k.Name = "altazor-" + strings.Repeat("a", 22)
	f := &computerFleetFixture{fakeFleet: base}
	s := service(t, f)
	store, e := approvals.Open(filepath.Join(t.TempDir(), "approvals.json"))
	if e != nil {
		t.Fatal(e)
	}
	s.SetApprovals(store)
	sess, e := s.Create("fixture", []string{k.ID})
	if e != nil {
		t.Fatal(e)
	}
	return s, f, sess, k, store
}
func computerUpdate(k *kitty.Kitty, mode string, revision uint64) ComputerPolicyUpdate {
	yes, no := true, false
	return ComputerPolicyUpdate{Kitty: k.ID, Binding: strings.Repeat("a", 64), ExpectedRevision: revision, Mode: mode, AllowInput: &yes, AllowBrowser: &no, AllowApps: &no, MaxActions: 100, MaxConsultations: 20}
}
func computerArmTurn(s *Service, sess *Session) {
	s.mu.Lock()
	sess.Turns = append(sess.Turns, Turn{})
	s.mu.Unlock()
}
func computerAwaitApproval(t *testing.T, s *Service, store *approvals.Store, id string) *approvals.Approval {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		s.computerMu.Lock()
		w := s.computerWaiting[id]
		s.computerMu.Unlock()
		if w != nil {
			a, e := store.Get(w.id)
			if e != nil {
				t.Fatal(e)
			}
			return a
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("no native pending action")
	return nil
}
func computerClaim(a *approvals.Approval) ComputerApprovalClaim {
	return ComputerApprovalClaim{ChatID: a.Chat, Kitty: a.Kitty, Binding: a.ComputerAction.Binding, PolicyRevision: a.ComputerAction.PolicyRevision, ActionHash: a.ComputerAction.ActionHash}
}
func TestLexOpenComputerPolicyCASReadOnlyDefaultAndBusy(t *testing.T) {
	s, f, sess, k, _ := computerServiceFixture(t)
	p, e := s.ComputerPolicy(sess.ID, k.ID, strings.Repeat("a", 64))
	if e != nil || p.Applied || p.Revision != 0 || p.Mode != "supervised" || p.AllowInput || p.MaxActions != 100 || sess.ComputerPolicy != nil {
		t.Fatal("GET applied policy", p, e)
	}
	a := desktop.Action{Name: "click", Args: map[string]any{"x": float64(1), "y": float64(2)}}
	if _, e = s.lexopenRunComputer(context.Background(), sess.ID, 0, k, a); !errors.Is(e, ErrComputerPolicy) || f.count() != 0 {
		t.Fatal("unapplied policy executed", e)
	}
	p, e = s.SetComputerPolicy(sess.ID, computerUpdate(k, "autonomous", 0))
	if e != nil || !p.Applied || p.Revision != 1 || !p.GUIEffectsUnknown {
		t.Fatal(p, e)
	}
	if _, e = s.SetComputerPolicy(sess.ID, computerUpdate(k, "supervised", 0)); e == nil {
		t.Fatal("stale CAS accepted")
	}
	wrong := computerUpdate(k, "supervised", 1)
	wrong.Binding = strings.Repeat("b", 64)
	if _, e = s.SetComputerPolicy(sess.ID, wrong); e == nil {
		t.Fatal("binding changed")
	}
	s.mu.Lock()
	sess.Turns = append(sess.Turns, Turn{Working: true})
	s.mu.Unlock()
	if _, e = s.SetComputerPolicy(sess.ID, computerUpdate(k, "supervised", 1)); !errors.Is(e, ErrBusy) {
		t.Fatal("busy policy changed", e)
	}
}
func TestLexOpenComputerAutonomousExplicitCategoryQuotaAndUnknown(t *testing.T) {
	s, f, sess, k, _ := computerServiceFixture(t)
	u := computerUpdate(k, "autonomous", 0)
	u.MaxActions = 1
	if _, e := s.SetComputerPolicy(sess.ID, u); e != nil {
		t.Fatal(e)
	}
	a := desktop.Action{Name: "click", Args: map[string]any{"x": float64(1), "y": float64(2)}}
	if _, e := s.lexopenRunComputer(context.Background(), sess.ID, 0, k, a); e != nil || f.count() != 1 {
		t.Fatal("consented input not executed", e)
	}
	if _, e := s.lexopenRunComputer(context.Background(), sess.ID, 0, k, a); !errors.Is(e, ErrComputerBudget) || f.count() != 1 {
		t.Fatal("action quota bypass", e)
	}
	p, _ := s.ComputerPolicy(sess.ID, k.ID, u.Binding)
	if p.ActionsUsed != 1 || p.OutcomeUnknown {
		t.Fatal("incorrect successful reservation", p)
	}
	if sess.ComputerExecution == nil || sess.ComputerExecution.State != "completed" || sess.ComputerExecution.Action != "click" || sess.ComputerExecution.Args["x"] != float64(1) {
		t.Fatal("automatic completion lacks an atomic exact-action receipt")
	}
	s2, f2, sess2, k2, _ := computerServiceFixture(t)
	u = computerUpdate(k2, "autonomous", 0)
	s2.SetComputerPolicy(sess2.ID, u)
	f2.failure = errors.New("uncertain remote stderr never surfaced")
	if _, e := s2.lexopenRunComputer(context.Background(), sess2.ID, 0, k2, a); !errors.Is(e, ErrComputerOutcomeUnknown) {
		t.Fatal("ambiguous effect retriable", e)
	}
	p, _ = s2.ComputerPolicy(sess2.ID, k2.ID, u.Binding)
	if !p.OutcomeUnknown {
		t.Fatal("uncertainty not durable")
	}
	if _, e := s2.SetComputerPolicy(sess2.ID, computerUpdate(k2, "autonomous", 1)); !errors.Is(e, ErrComputerOutcomeUnknown) {
		t.Fatal("policy reset uncertainty", e)
	}
	if _, e := s2.lexopenRunComputer(context.Background(), sess2.ID, 0, k2, a); !errors.Is(e, ErrComputerOutcomeUnknown) || f2.count() != 1 {
		t.Fatal("unknown action repeated", e)
	}
	reopened, e := New(f2, s2.dir)
	if e != nil {
		t.Fatal(e)
	}
	p, e = reopened.ComputerPolicy(sess2.ID, k2.ID, u.Binding)
	if e != nil || !p.OutcomeUnknown {
		t.Fatal("restart lost uncertainty", p, e)
	}
}
func TestLexOpenComputerIntelligentApprovalBoundOneUseAndGenericReject(t *testing.T) {
	s, f, sess, k, store := computerServiceFixture(t)
	s.SetComputerPolicy(sess.ID, computerUpdate(k, "intelligent", 0))
	computerArmTurn(s, sess)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	a := desktop.Action{Name: "click", Args: map[string]any{"x": float64(1), "y": float64(2)}}
	go func() { _, e := s.lexopenRunComputer(ctx, sess.ID, 0, k, a); done <- e }()
	ap := computerAwaitApproval(t, s, store, sess.ID)
	if f.count() != 0 || !approvals.ValidComputerAction(ap) {
		t.Fatal("executed before review")
	}
	if _, e := s.DecideApproval(context.Background(), ap.ID, true, "", true); e == nil {
		t.Fatal("generic approval bypass")
	}
	if _, e := s.SetComputerPolicy(sess.ID, computerUpdate(k, "autonomous", 1)); !errors.Is(e, ErrBusy) {
		t.Fatal("policy changed while waiting", e)
	}
	claim := computerClaim(ap)
	bad := claim
	bad.ActionHash = strings.Repeat("b", 64)
	if _, e := s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, bad); e == nil {
		t.Fatal("wrong hash accepted")
	}
	bad = claim
	bad.ChatID = "foreign"
	if _, e := s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, bad); e == nil {
		t.Fatal("wrong chat accepted")
	}
	if _, e := s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", true, claim); e == nil {
		t.Fatal("always accepted")
	}
	result, e := s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, claim)
	if e != nil || result.ComputerResult == nil || !result.ComputerResult.Completed || result.ComputerResult.State != "executed" || f.count() != 1 {
		t.Fatal("missing concrete one-use result", result, e)
	}
	select {
	case e = <-done:
		if e != nil {
			t.Fatal(e)
		}
	case <-time.After(time.Second):
		t.Fatal("original task not resumed")
	}
	if _, e = s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, claim); e == nil || f.count() != 1 {
		t.Fatal("approval replay", e)
	}
}
func TestLexOpenComputerCancelRestartHoldSecretAndDelegation(t *testing.T) {
	s, f, sess, k, store := computerServiceFixture(t)
	s.SetComputerPolicy(sess.ID, computerUpdate(k, "intelligent", 0))
	computerArmTurn(s, sess)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	a := desktop.Action{Name: "page_type", Args: map[string]any{"ref": float64(1), "text": "fixture", "enter": true}}
	go func() { _, e := s.lexopenRunComputer(ctx, sess.ID, 0, k, a); done <- e }()
	ap := computerAwaitApproval(t, s, store, sess.ID)
	f.mu.Lock()
	f.held = true
	f.mu.Unlock()
	if _, e := s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, computerClaim(ap)); !errors.Is(e, ErrComputerHeld) {
		t.Fatal("human hold bypass", e)
	}
	cancel()
	<-done
	if _, e := s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, computerClaim(ap)); e == nil || f.count() != 0 {
		t.Fatal("cancel replay", e)
	}
	reopened, e := New(f, s.dir)
	if e != nil {
		t.Fatal(e)
	}
	reopened.SetApprovals(store)
	if _, e = reopened.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, computerClaim(ap)); e == nil {
		t.Fatal("restart revived waiter")
	}
	if _, e = s.lexopenRunComputer(context.Background(), sess.ID, 0, k, desktop.Action{Name: "type_secret", Args: map[string]any{"name": "fixture"}}); e == nil || f.count() != 0 {
		t.Fatal("secret entered generic gate")
	}
	var turn Turn
	outs := s.runNonDesktop(context.Background(), sess.ID, []action{{kind: "delegate", name: "delegate", args: map[string]any{"kitty": "bo", "task": "click"}}, {kind: "machine", name: "machine", args: map[string]any{"action": "off"}}}, k, nil, &turn)
	if len(outs) != 2 || outs[0].err == "" || outs[1].err == "" || f.count() != 0 {
		t.Fatal("managed nonDesktop escaped gate")
	}
}

func TestLexOpenComputerRealTaskStopsUnknownBeforeModelRetry(t *testing.T) {
	s, f, sess, k, _ := computerServiceFixture(t)
	s.SetComputerPolicy(sess.ID, computerUpdate(k, "autonomous", 0))
	brain := f.brains[k.ID].(*scripted)
	brain.replies = []string{`@tool click {"x":1,"y":2}`, `@tool click {"x":1,"y":2}`}
	f.failure = errors.New("fixture unknown effect")
	if _, e := s.Send(context.Background(), sess.ID, "click the fixture once"); e != nil {
		t.Fatal(e)
	}
	got := waitDone(t, s, sess.ID)
	if f.count() != 1 {
		t.Fatal("unknown physical action retried", f.count())
	}
	brain.mu.Lock()
	n := len(brain.seen)
	brain.mu.Unlock()
	if n != 1 {
		t.Fatal("model asked to retry after uncertain effect", n)
	}
	turn := got.Turns[len(got.Turns)-1]
	if len(turn.Steps) != 1 || turn.Steps[0].Action != "click" || turn.Steps[0].Error == "" || !turn.NeedsHelp {
		t.Fatal("missing reviewable action step/stop", turn)
	}
}
func TestLexOpenComputerRealParsersSecretAndMachineCannotBypass(t *testing.T) {
	for _, text := range []string{`@tool type_secret {"name":"fixture"}`, `@tool machine {"action":"off"}`} {
		t.Run(text, func(t *testing.T) {
			s, f, sess, k, store := computerServiceFixture(t)
			s.SetComputerPolicy(sess.ID, computerUpdate(k, "autonomous", 0))
			brain := f.brains[k.ID].(*scripted)
			brain.replies = []string{text, `@tool done {"summary":"fixture no action"}`}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if _, e := s.Send(ctx, sess.ID, "fixture tool boundary"); e != nil {
				t.Fatal(e)
			}
			if strings.Contains(text, "machine") {
				ap := computerAwaitApproval(t, s, store, sess.ID)
				if ap.Action != "machine" {
					t.Fatal("wrong actual action")
				}
				if _, e := s.DecideComputerUseApproval(context.Background(), ap.ID, false, "fixture reject", false, computerClaim(ap)); e != nil {
					t.Fatal(e)
				}
			}
			waitDone(t, s, sess.ID)
			if f.count() != 0 {
				t.Fatal("secret or machine escaped native gate")
			}
		})
	}
}

func TestLexOpenComputerNativeSupervisedLocalReadApprovalIsExecution(t *testing.T) {
	s, f, sess, k, store := computerServiceFixture(t)
	s.SetComputerPolicy(sess.ID, computerUpdate(k, "supervised", 0))
	path := "/home/kitty/work/imports/" + strings.Repeat("b", 64) + "/fixture.txt"
	brain := &toolBrain{replies: []provider.Reply{{Calls: []provider.ToolCall{{ID: "read1", Name: "run", Args: map[string]any{"argv": []any{"cat", path}}}}}, {Calls: []provider.ToolCall{{ID: "done1", Name: "done", Args: map[string]any{"summary": "fixture read"}}}}}}
	f.brains[k.ID] = brain
	if _, e := s.Send(context.Background(), sess.ID, "read selected local fixture"); e != nil {
		t.Fatal(e)
	}
	ap := computerAwaitApproval(t, s, store, sess.ID)
	if ap.ComputerAction.Category != "local_read" || f.count() != 0 {
		t.Fatal("wrong read gate", ap)
	}
	result, e := s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, computerClaim(ap))
	if e != nil || result.ComputerResult == nil || !result.ComputerResult.Attempted || !result.ComputerResult.Completed {
		t.Fatal("executed read mislabeled", result, e)
	}
	waitDone(t, s, sess.ID)
	f.mu.Lock()
	calls := append([]string{}, f.calls...)
	f.mu.Unlock()
	if len(calls) != 1 || !strings.HasPrefix(calls[0], "python3 -I -c ") {
		t.Fatal("model argv executed instead of attested reader", calls)
	}
	k.Desktop = false
	if _, e = s.lexopenRunComputer(context.Background(), sess.ID, 0, k, desktop.Action{Name: "read_screen", Args: map[string]any{}}); !errors.Is(e, ErrComputerPolicy) || f.count() != 1 {
		t.Fatal("nonDesktop target bypass", e)
	}
}
func TestLexOpenComputerConsultationLimitDoesNotGrant(t *testing.T) {
	s, f, sess, k, store := computerServiceFixture(t)
	u := computerUpdate(k, "intelligent", 0)
	u.MaxConsultations = 1
	s.SetComputerPolicy(sess.ID, u)
	computerArmTurn(s, sess)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	a := desktop.Action{Name: "run", Args: map[string]any{"argv": []any{"true"}}}
	go func() { _, e := s.lexopenRunComputer(ctx, sess.ID, 0, k, a); done <- e }()
	computerAwaitApproval(t, s, store, sess.ID)
	cancel()
	<-done
	if _, e := s.lexopenRunComputer(context.Background(), sess.ID, 0, k, a); !errors.Is(e, ErrComputerBudget) || f.count() != 0 {
		t.Fatal("consultation exhaustion granted command", e)
	}
}

func TestLexOpenComputerExecutionReservationSurvivesInterruptedProcess(t *testing.T) {
	s, f, sess, k, _ := computerServiceFixture(t)
	s.SetComputerPolicy(sess.ID, computerUpdate(k, "autonomous", 0))
	f.entered = make(chan struct{}, 1)
	f.release = make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	a := desktop.Action{Name: "click", Args: map[string]any{"x": float64(1), "y": float64(2)}}
	go func() { _, e := s.lexopenRunComputer(ctx, sess.ID, 0, k, a); done <- e }()
	select {
	case <-f.entered:
	case <-time.After(time.Second):
		t.Fatal("fixture did not execute")
	}
	restarted, e := New(f, s.dir)
	if e != nil {
		t.Fatal(e)
	}
	p, e := restarted.ComputerPolicy(sess.ID, k.ID, strings.Repeat("a", 64))
	if e != nil || !p.OutcomeUnknown {
		t.Fatal("in-flight execution lacked durable reservation", p, e)
	}
	reloaded, _ := restarted.Get(sess.ID)
	if reloaded.ComputerExecution == nil || reloaded.ComputerExecution.State != "pending" || reloaded.ComputerExecution.Action != "click" || reloaded.ComputerExecution.Args["x"] != float64(1) {
		t.Fatal("crash lost reserved real action")
	}
	cancel()
	if e = <-done; !errors.Is(e, ErrComputerOutcomeUnknown) {
		t.Fatal("interrupted execution not uncertain", e)
	}
	if _, e = restarted.lexopenRunComputer(context.Background(), sess.ID, 0, k, a); !errors.Is(e, ErrComputerOutcomeUnknown) || f.count() != 1 {
		t.Fatal("restart replayed reserved action", e)
	}
}
func TestLexOpenComputerReceiptWriteFailureKeepsMutationBlocked(t *testing.T) {
	s, f, sess, k, _ := computerServiceFixture(t)
	dir := filepath.Join(t.TempDir(), "store")
	store, e := approvals.Open(filepath.Join(dir, "approvals.json"))
	if e != nil {
		t.Fatal(e)
	}
	s.SetApprovals(store)
	s.SetComputerPolicy(sess.ID, computerUpdate(k, "intelligent", 0))
	computerArmTurn(s, sess)
	f.afterExec = func() {
		if e := os.RemoveAll(dir); e != nil {
			panic(e)
		}
		if e := os.WriteFile(dir, []byte("fixture blocks receipt persistence"), 0600); e != nil {
			panic(e)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	a := desktop.Action{Name: "click", Args: map[string]any{"x": float64(1), "y": float64(2)}}
	go func() { _, e := s.lexopenRunComputer(ctx, sess.ID, 0, k, a); done <- e }()
	ap := computerAwaitApproval(t, s, store, sess.ID)
	if _, e = s.DecideComputerUseApproval(context.Background(), ap.ID, true, "", false, computerClaim(ap)); !errors.Is(e, ErrComputerPolicy) {
		t.Fatal("receipt failure reported completed", e)
	}
	if e = <-done; !errors.Is(e, ErrComputerPolicy) {
		t.Fatal(e)
	}
	p, e := s.ComputerPolicy(sess.ID, k.ID, strings.Repeat("a", 64))
	if e != nil || !p.OutcomeUnknown {
		t.Fatal("receipt failure cleared reservation", p, e)
	}
	if _, e = s.lexopenRunComputer(context.Background(), sess.ID, 0, k, a); !errors.Is(e, ErrComputerOutcomeUnknown) || f.count() != 1 {
		t.Fatal("unreceipted effect replayed", e)
	}
}
