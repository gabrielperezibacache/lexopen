import { ConnectorError } from "@/lib/personal-connectors/core";

// Provider error descriptions can contain credentials or request data. Only these
// fixed, locally authored messages may leave the server.
export function oauthFailureReason(code: string | null) {
  switch (code) {
    case "oauth_client_credentials": return "La preparación de esta aplicación necesita revisarse en Configuración. Después podrá iniciar sesión de nuevo.";
    case "oauth_code_rejected": return "El ingreso venció o ya fue utilizado. Pulse Conectar para iniciar uno nuevo.";
    case "oauth_callback_mismatch": return "La dirección de retorno no coincide con la aplicación registrada. Revísela en Configuración.";
    case "oauth_scope_mismatch": return "El servicio no confirmó los permisos de lectura solicitados. Vuelva a conectar y revise la autorización.";
    case "oauth_cancelled": return "No se autorizó la conexión. Puede iniciarla de nuevo cuando quiera.";
    case "oauth_test_failed": return "El acceso fue autorizado, pero no pudo comprobarse. Compruebe la conexión antes de volver a intentarlo.";
    case "oauth_save_unknown": return "No pudo confirmarse el guardado de la conexión. Compruebe su estado antes de iniciar otro ingreso.";
    case "oauth_token_invalid":
    case "oauth_token_type":
    case "oauth_provider_rejected": return "El servicio no confirmó el acceso. Pulse Conectar para iniciar un ingreso nuevo.";
    default: return "La conexión no se completó. Puede iniciar una conexión nueva.";
  }
}

export function readOAuthTokenResponse(tokens: Record<string, unknown>, requestedScopes: readonly string[]) {
  if (tokens.error !== undefined) {
    const code = tokens.error === "incorrect_client_credentials" || tokens.error === "invalid_client" ? "oauth_client_credentials"
      : tokens.error === "bad_verification_code" || tokens.error === "invalid_grant" ? "oauth_code_rejected"
      : tokens.error === "redirect_uri_mismatch" ? "oauth_callback_mismatch"
      : tokens.error === "access_denied" ? "oauth_cancelled" : "oauth_provider_rejected";
    throw new ConnectorError(code, oauthFailureReason(code), 409);
  }
  if (typeof tokens.access_token !== "string" || !tokens.access_token || tokens.access_token.length > 16000 || /[\r\n]/.test(tokens.access_token)) throw new ConnectorError("oauth_token_invalid", oauthFailureReason("oauth_token_invalid"), 409);
  if (String(tokens.token_type).toLowerCase() !== "bearer") throw new ConnectorError("oauth_token_type", oauthFailureReason("oauth_token_type"), 409);
  const scopes = typeof tokens.scope === "string" ? [...new Set(tokens.scope.split(/[\s,]+/).filter(Boolean))].sort() : [];
  if (scopes.length !== requestedScopes.length || scopes.some((scope, index) => scope !== [...requestedScopes].sort()[index])) throw new ConnectorError("oauth_scope_mismatch", oauthFailureReason("oauth_scope_mismatch"), 409);
  return { accessToken: tokens.access_token, scopes };
}
