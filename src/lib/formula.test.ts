import { describe, it, expect } from "vitest";
import { evaluateFormula, extractRefs, isValidFormula } from "./formula";

describe("formula evaluator", () => {
  it("evaluates basic arithmetic with field references", () => {
    expect(evaluateFormula("a * b", { a: 3, b: 4 })).toBe(12);
    expect(evaluateFormula("a / b * 100", { a: 80, b: 100 })).toBe(80);
    expect(evaluateFormula("(a + b) * c", { a: 1, b: 2, c: 3 })).toBe(9);
    expect(evaluateFormula("a - b", { a: 5, b: 8 })).toBe(-3);
  });
  it("rounds to 2 decimals", () => {
    expect(evaluateFormula("a / b * 100", { a: 1, b: 3 })).toBe(33.33);
  });
  it("coerces numeric strings (form inputs arrive as strings)", () => {
    expect(evaluateFormula("a * b", { a: "3", b: "4" })).toBe(12);
  });
  it("returns null when a referenced field is empty or missing", () => {
    expect(evaluateFormula("a * b", { a: 3, b: "" })).toBe(null);
    expect(evaluateFormula("a * b", { a: 3 })).toBe(null);
    expect(evaluateFormula("a * b", { a: 3, b: "abc" })).toBe(null);
  });
  it("returns null on divide-by-zero", () => {
    expect(evaluateFormula("a / b", { a: 5, b: 0 })).toBe(null);
  });
  it("rejects malformed or unsafe input", () => {
    expect(evaluateFormula("a +", { a: 1 })).toBe(null);
    expect(evaluateFormula("a b", { a: 1, b: 2 })).toBe(null);
    expect(evaluateFormula("alert(1)", {})).toBe(null);
    expect(evaluateFormula("", {})).toBe(null);
  });
  it("isValidFormula checks structure only", () => {
    expect(isValidFormula("a * b + 2")).toBe(true);
    expect(isValidFormula("(a + b)")).toBe(true);
    expect(isValidFormula("a *")).toBe(false);
    expect(isValidFormula("a b")).toBe(false);
    expect(isValidFormula("")).toBe(false);
  });
  it("extractRefs lists distinct identifiers", () => {
    expect(extractRefs("a * b + a / c").sort()).toEqual(["a", "b", "c"]);
    expect(extractRefs("2 * 3")).toEqual([]);
  });
});
