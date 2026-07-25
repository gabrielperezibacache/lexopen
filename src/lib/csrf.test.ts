import assert from "node:assert/strict";
import { originMatches } from "@/lib/api";

assert.equal(originMatches("https://app.example.com", "https://app.example.com"), true);
assert.equal(originMatches("https://app.example.com.evil.test", "https://app.example.com"), false);
assert.equal(originMatches("https://app.example.com:443/path", "https://app.example.com"), true);
assert.equal(originMatches("http://app.example.com", "https://app.example.com"), false);

console.log("csrf.test.ts OK");
