import { describe, expect, it } from "vitest";
import { extractJson } from "./parse";

describe("extractJson", () => {
  it("parses bare JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses fenced JSON", () => {
    expect(extractJson('```json\n{"tramites":[]}\n```')).toEqual({ tramites: [] });
  });

  it("recovers object from prose", () => {
    expect(extractJson('Aquí va: {"ok":true} fin')).toEqual({ ok: true });
  });

  it("returns null on garbage", () => {
    expect(extractJson("sin json")).toBeNull();
  });
});
