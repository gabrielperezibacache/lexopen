package approvals

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func computerApprovalFixture() Approval {
	a := Approval{Kind: ComputerKind, Connector: ComputerConnector, Chat: "chat1", Kitty: "kitty1", Action: "click", Args: map[string]any{"x": float64(1), "y": float64(2)}}
	binding := strings.Repeat("a", 64)
	raw, _ := json.Marshal(map[string]any{"action": a.Action, "args": a.Args, "binding": binding, "chat_id": a.Chat, "kitty": a.Kitty, "policy_revision": 1})
	sum := sha256.Sum256(raw)
	a.ComputerAction = &ComputerActionBinding{Version: "v1", Binding: binding, PolicyRevision: 1, Category: "input", Reason: "computer_effect_unknown", EffectUnknown: true, ActionHash: hex.EncodeToString(sum[:]), ActionJSON: string(raw)}
	return a
}
func TestLexOpenComputerApprovalOneUseDurableNoAutoRule(t *testing.T) {
	path := filepath.Join(t.TempDir(), "approvals.json")
	s, e := Open(path)
	if e != nil {
		t.Fatal(e)
	}
	a, e := s.RequestComputerAction(computerApprovalFixture())
	if e != nil {
		t.Fatal(e)
	}
	a.Args["x"] = 9
	a.ComputerAction.Binding = "mutated"
	a, e = s.Get(a.ID)
	if e != nil || !ValidComputerAction(a) {
		t.Fatal("caller mutated stored action", e)
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	wins := 0
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := s.DecideComputerAction(a.ID, true, ""); e == nil {
				mu.Lock()
				wins++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if wins != 1 {
		t.Fatal("decision not atomic", wins)
	}
	reopened, e := Open(path)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = reopened.DecideComputerAction(a.ID, true, ""); e == nil {
		t.Fatal("restart replay")
	}
	if len(reopened.Rules()) != 0 || len(reopened.d.Stats) != 0 {
		t.Fatal("computer approvals learned rule")
	}
	b, e := reopened.RequestComputerAction(computerApprovalFixture())
	if e != nil || a.ID == b.ID {
		t.Fatal("new action reused consumed/cancelled identifier", e)
	}
}
func TestLexOpenComputerApprovalStorageFailureAndBinding(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "approvals.json"))
	a := computerApprovalFixture()
	a.ComputerAction.ActionHash = strings.Repeat("0", 64)
	if _, e := s.RequestComputerAction(a); e == nil {
		t.Fatal("wrong hash accepted")
	}
	ap, e := s.RequestComputerAction(computerApprovalFixture())
	if e != nil {
		t.Fatal(e)
	}
	original := s.path
	bad := t.TempDir()
	s.path = bad
	if _, e = s.DecideComputerAction(ap.ID, true, ""); e == nil {
		t.Fatal("rename failure ignored")
	}
	got, _ := s.Get(ap.ID)
	if got.Status != Pending {
		t.Fatal("memory advanced on uncommitted decision")
	}
	s.path = original
	if _, e = s.DecideComputerAction(ap.ID, true, ""); e != nil {
		t.Fatal(e)
	}
	evidence := ComputerActionResult{State: "executed", Attempted: true, Completed: true, ActionHash: ap.ComputerAction.ActionHash, PolicyRevision: 1, Binding: ap.ComputerAction.Binding, ChatID: ap.Chat, Kitty: "other"}
	if _, e = s.DoneComputerAction(ap.ID, "done", "", evidence); e == nil {
		t.Fatal("foreign receipt accepted")
	}
	evidence.Kitty = ap.Kitty
	if _, e = s.DoneComputerAction(ap.ID, "done", "", evidence); e != nil {
		t.Fatal(e)
	}
	if _, e = s.DoneComputerAction(ap.ID, "again", "", evidence); e == nil {
		t.Fatal("receipt replaced")
	}
	raw, e := os.ReadFile(original)
	if e != nil || !strings.Contains(string(raw), "computer_result") {
		t.Fatal("receipt not durable", e)
	}
}
