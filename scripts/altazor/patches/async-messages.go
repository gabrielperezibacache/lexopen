package chat

// This opt-in protocol leaves the pinned synchronous API unchanged. Acceptance is
// committed before model work starts; an interrupted request is never replayed.
import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/madkoding/kitties/internal/attach"
	"github.com/madkoding/kitties/internal/kitty"
)

const AsyncMessagesVersion = "v1"
const maxAsyncRequests = 10000

var asyncIdentifier = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)
var ErrAsyncConflict = errors.New("the request identifier already belongs to different content")
var ErrAsyncInvalid = errors.New("the asynchronous message is not valid")

type AsyncReceipt struct {
	RequestID string `json:"request_id"`
	ChatID    string `json:"chat_id"`
	Status    string `json:"status"`
	State     string `json:"state"`
}

// AsyncRequest is stored with its turns in the same atomic session snapshot.
// Hash contains no plaintext, credential or file path. Turn indexes are immutable.
type AsyncRequest struct {
	Hash     string `json:"hash"`
	State    string `json:"state"`
	UserTurn int    `json:"user_turn"`
	Turn     int    `json:"turn"`
}

func copyAsyncRequests(in map[string]AsyncRequest) map[string]AsyncRequest {
	if in == nil {
		return nil
	}
	out := make(map[string]AsyncRequest, len(in))
	for id, request := range in {
		out[id] = request
	}
	return out
}

func asyncHash(text string, files []attach.Upload) string {
	type fileHash struct {
		Name string
		MIME string
		Hash string
	}
	body := struct {
		Text  string
		Files []fileHash
	}{Text: text}
	for _, file := range files {
		digest := sha256.Sum256(file.Data)
		body.Files = append(body.Files, fileHash{file.Name, file.MIME, hex.EncodeToString(digest[:])})
	}
	data, _ := json.Marshal(body)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func receiptFor(id, requestID string, request AsyncRequest) AsyncReceipt {
	return AsyncReceipt{RequestID: requestID, ChatID: id, Status: "accepted", State: request.State}
}

// AcceptFiles returns after durable acceptance, not after the first model call.
// Its single-desktop scope matches the private desktop broker; group chats keep
// using the unchanged synchronous endpoint.
func (s *Service) AcceptFiles(ctx context.Context, id, text string, files []attach.Upload, requestID string) (AsyncReceipt, error) {
	text = strings.TrimSpace(text)
	if !asyncIdentifier.MatchString(id) || !asyncIdentifier.MatchString(requestID) ||
		(text == "" && len(files) == 0) || len(text) > 64000 || utf8.RuneCountInString(text) > 16000 {
		return AsyncReceipt{}, ErrAsyncInvalid
	}
	metas, err := inspectAll(files)
	if err != nil {
		return AsyncReceipt{}, err
	}
	hash := asyncHash(text, files)
	lock := s.lockFor(id)
	lock.Lock()
	defer lock.Unlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return AsyncReceipt{}, fmt.Errorf("no such chat %q", id)
	}
	if previous, exists := sess.AsyncRequests[requestID]; exists {
		if previous.Hash != hash {
			return AsyncReceipt{}, ErrAsyncConflict
		}
		return receiptFor(id, requestID, previous), nil
	}
	if sess.Working() || s.tasks[id] != nil {
		return AsyncReceipt{}, ErrBusy
	}
	if len(sess.AsyncRequests) >= maxAsyncRequests {
		return AsyncReceipt{}, ErrAsyncInvalid
	}
	if len(sess.Members) != 1 {
		return AsyncReceipt{}, ErrAsyncInvalid
	}
	k, err := s.fleet.Get(sess.Members[0])
	if err != nil {
		return AsyncReceipt{}, err
	}
	if !k.Desktop {
		return AsyncReceipt{}, ErrAsyncInvalid
	}
	if err := ctx.Err(); err != nil {
		return AsyncReceipt{}, err
	}
	// Never overwrite or later clean up a file that predates this acceptance.
	for _, meta := range metas {
		for _, path := range []string{filepath.Join(filesDir(s.dir, id), meta.ID), filepath.Join(filesDir(s.dir, id), meta.ID) + ".tmp"} {
			if _, err := os.Lstat(path); !errors.Is(err, os.ErrNotExist) {
				if err != nil {
					return AsyncReceipt{}, err
				}
				return AsyncReceipt{}, errors.New("attachment storage identifier already exists")
			}
		}
	}
	if err := s.storeFiles(id, metas, files); err != nil {
		s.cleanupAsyncFiles(id, metas)
		return AsyncReceipt{}, err
	}
	if err := s.syncAsyncFiles(id, metas); err != nil {
		s.cleanupAsyncFiles(id, metas)
		return AsyncReceipt{}, err
	}
	if err := ctx.Err(); err != nil {
		s.cleanupAsyncFiles(id, metas)
		return AsyncReceipt{}, err
	}
	candidate := *sess
	candidate.Turns = append([]Turn(nil), sess.Turns...)
	candidate.AsyncRequests = copyAsyncRequests(sess.AsyncRequests)
	if candidate.AsyncRequests == nil {
		candidate.AsyncRequests = map[string]AsyncRequest{}
	}
	userTurn, index := len(candidate.Turns), len(candidate.Turns)+1
	candidate.Turns = append(candidate.Turns,
		Turn{At: s.now(), From: "user", Text: text, Attachments: metas},
		Turn{At: s.now(), From: k.Name, Kitty: k.ID, Working: true, AsyncPending: true})
	candidate.UpdatedAt = s.now()
	request := AsyncRequest{Hash: hash, State: "accepted", UserTurn: userTurn, Turn: index}
	candidate.AsyncRequests[requestID] = request
	committed, err := s.saveAsync(&candidate)
	if err != nil {
		if !committed {
			s.cleanupAsyncFiles(id, metas)
		} else {
			// A rename succeeded but its directory could not be synced. Preserve
			// the receipt and files, never execute an uncertain acceptance.
			s.interruptAsync(&candidate)
			s.sessions[id] = &candidate
			_, _ = s.saveAsync(&candidate)
		}
		return AsyncReceipt{}, err
	}
	s.sessions[id] = &candidate
	// Register cancellation before releasing the lock or acknowledging. The same
	// context owns both planning and desktop work, without an unsafe hand-over.
	seconds := k.Limits.Or(s.DefaultLimits).MaxSeconds
	if seconds <= 0 || seconds > 600 {
		seconds = 600
	}
	workCtx, cancel := context.WithTimeout(context.Background(), time.Duration(seconds)*time.Second)
	running := &task{cancel: cancel}
	s.tasks[id] = running
	s.wg.Add(1)
	s.emitLocked(Event{Type: "turn", Session: id, Index: userTurn, Turn: &candidate.Turns[userTurn]})
	s.emitLocked(Event{Type: "turn", Session: id, Index: index, Turn: &candidate.Turns[index]})
	owned := *k
	go s.runAccepted(workCtx, id, requestID, index, &owned, running)
	return receiptFor(id, requestID, request), nil
}

