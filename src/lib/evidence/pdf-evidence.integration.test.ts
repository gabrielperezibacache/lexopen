import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { putObject } from "@/lib/storage";
import { captureDocumentEvidence, readDocumentEvidence, authorizedEvidenceFragment, authorizedEvidenceOriginal, readEvidencePageImage } from "./service";
import { sha256, verifyEvidenceQuote } from "./fragments";

assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
if ([process.env.S3_BUCKET,process.env.S3_ACCESS_KEY_ID,process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("PDF integration requires isolated local storage, without external providers");
const code = (wanted: number) => (error: unknown) => (error as { status?: number }).status === wanted;

async function main() {
  const prefix=randomUUID(),users:string[]=[];
  let causaId="",documentId="";
  const previousStorage=process.env.STORAGE_PATH, previousOcr=process.env.OCR_ENABLED;
  const storage=await mkdtemp(path.join(tmpdir(),"lexopen-pdf-evidence-it-"));
  process.env.STORAGE_PATH=storage;delete process.env.OCR_ENABLED;
  try {
    const owner=await prisma.user.create({data:{name:"PDF owner fixture",email:`${prefix}@pdf-it.invalid`,password:"fixture-never-used",role:"abogado"}});users.push(owner.id);
    const member=await prisma.user.create({data:{name:"PDF member fixture",email:`${prefix}-member@pdf-it.invalid`,password:"fixture-never-used",role:"abogado"}});users.push(member.id);
    const outsider=await prisma.user.create({data:{name:"PDF outsider fixture",email:`${prefix}-outsider@pdf-it.invalid`,password:"fixture-never-used",role:"abogado"}});users.push(outsider.id);
    const cause=await prisma.causa.create({data:{titulo:`PDF integration ${prefix}`,tribunal:"Fixture",materia:"civil",acceso:"equipo",abogadoId:owner.id,miembros:{create:{userId:member.id,rol:"lectura"}}}});causaId=cause.id;
    const legacyText="Texto previo de evidencia, con versión anterior a las páginas PDF.";
    const doc=await prisma.documento.create({data:{nombre:"legacy-text.txt",contenido:legacyText,extractedMarkdown:legacyText,extractionStatus:"completed",causaId:cause.id,autorId:owner.id}});documentId=doc.id;
    const legacy=await captureDocumentEvidence(doc.id,owner);
    const bytes=await readFile(path.join(process.cwd(),"src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
    const sourceKey=`pdf-it/${prefix}/source.pdf`;
    await putObject({key:sourceKey,body:bytes,contentType:"application/pdf"});
    await prisma.documento.update({where:{id:doc.id},data:{nombre:"physical-pages.pdf",mimeType:"application/pdf",storageKey:sourceKey}});
    const captures=await Promise.all([captureDocumentEvidence(doc.id,owner),captureDocumentEvidence(doc.id,owner)]);
    assert.equal(captures[0].id,captures[1].id,"Concurrent capture of identical PDF bytes is idempotent");
    const snapshot=await prisma.documentEvidenceVersion.findUniqueOrThrow({where:{id:captures[0].id},include:{pages:{orderBy:{pageNumber:"asc"}},fragments:{orderBy:{ordinal:"asc"},include:{page:true}}}});
    assert.equal(snapshot.sourceSha256,sha256(bytes));
    assert.equal(snapshot.locatorKind,"pdf-page");assert.equal(snapshot.pageCount,3);
    assert.notEqual(snapshot.sourceStorageKey,sourceKey,"The PDF original is frozen independently of Documento's mutable source path");
    assert.deepEqual(snapshot.pages.map(p=>[p.pageNumber,p.method,p.status]),[[1,"native","completed"],[2,"ocr","completed"],[3,"empty","empty"]]);
    assert.equal(snapshot.textSha256,sha256(snapshot.extractedText));
    assert.equal(snapshot.extractedText,snapshot.pages.map(p=>p.text).join("\n\n"));
    assert.equal(snapshot.fragments.length,2);
    for(const fragment of snapshot.fragments){
      assert.ok(fragment.page);assert.equal(fragment.page.versionId,snapshot.id);
      assert.equal(fragment.page.textSha256,sha256(fragment.page.text));
      assert.equal(fragment.textSha256,sha256(fragment.text));
      assert.equal(fragment.page.text.slice(fragment.pageStartOffset!,fragment.pageEndOffset!),fragment.text);
      assert.equal(snapshot.extractedText.slice(fragment.startOffset,fragment.endOffset),fragment.text);
      const authorized=await authorizedEvidenceFragment(fragment.id,owner);
      assert.ok(verifyEvidenceQuote(authorized,fragment.text));
      assert.equal(verifyEvidenceQuote(authorized,"Una cita inventada sin respaldo"),false);
    }
    assert.deepEqual(snapshot.fragments.map(f=>f.page?.pageNumber),[1,2]);
    const page2=await readDocumentEvidence(doc.id,owner,{versionId:snapshot.id,page:2});
    assert.equal(page2.selectedPageNumber,2);assert.equal(page2.fragments.length,1);
    assert.match(page2.fragments[0].text,/PAGO EL 12 DE MAYO DE 2025/);
    assert.equal(new URL(page2.fragments[0].href,"http://fixture.invalid").searchParams.get("page"),"2");
    const empty=await readDocumentEvidence(doc.id,owner,{versionId:snapshot.id,page:3});
    assert.equal(empty.fragments.length,0);assert.equal(empty.pages[2].status,"empty");
    const old=await readDocumentEvidence(doc.id,owner,{versionId:legacy.id});
    assert.equal(old.versions.find(v=>v.id===legacy.id)?.locatorKind,"text-offset");
    assert.equal(old.pages.length,0);assert.equal(old.fragments[0].text,legacyText);
    assert.equal((await authorizedEvidenceOriginal(legacy.id,owner)).bytes.toString("utf8"),legacyText);
    const png=await readEvidencePageImage(snapshot.id,2,owner);
    assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    await assert.rejects(readEvidencePageImage(snapshot.id,4,owner),code(404));
    await assert.rejects(readEvidencePageImage(snapshot.id,2,outsider),code(404));
    await readEvidencePageImage(snapshot.id,2,member);
    await prisma.causaMiembro.deleteMany({where:{causaId:cause.id,userId:member.id}});
    await assert.rejects(readEvidencePageImage(snapshot.id,2,member),code(404));
    await assert.rejects(authorizedEvidenceFragment(snapshot.fragments[1].id,member),code(404));
    await assert.rejects(authorizedEvidenceOriginal(snapshot.id,member),code(404));
    await prisma.documento.update({where:{id:doc.id},data:{confidencial:true}});
    await assert.rejects(readEvidencePageImage(snapshot.id,2,{...owner,capabilityRevokes:"doc.confidential.read"}),code(404));
    await prisma.documento.update({where:{id:doc.id},data:{confidencial:false}});

    // Modifying the source file must not replace the version's retained original.
    const nextBytes=Buffer.concat([bytes,Buffer.from("\n% LexOpen next source version fixture\n")]);
    await putObject({key:sourceKey,body:nextBytes,contentType:"application/pdf"});
    await prisma.documento.update({where:{id:doc.id},data:{nombre:"physical-pages-updated.pdf"}});
    assert.deepEqual((await authorizedEvidenceOriginal(snapshot.id,owner)).bytes,bytes);
    assert.equal(sha256(await readEvidencePageImage(snapshot.id,2,owner)),sha256(png));
    const newer=await captureDocumentEvidence(doc.id,owner);assert.notEqual(newer.id,snapshot.id);
    assert.equal(newer.sourceSha256,sha256(nextBytes));
    assert.equal((await readDocumentEvidence(doc.id,owner,{versionId:snapshot.id,page:2})).fragments[0].id,snapshot.fragments[1].id);

    // Both the page text and its relationship to the fragment remain checked.
    const savedPage=snapshot.pages[1];
    await prisma.documentEvidencePage.update({where:{id:savedPage.id},data:{text:"Tampered page text",textSha256:sha256("Tampered page text")}});
    await assert.rejects(authorizedEvidenceFragment(snapshot.fragments[1].id,owner),code(409));
    await prisma.documentEvidencePage.update({where:{id:savedPage.id},data:{text:savedPage.text,textSha256:savedPage.textSha256}});
    await putObject({key:snapshot.sourceStorageKey!,body:Buffer.from("tampered frozen source")});
    await assert.rejects(readEvidencePageImage(snapshot.id,2,owner),code(409));
    await assert.rejects(authorizedEvidenceOriginal(snapshot.id,owner),code(409));
    await putObject({key:snapshot.sourceStorageKey!,body:bytes,contentType:"application/pdf"});
    console.log("PDF evidence PostgreSQL OK: physical page/fragment binding, OCR+blank page, literal offsets/hashes, concurrent idempotency, legacy versions, frozen original, revocation and tamper rejection");
  } finally {
    if(documentId)await prisma.documento.deleteMany({where:{id:documentId}});
    if(causaId)await prisma.causa.deleteMany({where:{id:causaId}});
    await prisma.auditEvent.deleteMany({where:{actorId:{in:users}}});
    await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();
    await rm(storage,{recursive:true,force:true});
    if(previousStorage===undefined)delete process.env.STORAGE_PATH;else process.env.STORAGE_PATH=previousStorage;
    if(previousOcr===undefined)delete process.env.OCR_ENABLED;else process.env.OCR_ENABLED=previousOcr;
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
