import { z } from "zod";

export const COMPUTER_AUTHORIZATION_MODES = ["supervised", "intelligent", "autonomous"] as const;
export type ComputerAuthorizationMode = typeof COMPUTER_AUTHORIZATION_MODES[number];
export const COMPUTER_AUTHORIZATION_MODE_OPTIONS = ["intelligent", "autonomous", "supervised"] as const;
export const DEFAULT_COMPUTER_AUTHORIZATION = Object.freeze({ mode: "supervised" as const, allowInput: false, allowBrowser: false, allowApps: false, maxActions: 100, maxConsultations: 20 });
export const COMPUTER_GUI_EFFECTS_ACKNOWLEDGEMENT = "Entiendo que permitir ratón y teclado puede pulsar Enviar o Eliminar en las aplicaciones abiertas. LexOpen no determina automáticamente el efecto de cada clic o tecla.";
export const COMPUTER_BROWSER_EFFECTS_NOTICE = "Abrir una página puede provocar acciones en ese servicio. LexOpen no determina automáticamente el efecto de cada dirección.";
export const COMPUTER_AUTHORIZATION_PERMISSION_LABELS = Object.freeze({ allowInput: "Ratón y teclado", allowBrowser: "Abrir páginas web", allowApps: "Abrir aplicaciones locales" });

const modeSchema = z.enum(COMPUTER_AUTHORIZATION_MODES);
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identifierSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const bindingSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** Every category is explicit. A mode name, missing checkbox or model claim
 * cannot supply permission. Parsing this choice performs no configuration write. */
export const computerAuthorizationChoiceSchema = z.object({
  mode: modeSchema,
  expectedRevision: revisionSchema,
  confirmed: z.literal(true),
  allowInput: z.boolean(), allowBrowser: z.boolean(), allowApps: z.boolean(),
  maxActions: z.number().int().min(1).max(1000),
  maxConsultations: z.number().int().min(1).max(100),
  guiEffectsAcknowledged: z.boolean().optional(),
}).strict().superRefine((choice, context) => {
  if (choice.mode !== "autonomous" && (choice.allowInput || choice.allowBrowser || choice.allowApps)) context.addIssue({ code: "custom", message: "Los permisos por categoría sólo se activan al elegir Trabajo autónomo." });
  if (choice.allowInput && choice.guiEffectsAcknowledged !== true) context.addIssue({ code: "custom", path: ["guiEffectsAcknowledged"], message: "Confirma el alcance del permiso de ratón y teclado antes de activarlo." });
});
export type ComputerAuthorizationChoice = {
  mode: ComputerAuthorizationMode; expectedRevision: number; confirmed: true;
  allowInput: boolean; allowBrowser: boolean; allowApps: boolean;
  maxActions: number; maxConsultations: number; guiEffectsAcknowledged?: boolean;
};
export function parseComputerAuthorizationChoice(value: unknown): ComputerAuthorizationChoice {
  return computerAuthorizationChoiceSchema.parse(value);
}
export function normalizeComputerAuthorizationMode(value: unknown): ComputerAuthorizationMode | null {
  const result = modeSchema.safeParse(value); return result.success ? result.data : null;
}

