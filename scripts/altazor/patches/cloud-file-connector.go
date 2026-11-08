package connector

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const LexOpenCloudFileOAuthVersion = "v1"

var cloudItemID = regexp.MustCompile(`^[A-Za-z0-9!_-]{1,200}$`)
var cloudGraphMetadata = regexp.MustCompile(`^/v1\.0/me/drive/(?:root(?:/children)?|items/[A-Za-z0-9!_-]{1,200}(?:/children)?)$`)
var cloudDownload = regexp.MustCompile(`^/v1\.0/me/drive/items/[A-Za-z0-9!_-]{1,200}/content$`)
var cloudFailure = errors.New("The selected cloud file could not be read safely.")
var cloudGeneratedAlias = regexp.MustCompile(`^altazor-(dropbox|microsoft)-[a-f0-9]{16}$`)

func lexopenCloudGeneratedKind(name string) string {
	m := cloudGeneratedAlias.FindStringSubmatch(name)
	if len(m) != 2 {
		return ""
	}
	if m[1] == "microsoft" {
		return "microsoft-365"
	}
	return "dropbox"
}

func cloudText(v any, max int, required bool) bool {
	s, ok := v.(string)
	if !ok {
		return !required && v == nil
	}
	if required && strings.TrimSpace(s) == "" || len(s) > max {
		return false
	}
	for _, r := range s {
		if r < 32 || r == 127 {
			return false
		}
	}
	return true
}
func cloudFields(args map[string]any, fields ...string) bool {
	allowed := map[string]bool{"action": true}
	for _, field := range fields {
		allowed[field] = true
	}
	for key := range args {
		if !allowed[key] {
			return false
		}
	}
	return true
}
func cloudPath(v any, root bool) bool {
	s, ok := v.(string)
	if !ok {
		return root && v == nil
	}
	if !cloudText(s, 1500, !root) || strings.ContainsAny(s, "\\?#%") || strings.Contains(s, "://") {
		return false
	}
	if s == "" || s == "/" {
		return root
	}
	if !strings.HasPrefix(s, "/") || path.Clean(s) != s {
		return false
	}
	return true
}
func cloudLimit(args map[string]any) bool {
	v, ok := args["limit"]
	return !ok || cloudText(v, 2, true) && lexopenFileQueryNumber(v.(string), 50)
}

// Exact file operations only: no credentials, arbitrary hosts, writes or unrelated Graph APIs.
func LexOpenValidateCloudFileCall(kind string, args map[string]any) error {
	action, ok := args["action"].(string)
	if !ok {
		return cloudFailure
	}
	if kind == "dropbox" {
		switch action {
		case "download_file", "read":
			if !cloudFields(args, "path", "name") || !cloudPath(args["path"], false) {
				return cloudFailure
			}
			if _, ok := args["name"]; ok {
				if _, e := lexopenFileName(str(args, "name"), ""); e != nil {
					return cloudFailure
				}
			}
			return nil
		case "list":
			if !cloudFields(args, "path", "limit") || !cloudPath(args["path"], true) || !cloudLimit(args) {
				return cloudFailure
			}
			return nil
		case "search":
			if !cloudFields(args, "query", "limit") || !cloudText(args["query"], 500, true) || !cloudLimit(args) {
				return cloudFailure
			}
			return nil
		}
		return cloudFailure
	}
	if kind != "microsoft-365" {
		return cloudFailure
	}
	switch action {
	case "download_file":
		if !cloudFields(args, "id", "name") || !cloudItemID.MatchString(str(args, "id")) {
			return cloudFailure
		}
		if _, e := lexopenFileName(str(args, "name"), "onedrive-file.bin"); e != nil {
			return cloudFailure
		}
		return nil
	case "list":
		if !cloudFields(args, "id", "limit") || !cloudLimit(args) {
			return cloudFailure
		}
		if v, ok := args["id"]; ok {
			if !cloudText(v, 200, true) || !cloudItemID.MatchString(v.(string)) {
				return cloudFailure
			}
		}
		return nil
	case "search":
		if !cloudFields(args, "query", "limit") || !cloudText(args["query"], 500, true) || !cloudLimit(args) {
			return cloudFailure
		}
		return nil
	case "request":
		if !cloudFields(args, "path", "method", "query") || !cloudText(args["path"], 1000, true) {
			return cloudFailure
		}
		if method, ok := args["method"]; ok && method != "GET" {
			return cloudFailure
		}
		target := str(args, "path")
		if !cloudGraphMetadata.MatchString(target) || strings.ContainsAny(target, "%\\?#") {
			return cloudFailure
		}
		if q, ok := args["query"]; ok {
			query, valid := q.(map[string]any)
			if !valid || len(query) > 3 {
				return cloudFailure
			}
			for key, value := range query {
				if !cloudText(value, 500, true) {
					return cloudFailure
				}
				switch key {
				case "$top":
					if !lexopenFileQueryNumber(value.(string), 50) {
						return cloudFailure
					}
				case "$select":
					for _, field := range strings.Split(value.(string), ",") {
						switch field {
						case "id", "name", "size", "file", "folder", "lastModifiedDateTime", "parentReference":
						default:
							return cloudFailure
						}
					}
				case "$orderby":
					if value != "name" && value != "lastModifiedDateTime desc" {
						return cloudFailure
					}
				default:
					return cloudFailure
				}
			}
		}
		return nil
	}
	return cloudFailure
}

