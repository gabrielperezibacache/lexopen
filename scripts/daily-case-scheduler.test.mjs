import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { startDailyCaseRefreshJob } from './local-host-schedulers.mjs';
const oldInterval=globalThis.setInterval, oldClear=globalThis.clearInterval, oldFetch=globalThis.fetch;
let tick; const calls=[];
try {
 mock.timers.enable({apis:['Date'],now:new Date('2026-11-14T10:59:00Z')});
 globalThis.setInterval=callback=>{tick=callback;return 123;};
 globalThis.clearInterval=()=>{};
 globalThis.fetch=async url=>{calls.push(url);return Response.json({enqueued:0,synced:0});};
 const timer=await startDailyCaseRefreshJob({env:{CRON_SECRET:'synthetic',PJUD_SYNC_INTERVAL_MINUTES:'5',PJUD_MIS_CAUSAS_INTERVAL_MINUTES:'1'},baseUrl:'http://localhost',alreadyHealthy:true,log:{info(){},warn(){}}});
 assert.equal(calls.length,0,'no startup catch-up');
 mock.timers.setTime(new Date('2026-11-14T11:00:00Z').getTime());
 tick();tick(); await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['http://localhost/api/pjud/mis-causas','http://localhost/api/causas/monitoreo']);
 tick(); await new Promise(resolve=>setImmediate(resolve)); assert.equal(calls.length,2,'no repeat inside minute zero');
 mock.timers.setTime(new Date('2026-11-14T12:30:00Z').getTime());tick();assert.equal(calls.length,2);
 mock.timers.setTime(new Date('2026-11-15T01:00:00Z').getTime());tick();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,4,'second local slot crosses UTC date');
 clearInterval(timer);
} finally {mock.timers.reset();globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;globalThis.fetch=oldFetch;}
console.log('Daily scheduler: no startup catch-up, concurrent ticks, two Chile slots passed.');
