import { ConnectorError } from "@/lib/personal-connectors/core";

// This is GitHub's read-only token-check endpoint. A fixed, invalid token proves
// application authentication without requesting access to any account or repo.
export async function checkGithubApplication(clientId: string, clientSecret: string, fetcher: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetcher(`https://api.github.com/applications/${encodeURIComponent(clientId)}/token`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: "0000000000000000000000000000000000000000" }),
    });
  } catch { throw new ConnectorError("oauth_application_check_unavailable", "No pudimos comprobar la preparación con GitHub. Compruebe su conexión a Internet y vuelva a guardar.", 503); }
  await response.body?.cancel();
  if (response.status === 401) throw new ConnectorError("oauth_client_credentials", "GitHub no reconoce estos datos. Copie el identificador y el valor completo del secreto de la aplicación; no use una contraseña ni un valor oculto con asteriscos.", 409);
  if (response.status !== 404) throw new ConnectorError("oauth_application_check_unavailable", "GitHub no confirmó la preparación. Vuelva a comprobarla antes de conectar su cuenta.", 503);
}
