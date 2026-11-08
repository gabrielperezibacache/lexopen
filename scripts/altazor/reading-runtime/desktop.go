package desktop

import (
	"errors"
	"math"
	"strconv"
	"strings"
)

// LexopenReadArgv exposes only the immutable, workspace-confined reader.
func LexopenReadArgv(source string, args map[string]any) ([]string, error) {
	if source != "browser" && source != "document" {
		return nil, errors.New("unknown semantic reading source")
	}
	argv := []string{"lexopen-read", source}
	allowed := map[string]bool{"offset": true, "limit": true, "query": true, "elementOffset": true, "elementLimit": true}
	if source == "document" {
		allowed["path"] = true
	}
	for key := range args {
		if !allowed[key] {
			return nil, errors.New("unsupported semantic reading option")
		}
	}
	if source == "document" {
		path, ok := args["path"].(string)
		if !ok || path == "" || len(path) > 1000 || strings.HasPrefix(path, "/") || strings.ContainsAny(path, "\\\x00\r\n") {
			return nil, errors.New("use a relative workspace document path")
		}
		for _, part := range strings.Split(path, "/") {
			if part == "" || strings.HasPrefix(part, ".") {
				return nil, errors.New("hidden or parent document paths are not supported")
			}
		}
		argv = append(argv, "--path="+path)
	}
	for _, field := range []struct {
		name, flag       string
		minimum, maximum int
	}{
		{"offset", "offset", 0, 2000000}, {"limit", "limit", 1000, 12000}, {"elementOffset", "element-offset", 0, 2000}, {"elementLimit", "element-limit", 1, 80},
	} {
		if value, found := args[field.name]; found {
			if f, ok := value.(float64); ok && (math.IsNaN(f) || math.IsInf(f, 0) || f != math.Trunc(f)) {
				return nil, errors.New("reading bounds must be integers")
			}
			n, err := num(args, field.name)
			if err != nil || n < field.minimum || n > field.maximum {
				return nil, errors.New("reading bounds exceed the supported range")
			}
			argv = append(argv, "--"+field.flag+"="+strconv.Itoa(n))
		}
	}
	if value, found := args["query"]; found {
		query, ok := value.(string)
		if !ok || len([]rune(query)) > 160 || strings.ContainsRune(query, 0) {
			return nil, errors.New("search is at most 160 characters")
		}
		argv = append(argv, "--query="+query)
	}
	return argv, nil
}
