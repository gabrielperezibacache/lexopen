import assert from "node:assert/strict";
import test from "node:test";
import { computerActivityDetail, computerConnectionLabel } from "./activity-detail";
import type { ComputerSessionView } from "./types";

function view(action?: string, connections: string[] = []): Pick<ComputerSessionView, "session" | "turns"> {
  return { session: { id: "fixture", state: "ready", held: false, createdAt: "", expiresAt: "", renewableUntil: "", canRenew: false, connectors: connections },
    turns: action ? [{ index: 0, from: "assistant", text: "Private document contents", working: true, needsHelp: false, steps: [{ action, at: "2030-05-06T17:01:00Z" }] }] : [] };
}

test("passive activity exposes selected connections and a fixed progress label, without contents", () => {
  const detail = computerActivityDetail(view("connector", ["altazor-google-1234567890abcdef", "altazor-github-1234567890abcdef"]));
  assert.deepEqual(detail, { connections: ["altazor-google-1234567890abcdef", "altazor-github-1234567890abcdef"], step: { label: "Consultando una aplicación", at: "2030-05-06T17:01:00Z" } });
  assert.equal(JSON.stringify(detail).includes("Private document"), false);
});

test("unknown steps and a new user message cannot masquerade as current work", () => {
  assert.equal(computerActivityDetail(view("private/path/to/file")), undefined);
  assert.equal(computerActivityDetail(view("constructor")), undefined);
  const current = view("run");
  current.turns.push({ index: 1, from: "user", text: "New task", working: false, needsHelp: false, steps: [] });
  assert.equal(computerActivityDetail(current), undefined);
});

test("only generated identities are abbreviated, while user connection names remain recognizable", () => {
  assert.equal(computerConnectionLabel("altazor-google-1234567890abcdef"), "Google Drive");
  assert.equal(computerConnectionLabel("altazor-github-1234567890abcdef"), "GitHub");
  assert.equal(computerConnectionLabel("Estudio · lectura"), "Estudio · lectura");
  assert.equal(computerConnectionLabel("altazor-google-invalid"), "altazor-google-invalid");
});

test("real native browser and selected connector steps get safe progress labels", () => {
  for (const action of ["open", "page_read", "page_click", "page_type", "read_screen", "launch"]) {
    assert.ok(computerActivityDetail(view(action))?.step?.label);
  }
  const github = "altazor-github-1234567890abcdef";
  assert.equal(computerActivityDetail(view(github, [github]))?.step?.label, "Consultando GitHub");
  assert.equal(computerActivityDetail(view(github)), undefined, "A connection outside this session is never presented as current work");
});
