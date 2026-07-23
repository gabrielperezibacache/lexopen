import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function wipe() {
  const models = [
    "workflowInstance",
    "workflow",
    "notification",
    "message",
    "comment",
    "qaPost",
    "qaThread",
    "iSheetRow",
    "iSheetColumn",
    "iSheet",
    "blogPost",
    "wikiPage",
    "task",
    "fileVersion",
    "siteFile",
    "folder",
    "siteGroup",
    "siteMember",
    "site",
    "groupMember",
    "group",
    "activity",
    "nota",
    "plazo",
    "documento",
    "parte",
    "causa",
    "cliente",
    "jurisprudencia",
    "integrationConfig",
    "user",
  ] as const;

  for (const m of models) {
    // @ts-expect-error dynamic wipe
    await prisma[m].deleteMany();
  }
}

async function main() {
  await wipe();

  const admin = await prisma.user.create({
    data: {
      email: "socio@estudio.cl",
      name: "María Paz Contreras",
      role: "admin",
      title: "Socia · Litigio Civil",
      avatarColor: "#c47a3a",
      password: "lexopen",
    },
  });
  const abogado = await prisma.user.create({
    data: {
      email: "abogado@estudio.cl",
      name: "Andrés Valenzuela",
      role: "abogado",
      title: "Asociado senior",
      avatarColor: "#1f6f78",
      password: "lexopen",
    },
  });
  const asistente = await prisma.user.create({
    data: {
      email: "asistente@estudio.cl",
      name: "Camila Rojas",
      role: "asistente",
      title: "Paralegal",
      avatarColor: "#2a4d3a",
      password: "lexopen",
    },
  });
  const clienteUser = await prisma.user.create({
    data: {
      email: "cliente@andes.cl",
      name: "Francisca Lagos (Andes)",
      role: "cliente",
      title: "Gerenta Legal · Constructora Andes",
      avatarColor: "#4a5d73",
      password: "lexopen",
    },
  });

  const litigioGroup = await prisma.group.create({
    data: {
      name: "Equipo Litigio",
      description: "Abogados y paralegales de litigio",
      members: {
        create: [
          { userId: admin.id },
          { userId: abogado.id },
          { userId: asistente.id },
        ],
      },
    },
  });

  const cliente1 = await prisma.cliente.create({
    data: {
      razonSocial: "Constructora Andes SpA",
      rut: "76.543.210-K",
      email: "legal@andes.cl",
      telefono: "+56 2 2345 6789",
      tipo: "empresa",
    },
  });
  const cliente2 = await prisma.cliente.create({
    data: {
      razonSocial: "Juan Carlos Muñoz Sepúlveda",
      rut: "12.345.678-9",
      email: "jcmunoz@correo.cl",
      telefono: "+56 9 8765 4321",
      tipo: "persona",
    },
  });

  const causa1 = await prisma.causa.create({
    data: {
      titulo: "Cobro de pesos — contrato de obra",
      rit: "C-4521-2025",
      ruc: "C-4521-2025",
      tribunal: "1º Juzgado Civil de Santiago",
      materia: "civil",
      procedimiento: "Ordinario",
      estado: "activa",
      etapa: "prueba",
      caratula: "Constructora Andes SpA con Inmobiliaria Pacífico Ltda.",
      resumen:
        "Demanda de cobro de pesos por saldo insoluto de contrato de construcción de edificio en Las Condes.",
      fechaIngreso: new Date("2025-03-12"),
      clienteId: cliente1.id,
      abogadoId: abogado.id,
      partes: {
        create: [
          { nombre: "Constructora Andes SpA", rut: "76.543.210-K", rol: "demandante" },
          { nombre: "Inmobiliaria Pacífico Ltda.", rut: "77.111.222-3", rol: "demandado" },
        ],
      },
    },
  });

  const causa2 = await prisma.causa.create({
    data: {
      titulo: "Despido injustificado y tutela laboral",
      rit: "O-1189-2025",
      ruc: "O-1189-2025",
      tribunal: "2º Juzgado de Letras del Trabajo de Santiago",
      materia: "laboral",
      procedimiento: "Monitorio / Tutela",
      estado: "activa",
      etapa: "contestacion",
      caratula: "Muñoz Sepúlveda Juan Carlos con Retail Sur S.A.",
      resumen:
        "Demanda por despido injustificado, nulidad del despido y tutela de derechos fundamentales.",
      fechaIngreso: new Date("2025-11-02"),
      clienteId: cliente2.id,
      abogadoId: admin.id,
      partes: {
        create: [
          { nombre: "Juan Carlos Muñoz Sepúlveda", rut: "12.345.678-9", rol: "demandante" },
          { nombre: "Retail Sur S.A.", rut: "96.800.100-5", rol: "demandado" },
        ],
      },
    },
  });

  const causa3 = await prisma.causa.create({
    data: {
      titulo: "Recurso de protección — derecho de propiedad",
      rit: "71345-2025",
      tribunal: "Corte de Apelaciones de Valparaíso",
      materia: "constitucional",
      procedimiento: "Recurso de protección",
      estado: "activa",
      etapa: "recurso",
      caratula: "Constructora Andes SpA con SERVIU V Región",
      resumen:
        "Acción constitucional por acto arbitrario que afecta posesión de inmueble fiscal adjudicado.",
      fechaIngreso: new Date("2026-01-20"),
      clienteId: cliente1.id,
      abogadoId: abogado.id,
      partes: {
        create: [
          { nombre: "Constructora Andes SpA", rut: "76.543.210-K", rol: "recurrente" },
          { nombre: "SERVIU Región de Valparaíso", rol: "recorrido" },
        ],
      },
    },
  });

  await prisma.documento.createMany({
    data: [
      {
        nombre: "Demanda de cobro de pesos.md",
        tipo: "escrito",
        contenido: "# Demanda de cobro de pesos\n\nEn lo principal...",
        causaId: causa1.id,
        autorId: abogado.id,
        obsidianPath: "Causas/C-4521-2025/Demanda.md",
      },
      {
        nombre: "Contrato de obra.pdf",
        tipo: "contrato",
        contenido: "Contrato de construcción 15.01.2024",
        causaId: causa1.id,
        autorId: abogado.id,
      },
      {
        nombre: "Demanda laboral — tutela.md",
        tipo: "escrito",
        contenido: "# Demanda laboral\n\nFundamentos...",
        causaId: causa2.id,
        autorId: admin.id,
        obsidianPath: "Causas/O-1189-2025/Demanda-tutela.md",
      },
    ],
  });

  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in3 = new Date();
  in3.setDate(in3.getDate() + 3);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const in14 = new Date();
  in14.setDate(in14.getDate() + 14);

  await prisma.plazo.createMany({
    data: [
      {
        titulo: "Audiencia de prueba",
        descripcion: "Presentar lista de testigos y documentos.",
        fechaLimite: in7,
        tipo: "audiencia",
        estado: "pendiente",
        causaId: causa1.id,
        responsableId: abogado.id,
      },
      {
        titulo: "Contestación de la demanda",
        descripcion: "Plazo fatal para contestar demanda laboral.",
        fechaLimite: in3,
        tipo: "procesal",
        estado: "pendiente",
        causaId: causa2.id,
        responsableId: admin.id,
      },
      {
        titulo: "Informe a cliente — estado de causa",
        fechaLimite: yesterday,
        tipo: "cliente",
        estado: "vencido",
        causaId: causa3.id,
        responsableId: asistente.id,
      },
    ],
  });

  await prisma.nota.createMany({
    data: [
      {
        titulo: "Estrategia probatoria",
        contenido: "## Prueba documental\n- Facturas\n- Actas de recepción",
        tags: "civil,prueba",
        causaId: causa1.id,
      },
      {
        titulo: "Checklist tutela laboral",
        contenido: "- [ ] Cotizaciones\n- [ ] Carta de despido",
        tags: "laboral,tutela",
        causaId: causa2.id,
      },
    ],
  });

  // —— HighQ Sites ——
  const siteCivil = await prisma.site.create({
    data: {
      name: "Andes · Cobro de pesos C-4521-2025",
      slug: "andes-cobro-c-4521-2025",
      description: "Matter site HighQ-style para litigio civil de Constructora Andes.",
      tipo: "matter",
      color: "#1f6f78",
      isClientVisible: true,
      clienteId: cliente1.id,
      causaId: causa1.id,
      members: {
        create: [
          { userId: admin.id, role: "admin" },
          { userId: abogado.id, role: "contributor" },
          { userId: asistente.id, role: "contributor" },
          { userId: clienteUser.id, role: "client" },
        ],
      },
      groups: { create: [{ groupId: litigioGroup.id, role: "contributor" }] },
    },
  });

  const siteLaboral = await prisma.site.create({
    data: {
      name: "Muñoz · Tutela laboral O-1189-2025",
      slug: "munoz-tutela-o-1189-2025",
      description: "Site de matter laboral con data room y Q&A cliente.",
      tipo: "matter",
      color: "#c47a3a",
      isClientVisible: true,
      clienteId: cliente2.id,
      causaId: causa2.id,
      members: {
        create: [
          { userId: admin.id, role: "admin" },
          { userId: asistente.id, role: "contributor" },
        ],
      },
    },
  });

  const siteVdr = await prisma.site.create({
    data: {
      name: "VDR · Due Diligence Pacífico",
      slug: "vdr-pacifico-dd",
      description: "Virtual Data Room para revisión documental de contraparte.",
      tipo: "vdr",
      color: "#0c1c24",
      isClientVisible: false,
      clienteId: cliente1.id,
      members: {
        create: [
          { userId: admin.id, role: "admin" },
          { userId: abogado.id, role: "contributor" },
        ],
      },
    },
  });

  const siteKnowledge = await prisma.site.create({
    data: {
      name: "Knowledge · Jurisprudencia & Playbooks",
      slug: "knowledge-jurisprudencia",
      description: "Base de conocimiento interna del estudio (wiki + blog).",
      tipo: "knowledge",
      color: "#2a4d3a",
      members: {
        create: [
          { userId: admin.id, role: "admin" },
          { userId: abogado.id, role: "contributor" },
          { userId: asistente.id, role: "viewer" },
        ],
      },
    },
  });

  const sitePortal = await prisma.site.create({
    data: {
      name: "Portal Cliente · Constructora Andes",
      slug: "portal-andes",
      description: "Client portal HighQ con causas visibles y documentos compartidos.",
      tipo: "client_portal",
      color: "#4a5d73",
      isClientVisible: true,
      clienteId: cliente1.id,
      causaId: causa3.id,
      members: {
        create: [
          { userId: admin.id, role: "admin" },
          { userId: abogado.id, role: "contributor" },
          { userId: clienteUser.id, role: "client" },
        ],
      },
    },
  });

  // Folders + files for civil site
  const folderEscritos = await prisma.folder.create({
    data: { name: "01 Escritos", siteId: siteCivil.id },
  });
  const folderPrueba = await prisma.folder.create({
    data: { name: "02 Prueba", siteId: siteCivil.id },
  });
  const folderCliente = await prisma.folder.create({
    data: { name: "03 Compartido con cliente", siteId: siteCivil.id },
  });

  await prisma.siteFile.create({
    data: {
      name: "Demanda.md",
      mimeType: "text/markdown",
      contenido: "# Demanda de cobro\n\nFundamentos de hecho y derecho...",
      sizeBytes: 120,
      siteId: siteCivil.id,
      folderId: folderEscritos.id,
      tags: "escrito,demanda",
      versions: {
        create: [
          { version: 1, contenido: "Borrador v1", note: "Borrador", authorId: abogado.id },
          { version: 2, contenido: "# Demanda de cobro\n\nFundamentos...", note: "Presentada", authorId: abogado.id },
        ],
      },
      comments: {
        create: [
          { body: "Revisar cuantía del lucro cesante.", authorId: admin.id },
        ],
      },
    },
  });

  await prisma.siteFile.create({
    data: {
      name: "Contrato-obra-2024.md",
      mimeType: "text/markdown",
      contenido: "Cláusulas relevantes del contrato de obra...",
      siteId: siteCivil.id,
      folderId: folderPrueba.id,
      tags: "contrato,prueba",
      versions: {
        create: [{ version: 1, contenido: "Cláusulas...", authorId: asistente.id }],
      },
    },
  });

  await prisma.siteFile.create({
    data: {
      name: "Informe-estado-cliente.md",
      mimeType: "text/markdown",
      contenido: "Estimada Francisca: el juicio se encuentra en etapa de prueba...",
      siteId: siteCivil.id,
      folderId: folderCliente.id,
      tags: "cliente",
      versions: {
        create: [{ version: 1, contenido: "Estimada Francisca...", authorId: asistente.id }],
      },
    },
  });

  // VDR folders
  const vdrFinancial = await prisma.folder.create({
    data: { name: "Financials", siteId: siteVdr.id },
  });
  const vdrLegal = await prisma.folder.create({
    data: { name: "Legal", siteId: siteVdr.id },
  });
  await prisma.siteFile.createMany({
    data: [
      {
        name: "Estados-financieros-2024.md",
        contenido: "Resumen EEFF...",
        siteId: siteVdr.id,
        folderId: vdrFinancial.id,
        tags: "dd,financial",
      },
      {
        name: "Estatutos-sociales.md",
        contenido: "Estatutos actualizados...",
        siteId: siteVdr.id,
        folderId: vdrLegal.id,
        tags: "dd,legal",
      },
      {
        name: "Index-VDR.md",
        contenido: "# Índice VDR Pacífico\n\n1. Financials\n2. Legal",
        siteId: siteVdr.id,
        tags: "index",
      },
    ],
  });

  // Wiki
  await prisma.wikiPage.createMany({
    data: [
      {
        title: "Home",
        slug: "home",
        content:
          "# Matter C-4521-2025\n\nBienvenido al site HighQ de la causa.\n\n- [Estrategia](estrategia)\n- [Checklist audiencia](checklist-audiencia)",
        siteId: siteCivil.id,
        authorId: abogado.id,
      },
      {
        title: "Estrategia",
        slug: "estrategia",
        content:
          "## Teoría del caso\nIncumplimiento de pago de hitos 3 y 4.\n\n## Prueba clave\nFacturas + actas de recepción parcial.",
        siteId: siteCivil.id,
        authorId: admin.id,
      },
      {
        title: "Checklist audiencia",
        slug: "checklist-audiencia",
        content: "- [ ] Notificar testigos\n- [ ] Carpeta de prueba indexada\n- [ ] Poder vigente",
        siteId: siteCivil.id,
        authorId: asistente.id,
      },
      {
        title: "Playbook tutela laboral",
        slug: "playbook-tutela",
        content: "# Playbook\n\n1. Indicios\n2. Inversión de carga\n3. Medidas reparatorias",
        siteId: siteKnowledge.id,
        authorId: admin.id,
      },
      {
        title: "Cómo citar jurisprudencia CS",
        slug: "citar-cs",
        content: "Use rol, sala, fecha y doctrina extractada en LexOpen.",
        siteId: siteKnowledge.id,
        authorId: abogado.id,
      },
    ],
  });

  await prisma.blogPost.createMany({
    data: [
      {
        title: "Kick-off matter Andes",
        body: "Se abre el site y se invita al cliente al portal.",
        siteId: siteCivil.id,
      },
      {
        title: "Nueva doctrina CS en tutela",
        body: "Resumen interno del fallo 45.678-2022.",
        siteId: siteKnowledge.id,
      },
    ],
  });

  // Tasks
  await prisma.task.createMany({
    data: [
      {
        title: "Preparar lista de testigos",
        description: "Incluir jefe de obra y supervisor técnico.",
        status: "in_progress",
        priority: "high",
        dueDate: in7,
        siteId: siteCivil.id,
        assigneeId: asistente.id,
        creatorId: abogado.id,
      },
      {
        title: "Revisar cuantía con cliente",
        status: "todo",
        priority: "medium",
        dueDate: in3,
        siteId: siteCivil.id,
        assigneeId: abogado.id,
        creatorId: admin.id,
      },
      {
        title: "Redactar contestación laboral",
        status: "todo",
        priority: "urgent",
        dueDate: in3,
        siteId: siteLaboral.id,
        assigneeId: admin.id,
        creatorId: admin.id,
      },
      {
        title: "Indexar carpeta Legal del VDR",
        status: "done",
        priority: "low",
        dueDate: yesterday,
        siteId: siteVdr.id,
        assigneeId: asistente.id,
        creatorId: abogado.id,
      },
      {
        title: "Actualizar playbook tutela",
        status: "todo",
        priority: "medium",
        dueDate: in14,
        siteId: siteKnowledge.id,
        assigneeId: abogado.id,
        creatorId: admin.id,
      },
    ],
  });

  // iSheets
  const sheetHitos = await prisma.iSheet.create({
    data: {
      name: "Hitos del juicio",
      description: "Seguimiento procesal estructurado (HighQ iSheet).",
      siteId: siteCivil.id,
      columns: {
        create: [
          { name: "Hito", key: "hito", type: "text", position: 0 },
          { name: "Fecha", key: "fecha", type: "date", position: 1 },
          {
            name: "Estado",
            key: "estado",
            type: "choice",
            options: "Pendiente,Cumplido,Vencido",
            position: 2,
          },
          { name: "Responsable", key: "responsable", type: "text", position: 3 },
        ],
      },
    },
  });

  await prisma.iSheetRow.createMany({
    data: [
      {
        sheetId: sheetHitos.id,
        dataJson: JSON.stringify({
          hito: "Notificación demanda",
          fecha: "2025-04-02",
          estado: "Cumplido",
          responsable: "Camila Rojas",
        }),
      },
      {
        sheetId: sheetHitos.id,
        dataJson: JSON.stringify({
          hito: "Audiencia de prueba",
          fecha: in7.toISOString().slice(0, 10),
          estado: "Pendiente",
          responsable: "Andrés Valenzuela",
        }),
      },
      {
        sheetId: sheetHitos.id,
        dataJson: JSON.stringify({
          hito: "Informe pericial",
          fecha: in14.toISOString().slice(0, 10),
          estado: "Pendiente",
          responsable: "Externo",
        }),
      },
    ],
  });

  const sheetDd = await prisma.iSheet.create({
    data: {
      name: "DD Issues Log",
      description: "Registro de hallazgos del VDR.",
      siteId: siteVdr.id,
      columns: {
        create: [
          { name: "Issue", key: "issue", type: "text", position: 0 },
          {
            name: "Severidad",
            key: "severidad",
            type: "choice",
            options: "Baja,Media,Alta",
            position: 1,
          },
          { name: "Área", key: "area", type: "choice", options: "Legal,Financial,Tax", position: 2 },
          { name: "Estado", key: "estado", type: "choice", options: "Abierto,Mitigado,Cerrado", position: 3 },
        ],
      },
    },
  });

  await prisma.iSheetRow.createMany({
    data: [
      {
        sheetId: sheetDd.id,
        dataJson: JSON.stringify({
          issue: "Garantía solidaria no protocolizada",
          severidad: "Alta",
          area: "Legal",
          estado: "Abierto",
        }),
      },
      {
        sheetId: sheetDd.id,
        dataJson: JSON.stringify({
          issue: "Pasivo contingente laboral",
          severidad: "Media",
          area: "Financial",
          estado: "Mitigado",
        }),
      },
    ],
  });

  // Q&A
  const qa1 = await prisma.qaThread.create({
    data: {
      subject: "¿Cuál es el saldo exacto cobrado?",
      category: "Cuantía",
      status: "answered",
      siteId: siteCivil.id,
      posts: {
        create: [
          {
            body: "Necesitamos confirmar UF y pesos al día de presentación.",
            authorId: clienteUser.id,
          },
          {
            body: "Saldo: UF 12.400 + intereses. Detalle en carpeta 03.",
            isAnswer: true,
            authorId: abogado.id,
          },
        ],
      },
    },
  });
  void qa1;

  await prisma.qaThread.create({
    data: {
      subject: "Acceso a carpeta Financials del VDR",
      category: "Acceso",
      status: "open",
      siteId: siteVdr.id,
      posts: {
        create: [
          {
            body: "¿Pueden habilitar lectura a nuestro advisor externo?",
            authorId: admin.id,
          },
        ],
      },
    },
  });

  // Workflows
  const wf = await prisma.workflow.create({
    data: {
      name: "Aprobación de escrito",
      description: "Paralegal → Abogado → Socio",
      siteId: siteCivil.id,
      triggerType: "manual",
      stepsJson: JSON.stringify([
        { name: "Revisión paralegal", role: "asistente" },
        { name: "Revisión abogado", role: "abogado" },
        { name: "Aprobación socio", role: "admin" },
      ]),
      instances: {
        create: [
          {
            status: "running",
            currentStep: 1,
            payloadJson: JSON.stringify({ documento: "Demanda.md" }),
            actorId: abogado.id,
          },
        ],
      },
    },
  });
  void wf;

  await prisma.workflow.create({
    data: {
      name: "Publicación a portal cliente",
      description: "Control antes de compartir archivo al cliente",
      siteId: sitePortal.id,
      triggerType: "file_upload",
      stepsJson: JSON.stringify([
        { name: "Compliance interno", role: "abogado" },
        { name: "OK socio", role: "admin" },
      ]),
    },
  });

  // Messages & notifications
  await prisma.message.createMany({
    data: [
      {
        subject: "Prep. audiencia",
        body: "Camila, ¿puedes armar el índice de prueba para el lunes?",
        senderId: abogado.id,
        receiverId: asistente.id,
      },
      {
        subject: "Re: Prep. audiencia",
        body: "Sí, lo dejo en la carpeta 02 Prueba.",
        senderId: asistente.id,
        receiverId: abogado.id,
        read: true,
      },
      {
        subject: "Acceso portal",
        body: "Francisca, ya puede ver el informe de estado en el portal.",
        senderId: admin.id,
        receiverId: clienteUser.id,
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: abogado.id,
        title: "Q&A respondido",
        body: "Cliente Andes preguntó por la cuantía",
        href: `/sites/${siteCivil.id}/qa`,
      },
      {
        userId: asistente.id,
        title: "Tarea asignada",
        body: "Preparar lista de testigos",
        href: `/sites/${siteCivil.id}/tareas`,
      },
      {
        userId: admin.id,
        title: "Workflow pendiente",
        body: "Aprobación de escrito — paso abogado",
        href: "/flujos",
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      {
        tipo: "estado",
        mensaje: "Site matter creado y vinculados miembros",
        siteId: siteCivil.id,
        causaId: causa1.id,
        userId: admin.id,
      },
      {
        tipo: "documento",
        mensaje: "Se versionó Demanda.md (v2)",
        siteId: siteCivil.id,
        causaId: causa1.id,
        userId: abogado.id,
      },
      {
        tipo: "comentario",
        mensaje: "Q&A del cliente sobre cuantía respondido",
        siteId: siteCivil.id,
        userId: abogado.id,
      },
      {
        tipo: "sistema",
        mensaje: "VDR Pacífico indexado",
        siteId: siteVdr.id,
        userId: asistente.id,
      },
      {
        tipo: "hermes",
        mensaje: "Hermes Agent: borrador contestación laboral (pendiente aprobación)",
        causaId: causa2.id,
        siteId: siteLaboral.id,
        userId: admin.id,
      },
    ],
  });

  await prisma.jurisprudencia.createMany({
    data: [
      {
        rol: "12.345-2023",
        tribunal: "Corte Suprema",
        sala: "Primera Sala",
        fecha: new Date("2023-08-14"),
        materia: "civil",
        caratula: "Sociedad X con Banco Y",
        descripcion: "Responsabilidad contractual e indemnización de perjuicios.",
        doctrina:
          "La indemnización exige daño cierto, nexo causal y culpa o dolo. Lucro cesante con parámetros objetivos.",
        fuente: "Corte Suprema",
        tags: "indemnizacion,contrato,perjuicios",
      },
      {
        rol: "45.678-2022",
        tribunal: "Corte Suprema",
        sala: "Cuarta Sala",
        fecha: new Date("2022-11-03"),
        materia: "laboral",
        caratula: "Trabajador A con Empresa B",
        descripcion: "Tutela de derechos fundamentales e indicios.",
        doctrina:
          "Acreditados indicios suficientes, el empleador debe justificar la medida.",
        fuente: "Corte Suprema",
        tags: "tutela,despido,discriminacion",
      },
      {
        rol: "8.901-2024",
        tribunal: "Corte de Apelaciones de Santiago",
        sala: "Octava Sala",
        fecha: new Date("2024-05-22"),
        materia: "civil",
        caratula: "Constructora C con Inmobiliaria D",
        descripcion: "Cobro de pesos y cláusula penal.",
        doctrina: "Cláusula penal moderable si es manifiestamente excesiva.",
        fuente: "Corte Apelaciones",
        tags: "obra,clausula-penal,cobro",
      },
      {
        rol: "1.234-2021",
        tribunal: "Tribunal Constitucional",
        fecha: new Date("2021-06-10"),
        materia: "constitucional",
        caratula: "Requerimiento de inaplicabilidad",
        descripcion: "Debido proceso en procedimiento civil.",
        doctrina: "Debido proceso exige defensa y contradicción reales.",
        fuente: "TC",
        tags: "debido-proceso,inaplicabilidad",
      },
      {
        rol: "33.210-2020",
        tribunal: "Corte Suprema",
        sala: "Segunda Sala",
        fecha: new Date("2020-09-18"),
        materia: "penal",
        caratula: "Ministerio Público con Imputado Z",
        descripcion: "Estándar de duda razonable.",
        doctrina: "Convicción más allá de duda razonable y coherencia de la prueba.",
        fuente: "Corte Suprema",
        tags: "prueba,juicio-oral",
      },
      {
        rol: "9.876-2024",
        tribunal: "Corte de Apelaciones de Valparaíso",
        fecha: new Date("2024-12-01"),
        materia: "constitucional",
        caratula: "Recurrente con SERVIU",
        descripcion: "Recurso de protección y arbitrariedad.",
        doctrina: "Arbitrariedad cuando el acto carece de fundamento racional.",
        fuente: "Corte Apelaciones",
        tags: "proteccion,arbitrariedad",
      },
    ],
  });

  await prisma.integrationConfig.createMany({
    data: [
      {
        provider: "obsidian",
        enabled: true,
        configJson: JSON.stringify({
          vaultPath: "./obsidian-vault",
          folderPrefix: "LexOpen",
          syncNotes: true,
          syncDocumentos: true,
        }),
      },
      {
        provider: "hermes",
        enabled: true,
        configJson: JSON.stringify({
          apiUrl: process.env.HERMES_API_URL || "http://localhost:8642/v1",
          model: "hermes-legal",
          requireApproval: true,
        }),
      },
      {
        provider: "google",
        enabled: false,
        configJson: JSON.stringify({
          scopes: [
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/gmail.send",
          ],
          syncDrive: true,
          syncCalendar: true,
        }),
      },
    ],
  });

  console.log("Seed LexOpen HighQ OK", {
    users: 4,
    sites: 5,
    causas: 3,
    siteCivil: siteCivil.slug,
    siteVdr: siteVdr.slug,
    sitePortal: sitePortal.slug,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
