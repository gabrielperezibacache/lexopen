import assert from "node:assert/strict";
import { calculateCivilDeadline, civilEdition, civilEditionHash, civilReviewReady, type CivilReview } from "./civil-profile";

// Synthetic engineering expectations exercise the gate. They cannot activate the published edition.
const dates: Record<string, string> = {
  sabado: "2026-11-07", domingo: "2026-11-09", inmaculada: "2026-12-09", navidad: "2026-12-26",
  "antes-medianoche": "2026-11-07", medianoche: "2026-11-09", febrero: "2027-02-02",
};
const review: CivilReview = {
  reviewer: "Fixture", reviewedOn: "2026-11-19", editionHash: civilEditionHash, legalBasis: "Fixture",
  sourceVersions: Object.fromEntries(civilEdition.sources.map(source => [source.url, "2026-11-01"])),
  effectiveFrom: "2026-11-01", effectiveThrough: "2027-02-28",
  cases: Object.fromEntries(Object.entries(dates).map(([id, due]) => [id, { due, basis: "Fixture" }])),
};
const input = { notice: "2026-12-04", days: 3, scopeConfirmed: true, notificationConfirmed: true };
assert.equal(civilReviewReady(null), false);
assert.throws(() => calculateCivilDeadline(input, null), /validación profesional/);
assert.equal(civilReviewReady(review), true);
for (const changes of [
  { editionHash: "cambió" }, { reviewer: "" }, { cases: {} }, { sourceVersions: {} }, { effectiveFrom: "2027-01-01" },
  { cases: { ...review.cases, sabado: { due: "2026-11-09", basis: "Fixture" } } },
]) assert.equal(civilReviewReady({ ...review, ...changes }), false);
const result = calculateCivilDeadline(input, review);
assert.equal(result.date, dates.inmaculada);
assert.equal(result.basis.review.editionHash, civilEditionHash);
assert.equal(result.basis.originalNotice, input.notice);
const utcMidnight = calculateCivilDeadline({ ...input, notice: "2026-11-07T00:00:00Z", days: 1 }, review);
assert.equal(utcMidnight.basis.start, "2026-11-06");
assert.equal(utcMidnight.basis.originalNotice, "2026-11-07T00:00:00Z");
for (const changes of [
  { scopeConfirmed: false }, { notificationConfirmed: false }, { notice: "" }, { notice: "2026-12-04T11:19:53" },
  { notice: "2026-11-31" }, { notice: "2026-10-30" }, { notice: "2027-02-28" }, { days: 0 }, { days: 1.5 },
]) assert.throws(() => calculateCivilDeadline({ ...input, ...changes }, review));
console.log("Civil profile passed: review, independent references, Santiago dates, eligibility and historical basis.");
