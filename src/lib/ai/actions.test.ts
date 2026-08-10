import { describe, expect, it } from "vitest";
import {
  AI_ACTIONS,
  AI_ACTION_META,
  demoForAction,
  isAiActionId,
  parseActionResult,
} from "./actions";

describe("ai actions catalog", () => {
  it("lists unique actions with metadata", () => {
    expect(new Set(AI_ACTIONS).size).toBe(AI_ACTIONS.length);
    for (const id of AI_ACTIONS) {
      expect(AI_ACTION_META[id].id).toBe(id);
      expect(AI_ACTION_META[id].label.length).toBeGreaterThan(2);
    }
  });

  it("validates action ids", () => {
    expect(isAiActionId("causa.resumen")).toBe(true);
    expect(isAiActionId("no.existe")).toBe(false);
  });

  it("parses demo JSON actions", () => {
    const raw = demoForAction("plazo.sugerir");
    const parsed = parseActionResult("plazo.sugerir", raw);
    expect(parsed.data).toBeTruthy();
    const data = parsed.data as { plazos: unknown[] };
    expect(Array.isArray(data.plazos)).toBe(true);
    expect(data.plazos.length).toBeGreaterThan(0);
  });

  it("keeps markdown for non-json actions", () => {
    const raw = demoForAction("causa.resumen", "prueba");
    const parsed = parseActionResult("causa.resumen", raw);
    expect(parsed.data).toBeNull();
    expect(parsed.content).toContain("Estado actual");
  });
});
