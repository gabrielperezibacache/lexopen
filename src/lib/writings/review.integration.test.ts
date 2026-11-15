import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { createCaseWriting, readCaseWriting, reviewCaseWriting, saveCaseWriting, assignCaseWritingReview, listCaseWritings, listWritingReviewers, readCaseWritingRevision } from "./service";
import { exportCaseWritingDocx } from "./export";
const status = (value:number)=>(error:unknown)=>(error as {status?:number}).status===value;
async function main(){
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),new URL(process.env.DATABASE_URL!).toString());
  const tag=randomUUID(), users:string[]=[];let causeId="";
  try{
    const owner=await prisma.user.create({data:{email:`${tag}@review.invalid`,name:"Autor ficticio",role:"abogado",password:"no-login"}});users.push(owner.id);
    const other=await prisma.user.create({data:{email:`${tag}-other@review.invalid`,name:"Revisor ficticio",role:"abogado",password:"no-login",capabilityRevokes:"causa.write"}});users.push(other.id);
    const cause=await prisma.causa.create({data:{titulo:tag,tribunal:"Ficticio",materia:"civil",acceso:"equipo",abogadoId:owner.id}});causeId=cause.id;
    let draft=(await createCaseWriting(cause.id,{requestId:randomUUID(),title:"Revisión",body:"Texto ficticio"},owner)).draft;
    const base=()=>({requestId:randomUUID(),expectedRevision:draft.revision,expectedAssignmentVersion:draft.assignmentVersion??0});
    await assert.rejects(assignCaseWritingReview(cause.id,draft.id,{...base(),reviewerId:other.id},owner),status(404));
    await prisma.causaMiembro.create({data:{causaId:cause.id,userId:other.id,rol:"supervisor"}});
    assert.equal((await listWritingReviewers(cause.id,draft.id,owner)).reviewers[0].id,other.id);
    await assert.rejects(assignCaseWritingReview(cause.id,draft.id,{...base(),reviewerId:owner.id},owner),status(422));
    await withRejectedAudit(owner.id,"case.writing.review_assigned",async()=>{
      await assert.rejects(assignCaseWritingReview(cause.id,draft.id,{...base(),reviewerId:other.id},owner),status(500));
      assert.equal((await prisma.caseWritingDraft.findUniqueOrThrow({where:{id:draft.id}})).reviewerId,null);
    });
    const assignment={...base(),reviewerId:other.id};
    const assigned=await Promise.all([assignCaseWritingReview(cause.id,draft.id,assignment,owner),assignCaseWritingReview(cause.id,draft.id,assignment,owner)]);
    assert.equal(assigned[0].draft.assignmentVersion,assigned[1].draft.assignmentVersion);draft=assigned[0].draft;
    assert.equal(draft.canReview,false);assert.equal(draft.canAssignReview,true);
    const reviewerView=await readCaseWriting(cause.id,draft.id,other);assert.equal(reviewerView.canWrite,false);assert.equal(reviewerView.canReview,true);
    assert.ok((await listCaseWritings(cause.id,other)).drafts.some(row=>row.id===draft.id));
    await assert.rejects(saveCaseWriting(cause.id,draft.id,{requestId:randomUUID(),expectedRevision:draft.revision,title:draft.title,body:"Foreign edit"},other),status(403));
    const review=()=>({requestId:randomUUID(),expectedRevision:draft.revision,expectedAssignmentVersion:draft.assignmentVersion!,decision:"approved",citationsChecked:true,note:"Cotejo ficticio"});
    await assert.rejects(reviewCaseWriting(cause.id,draft.id,review(),owner),status(403));
    const old=review();
    draft=(await assignCaseWritingReview(cause.id,draft.id,{...base(),reviewerId:null},owner)).draft;
    await assert.rejects(readCaseWriting(cause.id,draft.id,other),status(404));
    draft=(await assignCaseWritingReview(cause.id,draft.id,{...base(),reviewerId:other.id},owner)).draft;
    await assert.rejects(reviewCaseWriting(cause.id,draft.id,old,other),status(403),"reassignment cannot authorize a stale decision");
    await prisma.user.update({where:{id:other.id},data:{capabilityRevokes:"causa.write,escrito.approve"}});
    await assert.rejects(readCaseWriting(cause.id,draft.id,other),status(404));
    await prisma.user.update({where:{id:other.id},data:{capabilityRevokes:"causa.write"}});
    const decision=review();
    await assert.rejects(reviewCaseWriting(cause.id,draft.id,{...decision,citationsChecked:false},other),{name:"ZodError"});
    await withRejectedAudit(other.id,"case.writing.review",async()=>{await assert.rejects(reviewCaseWriting(cause.id,draft.id,decision,other),status(500));assert.equal(await prisma.caseWritingReview.count({where:{draftId:draft.id}}),0);});
    const accepted=await Promise.all([reviewCaseWriting(cause.id,draft.id,decision,other),reviewCaseWriting(cause.id,draft.id,decision,other)]);
    assert.equal(accepted[0].draft.review?.id,accepted[1].draft.review?.id);assert.equal(accepted[0].draft.review?.reviewerId,other.id);
    await assert.rejects(reviewCaseWriting(cause.id,draft.id,{...decision,note:"Changed"},other),status(409));
    await withRejectedAudit(owner.id,"case.writing.export",async()=>{
      await assert.rejects(exportCaseWritingDocx(cause.id,draft.id,owner,prisma,{purpose:"approved"}),status(500));
      assert.equal(await prisma.caseWritingExport.count({where:{draftId:draft.id}}),0);
    });
    const output=await exportCaseWritingDocx(cause.id,draft.id,owner,prisma,{purpose:"approved"});
    const receipt=await prisma.caseWritingExport.findUniqueOrThrow({where:{id:output.receiptId}});assert.equal(receipt.contentSha256,createHash("sha256").update(output.content).digest("hex"));
    await prisma.user.update({where:{id:owner.id},data:{capabilityRevokes:"escrito.approve"}});
    await assert.rejects(exportCaseWritingDocx(cause.id,draft.id,owner,prisma,{purpose:"approved"}),status(403));
    await exportCaseWritingDocx(cause.id,draft.id,owner);
    await prisma.user.update({where:{id:owner.id},data:{capabilityRevokes:""}});
    draft=(await saveCaseWriting(cause.id,draft.id,{requestId:randomUUID(),expectedRevision:draft.revision,title:draft.title,body:"Nueva versión"},owner)).draft;
    assert.equal(draft.review?.current,false);
    await assert.rejects(readCaseWriting(cause.id,draft.id,other),status(404));
    assert.equal((await listCaseWritings(cause.id,other)).drafts.length,0);
    await assert.rejects(exportCaseWritingDocx(cause.id,draft.id,owner,prisma,{purpose:"approved"}),status(409));
    draft=(await assignCaseWritingReview(cause.id,draft.id,{...base(),reviewerId:other.id},owner)).draft;
    await assert.rejects(readCaseWritingRevision(cause.id,draft.id,1,other),status(404));
    draft=(await saveCaseWriting(cause.id,draft.id,{requestId:randomUUID(),expectedRevision:draft.revision,title:draft.title,body:"Cita sin respaldo [^R999]."},owner)).draft;
    draft=(await assignCaseWritingReview(cause.id,draft.id,{...base(),reviewerId:other.id},owner)).draft;
    await assert.rejects(reviewCaseWriting(cause.id,draft.id,review(),other),status(409));
    await prisma.causaMiembro.delete({where:{causaId_userId:{causaId:cause.id,userId:other.id}}});
    await assert.rejects(reviewCaseWriting(cause.id,draft.id,review(),other),status(404));
    console.log("Assigned review: exact revision, separate read/review/edit rights, current source/case permissions, revoke/reassign, concurrent replay, atomic audits and approved export passed.");
  }finally{
    if(causeId){await prisma.caseWritingDraft.deleteMany({where:{causaId:causeId}});await prisma.causa.deleteMany({where:{id:causeId}});}
    await prisma.auditEvent.deleteMany({where:{actorId:{in:users}}});await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
