export const es = {
  meta: {
    title: "LexOpen — Operaciones jurídicas open source",
    description:
      "Clon open-source de HighQ para estudios jurídicos en Chile. Causas, jurisprudencia, Obsidian, Hermes Agent y Google Workspace.",
  },
  brand: {
    tagline: "Estudio · Chile",
    openPlatform: "Plataforma jurídica abierta",
  },
  common: {
    menu: "Menú",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    language: "Idioma",
    save: "Guardar",
    cancel: "Cancelar",
    loading: "Cargando…",
    search: "Buscar",
    back: "Volver",
    demoPassword: "Contraseña demo: lexopen",
  },
  nav: {
    groups: {
      workspace: "Espacio de trabajo",
      collab: "Colaboración",
      intel: "Inteligencia",
      portal: "Portal",
    },
    home: "Inicio",
    sites: "Espacios",
    clients: "Clientes",
    cases: "Causas",
    minutes: "Minutas",
    billing: "Facturación",
    tasks: "Tareas",
    calendar: "Calendario",
    search: "Buscar",
    messages: "Mensajes",
    workflows: "Flujos",
    people: "Personas",
    documents: "Documentos",
    deadlines: "Plazos",
    jurisprudence: "Jurisprudencia",
    agent: "Agente Hermes",
    assistant: "Asistente IA",
    portal: "Portal cliente",
    integrations: "Integraciones",
    audit: "Auditoría",
    settings: "Configuración",
    notifications: "Notificaciones",
  },
  siteTabs: {
    overview: "Resumen",
    files: "Archivos",
    tasks: "Tareas",
    wiki: "Wiki",
    isheets: "iSheets",
    qa: "Q&A",
    people: "Personas",
    workflows: "Flujos",
    backToSites: "← Espacios",
    spaceLabel: "Espacio LexOpen",
    types: {
      matter: "Matter / causa",
      vdr: "VDR",
      client_portal: "Portal cliente",
      project: "Proyecto",
      knowledge: "Knowledge",
    },
  },
  login: {
    access: "Acceso al estudio",
    title: "Iniciar sesión",
    subtitle: "Use un usuario demo o sus credenciales del estudio.",
    email: "Email",
    password: "Contraseña",
    submit: "Entrar",
    submitting: "Entrando…",
    error: "No se pudo iniciar sesión",
    demoUsers: "Usuarios demo",
    roles: {
      admin: "Socia / admin",
      lawyer: "Abogado",
      assistant: "Asistente",
      client: "Cliente (portal)",
    },
  },
  landing: {
    signIn: "Iniciar sesión",
    enterFirm: "Entrar al estudio",
    eyebrow: "Chile · Operación legal",
    lead:
      "Plataforma open-source para estudios jurídicos: espacios, data room, iSheets, tareas, wiki, Q&A y flujos — con causas chilenas, plazos, jurisprudencia, Obsidian, Hermes y Google Workspace.",
    openPlatform: "Abrir plataforma",
    seeDemo: "Ver demo del estudio",
    matterLabel: "Espacio de causa",
    matterMeta: "Archivos · Tareas · iSheets · Q&A · Wiki",
    bullets: [
      "VDR con versionado y comentarios",
      "iSheet de hitos procesales",
      "Workflow de aprobación de escritos",
      "Portal cliente + sync Obsidian",
    ],
    modulesTitle: "Módulos HighQ + capa Chile",
    modules: [
      { title: "Espacios", text: "Causas, VDR, conocimiento y portal" },
      { title: "Archivos", text: "Data room, versiones, metadata" },
      { title: "iSheets", text: "Tablas estructuradas colaborativas" },
      { title: "Wiki + Q&A", text: "Conocimiento y preguntas cliente" },
      { title: "Integraciones", text: "Obsidian · Google · Hermes" },
      { title: "Chile", text: "Causas RIT/RUC + jurisprudencia" },
    ],
  },
  locale: {
    switched: "Idioma actualizado",
    es: "Español",
    en: "English",
  },
  settings: {
    languageTitle: "Idioma de la interfaz",
    languageHelp:
      "Afecta navegación, login y textos de la plataforma. El contenido jurídico chileno (RIT, plazos, minutas) permanece en español cuando corresponde.",
  },
};

type DeepStringify<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? DeepStringify<U>[]
    : T extends object
      ? { [K in keyof T]: DeepStringify<T[K]> }
      : T;

export type Dictionary = DeepStringify<typeof es>;
