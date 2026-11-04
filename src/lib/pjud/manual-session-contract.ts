/** Client-safe DTOs. Browser contexts, account credentials and session cookies never enter this contract. */
import type { PjudCuadernosCoverage } from "@/lib/pjud/types";

export const MANUAL_OJV_MATERIAS = ["Civil", "Familia", "Laboral", "Cobranza", "Penal", "Garantía", "Tribunal Oral", "Apelaciones", "Corte Suprema", "Constitucional"] as const;
export type ManualOjvMateria = typeof MANUAL_OJV_MATERIAS[number];
export type ManualOjvUiPhase = "opening" | "waiting-login" | "waiting-user-confirmation" | "ready" | "listing" | "importing" | "completed" | "error" | "closed";
export type ManualOjvCandidate = { id: string; rit: string; tribunal: string; caratula: string | null; estado: string | null };
export type ManualOjvImportResult = {
  created: number; linked: number; syncOk: number; syncFailed: number; syncPartial: number; inserted: number;
  items: { causaId: string; rit: string; tribunal: string; status: string; note?: string; cuadernosCoverage?: PjudCuadernosCoverage }[];
};
export type ManualOjvUiSession = {
  id: string; phase: ManualOjvUiPhase; expiresAt: string; authenticated: boolean;
  listedAt: string | null; materiasTried: ManualOjvMateria[]; candidates: ManualOjvCandidate[];
  progress: { completed: number; total: number; currentRit?: string } | null;
  result: ManualOjvImportResult | null; error: string | null;
};
export type ManualOjvCapabilities = {
  available: boolean; allowed: boolean; hostLocal: boolean; reason: string | null; importLimit: number;
};
export type ManualOjvUiResponse = { capabilities: ManualOjvCapabilities; session: ManualOjvUiSession | null };
