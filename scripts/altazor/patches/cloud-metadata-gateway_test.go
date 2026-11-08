package gateway

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestLexOpenCloudMetadataCapabilityKeepsPreviousProtocols(t *testing.T) {
	server, _ := stagedGatewayFixture()
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, httptest.NewRequest("GET", "/v1/health", nil))
	var result map[string]any
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &result) != nil {
		t.Fatal("health failed")
	}
	for _, key := range []string{"lexopen_cloud_metadata", "lexopen_connected_file_focus", "lexopen_cloud_file_oauth", "lexopen_staged_file_actions", "lexopen_persistent_oauth"} {
		if result[key] != "v1" {
			t.Fatal("missing metadata/prior capability", key)
		}
	}
}