func (s *Service) runAccepted(ctx context.Context, id, requestID string, index int, k *kitty.Kitty, running *task) {
	defer s.wg.Done()
	defer running.cancel()
	finalState := "interrupted"
	defer func() {
		panicked := recover() != nil
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.tasks[id] != running {
			return
		}
		delete(s.tasks, id)
		if sess := s.sessions[id]; sess != nil {
			request := sess.AsyncRequests[requestID]
			request.State = finalState
			if ctx.Err() != nil || panicked {
				request.State = "interrupted"
			}
			sess.AsyncRequests[requestID] = request
			if index >= 0 && index < len(sess.Turns) {
				turn := &sess.Turns[index]
				turn.Working, turn.AsyncPending = false, false
				if turn.Text == "" {
					turn.Text = "(Altazor stopped before finishing this task)"
				}
				if request.State == "interrupted" && turn.Detail == "" {
					turn.Detail = "task interrupted; it will not be replayed automatically"
				}
			}
			sess.UpdatedAt = s.now()
			if _, err := s.saveAsync(sess); err != nil {
				request.State = "interrupted"
				sess.AsyncRequests[requestID] = request
				if index >= 0 && index < len(sess.Turns) {
					sess.Turns[index].Detail = "task state could not be saved; no automatic replay"
				}
				_, _ = s.saveAsync(sess)
			}
			if index >= 0 && index < len(sess.Turns) {
				s.emitLocked(Event{Type: "update", Session: id, Index: index, Turn: &sess.Turns[index]})
			}
		}
	}()
	s.mu.Lock()
	sess := s.sessions[id]
	if sess == nil || s.tasks[id] != running {
		s.mu.Unlock()
		return
	}
	request := sess.AsyncRequests[requestID]
	request.State = "running"
	sess.AsyncRequests[requestID] = request
	_, err := s.saveAsync(sess)
	s.mu.Unlock()
	if err != nil {
		return
	}
	turn, pending, answerErr := s.answer(ctx, id, k, []*kitty.Kitty{k})
	if answerErr != nil {
		turn = Turn{At: s.now(), From: k.Name, Kitty: k.ID, Text: "(" + k.Name + " could not answer: " + Plain(answerErr.Error()) + ")", Detail: answerErr.Error()}
	}
	s.mu.Lock()
	sess = s.sessions[id]
	if sess == nil || s.tasks[id] != running || index >= len(sess.Turns) {
		s.mu.Unlock()
		return
	}
	turn.AsyncPending = false
	// Keep the reservation until the cancellation entry and receipt are finalized.
	turn.Working = true
	sess.Turns[index] = turn
	sess.UpdatedAt = s.now()
	_, err = s.saveAsync(sess)
	s.emitLocked(Event{Type: "update", Session: id, Index: index, Turn: &sess.Turns[index]})
	s.mu.Unlock()
	if err != nil || ctx.Err() != nil {
		return
	}
	if answerErr != nil {
		finalState = "completed"
		return
	}
	if pending != nil {
		s.runTask(ctx, id, index, k, pending)
	}
	if ctx.Err() == nil {
		finalState = "completed"
	}
}

