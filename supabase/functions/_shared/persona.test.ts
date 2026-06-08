import { describe, it, expect } from "vitest";
import { buildLinaSystemPrompt } from "./persona";

describe("buildLinaSystemPrompt", () => {
  it("introduces Lina by name", () => {
    const p = buildLinaSystemPrompt("admin", "en");
    expect(p).toContain("Lina");
  });

  it("includes the role boundary for a worker and the worker's role label", () => {
    const p = buildLinaSystemPrompt("worker", "en");
    expect(p).toContain("worker");
    expect(p.toLowerCase()).toContain("cannot");
  });

  it("instructs Bengali responses when language is bn", () => {
    const p = buildLinaSystemPrompt("admin", "bn");
    expect(p.toLowerCase()).toContain("bengali");
  });

  it("includes the suggested-questions block marker", () => {
    const p = buildLinaSystemPrompt("admin", "en");
    expect(p).toContain("---SUGGESTED_QUESTIONS---");
  });

  it("tells Lina to use tools for live data", () => {
    const p = buildLinaSystemPrompt("admin", "en");
    expect(p.toLowerCase()).toContain("tool");
  });
});
