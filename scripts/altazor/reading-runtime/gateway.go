package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/madkoding/kitties/internal/desktop"
	"net/http"
	"time"
)

// The broker receives a bounded read API, never the gateway's arbitrary exec endpoint.
func (s *Server) handleLexopenRead(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var input map[string]any
	if err := decode(r, &input); err != nil {
		fail(w, http.StatusBadRequest, errors.New("invalid semantic reading request"))
		return
	}
	source, _ := input["source"].(string)
	delete(input, "source")
	argv, err := desktop.LexopenReadArgv(source, input)
	if err != nil {
		fail(w, http.StatusBadRequest, err)
		return
	}
	k, err := s.fleet.Get(r.PathValue("ref"))
	if err != nil {
		fail(w, codeFor(err), err)
		return
	}
	if !k.Desktop {
		fail(w, http.StatusConflict, errors.New("semantic reading requires a desktop"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	output, err := s.fleet.Exec(ctx, k.ID, argv...)
	if err != nil || len(output) > 256*1024 {
		fail(w, http.StatusBadGateway, errors.New("semantic reader unavailable; rebuild the LexOpen tools-2 desktop profile"))
		return
	}
	var result map[string]any
	if json.Unmarshal([]byte(output), &result) != nil || result["version"] != "v1" || result["source"] != source || result["redacted"] != true {
		fail(w, http.StatusBadGateway, errors.New("desktop did not return a compatible semantic reading"))
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	reply(w, http.StatusOK, result)
}
