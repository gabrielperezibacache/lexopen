package gateway

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"

	"github.com/madkoding/kitties/internal/attach"
	"github.com/madkoding/kitties/internal/chat"
)

type asyncChats interface {
	AcceptFiles(context.Context, string, string, []attach.Upload, string) (chat.AsyncReceipt, error)
}

func (s *Server) handleSendAsync(w http.ResponseWriter, r *http.Request) {
	acceptor, ok := s.chats.(asyncChats)
	if !ok {
		fail(w, http.StatusServiceUnavailable, fmt.Errorf("asynchronous messages are unavailable"))
		return
	}
	var body struct {
		Text      string `json:"text"`
		RequestID string `json:"request_id"`
		Files     []struct {
			Name string `json:"name"`
			MIME string `json:"mime"`
			Data string `json:"data"`
		} `json:"files"`
	}
	if err := decodeMax(r, &body, attach.MaxBody); err != nil {
		fail(w, codeFor(err), err)
		return
	}
	var files []attach.Upload
	for _, file := range body.Files {
		data, err := base64.StdEncoding.DecodeString(file.Data)
		if err != nil {
			fail(w, http.StatusBadRequest, fmt.Errorf("%s is not valid base64", attach.CleanName(file.Name)))
			return
		}
		files = append(files, attach.Upload{Name: file.Name, MIME: file.MIME, Data: data})
	}
	receipt, err := acceptor.AcceptFiles(r.Context(), r.PathValue("id"), body.Text, files, body.RequestID)
	if err != nil {
		fail(w, codeFor(err), err)
		return
	}
	reply(w, http.StatusAccepted, receipt)
}
