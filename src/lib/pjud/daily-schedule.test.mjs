import assert from 'node:assert/strict';
import { caseRefreshWindow, nextCaseRefreshAt } from './daily-schedule.mjs';
const cases = [
 ['2026-04-05T01:00:00Z','2026-04-05T12:00:00.000Z'],
 ['2026-11-14T10:59:59Z','2026-11-14T11:00:00.000Z'],
 ['2026-11-14T11:00:00Z','2026-11-15T01:00:00.000Z'],
 ['2026-11-15T01:00:00Z','2026-11-15T11:00:00.000Z'],
 ['2026-07-14T11:59:59Z','2026-07-14T12:00:00.000Z'],
 ['2026-07-14T12:00:00Z','2026-07-15T02:00:00.000Z'],
 ['2026-09-06T01:00:00Z','2026-09-06T02:00:00.000Z'],
 ['2026-09-06T02:00:00Z','2026-09-06T11:00:00.000Z'],
];
for (const [now, expected] of cases) assert.equal(nextCaseRefreshAt(new Date(now)).toISOString(), expected);
assert.equal(caseRefreshWindow(new Date('2026-11-14T10:59:59Z')), null);
assert.deepEqual(caseRefreshWindow(new Date('2026-11-14T11:00:59Z')), {key:'2026-11-14T08',canStart:true});
assert.deepEqual(caseRefreshWindow(new Date('2026-11-14T11:01:00Z')), {key:'2026-11-14T08',canStart:false});
assert.equal(caseRefreshWindow(new Date('2026-11-14T12:00:00Z')), null);
console.log('Fixed Chile refresh schedule: summer/winter, UTC date boundary, DST transition, exact start minute passed.');
