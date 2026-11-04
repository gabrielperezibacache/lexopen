import assert from "node:assert/strict";
import { narrowAclChange } from "./prepare-computer-ci.mjs";
assert.equal(narrowAclChange("user::rwx\ngroup::---\nother::---\n", "996", "--x"), "u:996:--x,m::--x");
assert.equal(narrowAclChange("user::rwx\ngroup::r-x\nother::---\n", "996", "r-x"), "u:996:r-x,m::r-x");
assert.equal(narrowAclChange("user::rwx\nuser:996:r--\ngroup::---\nmask::r--\nother::---\ndefault:user::rwx\n", "996", "--x"), "u:996:r-x,m::r-x");
assert.equal(narrowAclChange("user::rwx\nuser:996:rwx\ngroup::---\nmask::r--\nother::---\n", "996", "--x"), "u:996:r-x,m::r-x");
assert.throws(() => narrowAclChange("user::rwx\nuser:1200:rwx\ngroup::r-x\nmask::r--\nother::---\n", "996", "--x"), /widen another subject/);
assert.throws(() => narrowAclChange("user::rwx\ngroup::---\nother::---\n", "0", "--x"));
assert.throws(() => narrowAclChange("unknown:format\n", "996", "--x"));
const permission = n => [4, 2, 1].map((bit, index) => n & bit ? "rwx"[index] : "-").join("");
for (let group = 0; group < 8; group++) for (let named = 0; named < 8; named++) for (let mask = 0; mask < 8; mask++) {
  const acl = `user::rwx\nuser:1200:${permission(named)}\ngroup::${permission(group)}\nmask::${permission(mask)}\nother::---\n`;
  const wouldWiden = (group & (mask | 1)) !== (group & mask) || (named & (mask | 1)) !== (named & mask);
  if (wouldWiden) assert.throws(() => narrowAclChange(acl, "996", "--x"), /widen another subject/);
  else assert.equal(narrowAclChange(acl, "996", "--x"), `u:996:--x,m::${permission(mask | 1)}`);
}
console.log("Computer CI ACL planning PASS: least traversal, retained rights and 512 mask/subject combinations without collateral access.");
