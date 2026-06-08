import { describe, it, expect } from "vitest";
import { getProductionData, getFinancials, getBlockers, getLines, getWorkOrders } from "./insights";
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

describe("getBlockers gating", () => {
  it("denies the cutting role (blockers are sewing/finishing data)", async () => {
    const sb = fakeSupabase({});
    const out = await getBlockers(ctx("cutting", sb), {});
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

describe("getLines", () => {
  it("denies a cutting role (lines tool is sewing-only)", async () => {
    const sb = fakeSupabase({});
    const out = await getLines(ctx("cutting", sb), {});
    expect(out.toLowerCase()).toContain("don't have access");
  });
  it("answers for an admin", async () => {
    const sb = fakeSupabase({ lines: [], sewing_actuals: [], sewing_targets: [] });
    const out = await getLines(ctx("admin", sb), {});
    expect(typeof out).toBe("string");
  });
});

describe("getWorkOrders", () => {
  it("denies a storage role", async () => {
    const sb = fakeSupabase({});
    const out = await getWorkOrders(ctx("storage", sb), {});
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

import { comparePeriods, findAnomalies } from "./insights";

describe("comparePeriods", () => {
  it("reports the delta between two windows for an admin", async () => {
    // Builder returns different rows per call via a queue.
    let call = 0;
    const sb: any = {
      from() {
        const b: any = {
          select() { return b; }, eq() { return b; }, gte() { return b; }, lte() { return b; },
          then(resolve: any) {
            call += 1;
            const data = call === 1
              ? [{ good_today: 100 }, { good_today: 50 }]   // period A = 150
              : [{ good_today: 80 }, { good_today: 40 }];   // period B = 120
            return resolve({ data, error: null });
          },
        };
        return b;
      },
    };
    const out = await comparePeriods(ctx("admin", sb), {
      metric: "sewing_good",
      period_a_start: "2026-06-01", period_a_end: "2026-06-01",
      period_b_start: "2026-05-25", period_b_end: "2026-05-25",
    });
    expect(out).toContain("150");
    expect(out).toContain("120");
  });

  it("denies storage role", async () => {
    const out = await comparePeriods(ctx("storage", fakeSupabase({})), { metric: "sewing_good", period_a_start: "2026-06-01", period_a_end: "2026-06-01", period_b_start: "2026-05-25", period_b_end: "2026-05-25" });
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

describe("findAnomalies", () => {
  it("flags a line behind target", async () => {
    const sb = fakeSupabase({
      lines: [{ id: "l1", line_id: "A", name: "Line A", is_active: true }],
      sewing_actuals: [{ line_id: "l1", good_today: 200 }],
      sewing_targets: [{ line_id: "l1", per_hour_target: 100 }], // daily target 800 → 25%
    });
    const out = await findAnomalies(ctx("admin", sb), {});
    expect(out.toLowerCase()).toContain("line a");
  });
});
