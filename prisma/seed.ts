import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.activity.deleteMany();
  await prisma.nota.deleteMany();
  await prisma.plazo.deleteMany();
  await prisma.documento.deleteMany();
  await prisma.parte.deleteMany();
  await prisma.causa.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.jurisprudencia.deleteMany();
  await prisma.integrationConfig.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      email: "socio@estudio.cl",
      name: "María Paz Contreras",
      role: "admin",
    },
  });

  const abogado = await prisma.user.create({
    data: {
      email: "abogado@estudio.cl",
      name: "Andrés Valenzuela",
      role: "abogado",
    },
  });

  const asistente = await prisma.user.create({
    data: {
      email: "asistente@estudio.cl",
      name: "Camila Rojas",
      role: "asistente",
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
          {
            nombre: "Constructora Andes SpA",
            rut: "76.543.210-K",
            rol: "demandante",
          },
          {
            nombre: "Inmobiliaria Pacífico Ltda.",
            rut: "77.111.222-3",
            rol: "demandado",
          },
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
          {
            nombre: "Juan Carlos Muñoz Sepúlveda",
            rut: "12.345.678-9",
            rol: "demandante",
          },
          {
            nombre: "Retail Sur S.A.",
            rut: "96.800.100-5",
            rol: "demandado",
          },
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
          {
            nombre: "Constructora Andes SpA",
            rut: "76.543.210-K",
            rol: "recurrente",
          },
          {
            nombre: "SERVIU Región de Valparaíso",
            rol: "recorrido",
          },
        ],
      },
    },
  });

  await prisma.documento.createMany({
    data: [
      {
        nombre: "Demanda de cobro de pesos.md",
        tipo: "escrito",
        contenido:
          "# Demanda de cobro de pesos\n\nEn lo principal: demanda de cobro...\n\n**Tribunal:** 1º Juzgado Civil de Santiago\n**RIT:** C-4521-2025",
        causaId: causa1.id,
        autorId: abogado.id,
        obsidianPath: "Causas/C-4521-2025/Demanda.md",
      },
      {
        nombre: "Contrato de obra.pdf",
        tipo: "contrato",
        contenido: "Contrato de construcción suscrito el 15.01.2024...",
        causaId: causa1.id,
        autorId: abogado.id,
      },
      {
        nombre: "Demanda laboral — tutela.md",
        tipo: "escrito",
        contenido:
          "# Demanda laboral\n\nFundamentos de hecho y de derecho relativos al despido...",
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
        contenido:
          "## Prueba documental\n- Facturas impagas\n- Actas de recepción parcial\n\n## Testigos\n- Jefe de obra\n- Supervisor técnico",
        tags: "civil,prueba",
        causaId: causa1.id,
      },
      {
        titulo: "Checklist tutela laboral",
        contenido:
          "- [ ] Certificado de cotizaciones\n- [ ] Carta de despido\n- [ ] Liquidaciones de sueldo\n- [ ] Correos con gerente",
        tags: "laboral,tutela",
        causaId: causa2.id,
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      {
        tipo: "estado",
        mensaje: "Causa ingresada al sistema LexOpen",
        causaId: causa1.id,
        userId: abogado.id,
      },
      {
        tipo: "documento",
        mensaje: "Se cargó Demanda de cobro de pesos.md",
        causaId: causa1.id,
        userId: abogado.id,
      },
      {
        tipo: "comentario",
        mensaje: "Cliente solicita audiencia de conciliación previa.",
        causaId: causa2.id,
        userId: asistente.id,
      },
      {
        tipo: "hermes",
        mensaje:
          "Hermes Agent: borrador de contestación laboral generado (pendiente revisión humana).",
        causaId: causa2.id,
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
        descripcion:
          "Responsabilidad contractual por incumplimiento de obligación de dar. Criterios de indemnización de perjuicios.",
        doctrina:
          "La indemnización de perjuicios exige prueba de daño cierto, nexo causal y culpa o dolo del deudor. El lucro cesante debe acreditarse con parámetros objetivos.",
        texto:
          "Vistos: ... Se confirma la sentencia apelada en cuanto condena al pago de indemnización por daño emergente...",
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
        descripcion:
          "Tutela de derechos fundamentales. Indicios de discriminación y carga de la prueba.",
        doctrina:
          "En tutela laboral, acreditados indicios suficientes, corresponde al empleador explicar y justificar la medida adoptada.",
        texto:
          "Se acoge el recurso de unificación de jurisprudencia respecto del estándar de indicios...",
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
        descripcion:
          "Cobro de pesos derivados de contrato de obra. Aplicación de cláusulas penales.",
        doctrina:
          "La cláusula penal es exigible ante incumplimiento culpable, pudiendo moderarse judicialmente si es manifiestamente excesiva.",
        texto:
          "Se confirma la condena al pago del saldo de precio y se modera la cláusula penal al 20%...",
        fuente: "Corte Apelaciones",
        tags: "obra,clausula-penal,cobro",
      },
      {
        rol: "1.234-2021",
        tribunal: "Tribunal Constitucional",
        fecha: new Date("2021-06-10"),
        materia: "constitucional",
        caratula: "Requerimiento de inaplicabilidad — art. X COT",
        descripcion:
          "Inaplicabilidad por inconstitucionalidad en procedimiento civil.",
        doctrina:
          "El debido proceso exige posibilidad real de defensa y contradicción ante medidas que afectan derechos patrimoniales.",
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
        descripcion:
          "Valoración de prueba en juicio oral. Estándar de duda razonable.",
        doctrina:
          "La convicción más allá de toda duda razonable exige coherencia interna de la prueba de cargo y descarte de hipótesis alternativas plausibles.",
        fuente: "Corte Suprema",
        tags: "prueba,juicio-oral,duda-razonable",
      },
      {
        rol: "9.876-2024",
        tribunal: "Corte de Apelaciones de Valparaíso",
        fecha: new Date("2024-12-01"),
        materia: "constitucional",
        caratula: "Recurrente con SERVIU",
        descripcion:
          "Recurso de protección. Acto arbitrario de autoridad administrativa sobre posesión de inmueble.",
        doctrina:
          "La arbitrariedad se configura cuando el acto carece de fundamento racional o vulnera igualdad ante la ley sin justificación suficiente.",
        fuente: "Corte Apelaciones",
        tags: "proteccion,arbitrariedad,propiedad",
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

  console.log("Seed LexOpen OK");
  console.log({ admin: admin.email, abogado: abogado.email, causas: 3 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
