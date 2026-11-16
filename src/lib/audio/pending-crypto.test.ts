import assert from "node:assert/strict";
import { audioRecoveryKey } from "./recovery-key";
import { importAudioRecoveryKey, encryptPendingAudio, decryptPendingAudio } from "./pending-crypto";
async function main() {
  const secret = "fictitious-audio-recovery-secret-2026-only";
  const token = audioRecoveryKey("actor", "cause", "workspace", secret)!;
  for (const scope of [["other", "cause", "workspace"], ["actor", "other", "workspace"], ["actor", "cause", "other"]]) assert.notEqual(audioRecoveryKey(...scope as [string, string, string], secret), token);
  assert.equal(audioRecoveryKey("actor", "cause", "workspace", "weak"), null);
  const key = await importAudioRecoveryKey(token), blob = new Blob(["fictitious private recording"], { type: "audio/webm" });
  const value = await encryptPendingAudio(key, "scope/session/request/sequence", blob);
  assert.equal(new TextDecoder().decode(value.encrypted).includes("fictitious private recording"), false);
  assert.equal(await (await decryptPendingAudio(key, "scope/session/request/sequence", value)).text(), await blob.text());
  await assert.rejects(decryptPendingAudio(key, "other identity", value));
  await assert.rejects(decryptPendingAudio(key, "scope/session/request/sequence", { ...value, mimeType: "text/plain" }));
  const wrongKey = await importAudioRecoveryKey(audioRecoveryKey("other", "cause", "workspace", secret));
  await assert.rejects(decryptPendingAudio(wrongKey, "scope/session/request/sequence", value));
  assert.equal(key.extractable, false);
  console.log("Pending audio: encrypted bytes, metadata authentication and actor/cause/workspace isolation passed.");
}
void main();
