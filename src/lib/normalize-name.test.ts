import { describe, it, expect } from "vitest";
import { searchNorm } from "./normalize-name";

describe("searchNorm", () => {
  it("ignores leading/trailing spaces and case", () => {
    expect(searchNorm(" PO1123 ")).toBe("po1123");
    expect(searchNorm("Bagatelle ")).toBe("bagatelle");
  });
  it("ignores inner spacing and punctuation so variants match", () => {
    expect(searchNorm("PO 1123")).toBe(searchNorm("PO1123"));
    expect(searchNorm("t shirt")).toBe(searchNorm("T-Shirt"));
    expect(searchNorm("ORD-2026-001")).toBe(searchNorm("ord 2026 001"));
  });
  it("keeps non-Latin letters (Bengali, Chinese)", () => {
    expect(searchNorm("লাইন ২")).toBe("লাইন২");
    expect(searchNorm("生产 线")).toBe("生产线");
  });
  it("handles null/undefined/empty", () => {
    expect(searchNorm(null)).toBe("");
    expect(searchNorm(undefined)).toBe("");
    expect(searchNorm("  ")).toBe("");
  });
});
