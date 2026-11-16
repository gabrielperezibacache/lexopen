import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLegalBenchmark, loadLegalCorpus, legalMarkdown, type Prediction } from "./legal-chile";
async function references(): Promise<Prediction[]> {
  const { corpus } = await loadLegalCorpus();
  return corpus.queries.map(q => { const source = corpus.sources.find(s => s.id === q.relevant[0]); return { queryId: q.id, text: source?.excerpt ?? null, citations: source ? [{ sourceId: source.id, quote: source.excerpt, url: source.url, locator: source.locator }] : [] }; });
}
test("production lexical scorer is deterministic, bounded and offline", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw Error("Network is prohibited in this benchmark"); };
  try {
    const first = await evaluateLegalBenchmark(undefined, 1), second = await evaluateLegalBenchmark(undefined, 1);
    assert.deepEqual(first, second); assert.equal(first.metrics.recallAtK, 1); assert.equal(first.metrics.meanReciprocalRank, 1);
    assert(first.cases.every(c => c.retrieved.length <= 1)); assert.equal(first.review.status, "provisional");
    assert.match(first.corpusSha256, /^[a-f0-9]{64}$/); assert.match(legalMarkdown(first), /provisional/);
    const { corpus } = await loadLegalCorpus();
    assert(corpus.sources.every(s => s.jurisdiction === "CL" && s.authority && s.publishedOn && s.url.startsWith("https://www.bcn.cl/")));
  } finally { globalThis.fetch = previous; }
});
test("reference, literal grounding, unsupported answers and abstention are separate", async () => {
  const predictions = await references(), valid = await evaluateLegalBenchmark(predictions);
  assert.equal(valid.coverage.complete, true); assert.equal(valid.metrics.exactReferenceRate, 1); assert.equal(valid.metrics.literalQuoteRate, 1);
  assert.equal(valid.metrics.unsupportedAnswerRate, 0); assert.equal(valid.metrics.negativeAbstentionRate, 1);
  const fabricated = structuredClone(predictions); fabricated[0].citations[0].quote = "Texto que no aparece en la fuente";
  const quote = await evaluateLegalBenchmark(fabricated); assert(quote.metrics.literalQuoteRate! < 1); assert(quote.metrics.unsupportedAnswerRate! > 0); assert.equal(quote.metrics.exactReferenceRate, 1);
  const wrongReference = structuredClone(predictions); wrongReference[0].citations[0].locator = "artículo inventado";
  assert((await evaluateLegalBenchmark(wrongReference)).metrics.exactReferenceRate! < 1);
  const negative = structuredClone(predictions); negative[6] = { ...predictions[0], queryId: predictions[6].queryId };
  const irrelevant = await evaluateLegalBenchmark(negative); assert(irrelevant.metrics.unsupportedAnswerRate! > 0); assert.equal(irrelevant.metrics.literalQuoteRate, 1); assert.equal(irrelevant.metrics.negativeAbstentionRate, 0.5);
});
test("omitted predictions never masquerade as a complete perfect evaluation", async () => {
  const empty = await evaluateLegalBenchmark([]); assert.equal(empty.coverage.complete, false); assert.equal(empty.coverage.evaluatedPredictions, 0); assert.equal(empty.metrics.unsupportedAnswerRate, null); assert.equal(empty.metrics.exactReferenceRate, null);
  const predictions = await references();
  await assert.rejects(evaluateLegalBenchmark([predictions[0], predictions[0]]), /duplicadas/);
  await assert.rejects(evaluateLegalBenchmark([{ ...predictions[0], queryId: "unknown" }]), /desconocidas/);
  await assert.rejects(evaluateLegalBenchmark(undefined, 0));
});
