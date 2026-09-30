/**
 * Tipos compartidos entre `src/app/(app)/inicio/page.tsx` (Server Component,
 * datos ya resueltos) y `InicioWorkbench`/cards (Client Components). Fechas
 * viajan como ISO string (`Date` no es serializable a props de cliente).
 */

export type InicioEventoCard = {
  id: string;
  titulo: string;
  tipo: string;
  inicio: string;
  fin: string | null;
  causaId: string | null;
};

export type InicioPlazoCard = {
  id: string;
  titulo: string;
  fechaLimite: string;
  esFatal: boolean;
  causaId: string | null;
  causaLabel: string | null;
};

export type InicioActivityCard = {
  id: string;
  tipo: string;
  mensaje: string;
  createdAt: string;
  userName: string | null;
  causaId: string | null;
  siteId: string | null;
};

export type InicioCausaCard = {
  id: string;
  titulo: string;
  rit: string | null;
  estado: string;
  updatedAt: string;
};

export type InicioSuggestion = {
  label: string;
  prompt: string;
};

export type InicioInitialData = {
  hoy: {
    eventos: InicioEventoCard[];
    plazos: InicioPlazoCard[];
  };
  plazosProximos: InicioPlazoCard[];
  actividad: InicioActivityCard[];
  causasRecientes: InicioCausaCard[];
  suggestions: InicioSuggestion[];
};
