import {
  driveFolderUrl,
  isPlaceholderDriveFolderId,
  isRealDriveFolderId,
  makeStubFolderId,
  parseGoogleDriveFolderRef,
  stubFolderUrl,
} from "./drive-folder";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const cases: Array<{ input: string; id: string; real: boolean }> = [
  {
    input: "https://drive.google.com/drive/folders/abc123XYZ99",
    id: "abc123XYZ99",
    real: true,
  },
  {
    input: "https://drive.google.com/drive/u/0/folders/folder_99-aa?usp=sharing",
    id: "folder_99-aa",
    real: true,
  },
  {
    input: "https://drive.google.com/open?id=rawFolderId001",
    id: "rawFolderId001",
    real: true,
  },
  {
    input: "plainFolderId9999",
    id: "plainFolderId9999",
    real: true,
  },
  {
    input: "demo-folder-c4521-2025",
    id: "demo-folder-c4521-2025",
    real: false,
  },
  {
    input: "stub-folder-abc12345",
    id: "stub-folder-abc12345",
    real: false,
  },
];

for (const c of cases) {
  const parsed = parseGoogleDriveFolderRef(c.input);
  assert(parsed?.folderId === c.id, `Expected ${c.id}, got ${parsed?.folderId}`);
  assert(
    isRealDriveFolderId(parsed?.folderId) === c.real,
    `real flag for ${c.id}`
  );
  if (c.real) {
    assert(
      parsed?.folderUrl.includes("drive.google.com"),
      `URL should be Google for ${c.input}`
    );
  } else {
    assert(
      parsed?.folderUrl.startsWith("lexopen://"),
      `stub URL for ${c.input}`
    );
  }
}

assert(parseGoogleDriveFolderRef("") === null, "empty should be null");
assert(parseGoogleDriveFolderRef("nope") === null, "short junk should be null");
assert(isPlaceholderDriveFolderId("demo-x"), "demo prefix");
assert(isPlaceholderDriveFolderId(null), "null is placeholder");
assert(!isRealDriveFolderId("stub-folder-x"), "stub not real");
assert(driveFolderUrl("stub-1").startsWith("lexopen://"), "driveFolderUrl stub");
assert(stubFolderUrl("stub-1").includes("stub-1"), "stubFolderUrl");
assert(makeStubFolderId("cuid_abc-123").startsWith("stub-folder-"), "makeStub");

console.log("drive-folder.test.ts OK");
