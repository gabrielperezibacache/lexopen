// Public contract reviewed at the immutable upstream source commit below.
// These are real adapter names, not automatic access to accounts or installed applications.
export const CONNECTOR_SOURCE = "6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3";
export const CONNECTOR_GATE = "v1";
export const CONNECTOR_CATALOG = [
  {
    "id": "slack",
    "label": "Slack",
    "category": "messaging",
    "description": "Mensajes, historial y API de un espacio Slack.",
    "platform": "gateway",
    "oauth": "slack",
    "fieldNames": [
      "url",
      "token",
      "channel",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "send",
      "history",
      "request"
    ],
    "source": "internal/connector/catalog.go#L138"
  },
  {
    "id": "discord",
    "label": "Discord",
    "category": "messaging",
    "description": "Publica mensajes en un canal mediante su webhook.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url"
    ],
    "actions": [
      "send"
    ],
    "source": "internal/connector/catalog.go#L144"
  },
  {
    "id": "telegram",
    "label": "Telegram",
    "category": "messaging",
    "description": "Envía y consulta mensajes de un bot.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "token",
      "chat_id"
    ],
    "actions": [
      "send",
      "updates",
      "request"
    ],
    "source": "internal/connector/catalog.go#L146"
  },
  {
    "id": "whatsapp",
    "label": "WhatsApp",
    "category": "messaging",
    "description": "Mensajería con WhatsApp Cloud API.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "phone_id",
      "to",
      "token"
    ],
    "actions": [
      "send",
      "request"
    ],
    "source": "internal/connector/catalog.go#L149"
  },
  {
    "id": "email",
    "label": "Email",
    "category": "messaging",
    "description": "Envía correo por SMTP.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "host",
      "user",
      "password",
      "from",
      "to"
    ],
    "actions": [
      "send"
    ],
    "source": "internal/connector/catalog.go#L152"
  },
  {
    "id": "matrix",
    "label": "Matrix",
    "category": "messaging",
    "description": "Envía mensajes a una sala de Matrix.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url",
      "room",
      "token"
    ],
    "actions": [
      "send"
    ],
    "source": "internal/connector/catalog.go#L155"
  },
  {
    "id": "mastodon",
    "label": "Mastodon",
    "category": "social",
    "description": "Publica y consulta una cuenta de su instancia.",
    "platform": "gateway",
    "oauth": "mastodon",
    "fieldNames": [
      "url",
      "token"
    ],
    "actions": [
      "post",
      "timeline",
      "mentions",
      "reply",
      "like",
      "boost",
      "request"
    ],
    "source": "internal/connector/catalog.go#L159"
  },
  {
    "id": "bluesky",
    "label": "Bluesky",
    "category": "social",
    "description": "Publicaciones, respuestas, reacciones y notificaciones.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "handle",
      "password"
    ],
    "actions": [
      "post",
      "timeline",
      "notifications",
      "reply",
      "like"
    ],
    "source": "internal/connector/catalog.go#L162"
  },
  {
    "id": "x",
    "label": "X (Twitter)",
    "category": "social",
    "description": "Publicaciones, respuestas, menciones y API de X.",
    "platform": "gateway",
    "oauth": "x",
    "fieldNames": [
      "client_id",
      "client_secret",
      "token",
      "consumer_key",
      "consumer_secret",
      "access_token",
      "access_secret",
      "user_id"
    ],
    "actions": [
      "post",
      "mentions",
      "reply",
      "like",
      "request"
    ],
    "source": "internal/connector/catalog.go#L165"
  },
  {
    "id": "linkedin",
    "label": "LinkedIn",
    "category": "social",
    "description": "Publicaciones, comentarios y reacciones de una cuenta.",
    "platform": "gateway",
    "oauth": "linkedin",
    "fieldNames": [
      "author",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "post",
      "comment",
      "like",
      "request"
    ],
    "source": "internal/connector/catalog.go#L167"
  },
  {
    "id": "github",
    "label": "GitHub",
    "category": "git",
    "description": "Archivos, incidencias, comentarios, solicitudes de integración y API.",
    "platform": "gateway",
    "oauth": "github",
    "fieldNames": [
      "token",
      "repo",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "create_issue",
      "comment",
      "create_pr",
      "get_file",
      "list_issues",
      "get_issue",
      "request"
    ],
    "source": "internal/connector/catalog.go#L171"
  },
  {
    "id": "gitlab",
    "label": "GitLab",
    "category": "git",
    "description": "Incidencias, comentarios y API de GitLab.",
    "platform": "gateway",
    "oauth": "gitlab",
    "fieldNames": [
      "url",
      "project",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "create_issue",
      "comment",
      "request"
    ],
    "source": "internal/connector/catalog.go#L180"
  },
  {
    "id": "gitea",
    "label": "Gitea / Forgejo",
    "category": "git",
    "description": "Crea incidencias en un servidor Gitea o Forgejo.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "repo",
      "url",
      "token"
    ],
    "actions": [
      "create_issue"
    ],
    "source": "internal/connector/catalog.go#L186"
  },
  {
    "id": "motita",
    "label": "Motita",
    "category": "git",
    "description": "Solicita tareas de desarrollo a un gateway Motita.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url",
      "token"
    ],
    "actions": [
      "run"
    ],
    "source": "internal/connector/catalog.go#L189"
  },
  {
    "id": "notion",
    "label": "Notion",
    "category": "productivity",
    "description": "Crea páginas, añade contenido y utiliza su API.",
    "platform": "gateway",
    "oauth": "notion",
    "fieldNames": [
      "parent",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "create_page",
      "append",
      "request"
    ],
    "source": "internal/connector/catalog.go#L193"
  },
  {
    "id": "trello",
    "label": "Trello",
    "category": "productivity",
    "description": "Crea tarjetas en una lista de Trello.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "key",
      "list",
      "token"
    ],
    "actions": [
      "create_card"
    ],
    "source": "internal/connector/catalog.go#L199"
  },
  {
    "id": "todoist",
    "label": "Todoist",
    "category": "productivity",
    "description": "Gestiona tareas mediante Todoist.",
    "platform": "gateway",
    "oauth": "todoist",
    "fieldNames": [
      "project",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "add_task",
      "request"
    ],
    "source": "internal/connector/catalog.go#L202"
  },
  {
    "id": "linear",
    "label": "Linear",
    "category": "productivity",
    "description": "Crea incidencias y utiliza la API de Linear.",
    "platform": "gateway",
    "oauth": "linear",
    "fieldNames": [
      "team",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "create_issue",
      "request"
    ],
    "source": "internal/connector/catalog.go#L205"
  },
  {
    "id": "jira",
    "label": "Jira",
    "category": "productivity",
    "description": "Consulta y crea incidencias de Jira Cloud.",
    "platform": "gateway",
    "oauth": "atlassian",
    "fieldNames": [
      "project",
      "url",
      "email",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "create_issue",
      "search",
      "request"
    ],
    "source": "internal/connector/catalog.go#L208"
  },
  {
    "id": "google-chat",
    "label": "Google Chat",
    "category": "messaging",
    "description": "Publica mensajes en un espacio mediante webhook.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url"
    ],
    "actions": [
      "send"
    ],
    "source": "internal/connector/catalog.go#L212"
  },
  {
    "id": "teams",
    "label": "Microsoft Teams",
    "category": "messaging",
    "description": "Publica en un canal mediante un webhook de Workflows.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url"
    ],
    "actions": [
      "send"
    ],
    "source": "internal/connector/catalog.go#L214"
  },
  {
    "id": "google-workspace",
    "label": "Google Workspace",
    "category": "office",
    "description": "Correo, calendario, Drive, documentos, contactos, tareas y API.",
    "platform": "gateway",
    "oauth": "google",
    "fieldNames": [
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "send_mail",
      "create_event",
      "upload",
      "append_row",
      "create_doc",
      "list_mail",
      "read_mail",
      "list_events",
      "contacts",
      "add_contact",
      "tasks",
      "add_task",
      "complete_task",
      "request"
    ],
    "source": "internal/connector/catalog.go#L217"
  },
  {
    "id": "microsoft-365",
    "label": "Microsoft 365",
    "category": "office",
    "description": "Outlook, calendario, OneDrive, contactos, tareas y Microsoft Graph.",
    "platform": "gateway",
    "oauth": "microsoft",
    "fieldNames": [
      "client_id",
      "client_secret"
    ],
    "actions": [
      "send_mail",
      "create_event",
      "upload",
      "list_mail",
      "read_mail",
      "list_events",
      "contacts",
      "add_contact",
      "tasks",
      "add_task",
      "complete_task",
      "request"
    ],
    "source": "internal/connector/catalog.go#L226"
  },
  {
    "id": "airtable",
    "label": "Airtable",
    "category": "office",
    "description": "Añade registros y utiliza la API de una base.",
    "platform": "gateway",
    "oauth": "airtable",
    "fieldNames": [
      "base",
      "table",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "add_record",
      "request"
    ],
    "source": "internal/connector/catalog.go#L233"
  },
  {
    "id": "nextcloud",
    "label": "Nextcloud",
    "category": "office",
    "description": "Lee y escribe archivos en una carpeta WebDAV.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url",
      "user",
      "password",
      "folder"
    ],
    "actions": [
      "upload",
      "download"
    ],
    "source": "internal/connector/catalog.go#L236"
  },
  {
    "id": "google-sheets",
    "label": "Google Sheets",
    "category": "office",
    "description": "Añade filas mediante una aplicación de Apps Script.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url"
    ],
    "actions": [
      "append_row"
    ],
    "source": "internal/connector/catalog.go#L239"
  },
  {
    "id": "kroki",
    "label": "Diagrams (Kroki)",
    "category": "drawing",
    "description": "Genera diagramas SVG mediante Kroki.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url"
    ],
    "actions": [
      "render"
    ],
    "source": "internal/connector/catalog.go#L243"
  },
  {
    "id": "figma",
    "label": "Figma",
    "category": "drawing",
    "description": "Consulta estructuras de archivos y escribe comentarios.",
    "platform": "gateway",
    "oauth": "figma",
    "fieldNames": [
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "comment",
      "get_file",
      "request"
    ],
    "source": "internal/connector/catalog.go#L246"
  },
  {
    "id": "excalidraw",
    "label": "Excalidraw",
    "category": "drawing",
    "description": "Genera archivos de escenas para Excalidraw.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [],
    "actions": [
      "save"
    ],
    "source": "internal/connector/catalog.go#L249"
  },
  {
    "id": "webhook",
    "label": "Webhook",
    "category": "generic",
    "description": "Envía datos JSON a un webhook configurado.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "headers",
      "url"
    ],
    "actions": [
      "post"
    ],
    "source": "internal/connector/catalog.go#L252"
  },
  {
    "id": "http",
    "label": "HTTP API",
    "category": "generic",
    "description": "Consulta una API HTTP configurada.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url",
      "token"
    ],
    "actions": [
      "call"
    ],
    "source": "internal/connector/catalog.go#L254"
  },
  {
    "id": "shell",
    "label": "Program",
    "category": "generic",
    "description": "Ejecuta un programa fijo en el equipo del gateway.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "command"
    ],
    "actions": [
      "run"
    ],
    "blockedReason": "Ejecuta programas en el Host. Esta conexión no se habilita desde el escritorio aislado.",
    "source": "internal/connector/catalog.go#L257"
  },
  {
    "id": "stripe",
    "label": "Stripe",
    "category": "finance",
    "description": "Consulta pagos y facturas, envía facturas y solicita reembolsos.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "token"
    ],
    "actions": [
      "balance",
      "list_invoices",
      "list_payments",
      "send_invoice",
      "refund",
      "request"
    ],
    "source": "internal/connector/reads.go#L683"
  },
  {
    "id": "zendesk",
    "label": "Zendesk",
    "category": "productivity",
    "description": "Consulta tickets y prepara respuestas de atención.",
    "platform": "gateway",
    "oauth": "zendesk",
    "fieldNames": [
      "subdomain",
      "email",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "list_tickets",
      "read_ticket",
      "reply",
      "request"
    ],
    "source": "internal/connector/reads.go#L692"
  },
  {
    "id": "ntfy",
    "label": "ntfy (push)",
    "category": "messaging",
    "description": "Envía notificaciones a un tema ntfy.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "topic",
      "url",
      "token"
    ],
    "actions": [
      "send"
    ],
    "source": "internal/connector/reads.go#L700"
  },
  {
    "id": "caldav",
    "label": "Calendar & reminders (CalDAV)",
    "category": "personal",
    "description": "Calendarios y recordatorios mediante CalDAV.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url",
      "user",
      "password",
      "calendar",
      "tasks"
    ],
    "actions": [
      "events",
      "add_event",
      "calendars",
      "reminders",
      "add_reminder",
      "complete_reminder"
    ],
    "source": "internal/connector/personal.go#L622"
  },
  {
    "id": "carddav",
    "label": "Contacts (CardDAV)",
    "category": "personal",
    "description": "Contactos mediante CardDAV.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "url",
      "user",
      "password",
      "addressbook"
    ],
    "actions": [
      "contacts",
      "add_contact"
    ],
    "source": "internal/connector/personal.go#L631"
  },
  {
    "id": "apple",
    "label": "Mac Calendar, Reminders & Contacts",
    "category": "personal",
    "description": "Calendario, recordatorios y contactos del Mac del gateway.",
    "platform": "macos-host",
    "oauth": "",
    "fieldNames": [
      "calendar",
      "list"
    ],
    "actions": [
      "events",
      "add_event",
      "calendars",
      "reminders",
      "add_reminder",
      "complete_reminder",
      "contacts",
      "add_contact"
    ],
    "source": "internal/connector/personal.go#L639"
  },
  {
    "id": "home-assistant",
    "label": "Home Assistant",
    "category": "home",
    "description": "Consulta dispositivos y solicita acciones del hogar.",
    "platform": "gateway",
    "oauth": "home-assistant",
    "fieldNames": [
      "url",
      "token"
    ],
    "actions": [
      "states",
      "call_service",
      "request"
    ],
    "source": "internal/connector/personal.go#L645"
  },
  {
    "id": "rss",
    "label": "News feeds (RSS)",
    "category": "home",
    "description": "Consulta fuentes RSS y Atom.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "feeds"
    ],
    "actions": [
      "news"
    ],
    "source": "internal/connector/personal.go#L654"
  },
  {
    "id": "weather",
    "label": "Weather",
    "category": "home",
    "description": "Consulta la previsión de Open-Meteo.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "place"
    ],
    "actions": [
      "forecast"
    ],
    "source": "internal/connector/personal.go#L657"
  },
  {
    "id": "spotify",
    "label": "Spotify",
    "category": "music",
    "description": "Busca música, gestiona listas y controla reproducción Premium.",
    "platform": "gateway",
    "oauth": "spotify",
    "fieldNames": [
      "client_id",
      "client_secret"
    ],
    "actions": [
      "now_playing",
      "play",
      "pause",
      "next",
      "previous",
      "queue",
      "search",
      "playlists",
      "create_playlist",
      "add_to_playlist",
      "request"
    ],
    "source": "internal/connector/media.go#L511"
  },
  {
    "id": "tidal",
    "label": "TIDAL",
    "category": "music",
    "description": "Busca música y gestiona listas; sin reproducción remota.",
    "platform": "gateway",
    "oauth": "tidal",
    "fieldNames": [
      "country",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "search",
      "playlists",
      "create_playlist",
      "add_to_playlist",
      "request"
    ],
    "source": "internal/connector/media.go#L523"
  },
  {
    "id": "dropbox",
    "label": "Dropbox",
    "category": "office",
    "description": "Busca, lista y lee archivos con acceso de sólo lectura.",
    "platform": "gateway",
    "oauth": "",
    "fieldNames": [
      "token"
    ],
    "actions": [
      "list",
      "search",
      "read"
    ],
    "source": "internal/connector/media.go#L531"
  },
  {
    "id": "things",
    "label": "Things (Mac)",
    "category": "productivity",
    "description": "Consulta y gestiona tareas en Things 3 del Mac.",
    "platform": "macos-host",
    "oauth": "",
    "fieldNames": [
      "list"
    ],
    "actions": [
      "todos",
      "add_todo",
      "complete"
    ],
    "source": "internal/connector/media.go#L540"
  },
  {
    "id": "omnifocus",
    "label": "OmniFocus (Mac)",
    "category": "productivity",
    "description": "Consulta y gestiona tareas en OmniFocus del Mac.",
    "platform": "macos-host",
    "oauth": "",
    "fieldNames": [],
    "actions": [
      "tasks",
      "add_task",
      "complete"
    ],
    "source": "internal/connector/media.go#L547"
  },
  {
    "id": "facebook",
    "label": "Facebook Page",
    "category": "social",
    "description": "Publica y administra una página y su buzón de Messenger.",
    "platform": "gateway",
    "oauth": "facebook",
    "fieldNames": [
      "page_id",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "post",
      "posts",
      "comments",
      "reply",
      "like",
      "inbox",
      "send",
      "request"
    ],
    "source": "internal/connector/meta.go#L45"
  },
  {
    "id": "instagram",
    "label": "Instagram",
    "category": "social",
    "description": "Publica y responde comentarios de una cuenta profesional.",
    "platform": "gateway",
    "oauth": "facebook",
    "fieldNames": [
      "account_id",
      "token",
      "client_id",
      "client_secret"
    ],
    "actions": [
      "post",
      "posts",
      "comments",
      "reply",
      "request"
    ],
    "source": "internal/connector/meta.go#L57"
  }
] as const;
export type ConnectorKindId = typeof CONNECTOR_CATALOG[number]["id"];
export function connectorKind(id: string) { return CONNECTOR_CATALOG.find(kind => kind.id === id); }