const nativeSnapshotSchema = z.object({
  applied: z.boolean(), chat_id: identifierSchema, kitty: identifierSchema, binding: bindingSchema,
  mode: modeSchema, revision: revisionSchema,
  allow_input: z.boolean(), allow_browser: z.boolean(), allow_apps: z.boolean(),
  max_actions: z.number().int().min(1).max(1000), max_consultations: z.number().int().min(1).max(100),
  actions_used: z.number().int().nonnegative().max(1000), consultations_used: z.number().int().nonnegative().max(100),
  outcome_unknown: z.boolean(),
  gui_effects_unknown: z.boolean().optional(),
}).strict().superRefine((ack, context) => {
  if (ack.applied && ack.revision < 1) context.addIssue({ code: "custom", message: "Una política aplicada debe acreditar una revisión confirmada." });
  if (ack.actions_used > ack.max_actions || ack.consultations_used > ack.max_consultations) context.addIssue({ code: "custom", message: "El recibo excede los límites de la política." });
  if (ack.allow_input && ack.gui_effects_unknown !== true) context.addIssue({ code: "custom", message: "El recibo no declara el alcance de la entrada de ratón y teclado." });
  if (!ack.applied && (ack.mode !== "supervised" || ack.allow_input || ack.allow_browser || ack.allow_apps || ack.revision !== 0 || ack.actions_used !== 0 || ack.consultations_used !== 0 || ack.max_actions !== DEFAULT_COMPUTER_AUTHORIZATION.maxActions || ack.max_consultations !== DEFAULT_COMPUTER_AUTHORIZATION.maxConsultations || ack.gui_effects_unknown || ack.outcome_unknown)) context.addIssue({ code: "custom", message: "Una política no aplicada sólo puede declarar el estado inicial sin permisos adicionales." });
});
export type ComputerAuthorizationAck = {
  applied: true; chatId: string; kittyId: string; binding: string; mode: ComputerAuthorizationMode; revision: number;
  allowInput: boolean; allowBrowser: boolean; allowApps: boolean;
  maxActions: number; maxConsultations: number; actionsUsed: number; consultationsUsed: number; guiEffectsUnknown: boolean; outcomeUnknown: false;
};
export type ComputerAuthorizationAckScope = { chatId: string; kittyId: string; binding: string };
export type ComputerAuthorizationSnapshot = Omit<ComputerAuthorizationAck, "applied" | "outcomeUnknown"> & { applied: boolean; outcomeUnknown: boolean };
export type ExpectedComputerAuthorizationAck = ComputerAuthorizationAckScope & Pick<ComputerAuthorizationAck, "mode" | "revision" | "allowInput" | "allowBrowser" | "allowApps" | "maxActions" | "maxConsultations">;

/** The caller must derive this opaque binding from its current owner/workspace
 * and verify the native capability separately. A prompt is never an ACK. */
export function normalizeComputerAuthorizationSnapshot(value: unknown, expected: ComputerAuthorizationAckScope): ComputerAuthorizationSnapshot | null {
  const result = nativeSnapshotSchema.safeParse(value);
  if (!result.success || !identifierSchema.safeParse(expected.chatId).success || !identifierSchema.safeParse(expected.kittyId).success || !bindingSchema.safeParse(expected.binding).success) return null;
  const ack = result.data;
  if (ack.chat_id !== expected.chatId || ack.kitty !== expected.kittyId || ack.binding !== expected.binding) return null;
  return { applied: ack.applied, chatId: ack.chat_id, kittyId: ack.kitty, binding: ack.binding, mode: ack.mode, revision: ack.revision, allowInput: ack.allow_input, allowBrowser: ack.allow_browser, allowApps: ack.allow_apps, maxActions: ack.max_actions, maxConsultations: ack.max_consultations, actionsUsed: ack.actions_used, consultationsUsed: ack.consultations_used, guiEffectsUnknown: ack.gui_effects_unknown === true, outcomeUnknown: ack.outcome_unknown };
}
export function normalizeComputerAuthorizationAck(value: unknown, expected: ComputerAuthorizationAckScope): ComputerAuthorizationAck | null {
  const snapshot = normalizeComputerAuthorizationSnapshot(value, expected);
  return snapshot?.applied && !snapshot.outcomeUnknown ? { ...snapshot, applied: true, outcomeUnknown: false } : null;
}
export function validateComputerAuthorizationAck(value: unknown, expected: ExpectedComputerAuthorizationAck): boolean {
  const ack = normalizeComputerAuthorizationAck(value, expected);
  return Boolean(ack && ack.mode === expected.mode && ack.revision === expected.revision && ack.allowInput === expected.allowInput && ack.allowBrowser === expected.allowBrowser && ack.allowApps === expected.allowApps && ack.maxActions === expected.maxActions && ack.maxConsultations === expected.maxConsultations);
}

export function computerAuthorizationModePresentation(mode: ComputerAuthorizationMode) {
  switch (mode) {
    case "supervised": return { label: "Supervisar cada acción", description: "Consulta antes de las acciones que pueden cambiar el escritorio.", recommended: false };
    case "intelligent": return { label: "Consultas inteligentes", description: "Avanza con lecturas verificadas y consulta antes de acciones con efecto desconocido.", recommended: true };
    case "autonomous": return { label: "Trabajo autónomo", description: "Usa únicamente las categorías que autorices para este escritorio y conserva sus límites.", recommended: false };
  }
}
