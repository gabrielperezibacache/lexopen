import assert from "node:assert/strict";
import {
  applyWikiRestore,
  blogSlugConflictMessage,
  blogSlugify,
  shouldTakeRestorePath,
} from "@/lib/sites/wiki-blog-contract";

assert.equal(shouldTakeRestorePath({ action: "restore", revisionId: "r1" }), true);
assert.equal(shouldTakeRestorePath({ action: "restore" }), false);
assert.equal(shouldTakeRestorePath({ revisionId: "r1" }), false);

const applied = applyWikiRestore({
  current: { title: "A", content: "old" },
  revision: { title: "B", content: "rev" },
});
assert.deepEqual(applied.snapshot, { title: "A", content: "old" });
assert.deepEqual(applied.next, { title: "B", content: "rev" });

assert.equal(blogSlugify("Hola Mundo"), "hola-mundo");
assert.equal(blogSlugConflictMessage(409), "Ya existe una publicación con ese título/slug en el espacio");
assert.equal(blogSlugConflictMessage(500), null);

console.log("wiki-blog-contract.test.ts OK");
