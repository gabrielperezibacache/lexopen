import assert from "node:assert/strict";
import { listDriveFoldersWithSession } from "./drive-import";
async function main() {
  const requests: URL[] = []; let guards = 0, count = 2;
  const session = { accessToken: "fictional-picker-token", scopes: ["https://www.googleapis.com/auth/drive.readonly"], syncDrive: true, syncCalendar: false };
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url);
    assert.equal(url.origin, "https://www.googleapis.com"); assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictional-picker-token");
    assert.equal(url.searchParams.get("pageSize"), "50"); assert.ok(!url.searchParams.has("alt"), "folder selection must not download files");
    assert.equal(url.searchParams.get("fields"), "nextPageToken,incompleteSearch,files(id,name,mimeType,trashed)");
    return Response.json({ files: Array.from({ length: count }, (_, index) => ({ id: `Folder_fixture_${index}`, name: `Fictitious folder ${index}`, mimeType: "application/vnd.google-apps.folder", trashed: false })), nextPageToken: "fixture-page-2", incompleteSearch: false });
  };
  const deps = { fetch: fakeFetch, assertActive: async () => { guards++; } };
  const root = await listDriveFoldersWithSession(session, {}, deps);
  assert.equal(root.folders.length, 2); assert.equal(root.nextPageToken, "fixture-page-2"); assert.match(requests[0].searchParams.get("q")!, /'root' in parents/);
  await listDriveFoldersWithSession(session, { parentId: root.folders[0].id, pageToken: root.nextPageToken! }, deps);
  assert.match(requests[1].searchParams.get("q")!, /'Folder_fixture_0' in parents/);
  await listDriveFoldersWithSession(session, { query: "O'Higgins" }, deps);
  assert.ok(requests[2].searchParams.get("q")!.includes("name contains 'O\\'Higgins'"));
  const beforeInvalid = requests.length;
  await assert.rejects(listDriveFoldersWithSession(session, { parentId: "https://external.invalid" }, deps));
  await assert.rejects(listDriveFoldersWithSession(session, { query: "x".repeat(121) }, deps));
  assert.equal(requests.length, beforeInvalid);
  count = 51; await assert.rejects(listDriveFoldersWithSession(session, {}, deps), /lista inválida/);
  assert.equal(guards, 4, "every provider request must revalidate its owner-bound connection");
  console.log("Drive folder picker: metadata-only root/breadcrumb/search/page requests, fixed host, query escaping, live guard and 50-folder bound passed (no network).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
