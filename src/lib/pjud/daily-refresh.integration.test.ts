/** Durable schedule and real sync service; synthetic provider, disposable PostgreSQL only. */
import assert from "node:assert/strict";
import { mock } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { automaticRefreshCycle, claimAutomaticRefresh, nextCaseRefreshAt } from "./daily-refresh";
import { syncCausaPjud } from "./sync";
import { syncMisCausas } from "./claveunica";
import { enqueueDueSyncJobs, runDueSyncPipeline } from "./queue";

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),new URL(process.env.DATABASE_URL!).toString());
  assert.equal(await prisma.organization.count(),0,"requires fresh disposable organization scope");
  const scope=`fixture:${randomUUID()}`;
  const slots=["2031-11-14T08","2031-11-14T22","2031-11-15T08"];
  const org=await prisma.organization.create({data:{name:scope,settings:{create:{caseManagementMode:"pjud_cl"}}}});
  const causa=await prisma.causa.create({data:{titulo:scope,tribunal:"Tribunal ficticio",materia:"Fixture",pjudMonitoreoActivo:true}});
  const previousFlags = { public: process.env.PJUD_PUBLIC_SCRAPE, clave: process.env.PJUD_CLAVEUNICA_SCRAPE };
  process.env.PJUD_PUBLIC_SCRAPE="1"; process.env.PJUD_CLAVEUNICA_SCRAPE="1";
  let listed=0;
  const sessionSource={listMisCausas:async()=>{listed++;return [];},fetchMovimientos:async()=>({provider:"scrape" as const,demo:false,note:"Synthetic",movimientos:[]})};
  let calls=0;
  const fetchMovimientos=async()=>{calls++;return {provider:"scrape" as const,demo:false,note:"Synthetic schedule test",movimientos:[]};};
  const setTime=(date:string)=>mock.timers.setTime(new Date(date).getTime());
  try {
    mock.timers.enable({apis:["Date"],now:new Date("2031-11-14T10:30:00Z")});
    assert.equal(await automaticRefreshCycle(),null);
    await assert.rejects(syncMisCausas({automatic:true,sessionSource,processJobsInline:true}),/programada/);
    assert.equal(listed,0,"automatic portfolio cannot list outside scheduled hours");
    assert.equal((await syncCausaPjud(causa.id,{trigger:"cron",fetchMovimientos})).status,"disabled");
    assert.equal(calls,0);
    assert.equal((await syncCausaPjud(causa.id,{trigger:"manual",force:true,fetchMovimientos})).status,"ok");
    assert.equal(calls,1,"manual refresh is allowed outside scheduled hours");
    await prisma.causa.update({where:{id:causa.id},data:{pjudNextSyncAt:null}});
    setTime("2031-11-14T11:00:00Z");
    const claims=await Promise.all(Array.from({length:12},()=>claimAutomaticRefresh(scope)));
    assert.equal(claims.filter(Boolean).length,1,"concurrent processes can reserve a scope only once");
    await syncMisCausas({automatic:true,sessionSource,processJobsInline:true});
    await assert.rejects(syncMisCausas({automatic:true,sessionSource,processJobsInline:true}),/programada/);
    assert.equal(listed,1,"portfolio also consumes only one attempt per turn");
    const first=await syncCausaPjud(causa.id,{trigger:"cron",fetchMovimientos});
    assert.equal(first.status,"ok");
    assert.equal(first.nextSyncAt,"2031-11-15T01:00:00.000Z");
    assert.equal((await syncCausaPjud(causa.id,{trigger:"cron",fetchMovimientos})).status,"disabled");
    assert.equal(calls,2,"automatic duplicate cannot call provider");
    assert.equal((await enqueueDueSyncJobs({causaIds:[causa.id],trigger:"cron"})).length,0);
    setTime("2031-11-14T11:30:00Z");
    assert.equal(await automaticRefreshCycle(),slots[0],"a persisted started cycle can finish its batch after restart");
    assert.equal(await claimAutomaticRefresh(scope),null,"restart does not reset a reservation");
    assert.equal((await syncCausaPjud(causa.id,{force:true,trigger:"manual",fetchMovimientos})).status,"ok");
    assert.equal(calls,3,"manual refresh also bypasses an already consumed automatic slot");
    setTime("2031-11-15T01:00:00Z");
    const failing=async()=>{calls++;throw new Error("Synthetic provider failure");};
    await assert.rejects(syncCausaPjud(causa.id,{trigger:"cron",fetchMovimientos:failing}),/Synthetic provider failure/);
    assert.equal((await syncCausaPjud(causa.id,{trigger:"cron",fetchMovimientos})).status,"disabled");
    assert.equal(calls,4,"failure consumes its slot; retry waits for next slot");
    setTime("2031-11-15T11:30:00Z");
    assert.equal(await automaticRefreshCycle(),null,"no late catch-up when the Host missed minute zero");
    assert.deepEqual(await runDueSyncPipeline({automatic:true}),{enqueued:0,synced:0,results:[]});
    assert.equal(calls,4);
    assert.equal(nextCaseRefreshAt().toISOString(),"2031-11-16T01:00:00.000Z");
  } finally {
    mock.timers.reset();
    if(previousFlags.public===undefined)delete process.env.PJUD_PUBLIC_SCRAPE;else process.env.PJUD_PUBLIC_SCRAPE=previousFlags.public;
    if(previousFlags.clave===undefined)delete process.env.PJUD_CLAVEUNICA_SCRAPE;else process.env.PJUD_CLAVEUNICA_SCRAPE=previousFlags.clave;
    await prisma.causa.delete({where:{id:causa.id}});
    await prisma.organization.delete({where:{id:org.id}});
    await prisma.pjudRefreshReservation.deleteMany({where:{slot:{in:slots}}});
    await prisma.$disconnect();
  }
  console.log("Durable automatic schedule: concurrency, restart, failure, queue, manual exceptions passed (zero external requests).");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
