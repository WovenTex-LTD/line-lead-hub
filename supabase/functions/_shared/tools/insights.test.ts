import { describe, it, expect } from "vitest";
import { getProductionData, getFinancials, getBlockers } from "./insights";
import type { ToolContext } from "./types";

// Minimal fake Supabase query builder that returns canned rows.
function fakeSupabase(rowsByTable: Record<string, any[]>) {
  const make = (table: string) => {
    const builder: any = {
      _rows: rowsByTable[table] ?? [],
      select() { return builder; },
      eq() { return builder; },
      in() { return builder; },
      ilike() { return builder; },
      order() { return builder; },
      limit() { return Promise.resolve({ data: builder._rows, error: null }); },
      single() { return Promise.resolve({ data: builder._rows[0] ?? null, error: null }); },
      then(resolve: any) { return resolve({ data: builder._rows, error: null }); },
    };
    return builder;
  };
  return { from: (t: string) => make(t) } as any;
}

function ctx(role: string, supabase: any): ToolContext {
  return {
    supabase,
    factoryId: "fac-1",
    role,
    timezone: "Asia/Dhaka",
    today: "2026-06-08",
    language: "en",
    embed: async () => new Array(1536).fill(0),
  };
}

describe("getProductionData", () => {
  it("returns a sewing summary string for an admin", async () => {
    const sb = fakeSupabase({
      sewing_actuals: [{ good_today: 100, reject_today: 2, rework_today: 1, manpower_actual: 10, cumulative_good_total: 500, lines: { name: "Line A" }, work_orders: { po_number: "PO1" } }],
    });
    const out = await getProductionData(ctx("admin", sb), { department: "sewing" });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("denies a worker asking for cutting data", async () => {
    const sb = fakeSupabase({});
    const out = await getProductionData(ctx("worker", sb), { department: "cutting" });
    expect(out.toLowerCase()).toContain("don't have access");
  });

  it("denies a storage role asking for any production data", async () => {
    const sb = fakeSupabase({});
    const out = await getProductionData(ctx("storage", sb), { department: "sewing" });
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

describe("getFinancials", () => {
  it("denies a non-admin/owner", async () => {
    const sb = fakeSupabase({});
    const out = await getFinancials(ctx("worker", sb), {});
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

describe("getBlockers", () => {
  it("returns a blockers summary for a worker", async () => {
    const sb = fakeSupabase({ production_updates_sewing: [], production_updates_finishing: [] });
    const out = await getBlockers(ctx("worker", sb), {});
    expect(typeof out).toBe("string");
  });
});
