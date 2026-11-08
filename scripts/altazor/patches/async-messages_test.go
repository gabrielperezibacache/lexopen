package chat

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/madkoding/kitties/internal/attach"
	"github.com/madkoding/kitties/internal/provider"
)

type lexopenBlockingBrain struct {
	entered chan struct{}
	release chan struct{}
	once    sync.Once
	calls   atomic.Int32
}

func (b *lexopenBlockingBrain) Describe() string { return "synthetic blocking provider" }
func (b *lexopenBlockingBrain) Complete(ctx context.Context, messages []provider.Message) (provider.Reply, error) {
	b.calls.Add(1)
	b.once.Do(func() { close(b.entered) })
	select {
	case <-ctx.Done():
		return provider.Reply{}, ctx.Err()
	case <-b.release:
		return provider.Reply{Content: "Synthetic task complete"}, nil
	}
}

func lexopenAsyncFixture(t *testing.T) (*Service, *lexopenBlockingBrain, string) {
	t.Helper()
	f, _, _, _ := fleet(t)
	b := &lexopenBlockingBrain{entered: make(chan struct{}), release: make(chan struct{})}
	f.brains["a1"] = b
	s := service(t, f)
	chat, err := s.Create("Synthetic async fixture", []string{"ana"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Cancel(chat.ID); s.Wait() })
	return s, b, chat.ID
}

