export const MAIL_SETTINGS_PATH = "/configuracion/correo";
export const COMMUNICATIONS_SETTINGS_PATH = "/configuracion#comunicaciones";

const oauthResults = new Set(["connected", "error", "invalid_state", "missing_code"]);

export type MailSettingsQuery = { gmail?: string | string[]; microsoft?: string | string[] };

export function mailSettingsResult(query: MailSettingsQuery) {
  for (const provider of ["gmail", "microsoft"] as const) {
    const status = query[provider];
    if (typeof status === "string" && oauthResults.has(status)) return { provider, status };
  }
  return null;
}