// Called at startup only. It never dispatches an accepted task again.
func (s *Service) interruptAsync(sess *Session) bool {
	changed := false
	for id, request := range sess.AsyncRequests {
		if request.State != "accepted" && request.State != "running" {
			continue
		}
		request.State = "interrupted"
		sess.AsyncRequests[id] = request
		if request.Turn >= 0 && request.Turn < len(sess.Turns) {
			turn := &sess.Turns[request.Turn]
			turn.Working, turn.AsyncPending = false, false
			turn.Detail = "gateway interrupted; this task will not be replayed automatically"
			if turn.Text == "" {
				turn.Text = "(Altazor was interrupted before finishing this task)"
			}
		}
		changed = true
	}
	return changed
}

func (s *Service) cleanupAsyncFiles(id string, metas []attach.Attachment) {
	for _, meta := range metas {
		if !attachmentID.MatchString(meta.ID) {
			continue
		}
		path := filepath.Join(filesDir(s.dir, id), meta.ID)
		_ = os.Remove(path + ".tmp")
		_ = os.Remove(path)
	}
}

func syncAsyncPath(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	err = file.Sync()
	closeErr := file.Close()
	if err != nil {
		return err
	}
	return closeErr
}

func (s *Service) syncAsyncFiles(id string, metas []attach.Attachment) error {
	for _, meta := range metas {
		if err := syncAsyncPath(filepath.Join(filesDir(s.dir, id), meta.ID)); err != nil {
			return err
		}
	}
	if len(metas) > 0 {
		if err := syncAsyncPath(filesDir(s.dir, id)); err != nil {
			return err
		}
		// The first attachment creates chat/files: sync its parent entry too.
		return syncAsyncPath(filepath.Dir(filesDir(s.dir, id)))
	}
	return nil
}

// committed distinguishes a failed write (safe to roll back) from a rename whose
// durability could not be confirmed (keep the record, never execute it).
func (s *Service) saveAsync(sess *Session) (committed bool, err error) {
	if err = os.MkdirAll(s.dir, 0o700); err != nil {
		return false, err
	}
	data, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return false, err
	}
	file, err := os.CreateTemp(s.dir, ".async-*.tmp")
	if err != nil {
		return false, err
	}
	defer os.Remove(file.Name())
	if err = file.Chmod(0o600); err == nil {
		_, err = file.Write(data)
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return false, err
	}
	if err = os.Rename(file.Name(), filepath.Join(s.dir, sess.ID+".json")); err != nil {
		return false, err
	}
	return true, syncAsyncPath(s.dir)
}
