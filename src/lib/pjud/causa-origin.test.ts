import assert from "node:assert/strict";
import {
  causaOrigenWhere,
  duplicateCausaWhere,
  labelCausaOrigen,
  resolveCausaOrigin,
} from "./causa-origin";

assert.equal(
  resolveCausaOrigin({
    pjudOrigin: "rol",
    pjudSource: "scrape",
    pjudFromMisCausas: false,
  }),
  "rol"
);
assert.equal(
  labelCausaOrigen({
    pjudOrigin: "rol",
    pjudSource: "scrape",
  }),
  "ROL / OJV"
);
assert.equal(
  resolveCausaOrigin({
    pjudOrigin: null,
    pjudFromMisCausas: true,
    pjudSource: "api",
  }),
  "claveunica"
);
assert.equal(
  resolveCausaOrigin({
    pjudOrigin: null,
    pjudFromMisCausas: false,
    pjudSource: "csv",
  }),
  "csv"
);
assert.equal(
  resolveCausaOrigin({
    pjudOrigin: null,
    pjudFromMisCausas: false,
    pjudSource: "scrape",
  }),
  "manual"
);
assert.equal(labelCausaOrigen({}), "Manual");

assert.deepEqual(causaOrigenWhere("claveunica"), {
  OR: [{ pjudOrigin: "claveunica" }, { pjudFromMisCausas: true }],
});
assert.deepEqual(causaOrigenWhere(""), {});
assert.deepEqual(causaOrigenWhere(undefined), {});

assert.equal(duplicateCausaWhere({ rit: "C-1-2026" }), null);
assert.deepEqual(
  duplicateCausaWhere({
    rit: "C-1-2026",
    ruc: "2500123456-7",
    tribunal: "1º Juzgado Civil de Santiago",
  }),
  {
    OR: [
      {
        rit: { equals: "C-1-2026", mode: "insensitive" },
        tribunal: {
          equals: "1º Juzgado Civil de Santiago",
          mode: "insensitive",
        },
      },
      {
        ruc: { equals: "2500123456-7", mode: "insensitive" },
        tribunal: {
          equals: "1º Juzgado Civil de Santiago",
          mode: "insensitive",
        },
      },
    ],
  }
);
assert.equal(
  duplicateCausaWhere({ rit: "  ", tribunal: "Santiago" }),
  null
);

console.log("pjud/causa-origin.test.ts OK");
