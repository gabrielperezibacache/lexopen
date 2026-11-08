package connector

// FileReceipt is server-authored evidence, never a model's summary. It is
// published only after the exact bytes have been verified inside the desktop.
type FileReceipt struct {
	State string `json:"state"`
	RequestID string `json:"request_id"`
	ApprovalID string `json:"approval_id"`
	ChatID string `json:"chat_id"`
	Kitty string `json:"kitty"`
	Connector string `json:"connector"`
	Kind string `json:"kind"`
	Action string `json:"action"`
	Target map[string]any `json:"target"`
	LocalPath string `json:"local_path"`
	Name string `json:"name"`
	Bytes int `json:"bytes"`
	SHA256 string `json:"sha256"`
	Pages *int `json:"pages,omitempty"`
	FirstLine string `json:"first_line,omitempty"`
}
