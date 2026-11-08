package connector

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strings"
)

const LexOpenFileReadsVersion = "v1"
var lexopenFileID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,200}$`)
var lexopenRepoPart = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,150}$`)

func lexopenFileName(value, fallback string) (string, error) {
	if value == "" { value = fallback }
	if value == "" || len(value) > 180 || strings.HasPrefix(value, ".") || strings.ContainsAny(value, "/\\\x00\r\n") { return "", errors.New("give a simple non-hidden file name") }
	for _, r := range value { if r < 32 || r == 127 { return "", errors.New("invalid file name") } }
	return value, nil
}

func lexopenGithubPath(value string) (string, error) {
	if value == "" || len(value) > 1500 { return "", errors.New("give the exact repository file path") }
	parts := strings.Split(strings.TrimPrefix(value, "/"), "/")
	for i, p := range parts {
		if p == "" || p == "." || p == ".." || strings.ContainsAny(p, "\\\x00\r\n?#%") { return "", errors.New("invalid repository file path") }
		parts[i] = url.PathEscape(p)
	}
	return strings.Join(parts, "/"), nil
}

func lexopenReadFiles(kind string) map[string]actionFn {
	switch kind {
	case "google-workspace":
		return map[string]actionFn{"download_file": func(s Settings, a map[string]any) (request, error) {
			id := str(a, "id")
			if !lexopenFileID.MatchString(id) { return request{}, errors.New("give the exact Drive file id from the selected result") }
			format := str(a, "format")
			target, fallback := "https://www.googleapis.com/drive/v3/files/" + id + "?alt=media", "drive-file.bin"
			if format != "" {
				mimes := map[string]string{"text":"text/plain", "pdf":"application/pdf", "docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
				mime, ok := mimes[format]; if !ok { return request{}, errors.New("export format must be text, pdf or docx") }
				target = "https://www.googleapis.com/drive/v3/files/" + id + "/export?mimeType=" + url.QueryEscape(mime)
				fallback = "drive-document." + map[string]string{"text":"txt", "pdf":"pdf", "docx":"docx"}[format]
			}
			name, err := lexopenFileName(str(a, "name"), fallback); if err != nil { return request{}, err }
			return request{method:"GET", url:target, file:name}, nil
		}}
	case "github":
		return map[string]actionFn{"download_file": func(s Settings, a map[string]any) (request, error) {
			repo := str(a, "repo"); parts := strings.Split(repo, "/")
			if len(parts) != 2 || !lexopenRepoPart.MatchString(parts[0]) || !lexopenRepoPart.MatchString(parts[1]) || parts[0] == "." || parts[0] == ".." || parts[1] == "." || parts[1] == ".." { return request{}, errors.New("give an explicit owner/repository") }
			filePath, err := lexopenGithubPath(str(a, "path")); if err != nil { return request{}, err }
			name, err := lexopenFileName(str(a, "name"), path.Base(str(a, "path"))); if err != nil { return request{}, err }
			target := "https://api.github.com/repos/" + repo + "/contents/" + filePath
			if ref := str(a, "ref"); ref != "" {
				if len(ref) > 200 || strings.ContainsAny(ref, "\x00\r\n?#") { return request{}, errors.New("invalid repository reference") }
				target += "?ref=" + url.QueryEscape(ref)
			}
			headers := bearer(s["token"]); headers["Accept"] = "application/vnd.github.raw+json"
			return request{method:"GET", url:target, headers:headers, file:name}, nil
		}}
	}
	return nil
}

func readActions(kind string) []Action {
	base := lexopenLegacyReadActions(kind)
	switch kind {
	case "google-workspace": return append(base, Action{Name:"download_file", Help:"download one selected Drive file or export a native Google document to the private artifact library (complete files only, 4 MiB maximum)", Args:[]string{"id (exact Drive file id)", "name (simple file name, optional)", "format (native Google documents only: text, pdf, docx; omit for regular files)"}})
	case "github": return append(base, Action{Name:"download_file", Help:"download one selected repository file to the private artifact library (complete files only, 4 MiB maximum)", Args:[]string{"repo (explicit owner/repository)", "path (exact file path)", "ref (optional)", "name (simple file name, optional)"}})
	}
	return base
}

func lexopenFileReceipt(req request, data []byte) string {
	hash := sha256.Sum256(data)
	return fmt.Sprintf("Downloaded complete file %s; %d bytes; sha256=%s; source=%s. The original bytes are in the private artifact library, not automatically opened on the desktop.", req.file, len(data), hex.EncodeToString(hash[:]), req.url)
}
