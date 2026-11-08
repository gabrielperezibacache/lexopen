package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const ComputerUsePolicyVersion = "v1"

type ComputerUsePolicy struct {
	Mode                                string
	AllowInput, AllowBrowser, AllowApps bool
}
type ComputerDecision struct {
	Category      string
	Reason        string
	Automatic     bool
	Observation   bool
	LocalRead     bool
	EffectUnknown bool
}

var ErrComputerActionInvalid = errors.New("computer-use: invalid action; nothing was executed")
var importFile = regexp.MustCompile(`^/home/kitty/work/imports/([a-f0-9]{64})/([^/]{1,180})$`)

func computerString(v any, max int, required bool) bool {
	s, ok := v.(string)
	if !ok {
		return !required && v == nil
	}
	if len(s) > max || required && strings.TrimSpace(s) == "" {
		return false
	}
	for _, r := range s {
		if r == 0 || r == 127 || r < 32 && r != '\n' && r != '\t' {
			return false
		}
	}
	return true
}
func computerFields(args map[string]any, keys ...string) bool {
	allowed := map[string]bool{}
	for _, key := range keys {
		allowed[key] = true
	}
	for key := range args {
		if !allowed[key] {
			return false
		}
	}
	return true
}
func computerInteger(v any, min, max int) bool {
	var n int
	switch x := v.(type) {
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) || math.Trunc(x) != x {
			return false
		}
		n = int(x)
	case int:
		n = x
	case string:
		var e error
		n, e = strconv.Atoi(x)
		if e != nil {
			return false
		}
	default:
		return false
	}
	return n >= min && n <= max
}
func computerArgv(args map[string]any, key string) ([]string, bool) {
	raw, ok := args[key].([]any)
	if !ok || len(raw) == 0 || len(raw) > 32 {
		return nil, false
	}
	out := []string{}
	for _, v := range raw {
		if !computerString(v, 1024, true) {
			return nil, false
		}
		out = append(out, v.(string))
	}
	return out, true
}
func computerLocalTarget(value string) bool {
	m := importFile.FindStringSubmatch(value)
	return len(m) == 3 && !strings.HasPrefix(m[2], ".") && !strings.ContainsAny(m[2], "\\\x00\r\n%?#") && path.Clean(value) == value
}
func computerLocalRead(a Action) bool {
	argv, ok := computerArgv(a.Args, "argv")
	if !ok {
		return false
	}
	name := strings.TrimPrefix(argv[0], "/usr/bin/")
	switch name {
	case "cat", "head", "pdfinfo":
		return len(argv) == 2 && computerLocalTarget(argv[1])
	case "pdftotext":
		return len(argv) == 3 && argv[2] == "-" && computerLocalTarget(argv[1])
	}
	return false
}
func computerLocalApp(a Action) bool {
	argv, ok := computerArgv(a.Args, "argv")
	if !ok {
		return false
	}
	name := strings.TrimPrefix(argv[0], "/usr/bin/")
	if strings.Contains(name, "/") {
		return false
	}
	switch name {
	case "libreoffice", "soffice":
		if len(argv) > 3 {
			return false
		}
		if len(argv) > 1 && strings.HasPrefix(argv[1], "--") {
			if argv[1] != "--writer" && argv[1] != "--calc" && argv[1] != "--impress" && argv[1] != "--draw" {
				return false
			}
			return len(argv) == 2 || computerLocalTarget(argv[2])
		}
		return len(argv) == 1 || len(argv) == 2 && computerLocalTarget(argv[1])
	case "evince", "mousepad", "inkscape", "mtpaint":
		return len(argv) == 1 || len(argv) == 2 && computerLocalTarget(argv[1])
	}
	return false
}