func TestLexOpenAsyncAcceptsDurablyBeforeModelAndCancelsPlanning(t *testing.T) {
	s, brain, id := lexopenAsyncFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	receipts := make(chan AsyncReceipt, 1)
	errors := make(chan error, 1)
	go func() {
		receipt, err := s.AcceptFiles(ctx, id, "Synthetic question", nil, "cuid_request_1")
		receipts <- receipt
		errors <- err
	}()
	select {
	case receipt := <-receipts:
		if err := <-errors; err != nil {
			t.Fatal(err)
		}
		if receipt.RequestID != "cuid_request_1" || receipt.ChatID != id || receipt.Status != "accepted" {
			t.Fatalf("invalid receipt: %+v", receipt)
		}
	case <-time.After(2 * time.Second):
		cancel()
		t.Fatal("acceptance waited for model inference")
	}
	cancel() // The HTTP request ending must not cancel already accepted work.
	select {
	case <-brain.entered:
	case <-time.After(time.Second):
		t.Fatal("worker did not start")
	}
	data, err := os.ReadFile(filepath.Join(s.dir, id+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var persisted Session
	if err := json.Unmarshal(data, &persisted); err != nil {
		t.Fatal(err)
	}
	if len(persisted.Turns) != 2 || !persisted.Working() || persisted.AsyncRequests["cuid_request_1"].Hash == "" {
		t.Fatal("accepted work was not persisted with working state")
	}
	if !s.Cancel(id) {
		t.Fatal("planning did not register cancellation before acceptance")
	}
	s.Wait()
	chat, _ := s.Get(id)
	if chat.Working() || chat.AsyncRequests["cuid_request_1"].State != "interrupted" {
		t.Fatal("cancel did not stop initial inference")
	}
}

func TestLexOpenAsyncDeduplicatesAndRejectsConflictsAndBusy(t *testing.T) {
	s, brain, id := lexopenAsyncFixture(t)
	if _, err := s.AcceptFiles(context.Background(), id, "Synthetic request", nil, "request-1"); err != nil {
		t.Fatal(err)
	}
	<-brain.entered
	if receipt, err := s.AcceptFiles(context.Background(), id, "Synthetic request", nil, "request-1"); err != nil || receipt.Status != "accepted" {
		t.Fatalf("dedup: %+v %v", receipt, err)
	}
	if _, err := s.AcceptFiles(context.Background(), id, "Different request", nil, "request-1"); !errors.Is(err, ErrAsyncConflict) {
		t.Fatalf("changed content was not a conflict: %v", err)
	}
	if _, err := s.AcceptFiles(context.Background(), id, "Another request", nil, "request-2"); !errors.Is(err, ErrBusy) {
		t.Fatalf("concurrent work was accepted: %v", err)
	}
	if _, err := s.Send(context.Background(), id, "Legacy concurrent send"); !errors.Is(err, ErrBusy) {
		t.Fatalf("legacy send bypassed reservation: %v", err)
	}
	close(brain.release)
	s.Wait()
	if receipt, err := s.AcceptFiles(context.Background(), id, "Synthetic request", nil, "request-1"); err != nil || receipt.State != "completed" {
		t.Fatalf("completed dedup: %+v %v", receipt, err)
	}
	chat, _ := s.Get(id)
	if brain.calls.Load() != 1 || len(chat.Turns) != 2 || chat.Working() {
		t.Fatal("accepted message ran more than once or kept its reservation")
	}
}

func TestLexOpenAsyncRestartInterruptsWithoutReplay(t *testing.T) {
	s, brain, id := lexopenAsyncFixture(t)
	s.mu.Lock()
	chat := s.sessions[id]
	chat.Turns = []Turn{{From: "user", Text: "Synthetic persisted request"}, {From: "ana", Kitty: "a1", Working: true, AsyncPending: true}}
	chat.AsyncRequests = map[string]AsyncRequest{"saved-request": {Hash: asyncHash("Synthetic persisted request", nil), State: "running", UserTurn: 0, Turn: 1}}
	if _, err := s.saveAsync(chat); err != nil {
		t.Fatal(err)
	}
	s.mu.Unlock()
	restarted, err := New(s.fleet, s.dir)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := restarted.Get(id)
	if got.Working() || got.Turns[1].AsyncPending || got.AsyncRequests["saved-request"].State != "interrupted" {
		t.Fatal("restart left accepted work runnable")
	}
	receipt, err := restarted.AcceptFiles(context.Background(), id, "Synthetic persisted request", nil, "saved-request")
	if err != nil || receipt.State != "interrupted" {
		t.Fatalf("restart dedup: %+v %v", receipt, err)
	}
	restarted.Wait()
	if brain.calls.Load() != 0 {
		t.Fatal("restart replayed a task")
	}
}

func TestLexOpenAsyncSaveFailureRollsBackAndRemovesOnlyNewFiles(t *testing.T) {
	s, brain, id := lexopenAsyncFixture(t)
	path := filepath.Join(s.dir, id+".json")
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	files := []attach.Upload{{Name: "fixture.txt", MIME: "text/plain", Data: []byte("Synthetic attachment")}}
	if _, err := s.AcceptFiles(context.Background(), id, "Synthetic request", files, "failed-request"); err == nil {
		t.Fatal("failed persistence was acknowledged")
	}
	chat, _ := s.Get(id)
	if len(chat.Turns) != 0 || len(chat.AsyncRequests) != 0 || chat.Working() || s.Cancel(id) || brain.calls.Load() != 0 {
		t.Fatal("failed acceptance leaked an in-memory task")
	}
	entries, err := os.ReadDir(filesDir(s.dir, id))
	if err != nil || len(entries) != 0 {
		t.Fatalf("new attachment files leaked: %v, %d", err, len(entries))
	}
	entries, _ = os.ReadDir(s.dir)
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) == ".tmp" {
			t.Fatal("temporary snapshot leaked")
		}
	}
}

func TestLexOpenAsyncValidatesBeforePersistence(t *testing.T) {
	s, brain, id := lexopenAsyncFixture(t)
	for _, requestID := range []string{"", "../../escape", "request with spaces"} {
		if _, err := s.AcceptFiles(context.Background(), id, "Synthetic request", nil, requestID); !errors.Is(err, ErrAsyncInvalid) {
			t.Fatalf("invalid id accepted: %v", err)
		}
	}
	if _, err := s.AcceptFiles(context.Background(), id, "", nil, "empty-request"); !errors.Is(err, ErrAsyncInvalid) {
		t.Fatal("empty message was accepted")
	}
	if _, err := s.AcceptFiles(context.Background(), id, "Synthetic request", []attach.Upload{{Name: "bad.exe", Data: []byte("MZsynthetic-executable")}}, "bad-file"); err == nil {
		t.Fatal("invalid attachment was accepted")
	}
	chat, _ := s.Get(id)
	if len(chat.Turns) != 0 || len(chat.AsyncRequests) != 0 || brain.calls.Load() != 0 {
		t.Fatal("validation mutated the chat")
	}
}

