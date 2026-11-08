package gateway

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestLexOpenConnectedFileFocusCapabilityPreservesExistingContracts(t *testing.T) {
	server, _ := stagedGatewayFixture()
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, httptest.NewRequest("GET", "/v1/health", nil))
	var health map[string]any
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &health) != nil {
		t.Fatal("health failed")
	}
	for _, key := range []string{"lexopen_connected_file_focus", "lexopen_file_task_focus", "lexopen_native_file_actions", "lexopen_cloud_file_oauth", "lexopen_staged_file_actions", "lexopen_persistent_oauth"} {
		if health[key] != "v1" {
			t.Fatal("missing native capability", key)
		}
	}
}