// Only the actual tool and validated arguments decide permission. Model risk,
// purpose or category labels are invalid extra arguments, never authority.
func ClassifyComputerUse(a Action, p ComputerUsePolicy) (ComputerDecision, error) {
	raw, e := json.Marshal(a.Args)
	if e != nil || len(raw) > 16000 {
		return ComputerDecision{}, ErrComputerActionInvalid
	}
	valid := false
	d := ComputerDecision{Reason: "computer_effect_unknown", EffectUnknown: true}
	switch a.Name {
	case "screenshot", "read_screen", "page_read", "windows":
		valid = len(a.Args) == 0
		d = ComputerDecision{Category: "observation", Reason: "computer_observation", Automatic: true, Observation: true}
	case "wait":
		valid = computerFields(a.Args, "seconds") && (a.Args["seconds"] == nil || computerInteger(a.Args["seconds"], 1, 10))
		d = ComputerDecision{Category: "observation", Reason: "computer_observation", Automatic: true, Observation: true}
	case "focus":
		valid = computerFields(a.Args, "title") && computerString(a.Args["title"], 200, true)
		d.Category = "input"
	case "ask_help":
		valid = computerFields(a.Args, "reason") && computerString(a.Args["reason"], 1000, false)
		d = ComputerDecision{Category: "control", Reason: "computer_person_control", Automatic: true, Observation: true}
	case "done":
		valid = computerFields(a.Args, "summary") && computerString(a.Args["summary"], 4000, false)
		d = ComputerDecision{Category: "control", Reason: "computer_task_done", Automatic: true, Observation: true}
	case "click", "double_click", "move":
		valid = computerFields(a.Args, "x", "y", "button") && computerInteger(a.Args["x"], 0, 1279) && computerInteger(a.Args["y"], 0, 799)
		if b, ok := a.Args["button"]; ok {
			valid = valid && (b == "left" || b == "right" || b == "middle")
		}
		d.Category = "input"
	case "drag":
		valid = computerFields(a.Args, "x", "y", "to_x", "to_y")
		for _, key := range []string{"x", "to_x"} {
			valid = valid && computerInteger(a.Args[key], 0, 1279)
		}
		for _, key := range []string{"y", "to_y"} {
			valid = valid && computerInteger(a.Args[key], 0, 799)
		}
		d.Category = "input"
	case "scroll":
		valid = computerFields(a.Args, "direction", "amount") && (a.Args["amount"] == nil || computerInteger(a.Args["amount"], 1, 50)) && (a.Args["direction"] == nil || a.Args["direction"] == "up" || a.Args["direction"] == "down")
		d.Category = "input"
	case "type":
		valid = computerFields(a.Args, "text") && computerString(a.Args["text"], 2000, true)
		d.Category = "input"
	case "key":
		valid = computerFields(a.Args, "keys") && computerString(a.Args["keys"], 100, true) && !strings.ContainsAny(str(a.Args, "keys"), " \r\n\t")
		d.Category = "input"
	case "page_click":
		valid = computerFields(a.Args, "ref", "text") && (computerInteger(a.Args["ref"], 1, 1000) && a.Args["text"] == nil || a.Args["ref"] == nil && computerString(a.Args["text"], 200, true))
		d.Category = "input"
	case "page_type":
		valid = computerFields(a.Args, "ref", "text", "enter") && computerInteger(a.Args["ref"], 1, 1000) && computerString(a.Args["text"], 2000, true)
		if v, ok := a.Args["enter"]; ok {
			_, b := v.(bool)
			valid = valid && b
		}
		d.Category = "input"
	case "open":
		u, e := url.Parse(str(a.Args, "url"))
		valid = computerFields(a.Args, "url") && computerString(a.Args["url"], 3000, true) && e == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Hostname() != "" && u.User == nil
		d.Category = "browser"
	case "launch":
		_, ok := computerArgv(a.Args, "argv")
		valid = computerFields(a.Args, "argv") && ok
		d.Category = "apps"
		if !computerLocalApp(a) {
			d.Category = "command"
			d.Reason = "computer_command_requires_review"
		}
	case "run":
		_, ok := computerArgv(a.Args, "argv")
		valid = computerFields(a.Args, "argv") && ok
		d.Category = "command"
		d.Reason = "computer_command_requires_review"
		if computerLocalRead(a) {
			d = ComputerDecision{Category: "local_read", Reason: "computer_verified_local_read", LocalRead: true, Automatic: p.Mode == "intelligent" || p.Mode == "autonomous"}
		}
	case "install":
		argv, ok := computerArgv(a.Args, "packages")
		valid = computerFields(a.Args, "packages") && ok && len(argv) <= 20
		for _, name := range argv {
			valid = valid && packageName.MatchString(name)
		}
		d.Category = "install"
		d.Reason = "computer_install_requires_review"
	case "type_secret":
		return ComputerDecision{}, errors.New("computer-use: use the separate Secretos grant or person control; no secret was typed")
	case "machine":
		valid = computerFields(a.Args, "action") && (a.Args["action"] == nil || a.Args["action"] == "status" || a.Args["action"] == "on" || a.Args["action"] == "off")
		d.Category = "machine"
		d.Reason = "computer_machine_requires_review"
		if a.Args["action"] == nil || a.Args["action"] == "status" {
			d = ComputerDecision{Category: "observation", Reason: "computer_observation", Automatic: true, Observation: true}
		}
	}
	if !valid {
		return ComputerDecision{}, ErrComputerActionInvalid
	}
	if !d.Automatic && p.Mode == "autonomous" && (d.Category == "input" && p.AllowInput || d.Category == "browser" && p.AllowBrowser || d.Category == "apps" && p.AllowApps) {
		d.Automatic = true
		d.Reason = "computer_explicit_category_consent"
	}
	if !d.Automatic && p.Mode == "supervised" && d.Reason == "computer_effect_unknown" {
		d.Reason = "computer_supervised"
	}
	return d, nil
}

