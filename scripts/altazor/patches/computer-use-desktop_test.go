package desktop

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func computerTestAction(name string, args map[string]any) Action {
	return Action{Name: name, Args: args}
}
func TestLexOpenComputerClassifierConsentAndEffects(t *testing.T) {
	actions := []Action{computerTestAction("click", map[string]any{"x": float64(30), "y": float64(40)}), computerTestAction("page_type", map[string]any{"ref": float64(2), "text": "hello", "enter": true}), computerTestAction("focus", map[string]any{"title": "Document"}), computerTestAction("open", map[string]any{"url": "https://example.com/action"}), computerTestAction("launch", map[string]any{"argv": []any{"libreoffice", "--writer"}})}
	for _, a := range actions {
		for _, mode := range []string{"supervised", "intelligent", "autonomous"} {
			p := ComputerUsePolicy{Mode: mode}
			d, e := ClassifyComputerUse(a, p)
			if e != nil || d.Automatic || d.Observation || !d.EffectUnknown {
				t.Fatalf("mode alone granted %s/%s: %+v %v", mode, a.Name, d, e)
			}
			p.AllowInput = true
			p.AllowBrowser = true
			p.AllowApps = true
			d, e = ClassifyComputerUse(a, p)
			if e != nil || d.Automatic != (mode == "autonomous") {
				t.Fatalf("explicit consent mismatch %s/%s: %+v %v", mode, a.Name, d, e)
			}
		}
	}
	for _, name := range []string{"screenshot", "read_screen", "page_read", "windows"} {
		d, e := ClassifyComputerUse(computerTestAction(name, map[string]any{}), ComputerUsePolicy{})
		if e != nil || !d.Automatic || !d.Observation {
			t.Fatal(name, d, e)
		}
	}
}
func TestLexOpenComputerCommandsCannotUseAppConsent(t *testing.T) {
	p := ComputerUsePolicy{Mode: "autonomous", AllowInput: true, AllowBrowser: true, AllowApps: true}
	for _, a := range []Action{computerTestAction("run", map[string]any{"argv": []any{"sh", "-c", "echo danger"}}), computerTestAction("launch", map[string]any{"argv": []any{"python3", "-c", "print(1)"}}), computerTestAction("launch", map[string]any{"argv": []any{"libreoffice", "--headless", "--convert-to", "pdf"}}), computerTestAction("install", map[string]any{"packages": []any{"gimp"}}), computerTestAction("machine", map[string]any{"action": "off"})} {
		d, e := ClassifyComputerUse(a, p)
		if e != nil || d.Automatic {
			t.Fatal("command escaped explicit review", a, d, e)
		}
	}
	for _, a := range []Action{computerTestAction("click", map[string]any{"x": 1, "y": 2, "risk": "read"}), computerTestAction("click", map[string]any{"x": 1.5, "y": 2}), computerTestAction("run", map[string]any{"argv": []any{"cat", 5}}), computerTestAction("open", map[string]any{"url": "file:///etc/passwd"}), computerTestAction("open", map[string]any{"url": "https://user:password@example.com"}), computerTestAction("type_secret", map[string]any{"name": "fixture"}), computerTestAction("unknown", nil)} {
		if _, e := ClassifyComputerUse(a, p); e == nil {
			t.Fatal("invalid/secret action allowed", a)
		}
	}
}

type computerReaderFixture struct {
	root string
	argv []string
}

func (r *computerReaderFixture) Screenshot(context.Context, string) ([]byte, error) { return nil, nil }
func (r *computerReaderFixture) Exec(ctx context.Context, _ string, argv ...string) (string, error) {
	r.argv = append([]string{}, argv...)
	script := strings.ReplaceAll(argv[3], "/home/kitty/work", r.root)
	if runtime.GOOS == "darwin" {
		script = strings.ReplaceAll(script, "resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024))", "pass # macOS does not implement Linux RLIMIT_AS")
	}
	args := append([]string{"-I", "-c", script}, argv[4:]...)
	raw, e := exec.CommandContext(ctx, "python3", args...).CombinedOutput()
	return string(raw), e
}
func TestLexOpenComputerLocalReadAttestsHashAndRejectsSymlinks(t *testing.T) {
	root := t.TempDir()
	data := []byte("Native fixture text\nline two\n")
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	dir := filepath.Join(root, "imports", hash)
	if e := os.MkdirAll(dir, 0700); e != nil {
		t.Fatal(e)
	}
	path := filepath.Join(dir, "fixture.txt")
	if e := os.WriteFile(path, data, 0600); e != nil {
		t.Fatal(e)
	}
	r := &computerReaderFixture{root: root}
	a := computerTestAction("run", map[string]any{"argv": []any{"cat", "/home/kitty/work/imports/" + hash + "/fixture.txt"}})
	d, e := ClassifyComputerUse(a, ComputerUsePolicy{Mode: "intelligent"})
	if e != nil || !d.LocalRead || !d.Automatic {
		t.Fatal(d, e)
	}
	out, e := ReadComputerLocal(context.Background(), r, "fixture", a)
	if e != nil || !strings.Contains(out, string(data)) || len(r.argv) != 7 || r.argv[0] != "python3" {
		t.Fatal("not fixed attested reader", e, out)
	}
	if e = os.WriteFile(path, []byte("tampered"), 0600); e != nil {
		t.Fatal(e)
	}
	if _, e = ReadComputerLocal(context.Background(), r, "fixture", a); e == nil {
		t.Fatal("hash drift read")
	}
	os.Remove(path)
	outside := filepath.Join(root, "outside")
	os.WriteFile(outside, data, 0600)
	if e = os.Symlink(outside, path); e != nil {
		t.Fatal(e)
	}
	if _, e = ReadComputerLocal(context.Background(), r, "fixture", a); e == nil {
		t.Fatal("symlink file read")
	}
	os.Remove(path)
	os.Remove(dir)
	if e = os.Symlink(root, dir); e != nil {
		t.Fatal(e)
	}
	if _, e = ReadComputerLocal(context.Background(), r, "fixture", a); e == nil {
		t.Fatal("symlink directory read")
	}
	for _, argv := range [][]any{{"pdftotext", "-upw", "secret", "/home/kitty/work/imports/" + hash + "/fixture.txt", "-"}, {"cat", "/etc/passwd"}, {"pdfinfo", "/home/kitty/work/imports/" + hash + "/../private"}} {
		d, e = ClassifyComputerUse(computerTestAction("run", map[string]any{"argv": argv}), ComputerUsePolicy{Mode: "intelligent"})
		if e == nil && d.LocalRead {
			t.Fatal("untrusted local read", argv)
		}
	}
}
