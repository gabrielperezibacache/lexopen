export type TramiteTemplateItem = {
  titulo: string;
  detalle?: string;
  diasLimite?: number;
};

export type TramiteTemplate = {
  id: string;
  label: string;
  materia: string | null; // null = genérica
  items: TramiteTemplateItem[];
};

export const TRAMITE_TEMPLATES: TramiteTemplate[] = [
  {
    id: "civil-ordinario",
    label: "Civil ordinario — checklist ingreso",
    materia: "civil",
    items: [
      {
        titulo: "Revisar competencia y cuantía",
        detalle: "Confirmar tribunal y procedimiento aplicable.",
        diasLimite: 3,
      },
      {
        titulo: "Notificar demanda",
        detalle: "Gestionar notificación al demandado.",
        diasLimite: 10,
      },
      {
        titulo: "Calendariar plazo de contestación",
        detalle: "15 días hábiles desde notificación efectiva.",
        diasLimite: 15,
      },
      {
        titulo: "Solicitar medidas precautorias (si aplica)",
        diasLimite: 7,
      },
    ],
  },
  {
    id: "laboral-tutela",
    label: "Laboral / tutela — checklist",
    materia: "laboral",
    items: [
      {
        titulo: "Recopilar liquidaciones y contrato",
        diasLimite: 5,
      },
      {
        titulo: "Preparar y presentar demanda / tutela",
        diasLimite: 7,
      },
      {
        titulo: "Acompañar prueba documental",
        diasLimite: 10,
      },
      {
        titulo: "Preparar audiencia de conciliación",
        diasLimite: 20,
      },
    ],
  },
  {
    id: "constitucional-proteccion",
    label: "Recurso de protección",
    materia: "constitucional",
    items: [
      {
        titulo: "Redactar recurso y acompañar documentos",
        diasLimite: 3,
      },
      {
        titulo: "Ingresar en Corte de Apelaciones",
        diasLimite: 5,
      },
      {
        titulo: "Preparar alegatos",
        diasLimite: 15,
      },
      {
        titulo: "Seguimiento de orden de no innovar",
        diasLimite: 7,
      },
    ],
  },
  {
    id: "generica-handoff",
    label: "Handoff genérico post-actuación",
    materia: null,
    items: [
      {
        titulo: "Actualizar etapa procesal en LexOpen",
        diasLimite: 1,
      },
      {
        titulo: "Informar al cliente del resultado",
        diasLimite: 2,
      },
      {
        titulo: "Cargar documentos al expediente",
        diasLimite: 3,
      },
      {
        titulo: "Registrar próximos plazos fatales",
        diasLimite: 1,
      },
    ],
  },
];

export function templatesForMateria(materia?: string | null) {
  const m = (materia || "").toLowerCase();
  return TRAMITE_TEMPLATES.filter((t) => !t.materia || t.materia === m);
}

export function findTemplate(id: string) {
  return TRAMITE_TEMPLATES.find((t) => t.id === id) || null;
}

export function fechaLimiteFromDias(dias: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + dias);
  d.setHours(12, 0, 0, 0);
  return d;
}
