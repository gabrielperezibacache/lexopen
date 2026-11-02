import type { HearingNoteView } from "./types";

export type HearingPromotionTarget = "fact" | "note" | "writing";
export type HearingPromotionPreview = {
  source: Extract<HearingNoteView, { available: true }>;
  targets: Record<HearingPromotionTarget, { available: boolean; reason: string | null }>;
  warnings: string[];
};
export type HearingPromotionResult = {
  target: HearingPromotionTarget; id: string; href: string; reused: boolean; warnings: string[];
};
