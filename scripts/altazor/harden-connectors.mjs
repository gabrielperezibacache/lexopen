import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export const PINNED_COMMIT = "6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3";
export const CONNECTOR_GATE = "v1";
const gateTests = `package chat

import (
  "context"
  "testing"
  "github.com/madkoding/kitties/internal/approvals"
  "github.com/madkoding/kitties/internal/connector"
)

func TestLexOpenGateIgnoresAutoAndRejectsModelRuleChanges(t *testing.T) {
  s, sa, posts, _, _ := gated(t)
  if _, err := s.SetApprovalRule("ana", "hook", "*", "ask"); err != nil { t.Fatal(err) }
  k, _ := s.fleet.Get("ana")
  for _, mode := range []string{"none", "auto", "off", "remove", "never", "ask"} {
    got := s.runLimit("", action{args: map[string]any{"connector":"hook", "mode":mode}}, k, map[string]string{"hook":"hook"}, &Turn{})
    if got.err == "" { t.Fatalf("model changed permissions with %s", mode) }
    if mode := s.approvals.ModeOf(k.ID, "hook", "*"); mode != approvals.ModeAsk { t.Fatalf("rule changed: %s", mode) }
  }
  if _, err := s.SetApprovalRule("ana", "hook", "*", "auto"); err != nil { t.Fatal(err) }
  sa.replies = []string{"@connector hook {\\"text\\":\\"fixture\\"}", "Waiting"}
  sess, _ := s.Create("", []string{"ana"})
  turns, err := s.Send(context.Background(), sess.ID, "fixture")
  if err != nil || *posts != 0 || len(turns[0].Approvals) != 1 { t.Fatalf("not held: %v posts=%d turns=%+v", err, *posts, turns) }
  list, _ := s.ListApprovals(approvals.Pending)
  if _, err := s.DecideApproval(context.Background(), list[0].ID, true, "", false); err != nil || *posts != 1 { t.Fatalf("approve: %v posts=%d",err,*posts) }
  if _, err := s.DecideApproval(context.Background(), list[0].ID, true, "", false); err == nil || *posts != 1 { t.Fatal("approval was replayed") }
}

func TestLexOpenReadRequiresApprovalAndMissingStoreFailsClosed(t *testing.T) {
  s, _, posts, _, _ := gated(t)
  k, _ := s.fleet.Get("ana")
  weather, err := connector.Build("weather", connector.Settings{}, "")
  if err != nil { t.Fatal(err) }
  s.fleet.Connectors().Add("weather", weather)
  turn := &Turn{}
  _, held := s.gate("fixture-chat", k, action{name:"weather",args:map[string]any{"action":"forecast","place":"Santiago"}}, turn)
  if !held || len(turn.Approvals) != 1 || *posts != 0 { t.Fatal("read escaped the gate") }
  s.SetApprovals(nil)
  got, held := s.gate("fixture-chat", k, action{name:"hook",args:map[string]any{"text":"fixture"}}, &Turn{})
  if !held || got.err == "" || *posts != 0 { t.Fatal("missing approval store failed open") }
}
`;
const originals = {
  "internal/chat/limit.go": "860c0c96adfa350eab15801543c1471baf0ff077c7c0cca846906df264aa8d95",
  "internal/chat/approve.go": "2155d330c1a3b4c87278857c6b15e240b309dc756cfdd7ad020a5c6546f51106",
  "internal/gateway/gateway.go": "d39393bbb377e15cbdf01fdc2650524128c81fe91fabff19f68ca5b668f3a740",
};
const hash = value => createHash("sha256").update(value).digest("hex");
function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error("Pinned connector gate source no longer matches");
  return source.replace(before, after);
}

// Exported separately so a small credential-free fixture can verify the actual rewrites.
export function rewriteConnectorGate(path, source) {
  if (path === "internal/chat/limit.go") return `package chat

import "github.com/madkoding/kitties/internal/kitty"

// LexOpen owns connector permissions; model output must never weaken them.
const limitHelp = "Connector permissions are managed by the person in LexOpen."

func (s *Service) limitPrompt(allowed map[string]string) string {
	if len(allowed) == 0 { return "" }
	return "\\nEvery connector action waits for the person's confirmation in LexOpen. You cannot change these permissions. Do not repeat a held action.\\n"
}

func (s *Service) runLimit(id string, a action, k *kitty.Kitty, allowed map[string]string, turn *Turn) outcome {
	return outcome{action: a, err: "connector permissions can only be changed by the person in LexOpen"}
}
`;
  if (path === "internal/chat/approve.go") {
    source = once(source, "if s.approvals == nil {\n\t\treturn outcome{}, false\n\t}", "if s.approvals == nil {\n\t\treturn outcome{action: a, err: \"LexOpen connector approval store is unavailable\"}, true\n\t}");
    source = once(source, "if !found {\n\t\treturn outcome{}, false\n\t}", "if !found {\n\t\treturn outcome{action: a, err: \"LexOpen connector is unavailable\"}, true\n\t}");
    source = once(source, "if !isKind {\n\t\treturn outcome{}, false\n\t}", "if !isKind {\n\t\treturn outcome{action: a, err: \"LexOpen requires a catalogued connector\"}, true\n\t}");
    return once(source, "verdict := s.approvals.Check(k.ID, a.name, action, risk.String(), k.Approvals, s.demandOf(k))", "verdict := s.approvals.Check(k.ID, a.name, action, risk.String(), k.Approvals, s.demandOf(k))\n\t// LexOpen requires a fresh confirmation even for reads, learned trust and auto rules.\n\tif !verdict.Blocked {\n\t\tverdict = approvals.Verdict{Why: \"LexOpen requires confirmation for this connector action\"}\n\t}");
  }
  if (path === "internal/gateway/gateway.go") {
    source = once(source, '\t"net/http"\n\t"strconv"', '\t"net/http"\n\t"runtime"\n\t"strconv"');
    return once(source, 'out := map[string]any{"ok": true, "version": s.version,', 'out := map[string]any{"ok": true, "lexopen_connector_gate": "v1", "lexopen_connector_platform": runtime.GOOS, "version": s.version,');
  }
  throw new Error("Not a pinned connector gate file");
}

export async function hardenConnectors(directory) {
  const root = await realpath(directory);
  const marker = (await readFile(join(root, ".lexopen-source-commit"), "utf8")).trim();
  if (marker !== PINNED_COMMIT) throw new Error("Connector hardening requires the exact public source commit");
  const changes = [];
  for (const [path, expected] of Object.entries(originals)) {
    const file = join(root, path), stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) throw new Error("Pinned source must be an owned regular file");
    const source = await readFile(file, "utf8");
    if (hash(source) !== expected) throw new Error("Pinned source differs; extract a fresh public source archive before hardening");
    changes.push([file, rewriteConnectorGate(path, source)]);
  }
  // All inputs are checked before any file is written. Never run this against a user's gateway data.
  for (const [file, source] of changes) await writeFile(file, source);
  await writeFile(join(root, "internal/chat/lexopen_gate_test.go"), gateTests, { flag: "wx" });
  await writeFile(join(root, ".lexopen-connector-gate"), CONNECTOR_GATE + "\n");
  return { source: PINNED_COMMIT, connectorGate: CONNECTOR_GATE, files: changes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/altazor/harden-connectors.mjs <fresh-public-source-directory>");
  console.log(JSON.stringify(await hardenConnectors(process.argv[2])));
}
