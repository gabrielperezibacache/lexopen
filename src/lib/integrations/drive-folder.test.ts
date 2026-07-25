import { parseGoogleDriveFolderRef } from "./drive-folder";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const cases: Array<{ input: string; id: string }> = [
  {
    input: "https://drive.google.com/drive/folders/abc123XYZ",
    id: "abc123XYZ",
  },
  {
    input: "https://drive.google.com/drive/u/0/folders/folder_99-aa?usp=sharing",
    id: "folder_99-aa",
  },
  {
    input: "https://drive.google.com/open?id=rawFolderId001",
    id: "rawFolderId001",
  },
  {
    input: "plainFolderId9999",
    id: "plainFolderId9999",
  },
];

for (const c of cases) {
  const parsed = parseGoogleDriveFolderRef(c.input);
  assert(parsed?.folderId === c.id, `Expected ${c.id}, got ${parsed?.folderId}`);
  assert(
    parsed?.folderUrl.includes(c.id),
    `URL should include id for ${c.input}`
  );
}

assert(parseGoogleDriveFolderRef("") === null, "empty should be null");
assert(parseGoogleDriveFolderRef("nope") === null, "short junk should be null");

console.log("drive-folder.test.ts OK");
