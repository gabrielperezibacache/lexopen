import assert from "node:assert/strict";
import {
  GoogleIntegrationError,
  assertGoogleFeatureEnabled,
  getGoogleAuthUrl,
  googleActionHttpStatus,
  googleCredentialsConfigured,
  googleRedirectUri,
} from "@/lib/integrations/google";
import {
  driveFileUrl,
  isPlaceholderDriveFolderId,
  isRealDriveFolderId,
  parseGoogleDriveFolderRef,
} from "@/lib/integrations/drive-folder";

function throwsCode(fn: () => void, code: string, label: string) {
  try {
    fn();
    assert.fail(`${label}: expected throw`);
  } catch (e) {
    assert.ok(e instanceof GoogleIntegrationError, `${label}: type`);
    assert.equal(e.code, code, `${label}: code`);
  }
}

throwsCode(
  () =>
    assertGoogleFeatureEnabled({
      enabled: false,
      syncDrive: true,
      feature: "drive",
    }),
  "disabled",
  "drive disabled"
);

throwsCode(
  () =>
    assertGoogleFeatureEnabled({
      enabled: true,
      syncDrive: false,
      feature: "drive",
    }),
  "sync_off",
  "drive sync off"
);

throwsCode(
  () =>
    assertGoogleFeatureEnabled({
      enabled: true,
      syncCalendar: false,
      feature: "calendar",
    }),
  "sync_off",
  "calendar sync off"
);

assert.doesNotThrow(() =>
  assertGoogleFeatureEnabled({
    enabled: true,
    syncDrive: true,
    feature: "drive",
  })
);

assert.doesNotThrow(() =>
  assertGoogleFeatureEnabled({
    enabled: true,
    syncCalendar: true,
    feature: "calendar",
  })
);

const prevId = process.env.GOOGLE_CLIENT_ID;
const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
const prevRedirect = process.env.GOOGLE_REDIRECT_URI;

delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
assert.equal(googleCredentialsConfigured(), false);
assert.equal(getGoogleAuthUrl("state1"), null);

process.env.GOOGLE_CLIENT_ID = "client-test";
process.env.GOOGLE_CLIENT_SECRET = "secret-test";
process.env.GOOGLE_REDIRECT_URI =
  "https://example.test/api/integrations/google/callback";
assert.equal(googleCredentialsConfigured(), true);
assert.equal(
  googleRedirectUri(),
  "https://example.test/api/integrations/google/callback"
);
const url = getGoogleAuthUrl("abcSTATE");
assert.ok(url?.includes("accounts.google.com"), "auth host");
assert.ok(url?.includes("client_id=client-test"), "client id");
assert.ok(url?.includes("state=abcSTATE"), "state");
assert.ok(url?.includes("drive.file"), "drive scope");
assert.ok(url?.includes("access_type=offline"), "offline");

if (prevId === undefined) delete process.env.GOOGLE_CLIENT_ID;
else process.env.GOOGLE_CLIENT_ID = prevId;
if (prevSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
else process.env.GOOGLE_CLIENT_SECRET = prevSecret;
if (prevRedirect === undefined) delete process.env.GOOGLE_REDIRECT_URI;
else process.env.GOOGLE_REDIRECT_URI = prevRedirect;

assert.equal(isPlaceholderDriveFolderId("stub-folder-abc"), true);
assert.equal(isRealDriveFolderId("1aBcDeFgHiJkLmNoPq"), true);
assert.equal(
  parseGoogleDriveFolderRef(
    "https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPq"
  )?.folderId,
  "1aBcDeFgHiJkLmNoPq"
);
assert.ok(
  driveFileUrl("1aBcDeFgHiJkLmNoPq").includes("/file/d/1aBcDeFgHiJkLmNoPq/")
);

{
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  assert.equal(googleActionHttpStatus("stub"), 400);
  assert.equal(googleActionHttpStatus("needs_real_folder"), 400);
  assert.equal(googleActionHttpStatus("uploaded"), 200);
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  assert.equal(googleActionHttpStatus("stub"), 200);
  if (prev === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    (process.env as Record<string, string | undefined>).NODE_ENV = prev;
  }
}

console.log("google integration tests ok");
