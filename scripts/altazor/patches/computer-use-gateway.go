package gateway

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/chat"
	"io"
	"net"
	"net/http"
)

type computerPolicyChats interface {
	ComputerPolicy(string, string, string) (chat.ComputerPolicyState, error)
	SetComputerPolicy(string, chat.ComputerPolicyUpdate) (chat.ComputerPolicyState, error)
	DecideComputerUseApproval(context.Context, string, bool, string, bool, chat.ComputerApprovalClaim) (*approvals.Approval, error)
}

func (s *Server) computerPolicyAllowed(r *http.Request) bool {
	host, _, e := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	token := r.Header.Get("Authorization")
	expected := "Bearer " + s.token
	return e == nil && ip != nil && ip.IsLoopback() && s.token != "" && subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1
}
func computerPolicyError(w http.ResponseWriter, status int) {
	w.Header().Set("Cache-Control", "no-store")
	reply(w, status, map[string]any{"error": "No se confirmó la autorización de uso del escritorio.", "code": "computer_policy_unknown"})
}
func (s *Server) handleComputerPolicy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.computerPolicyAllowed(r) {
		computerPolicyError(w, 403)
		return
	}
	controller, ok := s.chats.(computerPolicyChats)
	if !ok || s.approver == nil {
		computerPolicyError(w, 503)
		return
	}
	var state chat.ComputerPolicyState
	var e error
	if r.Method == http.MethodGet {
		if len(r.URL.Query()) != 2 || len(r.URL.Query()["kitty"]) != 1 || len(r.URL.Query()["binding"]) != 1 {
			computerPolicyError(w, 400)
			return
		}
		state, e = controller.ComputerPolicy(r.PathValue("id"), r.URL.Query().Get("kitty"), r.URL.Query().Get("binding"))
	} else {
		var body chat.ComputerPolicyUpdate
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&body) != nil || !errors.Is(decoder.Decode(new(any)), io.EOF) {
			computerPolicyError(w, 400)
			return
		}
		state, e = controller.SetComputerPolicy(r.PathValue("id"), body)
	}
	if e != nil {
		computerPolicyError(w, 409)
		return
	}
	reply(w, 200, state)
}
