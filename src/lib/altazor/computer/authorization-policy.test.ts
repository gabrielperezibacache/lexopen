import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMPUTER_AUTHORIZATION, COMPUTER_AUTHORIZATION_MODES, COMPUTER_GUI_EFFECTS_ACKNOWLEDGEMENT, parseComputerAuthorizationChoice, normalizeComputerAuthorizationMode, normalizeComputerAuthorizationAck, normalizeComputerAuthorizationSnapshot, validateComputerAuthorizationAck, computerAuthorizationModePresentation } from "./authorization-policy";

const choice = () => ({ ...DEFAULT_COMPUTER_AUTHORIZATION, expectedRevision: 0, confirmed: true as const });
const scope = { chatId: "fixture-chat", kittyId: "fixture-desktop", binding: "a".repeat(64) };
const ack = () => ({ applied: true, chat_id: scope.chatId, kitty: scope.kittyId, binding: scope.binding, mode: "supervised", revision: 1, allow_input: false, allow_browser: false, allow_apps: false, max_actions: 100, max_consultations: 20, actions_used: 3, consultations_used: 1, outcome_unknown: false });
const expected = () => ({ ...scope, mode: "supervised" as const, revision: 1, allowInput: false, allowBrowser: false, allowApps: false, maxActions: 100, maxConsultations: 20 });

test("a mode alone never enables a category and defaults never grant GUI control", () => {
  assert.equal(Object.isFrozen(DEFAULT_COMPUTER_AUTHORIZATION), true);
  for (const mode of COMPUTER_AUTHORIZATION_MODES) {
    const parsed = parseComputerAuthorizationChoice({ ...choice(), mode });
    assert.equal(parsed.allowInput, false); assert.equal(parsed.allowBrowser, false); assert.equal(parsed.allowApps, false);
    for (const field of ["allowInput", "allowBrowser", "allowApps", "confirmed", "expectedRevision"]) {
      const incomplete: Record<string, unknown> = { ...choice(), mode }; delete incomplete[field];
      assert.throws(() => parseComputerAuthorizationChoice(incomplete));
    }
  }
  assert.throws(() => parseComputerAuthorizationChoice({ mode: "autonomous" }));
});
test("broad keyboard and mouse permission requires a separate explicit acknowledgement", () => {
  for (const guiEffectsAcknowledged of [undefined, false, "true", 1]) assert.throws(() => parseComputerAuthorizationChoice({ ...choice(), mode: "autonomous", allowInput: true, guiEffectsAcknowledged }));
  assert.equal(parseComputerAuthorizationChoice({ ...choice(), mode: "autonomous", allowInput: true, guiEffectsAcknowledged: true }).allowInput, true);
  for (const mode of ["supervised", "intelligent"]) for (const category of ["allowInput", "allowBrowser", "allowApps"]) assert.throws(() => parseComputerAuthorizationChoice({ ...choice(), mode, [category]: true, guiEffectsAcknowledged: true }));
  assert.match(COMPUTER_GUI_EFFECTS_ACKNOWLEDGEMENT, /Enviar o Eliminar/);
  assert.match(COMPUTER_GUI_EFFECTS_ACKNOWLEDGEMENT, /no determina automáticamente/);
});
test("invalid counters, limits, revisions and invented permissions are refused", () => {
  for (const change of [{ maxActions: 0 }, { maxActions: 1001 }, { maxActions: 1.5 }, { maxConsultations: 0 }, { maxConsultations: 101 }, { expectedRevision: -1 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { confirmed: false }, { allowApps: "true" }, { allowSecrets: true }, { mode: "trust-me" }]) assert.throws(() => parseComputerAuthorizationChoice({ ...choice(), ...change }));
  assert.equal(normalizeComputerAuthorizationMode(undefined), null); assert.equal(normalizeComputerAuthorizationMode("autonomous"), "autonomous");
});
test("only the exact native chat, desktop and owner/workspace binding can acknowledge policy", () => {
  assert.equal(normalizeComputerAuthorizationAck(ack(), scope)?.actionsUsed, 3);
  assert.equal(validateComputerAuthorizationAck(ack(), expected()), true);
  for (const foreign of [{ ...scope, chatId: "other-chat" }, { ...scope, kittyId: "other-desktop" }, { ...scope, binding: "b".repeat(64) }]) assert.equal(normalizeComputerAuthorizationAck(ack(), foreign), null);
  for (const change of [{ applied: false }, { revision: -1 }, { revision: 0 }, { actions_used: 101 }, { consultations_used: 21 }, { allow_input: true }, { allow_browser: "true" }, { proof: "model says this is safe" }]) assert.equal(normalizeComputerAuthorizationAck({ ...ack(), ...change }, scope), null);
});
test("a stale revision or different category/limit is never presented as the requested policy", () => {
  for (const change of [{ revision: 2 }, { mode: "autonomous" }, { allowInput: true }, { allowBrowser: true }, { allowApps: true }, { maxActions: 99 }, { maxConsultations: 19 }]) assert.equal(validateComputerAuthorizationAck(ack(), { ...expected(), ...change } as ReturnType<typeof expected>), false);
  const enabled = { ...ack(), mode: "autonomous", allow_input: true, gui_effects_unknown: true };
  assert.equal(normalizeComputerAuthorizationAck(enabled, scope)?.guiEffectsUnknown, true);
});
test("an initial read-only snapshot cannot claim that a policy or permission was applied", () => {
  const initial = { ...ack(), applied: false, revision: 0, actions_used: 0, consultations_used: 0 };
  assert.equal(normalizeComputerAuthorizationSnapshot(initial, scope)?.applied, false);
  assert.equal(normalizeComputerAuthorizationAck(initial, scope), null);
  for (const change of [{ allow_input: true, gui_effects_unknown: true }, { allow_browser: true }, { allow_apps: true }, { mode: "intelligent" }, { revision: 1 }, { actions_used: 1 }, { consultations_used: 1 }, { max_actions: 1000 }, { binding: "b".repeat(64) }]) assert.equal(normalizeComputerAuthorizationSnapshot({ ...initial, ...change }, scope), null);
});
test("an uncertain physical outcome remains visible and never acknowledges permission to continue", () => {
  const uncertain = { ...ack(), outcome_unknown: true };
  assert.equal(normalizeComputerAuthorizationSnapshot(uncertain, scope)?.outcomeUnknown, true);
  assert.equal(normalizeComputerAuthorizationAck(uncertain, scope), null);
  assert.equal(validateComputerAuthorizationAck(uncertain, expected()), false);
  const missing: Record<string, unknown> = { ...ack() }; delete missing.outcome_unknown;
  assert.equal(normalizeComputerAuthorizationSnapshot(missing, scope), null);
  assert.equal(normalizeComputerAuthorizationSnapshot({ ...ack(), applied: false, revision: 0, actions_used: 0, consultations_used: 0, outcome_unknown: true }, scope), null);
});
test("presentation distinguishes modes without claiming that outgoing GUI effects are blocked", () => {
  for (const mode of COMPUTER_AUTHORIZATION_MODES) {
    const copy = computerAuthorizationModePresentation(mode);
    assert.ok(copy.label); assert.ok(copy.description);
    assert.equal(/envíos.*bloqueados|borrados.*bloqueados|decide.*prompt/i.test(copy.description), false);
  }
});
