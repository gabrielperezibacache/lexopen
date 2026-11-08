import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { eventFormDates, moveEventToDay } from "./form-dates";

test("all-day input uses an inclusive last day and an exclusive stored end", () => {
  assert.deepEqual(eventFormDates("2026-11-24", "", true), { inicio: "2026-11-24T00:00:00.000Z", fin: "2026-11-25T00:00:00.000Z" });
  assert.equal(eventFormDates("2026-11-24", "2026-11-26", true).fin, "2026-11-27T00:00:00.000Z");
  assert.throws(() => eventFormDates("2026-11-24", "2026-11-23", true));
  assert.throws(() => eventFormDates("2026-02-31", "", true));
  assert.throws(() => eventFormDates("2026-11-24T10:00", "2026-11-24T09:00", false));
  assert.equal(moveEventToDay("invalid", "2026-11-24"), null);
});
test("a browser in Tokyo sends an instant that a host in Santiago cannot reinterpret", () => {
  const client = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import {eventFormDates,moveEventToDay} from './src/lib/calendario/form-dates.ts'; process.stdout.write(JSON.stringify({dates:eventFormDates('2026-11-24T10:00','2026-11-24T12:00',false),allDay:moveEventToDay('2026-11-24T00:00:00Z','2026-11-26',true)}));`], { env: { ...process.env, TZ: "Asia/Tokyo" }, encoding: "utf8", timeout: 10000 });
  assert.equal(client.status, 0, client.stderr);
  const input = JSON.parse(client.stdout);
  assert.equal(input.dates.inicio, "2026-11-24T01:00:00.000Z");
  assert.equal(input.allDay, "2026-11-26T00:00:00.000Z");
  const host = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import {eventDate} from './src/lib/calendario/event-input.ts'; process.stdout.write(eventDate(${JSON.stringify(input.dates.inicio)},false).toISOString());`], { env: { ...process.env, TZ: "America/Santiago" }, encoding: "utf8", timeout: 10000 });
  assert.equal(host.status, 0, host.stderr);
  assert.equal(host.stdout, input.dates.inicio);
});
