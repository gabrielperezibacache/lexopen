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
test("academic Word uses native outline levels, emphasis, lists and quotation style", () => {
  const docx = exportAcademicDocx([
    "# Manuscrito",
    "## Fundamentos",
    "### Límites",
    "**Tesis** y *matiz* con ***énfasis doble*** [R1].",
    "- Lectura [R2]",
    "- Contraste",
    "",
    "3. Primer paso",
    "4. Segundo paso",
    "",
    "> Pasaje literal [R3].",
    "[Fuente](https://example.invalid/ficha_(test))",
    "[R4](https://example.invalid/fuente)",
    "[Etiqueta](javascript:alert(1))",
    "\\*Literal\\* y `**código**`",
  ].join("\n")).toString("utf8");
  for (const [level, heading] of ["Manuscrito", "Fundamentos", "Límites"].entries()) {
    assert.ok(docx.includes(`<w:pStyle w:val="Heading${level + 1}"/></w:pPr><w:r><w:t xml:space="preserve">${heading}</w:t>`));
    assert.ok(docx.includes(`<w:outlineLvl w:val="${level}"/>`));
  }
  assert.match(docx, /<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">Tesis<\/w:t>/);
  assert.match(docx, /<w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">matiz<\/w:t>/);
  assert.match(docx, /<w:rPr><w:b\/><w:i\/><\/w:rPr><w:t xml:space="preserve">énfasis doble<\/w:t>/);
  assert.equal(docx.match(/<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="1"\/>/g)?.length, 2);
  assert.equal(docx.match(/<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="2"\/>/g)?.length, 2);
  assert.match(docx, /<w:num w:numId="1"><w:abstractNumId w:val="0"\/><\/w:num>/);
  assert.match(docx, /<w:num w:numId="2"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"\/>/);
  assert.match(docx, /<w:pStyle w:val="Quote"\/><\/w:pPr><w:r><w:t xml:space="preserve">Pasaje literal \[R3\]\./);
  assert.match(docx, /Fuente \(https:\/\/example.invalid\/ficha_\(test\)\)/);
  assert.match(docx, /\[R4\] \(https:\/\/example.invalid\/fuente\)/);
  assert.match(docx, /\[Etiqueta\]\(javascript:alert\(1\)\)/);
  assert.doesNotMatch(docx, /<w:hyperlink|TargetMode=/);
  assert.match(docx, /\[R1\]/);
  assert.match(docx, /Lectura \[R2\]/);
  assert.ok(docx.includes("`**código**`"));
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
