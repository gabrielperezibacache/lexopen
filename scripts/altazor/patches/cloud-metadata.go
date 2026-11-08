package connector

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const LexOpenCloudMetadataSchema = "lexopen-cloud-metadata.v1"
const lexopenCloudMetadataMaxRows = 50
const lexopenCloudMetadataMaxBytes = 3500

var lexopenMetadataMIME = regexp.MustCompile(`^[A-Za-z0-9!#$&^_.+-]{1,100}/[A-Za-z0-9!#$&^_.+-]{1,100}$`)

func lexopenMetadataText(value any, max int) string {
	if !cloudText(value, max, true) {
		return ""
	}
	text := value.(string)
	if !utf8.ValidString(text) {
		return ""
	}
	return text
}
func lexopenMetadataName(value any) string {
	text := lexopenMetadataText(value, 700)
	if text == "." || text == ".." || strings.ContainsAny(text, "/\\") {
		return ""
	}
	return text
}
func lexopenMetadataTime(value any) string {
	text := lexopenMetadataText(value, 50)
	if text == "" {
		return ""
	}
	stamp, e := time.Parse(time.RFC3339Nano, text)
	if e != nil {
		return ""
	}
	return stamp.UTC().Format(time.RFC3339Nano)
}

// List-folder metadata is a tagged file/folder union. SearchMatchV2 adds one
// MetadataV2 wrapper; legacy SearchMatch carries the metadata directly.
// Official definitions: https://dropbox.github.io/dropbox-sdk-js/global.html#FilesSearchMatchV2
func lexopenDropboxMetadata(entry any, search bool) (map[string]any, bool) {
	item, ok := entry.(map[string]any)
	if !ok {
		return nil, false
	}
	if !search {
		return item, true
	}
	item, ok = item["metadata"].(map[string]any)
	if !ok {
		return nil, false
	}
	if item[".tag"] == "metadata" {
		item, ok = item["metadata"].(map[string]any)
		if !ok {
			return nil, false
		}
	}
	return item, true
}
func lexopenMetadataItem(service string, item map[string]any) (map[string]any, bool) {
	name := lexopenMetadataName(item["name"])
	if name == "" {
		return nil, false
	}
	kind := "unknown"
	if service == "dropbox" {
		if tag, ok := item[".tag"].(string); ok && (tag == "file" || tag == "folder") {
			kind = tag
		}
	} else {
		_, folderPresent := item["folder"]
		_, filePresent := item["file"]
		_, folder := item["folder"].(map[string]any)
		_, file := item["file"].(map[string]any)
		if folder && !filePresent {
			kind = "folder"
		} else if file && !folderPresent {
			kind = "file"
		}
	}
	out := map[string]any{"kind": kind, "name": name}
	if service == "dropbox" {
		for _, field := range []string{"path_display", "path_lower"} {
			if value, ok := item[field]; ok && cloudPath(value, false) {
				out["path"] = value
				break
			}
		}
	} else {
		if id := lexopenMetadataText(item["id"], 200); cloudItemID.MatchString(id) {
			out["id"] = id
		}
	}
	if kind == "file" {
		if size, ok := item["size"].(float64); ok && !math.IsNaN(size) && !math.IsInf(size, 0) && size >= 0 && size <= 9007199254740991 && math.Trunc(size) == size {
			out["size"] = size
		}
		timestamp := item["server_modified"]
		if service == "microsoft-365" {
			timestamp = item["lastModifiedDateTime"]
			if file, ok := item["file"].(map[string]any); ok {
				if mime := lexopenMetadataText(file["mimeType"], 200); lexopenMetadataMIME.MatchString(mime) {
					out["mimeType"] = mime
				}
			}
		}
		if stamp := lexopenMetadataTime(timestamp); stamp != "" {
			out["modified_at"] = stamp
		}
	}
	return out, true
}

// This projection describes one bounded response only, never the account as a
// whole. It performs no request, pagination, filename-based type inference or
// content read, and excludes provider cursors, links and unrelated metadata.
func lexopenTypedCloudMetadata(service, action string, raw []byte) (string, bool) {
	if service != "dropbox" && service != "microsoft-365" || action != "list" && action != "search" && !(service == "microsoft-365" && action == "request") {
		return "", false
	}
	unavailable := "Read response unavailable."
	var object map[string]any
	if !utf8.Valid(raw) || json.Unmarshal(raw, &object) != nil || object == nil {
		return unavailable, true
	}
	var entries []any
	var ok bool
	if service == "dropbox" {
		field := "entries"
		if action == "search" {
			field = "matches"
		}
		entries, ok = object[field].([]any)
	} else {
		entries, ok = object["value"].([]any)
		if !ok && action == "request" {
			entries = []any{object}
			ok = true
		}
	}
	if !ok {
		return unavailable, true
	}
	rows := []map[string]any{}
	truncated := len(entries) > lexopenCloudMetadataMaxRows
	for index, entry := range entries {
		if index >= lexopenCloudMetadataMaxRows {
			break
		}
		var item map[string]any
		var valid bool
		if service == "dropbox" {
			item, valid = lexopenDropboxMetadata(entry, action == "search")
		} else {
			item, valid = entry.(map[string]any)
		}
		if !valid {
			truncated = true
			continue
		}
		projected, valid := lexopenMetadataItem(service, item)
		if !valid {
			truncated = true
			continue
		}
		rows = append(rows, projected)
	}
	for {
		out, e := json.Marshal(map[string]any{"schema": LexOpenCloudMetadataSchema, "service": service, "action": action, "items": rows, "page_only": true, "exhaustive": false, "items_truncated": truncated})
		if e != nil {
			return unavailable, true
		}
		if len(out) <= lexopenCloudMetadataMaxBytes {
			return string(out), true
		}
		if len(rows) == 0 {
			return unavailable, true
		}
		rows = rows[:len(rows)-1]
		truncated = true
	}
}
