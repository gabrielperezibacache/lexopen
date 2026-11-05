import type { ConnectorField } from "./types";
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
  return { label: kind === "slack" && field.name === "url" ? "Dirección del webhook de Slack" : kind === "slack" && field.name === "token" ? "Token del bot de Slack" : labels[field.name] || field.label, help: kind === "slack" ? slackHelp[field.name] || field.help : field.help };
}
