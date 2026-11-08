package gateway

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"

	"github.com/madkoding/kitties/internal/chat"
)

type stagedMetadataChats interface {
	StageMetadataAction(context.Context, string, chat.StagedMetadataAction) (chat.StagedMetadataActionResult, error)
}

func (s *Server) handleLexopenStageMetadata(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	address, _, err := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(address)
	provided, bearer := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if err != nil || ip == nil || !ip.IsLoopback() || !bearer || s.token == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(s.token)) != 1 {
		lexopenMetadataStageError(w, 403, "metadata_action_forbidden")
		return
	}
	stager, ok := s.chats.(stagedMetadataChats)
	if !ok {
		lexopenMetadataStageError(w, 503, "metadata_action_unavailable")
		return
	}
	var body chat.StagedMetadataAction
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32768))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
		lexopenMetadataStageError(w, 400, "metadata_action_invalid")
		return
	}
	result, err := stager.StageMetadataAction(r.Context(), r.PathValue("id"), body)
	if err != nil {
		switch {
		case errors.Is(err, chat.ErrAsyncConflict):
			lexopenMetadataStageError(w, 409, "metadata_action_conflict")
		case errors.Is(err, chat.ErrBusy):
			lexopenMetadataStageError(w, 409, "metadata_action_busy")
		case errors.Is(err, chat.ErrStagedMetadataInvalid):
			lexopenMetadataStageError(w, 400, "metadata_action_invalid")
		default:
			lexopenMetadataStageError(w, 503, "metadata_action_unavailable")
		}
		return
	}
	reply(w, http.StatusOK, result)
}

func lexopenMetadataStageError(w http.ResponseWriter, status int, code string) {
	reply(w, status, map[string]any{"ok": false, "code": code, "error": "No se pudo preparar la consulta de metadatos seleccionada."})
}
