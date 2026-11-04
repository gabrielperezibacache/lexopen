import assert from "node:assert/strict";
import { assertDisposableDatabaseUrl as guard } from "./disposable-db.mjs";
for (const host of ["127.0.0.1", "localhost", "[::1]"]) assert.match(guard(`postgresql://fixture:fixture@${host}:55448/lexopen_test?schema=public`), /lexopen_test/);
for (const value of [undefined, "bad", "postgres://x:x@remote.example/test", "postgres://x:x@localhost/contest", "postgres://x:x@localhost/lexopen", "postgres://x:x@localhost/lexopen_test?host=remote.example", "postgres://x:x@localhost/lexopen_test?hostaddr=1.1.1.1", "postgres://x:x@localhost/lexopen_test?options=-chost%3Dremote.example", "postgres://x:x@localhost/lexopen_test?schema=public&schema=other", "postgres://x:x@localhost/lexopen_test#fragment"]) assert.throws(() => guard(value));
console.log("Disposable DB: launcher and tests share local-only destination guards, no connection redirection");
