import assert from "node:assert/strict";
import { computerHelpIdentity } from "./help-identity";
import type { ComputerTurn } from "./types";

const turn: ComputerTurn = { index: 4, from: "assistant", text: "Plan inicial que no cambia", working: true, needsHelp: false, help: { stepIndex: 2, question: "Confirma el dato" }, steps: [{ action: "ask_help", at: "" }] };
const first = computerHelpIdentity("owner", "session", turn)!;
const second = computerHelpIdentity("owner", "session", { ...turn, help: { stepIndex: 8, question: "Confirma el dato" } })!;
assert.notEqual(first.requestKey, second.requestKey, "two ask_help calls in one turn cannot reuse an answered request");
assert.equal(first.question, "Confirma el dato");
assert.notEqual(first.requestKey, computerHelpIdentity("peer", "session", turn)!.requestKey);
assert.notEqual(first.requestKey, computerHelpIdentity("owner", "other-session", turn)!.requestKey);
assert.equal(computerHelpIdentity("owner", "session", { ...turn, working: false, needsHelp: true }), null, "terminal needs_help has no live upstream reply channel");
assert.equal(computerHelpIdentity("owner", "session", { ...turn, help: undefined }), null);
console.log("Computer help identity: actual question, per-step occurrence, owner/session isolation and terminal-help denial passed.");
