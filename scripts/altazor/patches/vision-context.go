package chat

import "github.com/madkoding/kitties/internal/provider"

// Desktop captures remain in the turn and UI. The model's declared capability
// controls only inference input, including images produced by native tool feedback.
func lexopenInferenceMessages(brain provider.Client, messages []provider.Message) []provider.Message {
	if provider.SeesImages(brain) { return messages }
	filtered := make([]provider.Message,len(messages))
	copy(filtered,messages)
	for i := range filtered {
		if len(filtered[i].Images)==0 { continue }
		filtered[i].Images=nil
		filtered[i].Content += "\n[The desktop image is retained for the person to monitor. It is not included in this request because your configured model does not accept images. Use read_screen for screen text and local document tools for files; do not claim to have seen the screenshot.]"
	}
	return filtered
}
