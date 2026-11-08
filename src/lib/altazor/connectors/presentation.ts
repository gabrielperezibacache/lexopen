import type { ConnectorField } from "./types";

/** Copy for account sign-in, whose permissions are narrower than the adapter API. */
const accountPresentation: Record<string, { label: string; description: string }> = {
  "google-workspace": { label: "Google Drive", description: "Busca y lee tus archivos de Drive, sin modificarlos." },
  github: { label: "GitHub", description: "Consulta tu perfil y los archivos de repositorios públicos de GitHub." },
  dropbox: { label: "Dropbox", description: "Busca y lee tus archivos autorizados de Dropbox, sin modificarlos." },
  "microsoft-365": { label: "OneDrive · Microsoft 365", description: "Busca y lee tus archivos de OneDrive, sin modificarlos." },
};
export function connectorAccountPresentation(entry: { id: string; label: string; description: string }) {
  return accountPresentation[entry.id] || { label: entry.label, description: entry.description };
}

const labels: Record<string, string> = {
  access_secret: "Secreto de acceso", access_token: "Token de acceso", account_id: "Identificador de cuenta", addressbook: "Libreta de direcciones", author: "Autor", base: "Base", calendar: "Calendario", channel: "Canal de destino", chat_id: "Identificador del chat", client_id: "Identificador de su aplicación", client_secret: "Secreto de su aplicación", command: "Programa", consumer_key: "Clave de la aplicación", consumer_secret: "Secreto de la aplicación", country: "País", email: "Correo electrónico", feeds: "Fuentes RSS", folder: "Carpeta", from: "Remitente", handle: "Nombre de usuario", headers: "Cabeceras de la petición", host: "Servidor", key: "Clave de acceso", list: "Lista", page_id: "Identificador de página", parent: "Carpeta o elemento superior", password: "Contraseña", phone_id: "Identificador de teléfono", place: "Localidad", project: "Proyecto", repo: "Repositorio", room: "Sala", subdomain: "Subdominio", table: "Tabla", tasks: "Tareas", team: "Equipo", to: "Destinatario", token: "Token de acceso", topic: "Tema", url: "Dirección del servicio", user: "Usuario", user_id: "Identificador de usuario",
};
const slackHelp: Record<string, string> = {
  url: "Desde la configuración de su aplicación Slack → Incoming Webhooks. Publica sólo en el canal para el que se creó.",
  token: "Token de bot (empieza por xoxb-) desde su aplicación Slack → OAuth & Permissions. Se utiliza junto al canal de destino.",
  channel: "Canal al que desea enviar mensajes, por ejemplo #general. Necesario al usar un token de bot o inicio de sesión.",
  client_id: "Identificador de una aplicación Slack registrada por usted. Se utiliza para el inicio de sesión, junto a su secreto de aplicación.",
  client_secret: "Secreto de esa misma aplicación Slack. Se introduce aquí una vez; su valor no vuelve a mostrarse.",
};
export function connectorFieldPresentation(kind: string, field: ConnectorField) {
  if (kind === "dropbox" && field.name === "token") return { label: "Token temporal de Dropbox (sólo lectura)", help: "Para mantener la conexión, usa Conectar Dropbox. Este campo es una modalidad avanzada: el token debe autorizar únicamente account_info.read, files.metadata.read y files.content.read; no se renueva automáticamente." };
  if (kind === "rss" && field.name === "feeds") return { label: "Direcciones de tus fuentes RSS", help: "Añade las direcciones completas de las fuentes que quieres consultar. Una fuente pública no necesita iniciar sesión." };
  if (kind === "caldav" && field.name === "url") return { label: "Dirección de tu calendario CalDAV", help: "Usa la dirección CalDAV facilitada por tu servicio. Guardar la conexión no incorpora automáticamente sus eventos a la Agenda de LexOpen." };
  if (kind === "http" && field.name === "url") return { label: "Dirección de la API", help: "Modalidad avanzada para un servicio concreto. Cada operación muestra su destino, método y datos para revisión; guardar esta conexión no autoriza sus peticiones futuras." };
  if (kind === "google-workspace" && field.name === "token") return { label: "Token temporal de Google (sólo lectura)", help: "Modalidad avanzada con permiso drive.metadata.readonly. Para el ingreso habitual, use Conectar Google. Este valor no vuelve a mostrarse y caduca según Google, sin renovación automática; permite consultar sólo metadatos de Drive." };
  if (kind === "github" && field.name === "token") return { label: "Token de acceso de GitHub", help: "Modalidad avanzada: token fine-grained limitado al repositorio y a Contents: Read-only. Para el ingreso habitual, use Conectar GitHub. Su valor no vuelve a mostrarse." };
  if (["google-workspace", "github"].includes(kind) && field.name === "client_id") return { label: labels.client_id, help: "Configuración avanzada de una aplicación propia en el gateway. Para el ingreso habitual, use el botón Conectar." };
  if (["google-workspace", "github"].includes(kind) && field.name === "client_secret") return { label: labels.client_secret, help: "Secreto de su propia aplicación OAuth, cuando el proveedor lo requiera. Déjelo vacío si utiliza el token de acceso." };
  return { label: kind === "slack" && field.name === "url" ? "Dirección del webhook de Slack" : kind === "slack" && field.name === "token" ? "Token del bot de Slack" : labels[field.name] || field.label, help: kind === "slack" ? slackHelp[field.name] || field.help : field.help };
}
