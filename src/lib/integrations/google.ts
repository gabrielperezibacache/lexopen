/** Compatibility facade. OAuth and token refresh are shared by Drive and Calendar. */
export { type GoogleConfig, type GoogleErrorCode, GoogleIntegrationError, googleCredentialsConfigured, googleRedirectUri, assertGoogleFeatureEnabled, getGoogleConfig, isGoogleIntegrationEnabled, getGoogleAuthUrl, exchangeGoogleCode, updateGoogleSyncOptions, ensureGoogleAccessToken, requireDriveSession, googleActionHttpStatus } from "./google-session";
export { pushPlazoToGoogleCalendar, pushEventoToGoogleCalendar, pullGoogleCalendarEvents, deleteGoogleCalendarEvent } from "./google-calendar";
export { uploadFileToDrive, pushDocumentoToDrive, linkCausaDriveFolder, createCausaDriveFolder, unlinkCausaDriveFolder, listCausaDriveFolder, pushMinutaToDrive } from "./google-corporate-drive";
