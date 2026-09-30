import assert from "node:assert/strict";
import {
  DEFAULT_ASSISTANT_FIRM_POLICY,
  isAssistantLlmMode,
  normalizeAssistantFirmPolicy,
} from "./firm-policy";

// defaults: sin fila de FirmSettings, cae a remote_allowed / auditLlmPrompts=false
{
  const policy = normalizeAssistantFirmPolicy(null);
  assert.equal(policy.assistantLlmMode, "remote_allowed");
  assert.equal(policy.auditLlmPrompts, false);
  assert.deepEqual(policy, DEFAULT_ASSISTANT_FIRM_POLICY);
}

{
  const policy = normalizeAssistantFirmPolicy(undefined);
  assert.deepEqual(policy, DEFAULT_ASSISTANT_FIRM_POLICY);
}

// enum: valor válido se respeta
{
  const policy = normalizeAssistantFirmPolicy({
    assistantLlmMode: "local_only",
    auditLlmPrompts: true,
  });
  assert.equal(policy.assistantLlmMode, "local_only");
  assert.equal(policy.auditLlmPrompts, true);
}

{
  const policy = normalizeAssistantFirmPolicy({
    assistantLlmMode: "remote_allowed",
    auditLlmPrompts: false,
  });
  assert.equal(policy.assistantLlmMode, "remote_allowed");
  assert.equal(policy.auditLlmPrompts, false);
}

// enum: valor inválido/corrupto en DB cae a default (nunca lanza)
{
  const policy = normalizeAssistantFirmPolicy({
    assistantLlmMode: "algo-invalido",
    auditLlmPrompts: null,
  });
  assert.equal(policy.assistantLlmMode, "remote_allowed");
  assert.equal(policy.auditLlmPrompts, false);
}

// isAssistantLlmMode: guard de tipo
assert.equal(isAssistantLlmMode("local_only"), true);
assert.equal(isAssistantLlmMode("remote_allowed"), true);
assert.equal(isAssistantLlmMode("otro"), false);
assert.equal(isAssistantLlmMode(null), false);
assert.equal(isAssistantLlmMode(undefined), false);
assert.equal(isAssistantLlmMode(123), false);

console.log("assistant/firm-policy.test.ts OK");
