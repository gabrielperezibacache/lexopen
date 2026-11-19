import { z } from "zod";
import type { IcaroDestination } from "../icaros/types";
import type { AltazorSourceSnapshot } from "../resources";

const text = (max: number) => z.string().trim().max(max);
export const reportSchema = z
  .object({
    summary: text(4000).min(1),
    waits: z.array(text(500)).max(12),
    needs: z.array(text(500)).max(12),
    tasks: z
      .array(
        z
          .object({
            title: text(300).min(1),
            description: text(1500),
            sourceIds: z.array(z.string().regex(/^R[1-9][0-9]*$/)).max(20),
          })
          .strict(),
      )
      .max(12),
    draft: z
      .object({
        title: text(200).min(1),
        body: text(12000).min(1),
        sourceIds: z.array(z.string().regex(/^R[1-9][0-9]*$/)).max(20),
      })
      .strict()
      .nullable(),
    citations: z
      .array(
        z
          .object({
            sourceId: z.string().regex(/^R[1-9][0-9]*$/),
            quote: text(600).min(1),
          })
          .strict(),
      )
      .max(20),
    question: text(1000).nullable(),
  })
  .strict();
export type CaseReport = z.infer<typeof reportSchema>;
export type CaseReference = { id: string; source: AltazorSourceSnapshot };
export type CaseTeamMember = {
  id: string;
  name: string;
  revision: number;
  useMemory: boolean;
  memorySelection?: (import("../icaros/types").IcaroMemoryRef & { label: string })[];
  destination: IcaroDestination;
};
export type CaseJobPlan = {
  version: 1;
  asOf: string;
  snapshot: CaseSnapshot;
  snapshotHash: string;
  destination: IcaroDestination;
  team: CaseTeamMember[];
  objective: string;
};
export type CaseSnapshot = {
  cause: {
    id: string;
    titulo: string;
    rit: string | null;
    estado: string;
    etapa: string;
    resumen: string | null;
    tribunal: string;
    materia: string;
    procedimiento: string | null;
    ruc: string | null;
    clienteId: string | null;
  };
  documents: {
    id: string;
    nombre: string;
    version: number;
    updatedAt: string;
  }[];
  deadlines: {
    id: string;
    titulo: string;
    estado: string;
    esFatal: boolean;
    responsable: { name: string } | null;
    fechaLimite: string;
    fechaCivilChile: string;
  }[];
  tasks: {
    id: string;
    title: string;
    description: string | null;
    assignee: { name: string } | null;
    status: string;
    waitingOn: string | null;
    dueDate: string | null;
  }[];
  movements: {
    id: string;
    titulo: string;
    detalle: string | null;
    tipo: string;
    fuente: string;
    fecha: string;
    pendienteResolucion: boolean;
  }[];
};
export const selectionSchema = z
  .object({
    requestId: z
      .string()
      .min(8)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/),
    expectedRevision: z.number().int().positive(),
    proposals: z
      .array(
        z
          .object({
            id: z.string().min(1).max(50),
            title: text(300).min(1),
            body: text(12000),
          })
          .strict(),
      )
      .max(13),
  })
  .strict();
export type CaseSelection = z.infer<typeof selectionSchema>;
export type CaseJobView = {
  continuationHash?: string | null;
  id: string;
  causaId: string;
  available: boolean;
  asOf: string;
  canResume: boolean;
  objective: string;
  status: string;
  revision: number;
  errorCode: string | null;
  report: CaseReport | null;
  references: { id: string; title: string; href: string; quote: string }[];
  progress: { planned: number; completed: number; failed: number };
  coverage: {
    documents: number;
    extracted: number;
    unavailable: number;
    partial: number;
  };
  steps: {
    id: string;
    label: string;
    status: string;
    errorCode: string | null;
    entityId?: string;
    href?: string;
  }[];
  nextStep: number | null;
  receipts: { entityId: string; href: string; title: string }[];
  help: { id: string; question: string; status: string; notificationStatus:string } | null;
  savedSelection: CaseSelection | null;
  coordinator: { provider: string; model: string } | null;
  team: { name: string; provider: string; model: string; memoryLabels: string[] }[];
  pendingPlan: { preview: string; hash: string } | null;
};
export const emptyReport = (): CaseReport => ({
  summary: "",
  waits: [],
  needs: [],
  tasks: [],
  draft: null,
  citations: [],
  question: null,
});
