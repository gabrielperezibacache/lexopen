import assert from "node:assert/strict";
import { splitEvidenceText, verifyEvidenceQuote, sha256, MAX_EVIDENCE_TEXT } from "./fragments";
const text = Array.from({length:120}, (_,i)=>`Párrafo ${i}: decisión, año y fecha. 🔎 ${'evidencia '.repeat(120)}`).join('\n\n');
const fragments=splitEvidenceText(text);
assert.ok(fragments.length>50);
for (const f of fragments) {
  assert.equal(text.slice(f.startOffset,f.endOffset),f.text);
  assert.equal(sha256(f.text),f.textSha256);
  assert.ok(verifyEvidenceQuote(f,f.text.slice(0,80)));
  assert.equal(verifyEvidenceQuote(f,'una cita inventada que no está'),false);
  assert.equal(verifyEvidenceQuote({...f,textSha256:'tampered'},f.text),false);
  assert.equal(verifyEvidenceQuote(f,' '),false);
}
assert.throws(()=>splitEvidenceText('x'.repeat(MAX_EVIDENCE_TEXT+1)),/límite/);
assert.deepEqual(splitEvidenceText(' \n\t'),[]);
assert.throws(()=>splitEvidenceText('contenido',0),/inválido/);
assert.deepEqual(splitEvidenceText(text),fragments);
console.log('evidence fragments OK: exact Unicode offsets, stable locators, invented/tampered quotes rejected, explicit limits');
