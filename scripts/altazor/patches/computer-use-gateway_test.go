package gateway

import (
	"context"
	"encoding/json"
	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/chat"
	"github.com/madkoding/kitties/internal/kitty"
	"net/http/httptest"
	"strings"
	"testing"
)

type computerGatewayChats struct {
	*fakeChats
	gets, puts, decides int
	last                chat.ComputerPolicyUpdate
}

func (c *computerGatewayChats) ComputerPolicy(id, k, b string) (chat.ComputerPolicyState, error) {
	c.gets++
	return chat.ComputerPolicyState{ChatID: id, Kitty: k, Binding: b, Mode: "supervised", MaxActions: 100, MaxConsultations: 20}, nil
}
func (c *computerGatewayChats) SetComputerPolicy(id string, u chat.ComputerPolicyUpdate) (chat.ComputerPolicyState, error) {
	c.puts++
	c.last = u
	return chat.ComputerPolicyState{Applied: true, ChatID: id, Kitty: u.Kitty, Binding: u.Binding, Revision: u.ExpectedRevision + 1, Mode: u.Mode}, nil
}
func (c *computerGatewayChats) DecideComputerUseApproval(_ context.Context, _ string, _ bool, _ string, _ bool, _ chat.ComputerApprovalClaim) (*approvals.Approval, error) {
	c.decides++
	return &approvals.Approval{Kind: approvals.ComputerKind}, nil
}
func computerGatewayRequest(s *Server, method, url, body, remote, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.RemoteAddr = remote
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	return rec
}
func TestLexOpenComputerPolicyGatewayBoundaryAndCapability(t *testing.T) {
	c := &computerGatewayChats{fakeChats: &fakeChats{sessions: map[string]*chat.Session{}}}
	s := New(&fakeFleet{kitties: map[string]*kitty.Kitty{}}, c, "fixture-token", "fixture")
	health := computerGatewayRequest(s, "GET", "/v1/health", "", "127.0.0.1:1234", "")
	if strings.Contains(health.Body.String(), "lexopen_computer_use_policy") {
		t.Fatal("advertised without approvals")
	}
	s.WithApprovals(&fakeApprover{})
	health = computerGatewayRequest(s, "GET", "/v1/health", "", "127.0.0.1:1234", "")
	var h map[string]any
	json.Unmarshal(health.Body.Bytes(), &h)
	if h["lexopen_computer_use_policy"] != "v1" {
		t.Fatal("missing concrete capability", h)
	}
	url := "/v1/lexopen/chats/chat1/computer-policy?kitty=kitty1&binding=" + strings.Repeat("a", 64)
	for _, tc := range []struct {
		remote, token string
		want          int
	}{{"127.0.0.1:1", "", 401}, {"192.0.2.1:1", "fixture-token", 403}, {"127.0.0.1:1", "wrong", 401}, {"127.0.0.1:1", "fixture-token", 200}} {
		r := computerGatewayRequest(s, "GET", url, "", tc.remote, tc.token)
		if r.Code != tc.want {
			t.Fatal(tc, r.Code, r.Body.String())
		}
	}
	if c.gets != 1 || c.puts != 0 {
		t.Fatal("GET changed desired state")
	}
	r := computerGatewayRequest(s, "GET", url+"&kitty=other", "", "127.0.0.1:1", "fixture-token")
	if r.Code != 400 {
		t.Fatal("duplicate scope accepted")
	}
	if r.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("policy cacheable")
	}
	body := `{"kitty":"kitty1","binding":"` + strings.Repeat("a", 64) + `","expected_revision":0,"mode":"intelligent","allow_input":false,"allow_browser":false,"allow_apps":false,"max_actions":100,"max_consultations":20}`
	r = computerGatewayRequest(s, "PUT", "/v1/lexopen/chats/chat1/computer-policy", body, "[::1]:1", "fixture-token")
	if r.Code != 200 || c.puts != 1 || c.last.Mode != "intelligent" {
		t.Fatal("valid exact update failed", r.Code, r.Body.String())
	}
	for _, invalid := range []string{strings.TrimSuffix(body, "}") + `,"risk":"safe"}`, body + `{}`, strings.Repeat(" ", 4097) + body} {
		r = computerGatewayRequest(s, "PUT", "/v1/lexopen/chats/chat1/computer-policy", invalid, "127.0.0.1:1", "fixture-token")
		if r.Code != 400 || c.puts != 1 {
			t.Fatal("invalid update reached controller", r.Code)
		}
	}
	claim := `{"computer":{"chat_id":"chat1","kitty":"kitty1","binding":"` + strings.Repeat("a", 64) + `","policy_revision":1,"action_hash":"` + strings.Repeat("b", 64) + `"}}`
	r = computerGatewayRequest(s, "POST", "/v1/approvals/action1/approve", claim, "192.0.2.1:1", "fixture-token")
	if r.Code != 403 || c.decides != 0 {
		t.Fatal("nonloopback computer decision")
	}
	r = computerGatewayRequest(s, "POST", "/v1/approvals/action1/approve", claim, "127.0.0.1:1", "fixture-token")
	if r.Code != 200 || c.decides != 1 {
		t.Fatal("computer claim not routed", r.Code, r.Body.String())
	}
}
