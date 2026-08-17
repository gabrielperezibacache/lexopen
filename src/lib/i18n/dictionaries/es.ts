export const es = {
  meta: {
    title: "LexOpen — Operaciones jurídicas open source",
    description:
      "Clon open-source de HighQ para estudios jurídicos en Chile. Causas, jurisprudencia, Obsidian, copiloto IA y Google Workspace.",
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
    loadingApp: "Cargando LexOpen...",
    retry: "Reintentar",
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
    pjudMonitor: "Monitoreo PJUD",
    misCausas: "Mis Causas CU",
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
    agent: "Copiloto IA",
    assistant: "Copiloto IA",
    portal: "Portal cliente",
    integrations: "Integraciones",
    audit: "Auditoría",
    settings: "Configuración",
    notifications: "Notificaciones",
    account: "Mi cuenta",
  },
  siteTabs: {
    overview: "Resumen",
    files: "Archivos",
    tasks: "Tareas",
    wiki: "Wiki",
    blog: "Blog",
    isheets: "iSheets",
    qa: "Q&A",
    people: "Personas",
    workflows: "Flujos",
    backToSites: "← Espacios",
    backToPortal: "← Portal",
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
    subtitleProd: "Ingrese con las credenciales del estudio.",
    email: "Email",
    password: "Contraseña",
    submit: "Entrar",
    submitting: "Entrando…",
    error: "No se pudo iniciar sesión",
    demoUsers: "Usuarios demo · contraseña lexopen",
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
      "Plataforma open-source para estudios jurídicos: espacios, data room, iSheets, tareas, wiki, Q&A y flujos — con causas chilenas, plazos, jurisprudencia, Obsidian, copiloto IA y Google Workspace.",
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
      { title: "Integraciones", text: "Obsidian · Google · Copiloto" },
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
  dashboard: {
    eyebrow: "Inicio del estudio",
    titleFallback: "Inicio",
    hello: "Hola, {name}",
    subtitle:
      "Clientes, causas, trámites pendientes, minutas y actividad del estudio.",
    clients: "Clientes",
    newCase: "Nueva causa",
    viewAll: "Ver todas",
    viewClients: "Ver clientes",
    stats: {
      activeClients: "Clientes activos",
      activeCases: "Causas activas",
      overdueFilings: "Trámites vencidos",
      openTasks: "Tareas abiertas",
    },
    tramites: {
      title: "Trámites a seguir",
      openCount: "{count} abiertos",
      overdueCount: "{count} vencidos",
      notificationsCount: "{count} notificaciones",
      empty: "Sin trámites abiertos. Revise las fichas de cliente o causa.",
      noClient: "Sin cliente",
    },
    sites: {
      recent: "Espacios recientes",
      all: "Todos",
      meta: "{tipo} · {files} archivos · {tasks} tareas",
      empty: "Aún no hay espacios.",
      create: "Crear un espacio",
    },
    tasks: {
      my: "Mis tareas",
      empty: "No tiene tareas asignadas.",
      globalInbox: "Ver bandeja global",
    },
    minutes: {
      recent: "Minutas recientes",
      pendingCount: "{count} pendientes",
      empty: "Sin minutas aún. Tras cada audiencia o reunión, genere el handoff.",
    },
    activity: {
      recent: "Actividad reciente",
      system: "Sistema",
      general: "General",
      empty: "Sin actividad reciente.",
    },
  },
  errors: {
    eyebrow: "Error",
    title: "No se pudo cargar esta vista",
    forbidden: "No tiene permiso para ver esta sección.",
    genericProd: "Ocurrió un error inesperado. Intente de nuevo o vuelva al inicio.",
  },
  integrations: {
    loadingStatus: "Cargando estado…",
    loadingEnv: "Cargando entorno…",
  },
  causas: {
    eyebrow: "Litigio Chile",
    title: "Causas judiciales",
    subtitle:
      "Alta manual, importación ClaveÚnica (Mis Causas) o ROL en Monitoreo. Edite, archive o elimine desde aquí o la ficha.",
    newCase: "Nueva causa",
    empty: "No hay causas con esos filtros.",
  },
  portal: {
    eyebrow: "Experiencia cliente",
    title: "Portal del cliente",
    subtitleClient:
      "Documentos compartidos (etiqueta «cliente»), hitos y Q&A limitado. Solo ve espacios donde es miembro; puede abrir preguntas mientras el hilo esté abierto.",
    subtitleStaff:
      "Documentos compartidos (etiqueta «cliente»), hitos y Q&A limitado. Vista previa staff (espacios visibles al cliente).",
    notice:
      "Acceso restringido: documentos compartidos y Q&A limitado. Sin facturación interna, copiloto del estudio, wiki, iSheets ni carpetas Drive internas.",
  },
  crm: {
    eyebrow: "CRM",
    title: "Clientes",
    subtitle:
      "Seguimiento por cliente: causas, trámites pendientes/hechos y carpeta documental con asistente IA.",
    searchPlaceholder: "Buscar RUT, nombre, email…",
    filterAll: "Todos",
    filterActive: "Activos",
    filterInactive: "Inactivos",
    filter: "Filtrar",
    colClient: "Cliente",
    colRut: "RUT",
    colCases: "Causas",
    colPending: "Trámites pend.",
    colDocs: "Docs",
    colLawyer: "Abogado",
    colStatus: "Estado",
    empty: "No hay clientes con esos filtros.",
    noEmail: "sin email",
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
