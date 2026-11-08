import assert from "node:assert/strict";
import test from "node:test";
import { KittiesGateway } from "../computer/gateway";

const origin = "http://127.0.0.1:55444", token = "fictitious-operation-safety-gateway";
const kitty = "fixture-desktop", chat = "fixture-chat";
const selected = ["research-feeds", "research-api", "course-calendar", "course-files"];
const reads = [
  { id: "feed-read", connector: selected[0], kind: "rss", action: "news", args: { action: "news" } },
  { id: "api-read", connector: selected[1], kind: "http", action: "call", args: { action: "call", method: "GET", path: "/public/calls" } },
  { id: "calendar-read", connector: selected[2], kind: "caldav", action: "events", args: { action: "events", calendar: "course", from: "2026-11-01", to: "2026-11-07" } },
  { id: "file-read", connector: selected[3], kind: "dropbox", action: "read", args: { action: "read", path: "/Curso/Resolución.pdf" } },
];
const write = { id: "calendar-write", connector: selected[2], kind: "caldav", action: "add_event", args: { action: "add_event", title: "Fictitious seminar", start: "2026-11-07T10:00:00Z" } };

test("RSS, HTTP, CalDAV and Dropbox reads remain explicit operations; viewing them cannot authorize writes", async () => {
  const decisions: string[] = [];
  const approvals = [...reads, write].map(row => ({ ...row, kitty, chat, status: "pending", at: "2026-11-07T00:00:00Z" }));
  const fetcher: typeof fetch = async (raw, init) => {
    const url = new URL(String(raw));
    assert.equal(url.origin, origin); assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    assert.equal(init?.redirect, "error");
    if (url.pathname === "/v1/health") return Response.json({ ok: true, lexopen_connector_gate: "v1" });
    if (url.pathname === "/v1/approvals") return Response.json({ approvals: [...approvals, { ...write, id: "foreign-chat", kitty, chat: "other-chat", status: "pending" }] });
    const match = /^\/v1\/approvals\/([a-z-]+)\/(approve|reject)$/.exec(url.pathname);
    assert.ok(match, "only an explicit decision may reach a mutation endpoint"); assert.equal(init?.method, "POST");
    decisions.push(`${match[1]}:${match[2]}`);
    const row = approvals.find(row => row.id === match[1]); assert.ok(row);
    const body = JSON.parse(String(init?.body)); assert.equal(body.always, false, "no blanket approval for later operations");
    return Response.json({ approval: { ...row, status: match[2] === "approve" ? "approved" : "rejected", always: false } });
  };
  const gateway = new KittiesGateway(origin, token, fetcher);
  const pending = await gateway.pendingApprovals(kitty, chat, selected);
  assert.equal(pending.length, 5); assert.equal(decisions.length, 0);
  for (const read of reads) {
    assert.ok(pending.find(row => row.id === read.id)?.reviewable);
    assert.equal((await gateway.decideApproval(read.id, kitty, chat, selected, true)).status, "approved");
  }
  assert.equal(decisions.includes("calendar-write:approve"), false, "approving a read cannot approve a calendar write");
  await assert.rejects(gateway.decideApproval("calendar-write", kitty, chat, ["research-feeds"], true));
  await assert.rejects(gateway.decideApproval("foreign-chat", kitty, chat, selected, true));
  assert.equal(decisions.length, reads.length);
  assert.equal((await gateway.decideApproval("calendar-write", kitty, chat, selected, false)).status, "rejected");
  assert.equal(decisions.includes("calendar-write:approve"), false);
});

test("a request with hidden credentials cannot be authorized through the generic HTTP adapter", async () => {
  let mutations = 0;
  const gateway = new KittiesGateway(origin, token, async (raw, init) => {
    const url = new URL(String(raw));
    if (init?.method === "POST") { mutations++; throw Error("unexpected write"); }
    if (url.pathname === "/v1/health") return Response.json({ ok: true, lexopen_connector_gate: "v1" });
    return Response.json({ approvals: [{ id: "hidden-request", kitty, chat, connector: "research-api", kind: "http", action: "call", args: { method: "POST", path: "/documents", headers: { Authorization: "fictitious-must-not-be-returned" } }, status: "pending" }] });
  });
  const pending = await gateway.pendingApprovals(kitty, chat, selected);
  assert.equal(pending[0].reviewable, false); assert.equal(JSON.stringify(pending).includes("fictitious-must-not-be-returned"), false);
  await assert.rejects(gateway.decideApproval("hidden-request", kitty, chat, selected, true)); assert.equal(mutations, 0);
});
