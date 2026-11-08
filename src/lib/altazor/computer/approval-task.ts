import { computerUserMessagePresentation } from "./presentation";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Recover the user's goal from the structural approval reference, never from
 * connector output or its instructions. Ambiguity disables automatic resume. */
export function originalTaskForApproval(turns: readonly Record<string, unknown>[], approvalId: string, expectedKittyId?: string): string | null {
  if (!approvalId || turns.length > 10_000 || expectedKittyId !== undefined && !expectedKittyId) return null;
  const references: number[] = [];
  let latestUser = -1;
  for (let index = 0; index < turns.length; index++) {
    const turn = turns[index];
    if (turn.from === "user") latestUser = index;
    if (!Array.isArray(turn.approvals)) continue;
    for (const approval of turn.approvals) if (record(approval) && approval.id === approvalId) references.push(index);
  }
  if (references.length !== 1) return null;
  const approvalIndex = references[0], approvalTurn = turns[approvalIndex];
  if (typeof approvalTurn.from !== "string" || !approvalTurn.from || ["user", "system", "approval"].includes(approvalTurn.from)) return null;
  // Native turn.from is the assistant's display name, while turn.kitty pins its
  // immutable identity. Production callers always supply the validated kitty.
  if (expectedKittyId !== undefined && approvalTurn.kitty !== expectedKittyId) return null;
  let precedingUser = -1;
  for (let index = approvalIndex - 1; index >= 0; index--) if (turns[index].from === "user") { precedingUser = index; break; }
  if (precedingUser < 0 || precedingUser !== latestUser) return null;
  const text = turns[precedingUser].text;
  if (typeof text !== "string") return null;
  const task = computerUserMessagePresentation(text).text;
  return task.trim() && task.length <= 15_000 ? task : null;
}
