import type { Prisma } from "@prisma/client";

/** The organization form never needs integration credentials or their ciphertext. */
export const firmFormSelect = {
  id: true,
  name: true,
  rut: true,
  email: true,
  telefono: true,
  direccion: true,
  settings: { select: {
    emisorRazonSocial: true,
    emisorRut: true,
    emisorGiro: true,
    emisorDireccion: true,
    defaultRetencionPct: true,
    ivaPct: true,
    hermesAllowDemo: true,
    assistantLlmMode: true,
    auditLlmPrompts: true,
  } },
} as const satisfies Prisma.OrganizationSelect;
