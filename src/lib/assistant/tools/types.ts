import type { ZodType } from "zod";
import type { Role } from "@/lib/auth/rbac";
import type {
  AssistantIntentId,
  ToolContext,
  ToolKind,
  ToolResult,
} from "@/lib/assistant/types";

/**
 * Contrato de herramienta del asistente. `preview` describe en español lo
 * que se hará (sin persistir); `execute` persiste con RBAC + auditoría.
 * `undo` (opcional) revierte usando el token devuelto por `execute`.
 */
export type AssistantTool<TInput = unknown> = {
  id: AssistantIntentId;
  description: string;
  kind: ToolKind;
  roles: Role[];
  /** The tool receives parsed output, including defaults supplied by its schema. */
  inputSchema: ZodType<TInput>;
  preview: (input: TInput, ctx: ToolContext) => Promise<string> | string;
  execute: (input: TInput, ctx: ToolContext) => Promise<ToolResult>;
  undo?: (token: string, ctx: ToolContext) => Promise<ToolResult>;
};

/** Tipo borrado usado por el registry (cada tool conserva su TInput internamente). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAssistantTool = AssistantTool<any>;
