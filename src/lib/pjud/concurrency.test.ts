import assert from "node:assert/strict";
import { mapWithConcurrency } from "@/lib/pjud/concurrency";

async function main() {
  let active = 0;
  let peak = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(peak <= 2, true);
  console.log("pjud/concurrency.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
