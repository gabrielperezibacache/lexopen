import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { rankResearchText, researchTerms } from "../../src/lib/research/search";
import { sha256, verifyEvidenceQuote } from "../../src/lib/evidence/fragments";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sourceSchema = z.object({ id: z.string().min(1), jurisdiction: z.literal("CL"), authority: z.string().min(1), publishedOn: date, versionDate: date.nullable(), title: z.string().min(1), locator: z.string().min(1), url: z.string().url().refine(url => new URL(url).hostname === "www.bcn.cl" && new URL(url).protocol === "https:"), excerpt: z.string().min(1).max(3000) }).strict();
const corpusSchema = z.object({ version: z.string().min(1), capturedOn: date, review: z.object({ status: z.enum(["provisional", "reviewed"]), professionalReviewer: z.string().min(1).nullable(), reviewedOn: date.nullable() }).strict(), notice: z.string(), sources: z.array(sourceSchema).min(1).max(1000), queries: z.array(z.object({ id: z.string().min(1), query: z.string().min(3).max(1000), relevant: z.array(z.string()).max(20) }).strict()).min(1).max(1000) }).strict();
const claimSchema = z.object({ sourceId: z.string(), quote: z.string().min(1).max(3000), locator: z.string(), url: z.string().max(2000) }).strict();
const predictionsSchema = z.array(z.object({ queryId: z.string(), text: z.string().max(10000).nullable(), citations: z.array(claimSchema).max(20) }).strict()).max(1000);
export type Prediction = z.infer<typeof predictionsSchema>[number];
export async function loadLegalCorpus() {
  const raw = await readFile(new URL("../../fixtures/evaluation/legal-chile.v1.json", import.meta.url));
  const corpus = corpusSchema.parse(JSON.parse(raw.toString()));
  const ids = new Set(corpus.sources.map(s => s.id));
  if (ids.size !== corpus.sources.length || new Set(corpus.queries.map(q => q.id)).size !== corpus.queries.length || corpus.queries.some(q => new Set(q.relevant).size !== q.relevant.length || q.relevant.some(id => !ids.has(id)))) throw Error("Identidades o referencias del corpus inválidas");
  if (corpus.review.status === "reviewed" && (!corpus.review.professionalReviewer || !corpus.review.reviewedOn)) throw Error("Una revisión profesional necesita autor y fecha");
  return { corpus, corpusSha256: sha256(raw) };
}
export async function evaluateLegalBenchmark(rawPredictions?: unknown, topK = 3) {
  if (!Number.isSafeInteger(topK) || topK < 1 || topK > 20) throw Error("Use top-k entre 1 y 20");
  const { corpus, corpusSha256 } = await loadLegalCorpus();
  const predictions = rawPredictions === undefined ? undefined : predictionsSchema.parse(rawPredictions);
  if (predictions && (new Set(predictions.map(p => p.queryId)).size !== predictions.length || predictions.some(p => !corpus.queries.some(q => q.id === p.queryId)))) throw Error("Predicciones duplicadas o de consultas desconocidas");
  const cases = corpus.queries.map(query => {
    const terms = researchTerms(query.query);
    const ranked = corpus.sources.map(source => ({ source, ...rankResearchText(source.excerpt, source.title, terms) })).filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id, "en")).slice(0, topK);
    const positions = query.relevant.map(id => ranked.findIndex(r => r.source.id === id)).filter(p => p >= 0);
    const first = ranked[0]?.source;
    const baseline: Prediction = { queryId: query.id, text: first?.excerpt ?? null, citations: first ? [{ sourceId: first.id, quote: first.excerpt, locator: first.locator, url: first.url }] : [] };
    const prediction = predictions ? predictions.find(p => p.queryId === query.id) : baseline;
    const citations = prediction?.citations || [];
    const checked = citations.map(c => {
      const source = corpus.sources.find(s => s.id === c.sourceId);
      return { sourceId: c.sourceId, exactReference: Boolean(source && source.url === c.url && source.locator === c.locator), literalQuote: Boolean(source && verifyEvidenceQuote({ text: source.excerpt, textSha256: sha256(source.excerpt) }, c.quote)), relevant: query.relevant.includes(c.sourceId) };
    });
    const answered = Boolean(prediction?.text?.trim());
    const unsupported = answered && (!checked.length || checked.some(c => !c.exactReference || !c.literalQuote || !c.relevant));
    return { id: query.id, query: query.query, relevant: query.relevant, retrieved: ranked.map(r => ({ id: r.source.id, score: r.score })), recallAtK: query.relevant.length ? positions.length / query.relevant.length : null, reciprocalRank: query.relevant.length ? positions.length ? 1 / (Math.min(...positions) + 1) : 0 : null,
      predictionPresent: Boolean(prediction), prediction: prediction ?? null, answered, unsupportedAnswer: prediction ? unsupported : null, abstainedCorrectly: query.relevant.length ? null : prediction ? !answered && !citations.length : null, citationChecks: checked, requiresSemanticReview: answered };
  });
  const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const checks = cases.flatMap(c => c.citationChecks), answered = cases.filter(c => c.answered), known = cases.filter(c => c.predictionPresent);
  return { format: 1, evaluator: "lexopen-legal-eval-1", engine: "production-rankResearchText", mode: predictions ? "supplied-predictions" : "extractive-baseline", corpus: corpus.version, corpusSha256, predictionSha256: predictions ? sha256(JSON.stringify(predictions)) : null, sources: corpus.sources.map(s => ({ id: s.id, jurisdiction: s.jurisdiction, authority: s.authority, publishedOn: s.publishedOn, versionDate: s.versionDate, url: s.url, locator: s.locator, excerptSha256: sha256(s.excerpt) })), capturedOn: corpus.capturedOn, review: corpus.review, topK, coverage: { queries: cases.length, evaluatedPredictions: known.length, complete: known.length === cases.length },
    metrics: { positiveAnswerCoverage: average(cases.filter(c => c.relevant.length > 0).map(c => Number(c.answered))), recallAtK: average(cases.flatMap(c => c.recallAtK === null ? [] : [c.recallAtK])), meanReciprocalRank: average(cases.flatMap(c => c.reciprocalRank === null ? [] : [c.reciprocalRank])), exactReferenceRate: average(checks.map(c => Number(c.exactReference))), literalQuoteRate: average(checks.map(c => Number(c.literalQuote))), unsupportedAnswerRate: average(answered.map(c => Number(c.unsupportedAnswer))), negativeAbstentionRate: average(cases.flatMap(c => c.abstainedCorrectly === null ? [] : [Number(c.abstainedCorrectly)])) },
    limitations: [corpus.notice, "Evalúa el ranking léxico local y citas literales, no el buscador remoto completo, vigencia normativa, interpretación ni razonamiento de un modelo.", "Una cita literal relevante no demuestra que una respuesta la interprete correctamente; requiere revisión semántica profesional.", "El baseline cita el primer resultado incluso en un negativo con solapamiento: su error se mide, no se oculta."], cases };
}
export function legalMarkdown(report: Awaited<ReturnType<typeof evaluateLegalBenchmark>>) {
  return `# Evaluación jurídica ${report.corpus}\n\nModo: ${report.mode}. Revisión: ${report.review.status}. SHA-256: ${report.corpusSha256}.\n\n| Métrica | Resultado |\n| --- | ---: |\n` + Object.entries(report.metrics).map(([key, value]) => `| ${key} | ${value ?? "sin muestra"} |`).join("\n") + "\n\n" + report.limitations.map(s => `- ${s}`).join("\n") + "\n";
}
export async function main(args: string[]) {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) { if (!["--predictions", "--top-k", "--json", "--markdown"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || args[i] in flags) throw Error("Uso: [--predictions archivo.json] [--top-k 3] [--json archivo] [--markdown archivo]"); flags[args[i]] = args[i + 1]; }
  if (flags["--json"] && flags["--markdown"] && path.resolve(flags["--json"]) === path.resolve(flags["--markdown"])) throw Error("JSON y Markdown necesitan destinos distintos");
  let predictions: unknown;
  if (flags["--predictions"]) { if ((await stat(flags["--predictions"])).size > 1024 * 1024) throw Error("Predicciones demasiado grandes"); predictions = JSON.parse(await readFile(flags["--predictions"], "utf8")); }
  const report = await evaluateLegalBenchmark(predictions, flags["--top-k"] ? Number(flags["--top-k"]) : undefined);
  for (const [flag, content] of [["--json", JSON.stringify(report, null, 2) + "\n"], ["--markdown", legalMarkdown(report)]]) if (flags[flag]) { await mkdir(path.dirname(path.resolve(flags[flag])), { recursive: true }); await writeFile(flags[flag], content); }
  if (!flags["--json"]) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.coverage.complete) process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 2; });
