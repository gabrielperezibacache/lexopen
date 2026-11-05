import type { AltazorSourceInput } from "@/lib/altazor/resource-input";
import type { AltazorDestination } from "@/lib/altazor/types";
import type { emptyAcademicBrief } from "@/lib/altazor/academic-schemas";
import { withCsrfHeaders } from "@/lib/client-csrf";
import type { AltazorSelectedSource } from "./AltazorSources";

export type AcademicProfile = { name: string; headline: string; orcid: string; biography: string; education: string; experience: string; publications: string; languages: string; interests: string };
export type AcademicMatrix = { dimensions: { id: string; label: string; type: "text" | "number" | "date" | "tag" }[]; rows: { id: string; title: string; included: boolean; available?: boolean; cells: Record<string, { value: string; source?: AltazorSourceInput }> }[] };
export type AcademicArtifact = { id: string; available: boolean; title?: string; body?: string; mode?: string; status?: string; revision?: number; sources?: { title: string; href: string; text: string; warnings: string[] }[] };
export type AcademicWorkspace = { id: string; title: string; kind: string; revision: number; brief: typeof emptyAcademicBrief; matrix: AcademicMatrix; artifacts: AcademicArtifact[]; sources: AltazorSelectedSource[]; unavailableSources: number };
export type AcademicOverview = { workspaces: { id: string; title: string; kind: string }[]; profile: AcademicProfile; profileRevision: number; destination: AltazorDestination };
export async function academicApi<T>(url: string, body?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : method, headers: body === undefined ? undefined : withCsrfHeaders({ "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo guardar el trabajo académico. Conserva tus cambios e inténtalo nuevamente.");
  return result;
}
