/** Microphone access stays with the current LexOpen document, never an embedded page or another window. */
function secureAppOrigin(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url.origin;
  } catch { /* Opaque origins, setup files and malformed URLs cannot request a microphone. */ }
  return null;
}
function isCurrentAppFrame(win, contents, requestingUrl, details, getAppUrl) {
  try {
    if (!contents || win.isDestroyed() || contents.isDestroyed() || contents !== win.webContents || details?.isMainFrame !== true) return false;
    const appOrigin = secureAppOrigin(getAppUrl());
    return Boolean(appOrigin && secureAppOrigin(contents.getURL()) === appOrigin && secureAppOrigin(requestingUrl) === appOrigin && (!details.securityOrigin || secureAppOrigin(details.securityOrigin) === appOrigin));
  } catch { return false; }
}
function attachMicrophoneGuards(win, getAppUrl) {
  // Electron previously used its default allow behavior. Leave unrelated permissions unchanged.
  win.webContents.session.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (permission !== "media") return true;
    return details?.mediaType === "audio" && isCurrentAppFrame(win, contents, origin, details, getAppUrl);
  });
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (permission !== "media") return callback(true);
    const audioOnly = Array.isArray(details?.mediaTypes) && details.mediaTypes.length === 1 && details.mediaTypes[0] === "audio";
    callback(audioOnly && isCurrentAppFrame(win, contents, details?.requestingUrl, details, getAppUrl));
  });
}
module.exports = { attachMicrophoneGuards, secureAppOrigin };
