import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  consumeUndo,
  getPlan,
  storePlan,
  storeUndo,
} from "./plan-store";
import type { AssistantPlan } from "./types";

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), "lexopen-plan-"));
  const env = process.env as Record<string, string | undefined>;
  const prevPath = env.LEXOPEN_ASSISTANT_PLANS_PATH;
  env.LEXOPEN_ASSISTANT_PLANS_PATH = path.join(dir, "plans.json");

  try {
    const plan = {
      id: "plan-test-1",
      intents: [],
      steps: [],
      needsConfirm: false,
    } satisfies AssistantPlan;
    await storePlan(plan, "user-1");
    const loaded = await getPlan(plan.id, "user-1");
    assert.ok(loaded);
    assert.equal(loaded?.id, "plan-test-1");
    assert.equal(await getPlan(plan.id, "other-user"), null);

    const token = await storeUndo({
      toolId: "nota.crear",
      entityType: "Nota",
      entityId: "n1",
      before: { foo: 1 },
    });
    assert.ok(token);
    const undo = await consumeUndo(token);
    assert.ok(undo);
    assert.equal(undo?.entityId, "n1");
    assert.equal(await consumeUndo(token), null);
  } finally {
    if (prevPath === undefined) delete env.LEXOPEN_ASSISTANT_PLANS_PATH;
    else env.LEXOPEN_ASSISTANT_PLANS_PATH = prevPath;
    await rm(dir, { recursive: true, force: true });
  }

  console.log("assistant/plan-store.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