func lexopenCloudReadFiles(kind string) map[string]actionFn {
	if kind == "dropbox" {
		return map[string]actionFn{"download_file": func(s Settings, a map[string]any) (request, error) {
			if LexOpenValidateCloudFileCall(kind, a) != nil {
				return request{}, cloudFailure
			}
			name, e := lexopenFileName(str(a, "name"), path.Base(str(a, "path")))
			if e != nil {
				return request{}, cloudFailure
			}
			raw, _ := json.Marshal(map[string]string{"path": str(a, "path")})
			headers := bearer(s["token"])
			headers["Dropbox-API-Arg"] = cloudASCIIJSON(raw)
			return request{method: "POST", url: dropboxContent + "/files/download", headers: headers, file: name}, nil
		}}
	}
	if kind != "microsoft-365" {
		return nil
	}
	return map[string]actionFn{
		"download_file": func(_ Settings, a map[string]any) (request, error) {
			if LexOpenValidateCloudFileCall(kind, a) != nil {
				return request{}, cloudFailure
			}
			name, _ := lexopenFileName(str(a, "name"), "onedrive-file.bin")
			return request{method: "GET", url: "https://graph.microsoft.com/v1.0/me/drive/items/" + url.PathEscape(str(a, "id")) + "/content", file: name}, nil
		},
		"list": func(_ Settings, a map[string]any) (request, error) {
			if LexOpenValidateCloudFileCall(kind, a) != nil {
				return request{}, cloudFailure
			}
			target := "https://graph.microsoft.com/v1.0/me/drive/root/children"
			if id := str(a, "id"); id != "" {
				target = "https://graph.microsoft.com/v1.0/me/drive/items/" + url.PathEscape(id) + "/children"
			}
			return request{method: "GET", url: target + "?$top=" + strconv.Itoa(limitOf(a))}, nil
		},
		"search": func(_ Settings, a map[string]any) (request, error) {
			if LexOpenValidateCloudFileCall(kind, a) != nil {
				return request{}, cloudFailure
			}
			q := url.PathEscape(strings.ReplaceAll(str(a, "query"), "'", "''"))
			return request{method: "GET", url: "https://graph.microsoft.com/v1.0/me/drive/root/search(q='" + q + "')?$top=" + strconv.Itoa(limitOf(a))}, nil
		},
	}
}

func cloudASCIIJSON(raw []byte) string {
	var out strings.Builder
	for _, r := range string(raw) {
		if r < 127 {
			out.WriteRune(r)
		} else {
			encoded, _ := json.Marshal(string(r))
			text := string(encoded)
			if r <= 0xffff {
				const hex = "0123456789abcdef"
				out.WriteString(`\u`)
				for _, shift := range []uint{12, 8, 4, 0} {
					out.WriteByte(hex[(r>>shift)&15])
				}
			} else {
				_ = text
				for _, unit := range []rune{0xd800 + (r-0x10000)/0x400, 0xdc00 + (r-0x10000)%0x400} {
					const hex = "0123456789abcdef"
					out.WriteString(`\u`)
					for _, shift := range []uint{12, 8, 4, 0} {
						out.WriteByte(hex[(unit>>shift)&15])
					}
				}
			}
		}
	}
	return out.String()
}

