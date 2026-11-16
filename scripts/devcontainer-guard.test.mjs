import assert from "node:assert/strict";
import { checkDevContainerDatabase } from "./devcontainer-guard.mjs";
const local = "postgresql://fictitious:fictitious@127.0.0.1:5432/lexopen_dev_e2e";
assert.equal(checkDevContainerDatabase({}), false);
assert.equal(checkDevContainerDatabase({ LEXOPEN_DEV_CONTAINER: "1", DATABASE_URL: local, E2E_DATABASE_URL: local }), true);
for (const DATABASE_URL of [undefined, "postgresql://fictitious@remote.invalid/lexopen_dev_e2e", "postgresql://fictitious@localhost/production"]) assert.throws(() => checkDevContainerDatabase({ LEXOPEN_DEV_CONTAINER: "1", DATABASE_URL }));
assert.throws(() => checkDevContainerDatabase({ LEXOPEN_DEV_CONTAINER: "1", DATABASE_URL: local, E2E_DATABASE_URL: local + "_other" }));
console.log("Dev Container: local disposable initialization only, mismatched and remote targets rejected.");
