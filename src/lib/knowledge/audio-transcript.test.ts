import assert from "node:assert/strict";
import { audioPublicationContext, audioTranscriptNotice } from "./audio-transcript";

const audioId = "audio_fixture", publication = { audioId };
const base = { method: "audio-transcript-snapshot", audioId, revision: 2, reviewStatus: "unreviewed", provider: "fixture-automatic", model: "fixture-model" };
assert.deepEqual(audioPublicationContext(null), { warnings: [] });
assert.deepEqual(audioPublicationContext({ extractionJson: JSON.stringify(base), audioPublication: null }), { warnings: [] }, "A JSON label without the authoritative publication relation does not classify a document");
const automatic = audioPublicationContext({ extractionJson: JSON.stringify(base), audioPublication: publication });
assert.equal(automatic.audioTranscript?.verificationBasis, "transcript_text"); assert.equal(automatic.audioTranscript?.reviewStatus, "unreviewed"); assert.equal(automatic.audioTranscript?.revision, 2);
assert.ok(automatic.warnings[0].includes(audioTranscriptNotice)); assert.match(automatic.warnings[0], /automática sin revisión humana confirmada/);
const reviewed = audioPublicationContext({ extractionJson: JSON.stringify({ ...base, revision: 4, reviewStatus: "reviewed" }), audioPublication: publication });
assert.equal(reviewed.audioTranscript?.revision, 4); assert.match(reviewed.warnings[0], /registra revisión humana/); assert.match(reviewed.warnings[0], /no acredita fidelidad al audio/);
const manual = audioPublicationContext({ extractionJson: JSON.stringify({ ...base, provider: "manual", model: null }), audioPublication: publication }); assert.match(manual.warnings[0], /manual sin revisión humana confirmada/);
for (const extractionJson of [null, "not JSON", "{}", "x".repeat(16_385), JSON.stringify({ ...base, audioId: "another_audio" }), JSON.stringify({ ...base, reviewStatus: "certified" }), JSON.stringify({ ...base, revision: 0 })]) {
  const uncertain = audioPublicationContext({ extractionJson, audioPublication: publication });
  assert.equal(uncertain.audioTranscript?.reviewStatus, "unknown"); assert.equal(uncertain.audioTranscript?.revision, null); assert.match(uncertain.warnings[0], /No se pudo determinar la revisión humana/); assert.ok(uncertain.warnings[0].includes(audioTranscriptNotice));
}
assert.equal(automatic.audioTranscript?.reviewStatus, "unreviewed", "A later reviewed publication does not mutate an earlier publication's review label");
console.log("Audio transcript citation unit PASS: authoritative publication relation, snapshot review status, literal-TXT versus speech/timing distinction, reviewed/manual/automatic wording and safe unknown metadata fallback.");
