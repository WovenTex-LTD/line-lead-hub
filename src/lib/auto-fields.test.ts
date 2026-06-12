import { describe, it, expect } from "vitest";
import { resolveAutoValue } from "./auto-fields";

const ctx = { userName: "Karim S", userEmail: "k@example.com", factoryName: "WovenTex LTD" };
const now = new Date(2026, 5, 12, 14, 5); // 2026-06-12 14:05 local

describe("resolveAutoValue", () => {
  it("resolves date/time sources from the clock", () => {
    expect(resolveAutoValue("submission_date", ctx, now)).toBe("2026-06-12");
    expect(resolveAutoValue("submission_time", ctx, now)).toBe("14:05");
    expect(resolveAutoValue("submission_datetime", ctx, now)).toBe("2026-06-12 14:05");
    expect(resolveAutoValue("current_month", ctx, now)).toBe("June");
    expect(resolveAutoValue("current_year", ctx, now)).toBe("2026");
  });
  it("resolves user/factory sources from context", () => {
    expect(resolveAutoValue("user_name", ctx, now)).toBe("Karim S");
    expect(resolveAutoValue("user_email", ctx, now)).toBe("k@example.com");
    expect(resolveAutoValue("factory_name", ctx, now)).toBe("WovenTex LTD");
  });
  it("returns empty string for missing context or unknown source", () => {
    expect(resolveAutoValue("user_name", {}, now)).toBe("");
    expect(resolveAutoValue("bogus", ctx, now)).toBe("");
  });
});
