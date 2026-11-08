package gateway

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/madkoding/kitties/internal/attach"
	"github.com/madkoding/kitties/internal/chat"
	"github.com/madkoding/kitties/internal/kitty"
)

type lexopenAsyncChats struct {
	*fakeChats
	err   error
	calls int
}

func (c *lexopenAsyncChats) AcceptFiles(_ context.Context, id, text string, files []attach.Upload, requestID string) (chat.AsyncReceipt, error) {
	c.calls++
	if c.err != nil {
		return chat.AsyncReceipt{}, c.err
	}
	return chat.AsyncReceipt{RequestID: requestID, ChatID: id, Status: "accepted", State: "accepted"}, nil
}

func TestLexOpenAsyncGatewayAdvertisesCapabilityAndReturns202(t *testing.T) {
	f := &fakeFleet{kitties: map[string]*kitty.Kitty{}}
	c := &lexopenAsyncChats{fakeChats: &fakeChats{sessions: map[string]*chat.Session{}}}
	s := New(f, c, "fixture-token", "synthetic-test")
	server := httptest.NewServer(s)
	defer server.Close()
	code, health, _ := call(t, server, "GET", "/v1/health", "fixture-token", nil)
	if code != 200 || health["lexopen_async_messages"] != "v1" {
		t.Fatalf("capability missing: %d %+v", code, health)
	}
	code, receipt, _ := call(t, server, "POST", "/v1/chats/chat1/messages/async", "fixture-token", map[string]any{"text": "Synthetic request", "request_id": "request1"})
	if code != 202 || receipt["request_id"] != "request1" || receipt["chat_id"] != "chat1" || receipt["status"] != "accepted" {
		t.Fatalf("invalid acknowledgement: %d %+v", code, receipt)
	}
	for _, err := range []error{chat.ErrAsyncConflict, chat.ErrBusy} {
		c.err = err
		if code, _, _ := call(t, server, "POST", "/v1/chats/chat1/messages/async", "fixture-token", map[string]any{"text": "Synthetic request", "request_id": "request1"}); code != http.StatusConflict {
			t.Fatalf("expected conflict, got %d", code)
		}
	}
	c.err = chat.ErrAsyncInvalid
	if code, _, _ := call(t, server, "POST", "/v1/chats/chat1/messages/async", "fixture-token", map[string]any{"text": "Synthetic request", "request_id": "request1"}); code != http.StatusBadRequest {
		t.Fatalf("expected validation error, got %d", code)
	}
}

func TestLexOpenAsyncGatewayRequiresAuthenticationAndRealAcceptor(t *testing.T) {
	server, _, _ := setup(t)
	defer server.Close()
	if code, health, _ := call(t, server, "GET", "/v1/health", "tok", nil); code != 200 || health["lexopen_async_messages"] != nil {
		t.Fatal("legacy chat service advertised unavailable async protocol")
	}
	if code, _, _ := call(t, server, "POST", "/v1/chats/chat1/messages/async", "", map[string]any{"text": "Synthetic request", "request_id": "request1"}); code != http.StatusUnauthorized {
		t.Fatal("anonymous async submission was allowed")
	}
	if code, _, _ := call(t, server, "POST", "/v1/chats/chat1/messages/async", "tok", map[string]any{"text": "Synthetic request", "request_id": "request1"}); code != http.StatusServiceUnavailable {
		t.Fatalf("unsupported async protocol fell back to synchronous execution: %d", code)
	}
}
