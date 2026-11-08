import { digest } from "@/lib/personal-connectors/core";
import type { ComputerTurn } from "./types";

/** Turn.Text is the initial plan in Kitties; each live ask_help is a distinct step. */
export function computerHelpIdentity(ownerId: string, sessionId: string, turn?: ComputerTurn) {
  if (!turn || turn.from !== "assistant" || !turn.working || !turn.help || !Number.isSafeInteger(turn.help.stepIndex) || turn.help.stepIndex < 0 || !turn.help.question.trim()) return null;
  const question = turn.help.question.trim();
  const key = `computer:${sessionId}:${turn.index}:${turn.help.stepIndex}:${digest(question)}`;
  return { key, requestKey: digest(`${ownerId}:${key}`), question };
}