// A local read is attested in one process, through no-follow directory handles
// and the content hash. A symlink swap can never turn it into reading another file.
const computerVerifiedReader = `import hashlib,json,os,resource,stat,sys
resource.setrlimit(resource.RLIMIT_CPU,(8,8));resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024))
kind,expected,name=sys.argv[1:]
assert len(expected)==64 and all(c in '0123456789abcdef' for c in expected)
assert name and not name.startswith('.') and not any(ord(c)<32 or c in '/\\' for c in name)
flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
opened=[]
try:
 base=os.open('/home/kitty/work',flags);opened.append(base)
 for part in ('imports',expected):base=os.open(part,flags,dir_fd=base);opened.append(base)
 fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=base)
 with os.fdopen(fd,'rb') as f:
  assert stat.S_ISREG(os.fstat(f.fileno()).st_mode)
  data=f.read(4194305)
 assert len(data)<=4194304 and hashlib.sha256(data).hexdigest()==expected
 if kind in ('pdfinfo','pdftotext'):
  import io,logging,warnings
  warnings.simplefilter('ignore');logging.disable(logging.CRITICAL)
  from pypdf import PdfReader
  reader=PdfReader(io.BytesIO(data),strict=False);assert not reader.is_encrypted
  if kind=='pdfinfo':out=json.dumps({'pages':len(reader.pages),'bytes':len(data),'sha256':expected})
  else:out='\n'.join((p.extract_text() or '') for p in reader.pages[:20])
 else:
  out=data.decode('utf-8-sig',errors='replace')
  if kind=='head':out='\n'.join(out.splitlines()[:10])
 print(out[:12000]);print('\n[Native verified local read. Long text is a bounded preview, not a full-file receipt.]')
finally:
 for fd in reversed(opened):os.close(fd)
`

func ReadComputerLocal(ctx context.Context, r Runner, ref string, a Action) (string, error) {
	if !computerLocalRead(a) {
		return "", ErrComputerActionInvalid
	}
	argv, _ := computerArgv(a.Args, "argv")
	m := importFile.FindStringSubmatch(argv[1])
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, e := r.Exec(ctx, ref, "python3", "-I", "-c", computerVerifiedReader, strings.TrimPrefix(argv[0], "/usr/bin/"), m[1], m[2])
	if e != nil {
		return "", errors.New("computer-use: local read could not be verified")
	}
	if len(out) > 16000 {
		out = out[:16000]
	}
	return out, nil
}
