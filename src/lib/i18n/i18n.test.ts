import assert from "node:assert/strict";
import {
  DEFAULT_LOCALE,
  getDictionary,
  isLocale,
  negotiateLocale,
  translate,
  LOCALES,
} from "./index";
import { es } from "./dictionaries/es";
import { en } from "./dictionaries/en";

assert.equal(DEFAULT_LOCALE, "es");
assert.ok(LOCALES.includes("es") && LOCALES.includes("en"));
assert.equal(isLocale("es"), true);
assert.equal(isLocale("fr"), false);

assert.equal(negotiateLocale("en-US,en;q=0.9"), "en");
assert.equal(negotiateLocale("es-CL,es;q=0.9,en;q=0.8"), "es");
assert.equal(negotiateLocale(null), "es");

assert.equal(translate(es, "nav.home"), "Inicio");
assert.equal(translate(en, "nav.home"), "Home");
assert.equal(translate(es, "missing.key", "fallback"), "fallback");

const esDict = getDictionary("es");
const enDict = getDictionary("en");

function keysOf(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [prefix].filter(Boolean);
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) return keysOf(v, path);
    return [path];
  });
}

const esKeys = new Set(keysOf(esDict));
const enKeys = new Set(keysOf(enDict));
for (const k of esKeys) {
  assert.ok(enKeys.has(k), `missing EN key: ${k}`);
}
for (const k of enKeys) {
  assert.ok(esKeys.has(k), `missing ES key: ${k}`);
}

assert.equal(esDict.landing.modules.length, enDict.landing.modules.length);
assert.equal(esDict.landing.bullets.length, enDict.landing.bullets.length);

console.log("i18n/i18n.test.ts OK");
