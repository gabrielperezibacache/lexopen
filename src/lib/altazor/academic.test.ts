import assert from "node:assert/strict";
import { test } from "node:test";
import { exportAcademicDocx } from "./document-export";
import { parseAcademicOutput, academicWritingBody } from "./academic-output";
import { academicWorkspaceSaveSchema } from "./academic-schemas";
import type { AltazorSourceSnapshot } from "./resources";
import { altazorSourceFingerprint } from "./resources";
import { canonicalJson } from "@/lib/command-execution";
const refs=[{ title:"Fuente ficticia",text:"La interpretación debe conservar sus límites.",citations:[],warnings:[],input:{kind:"book",bookId:"fake",fragmentId:"fake",quote:"La interpretación debe conservar sus límites."},scopeKey:"personal",version:1,href:"/biblioteca/fake",proofJson:"{}",fingerprint:"a".repeat(64) }] satisfies AltazorSourceSnapshot[];
test("source proof survives canonical persistence without depending on object key order",()=>{
  const { fingerprint: _fingerprint, ...snapshot }=refs[0];
  void _fingerprint;
  assert.equal(altazorSourceFingerprint(snapshot),altazorSourceFingerprint(JSON.parse(canonicalJson(snapshot))));
  assert.notEqual(altazorSourceFingerprint(snapshot),altazorSourceFingerprint({...snapshot,text:"Texto distinto"}));
});
test("academic proposals cannot introduce references or fabricate literal quotations",()=>{
  const answer=(text:string,referenceIds:string[])=>JSON.stringify({sections:[{heading:"Análisis",text,referenceIds}]});
  assert.match(parseAcademicOutput(answer("La fuente exige cautela.",["R1"]),refs),/\[R1\]/);
  assert.throws(()=>parseAcademicOutput(answer("Dato inventado",["R8"]),refs));
  assert.throws(()=>parseAcademicOutput(answer("“Conclusión que no figura en el original”",["R1"]),refs));
  assert.throws(()=>parseAcademicOutput(answer("Afirmación sin fuente",[]),refs));
  assert.throws(()=>parseAcademicOutput(answer("Ver https://example.test/falso",["R1"]),refs));
  assert.match(parseAcademicOutput(answer("“conservar sus límites”",["R1"]),refs),/conservar sus límites/);
});
test("Word output preserves Unicode and treats markup as inert text",()=>{
  const docx=exportAcademicDocx('# Texto ficticio\n\nAnálisis, educación y niño. <script>no ejecutar</script> & fuente.');
  assert.equal(docx.readUInt32LE(),0x04034b50);
  assert.match(docx.toString('utf8'),/Análisis, educación y niño/);
  assert.match(docx.toString('utf8'),/&lt;script&gt;no ejecutar&lt;\/script&gt;/);
  assert.throws(()=>exportAcademicDocx('Texto\u0000inválido'));
  assert.throws(()=>exportAcademicDocx('x'.repeat(100001)));
});
test("literature matrix retains typed cells and rejects conflicting dimensions",()=>{
  const input={expectedRevision:1,title:"Matriz ficticia",brief:{},matrix:{dimensions:[{id:"year",label:"Año",type:"number"}],rows:[{id:"paper-1",title:"Artículo ficticio",included:true,cells:{year:{value:"2026"}}}]}};
  assert.equal(academicWorkspaceSaveSchema.safeParse(input).success,true);
  assert.equal(academicWorkspaceSaveSchema.safeParse({...input,matrix:{...input.matrix,dimensions:[...input.matrix.dimensions,...input.matrix.dimensions]}}).success,false);
  assert.equal(academicWorkspaceSaveSchema.safeParse({...input,matrix:{...input.matrix,rows:[{...input.matrix.rows[0],cells:{unknown:{value:"otra"}}}]}}).success,false);
  assert.equal(academicWorkspaceSaveSchema.safeParse({...input,matrix:{...input.matrix,rows:[{...input.matrix.rows[0],cells:{year:{value:"veinte"}}}]}}).success,false);
});

test("academic promotion binds registered references to native writing footnotes",()=>{
  assert.equal(academicWritingBody("Análisis [R1]. Ya incorporado [^R2].",2),"Análisis [^R1]. Ya incorporado [^R2].");
  assert.throws(()=>academicWritingBody("Conclusión [R9]",2));
  assert.throws(()=>academicWritingBody("Conclusión [^R9]",2));
  assert.equal(academicWritingBody("Comentario sin respaldo",0),"Comentario sin respaldo");
});