func TestLexOpenAsyncConcurrentIdenticalRequestStartsOneWorker(t *testing.T) {
	s, brain, id := lexopenAsyncFixture(t)
	var requests sync.WaitGroup
	for i := 0; i < 8; i++ {
		requests.Add(1)
		go func() {
			defer requests.Done()
			if _, err := s.AcceptFiles(context.Background(), id, "Synthetic request", nil, "same-request"); err != nil {
				t.Error(err)
			}
		}()
	}
	requests.Wait()
	<-brain.entered
	if brain.calls.Load() != 1 {
		t.Fatal("concurrent identical request was replayed")
	}
	s.Cancel(id)
	s.Wait()
}

func TestLexOpenAsyncContinuesDesktopTaskAndHidesPendingMarkerFromModel(t *testing.T) {
	s, desktop, brain := deskService(t, "@tool click {\"x\":1,\"y\":2}", "@tool done {\"summary\":\"Synthetic desktop task complete\"}")
	chat, err := s.Create("Synthetic desktop fixture", []string{"ana"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.AcceptFiles(context.Background(), chat.ID, "Synthetic desktop request", nil, "desktop-request"); err != nil {
		t.Fatal(err)
	}
	s.Wait()
	got, _ := s.Get(chat.ID)
	if got.Working() || got.AsyncRequests["desktop-request"].State != "completed" || len(got.Turns[1].Steps) == 0 || len(desktop.execs) == 0 {
		t.Fatal("accepted work did not continue its desktop task")
	}
	first := brain.seen[0]
	if first[len(first)-1].Role != "user" || !strings.Contains(first[len(first)-1].Content, "Synthetic desktop request") {
		t.Fatal("pending marker displaced the actual request in the model prompt")
	}
	if receipt, err := s.AcceptFiles(context.Background(), chat.ID, "Synthetic desktop request", nil, "desktop-request"); err != nil || receipt.State != "completed" || len(brain.seen) != 2 {
		t.Fatal("completed desktop work was replayed")
	}
}

func TestLexOpenAsyncLegacySendCannotBypassFinalizingTask(t *testing.T) {
	s, brain, id := lexopenAsyncFixture(t)
	_, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.tasks[id] = &task{cancel: cancel}
	s.mu.Unlock()
	if _, err := s.Send(context.Background(), id, "Synthetic concurrent legacy send"); !errors.Is(err, ErrBusy) {
		t.Fatalf("legacy send bypassed finalizing reservation: %v", err)
	}
	s.mu.Lock()
	delete(s.tasks, id)
	s.mu.Unlock()
	cancel()
	if brain.calls.Load() != 0 {
		t.Fatal("legacy send reached the provider")
	}
}

func TestLexOpenAsyncAttachmentContentIsPartOfDurableIdempotency(t *testing.T) {
	s, brain, id := lexopenAsyncFixture(t)
	files := []attach.Upload{{Name: "fixture.txt", MIME: "text/plain", Data: []byte("Synthetic original")}}
	if _, err := s.AcceptFiles(context.Background(), id, "Synthetic request", files, "file-request"); err != nil {
		t.Fatal(err)
	}
	<-brain.entered
	if _, err := s.AcceptFiles(context.Background(), id, "Synthetic request", files, "file-request"); err != nil {
		t.Fatal(err)
	}
	changed := []attach.Upload{{Name: "fixture.txt", MIME: "text/plain", Data: []byte("Synthetic changed")}}
	if _, err := s.AcceptFiles(context.Background(), id, "Synthetic request", changed, "file-request"); !errors.Is(err, ErrAsyncConflict) {
		t.Fatalf("changed attachment was accepted: %v", err)
	}
	entries, err := os.ReadDir(filesDir(s.dir, id))
	if err != nil || len(entries) != 1 {
		t.Fatal("duplicate request stored another attachment")
	}
	s.Cancel(id)
	s.Wait()
	if brain.calls.Load() != 1 {
		t.Fatal("duplicate attachment request executed again")
	}
}
