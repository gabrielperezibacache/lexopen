import assert from "node:assert/strict";
import { AUDIO_MAX_BYTES, byteRange, identifyAudio, readAudioUpload, validateSegments } from "./ingest";
import { parseTranscription } from "./provider";
import { discardAudioAttempt } from "./storage";
import { audioOriginalResponse } from "./http";

export function syntheticWave(seconds = 1) {
  const rate = 8000, size = rate * 2 * seconds, bytes = Buffer.alloc(44 + size);
  bytes.write("RIFF"); bytes.writeUInt32LE(36 + size, 4); bytes.write("WAVE", 8); bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(size, 40); return bytes;
}
const code = (status: number) => (error: unknown) => Boolean(error && typeof error === "object" && "status" in error && error.status === status);
async function main() {
  const wave = syntheticWave(); assert.deepEqual(identifyAudio("synthetic.wav", wave), { mimeType: "audio/wav", durationMs: 1000 });
  assert.throws(() => identifyAudio("renamed.wav", Buffer.from("<html><script>bad()</script>")), code(415));
  assert.throws(() => identifyAudio("renamed.mp3", wave), code(415));
  assert.throws(() => identifyAudio("large.wav", Buffer.alloc(AUDIO_MAX_BYTES + 1)), code(413));
  assert.deepEqual(byteRange(null, 100), null); assert.deepEqual(byteRange("bytes=10-19", 100), { start: 10, end: 19 }); assert.deepEqual(byteRange("bytes=90-", 100), { start: 90, end: 99 }); assert.deepEqual(byteRange("bytes=-20", 100), { start: 80, end: 99 }); assert.deepEqual(byteRange("bytes=90-999", 100), { start: 90, end: 99 });
  for (const range of ["bytes=100-", "bytes=20-10", "bytes=-0", "bytes=", "bytes=0-1,4-8", "items=0-1", "bytes=9999999999999999999999-"]) assert.throws(() => byteRange(range, 100), code(416));
  const ranged = audioOriginalResponse({ sourceName: "Prueba.wav", mimeType: "audio/wav" }, wave, "bytes=0-11"); assert.equal(ranged.status, 206); assert.equal(ranged.headers.get("content-range"), `bytes 0-11/${wave.length}`); assert.equal(ranged.headers.get("x-content-type-options"), "nosniff"); assert.equal(ranged.headers.get("cache-control"), "private, no-store"); assert.equal((await ranged.arrayBuffer()).byteLength, 12);
  assert.equal(audioOriginalResponse({ sourceName: "Prueba.wav", mimeType: "audio/wav" }, wave, "bytes=999999-").status, 416);
  assert.deepEqual(parseTranscription({ text: "Una prueba ficticia." }, null), { text: "Una prueba ficticia.", durationMs: null, segments: [] });
  assert.deepEqual(parseTranscription({ text: "Una prueba ficticia.", duration: 1, segments: [{ start: 0, end: 1, text: "Una prueba ficticia." }] }, 1000), { text: "Una prueba ficticia.", durationMs: 1000, segments: [{ startMs: 0, endMs: 1000, text: "Una prueba ficticia." }] });
  assert.throws(() => parseTranscription({ text: "Texto uno", segments: [{ start: 0, end: 1, text: "Texto diferente" }] }, 1000), code(502));
  assert.throws(() => parseTranscription({ text: "Texto", duration: 10 }, 1000), code(502));
  assert.throws(() => validateSegments([{ startMs: 0, endMs: 800, text: "Uno" }, { startMs: 700, endMs: 1000, text: "Dos" }], 1000), code(422));
  assert.throws(() => validateSegments([{ startMs: 0, endMs: 2000, text: "Fuera" }], 1000), code(422));
  await assert.rejects(discardAudioAttempt("case-audio/audio_aaa/original/old")); await assert.rejects(discardAudioAttempt("../source.wav"));
  const form = new FormData(); form.set("file", new File([new Uint8Array(wave)], "synthetic.wav")); form.set("requestId", "synthetic-request"); form.set("title", "Prueba ficticia");
  const request = new Request("http://localhost/api", { method: "POST", body: form }); const upload = await readAudioUpload(request); assert.equal(upload.title, "Prueba ficticia"); assert.equal(upload.bytes.length, wave.length);
  const duplicated = new FormData(); duplicated.append("file", new File([new Uint8Array(wave)], "synthetic.wav")); duplicated.append("requestId", "synthetic-request"); duplicated.append("requestId", "duplicate-request");
  await assert.rejects(readAudioUpload(new Request("http://localhost/api", { method: "POST", body: duplicated })), code(400));
  let pulls = 0, cancelled = false;
  const chunked = new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } }), duplex: "half" } as RequestInit);
  await assert.rejects(readAudioUpload(chunked), code(413)); assert.equal(cancelled, true); assert.ok(pulls <= 28);
  console.log("Audio unit PASS: container signatures, WAV duration, bounded multipart including chunked/cancellation, duplicate fields, single ranges, real/unknown timestamps and ordered/aligned segments, restricted cleanup namespace.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
