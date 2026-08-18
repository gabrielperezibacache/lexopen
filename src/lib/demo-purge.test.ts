import assert from "node:assert/strict";
import {
  DEMO_USER_EMAILS,
  PURGE_CATALOG_MODELS,
  PURGE_CONFIRM_PHRASE,
  PURGE_DATA_MODELS,
} from "@/lib/demo-purge";

assert.ok(DEMO_USER_EMAILS.includes("socio@estudio.cl"));
assert.ok(PURGE_DATA_MODELS.includes("mailboxAccount"));
assert.ok(PURGE_DATA_MODELS.indexOf("mailboxAttachment") < PURGE_DATA_MODELS.indexOf("mailboxMessage"));
assert.ok(PURGE_DATA_MODELS.indexOf("mailboxMessage") < PURGE_DATA_MODELS.indexOf("mailboxAccount"));
assert.ok(PURGE_DATA_MODELS.indexOf("mailboxAccount") < PURGE_DATA_MODELS.indexOf("user"));
assert.ok(PURGE_DATA_MODELS.includes("tramite"));
assert.ok(PURGE_DATA_MODELS.includes("user"));
assert.ok(PURGE_DATA_MODELS.indexOf("tramite") < PURGE_DATA_MODELS.indexOf("causa"));
assert.ok(PURGE_DATA_MODELS.indexOf("pjudSyncJob") < PURGE_DATA_MODELS.indexOf("causa"));
assert.ok(PURGE_CATALOG_MODELS.includes("tribunal"));
assert.equal(PURGE_CONFIRM_PHRASE, "ELIMINAR DATOS DEMO");
assert.equal(
  (PURGE_DATA_MODELS as readonly string[]).includes("tribunal"),
  false
);
console.log("demo-purge.test.ts OK");