// Redirects are handled here, never by a client which forwards the Graph bearer.
var lexopenCloudHTTPDo = (&http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}).Do

func cloudCDN(raw string) bool {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || u.Fragment != "" || u.Hostname() == "" || len(raw) > 16000 {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return host == "files.1drv.com" || strings.HasSuffix(host, ".files.1drv.com") || strings.HasSuffix(host, ".sharepoint.com")
}
func cloudComplete(resp *http.Response, max int) ([]byte, error) {
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK || resp.ContentLength > int64(max) {
		return nil, cloudFailure
	}
	data, e := io.ReadAll(io.LimitReader(resp.Body, int64(max+1)))
	if e != nil || len(data) > max || resp.ContentLength >= 0 && resp.ContentLength != int64(len(data)) {
		return nil, cloudFailure
	}
	return data, nil
}
func lexopenSendMicrosoft(ctx context.Context, r request) ([]byte, error) {
	u, e := url.Parse(r.url)
	if e != nil || u.Scheme != "https" || u.Host != "graph.microsoft.com" || u.User != nil || u.Fragment != "" || r.method != "GET" {
		return nil, cloudFailure
	}
	if u.Path != "/v1.0/me" && !cloudGraphMetadata.MatchString(u.Path) && !cloudDownload.MatchString(u.Path) && !strings.HasPrefix(u.Path, "/v1.0/me/drive/root/search(q='") {
		return nil, cloudFailure
	}
	req, e := http.NewRequestWithContext(ctx, "GET", r.url, nil)
	if e != nil {
		return nil, cloudFailure
	}
	req.Header.Set("Authorization", r.headers["Authorization"])
	resp, e := lexopenCloudHTTPDo(req)
	if e != nil || resp == nil {
		return nil, cloudFailure
	}
	if r.file == "" {
		return cloudComplete(resp, 4<<20)
	}
	if !cloudDownload.MatchString(u.Path) {
		resp.Body.Close()
		return nil, cloudFailure
	}
	for redirects := 0; redirects < 3; redirects++ {
		if resp.StatusCode == http.StatusOK {
			return cloudComplete(resp, 4<<20)
		}
		location := resp.Header.Get("Location")
		status := resp.StatusCode
		resp.Body.Close()
		if redirects >= 2 || status != 302 && status != 303 && status != 307 && status != 308 || !cloudCDN(location) {
			return nil, cloudFailure
		}
		next, e := http.NewRequestWithContext(ctx, "GET", location, nil)
		if e != nil {
			return nil, cloudFailure
		}
		resp, e = lexopenCloudHTTPDo(next)
		if e != nil || resp == nil {
			return nil, cloudFailure
		}
	}
	resp.Body.Close()
	return nil, cloudFailure
}

// Never surface preauthenticated download URLs, raw errors or unrelated profile data.
func lexopenCloudRender(kind, action string, raw []byte) (string, bool) {
	if kind != "microsoft-365" || action != "list" && action != "search" && action != "request" {
		return "", false
	}
	var object map[string]any
	if json.Unmarshal(raw, &object) != nil {
		return "Read response unavailable.", true
	}
	project := func(item map[string]any) map[string]any {
		out := map[string]any{}
		for _, key := range []string{"id", "name", "size", "lastModifiedDateTime"} {
			switch v := item[key].(type) {
			case string:
				if len(v) <= 700 {
					out[key] = v
				}
			case float64:
				out[key] = v
			}
		}
		if _, ok := item["folder"]; ok {
			out["folder"] = true
		}
		if file, ok := item["file"].(map[string]any); ok {
			if mime, ok := file["mimeType"].(string); ok && len(mime) <= 200 {
				out["mimeType"] = mime
			}
		}
		return out
	}
	rows := []map[string]any{}
	if list, ok := object["value"].([]any); ok {
		for _, entry := range list {
			if item, ok := entry.(map[string]any); ok && len(rows) < 50 {
				rows = append(rows, project(item))
			}
		}
	} else {
		rows = append(rows, project(object))
	}
	for {
		out, _ := json.Marshal(map[string]any{"service": "microsoft-365", "items": rows, "page_only": true, "exhaustive": false})
		if len(out) <= 3500 {
			return string(out), true
		}
		rows = rows[:len(rows)-1]
	}
}
