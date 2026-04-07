import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FabricRow {
  id: string;
  cost_sheet_id: string;
  fabric_type: string;
  description: string | null;
  composition: string | null;
  construction: string | null;
  gsm: number | null;
  width: number | null;
  consumption_per_dozen: number | null;
  consumption_unit: string;
  wastage_pct: number;
  marker_efficiency: number | null;
  price_per_unit: number;
  price_unit: string;
  currency: string;
  exchange_rate: number;
  source: string | null;
  supplier_name: string | null;
  greige_cost: number | null;
  dyeing_finishing_cost: number | null;
  sort_order: number;
}

export interface TrimRow {
  id: string;
  cost_sheet_id: string;
  category: string;
  item_name: string;
  description: string | null;
  qty_per_garment: number | null;
  unit_of_measure: string | null;
  unit_price: number;
  currency: string;
  exchange_rate: number;
  supplier_name: string | null;
  is_buyer_supplied: boolean;
  specifications: string | null;
  sort_order: number;
}

export interface ProcessRow {
  id: string;
  cost_sheet_id: string;
  category: string;
  process_name: string;
  description: string | null;
  placement: string | null;
  cost_per_piece: number;
  currency: string;
  exchange_rate: number;
  supplier_name: string | null;
  is_outsourced: boolean;
  sort_order: number;
}

export interface CommercialRow {
  id: string;
  cost_sheet_id: string;
  category: string;
  item_name: string;
  description: string | null;
  cost_type: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  sort_order: number;
}

export interface CmRow {
  id: string;
  cost_sheet_id: string;
  cm_per_dozen: number | null;
  sam: number | null;
  efficiency_pct: number | null;
  labour_cost_per_minute: number | null;
  overhead_type: string;
  overhead_value: number;
}

export interface CostSheet {
  id: string;
  factory_id: string;
  buyer_name: string;
  style_ref: string;
  style_description: string | null;
  garment_type: string | null;
  fabric_composition: string | null;
  gsm: number | null;
  target_quantity: number | null;
  buyer_target_price: number | null;
  target_price_type: string;
  season: string | null;
  program_name: string | null;
  currency: string;
  exchange_rate: number;
  quoted_price: number | null;
  desired_margin_pct: number | null;
  work_order_id: string | null;
  is_template: boolean;
  template_name: string | null;
  status: "draft" | "submitted" | "approved" | "sent" | "accepted" | "rejected";
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Nested data (when fetched with relations)
  cost_sheet_fabrics?: FabricRow[];
  cost_sheet_trims?: TrimRow[];
  cost_sheet_processes?: ProcessRow[];
  cost_sheet_commercial?: CommercialRow[];
  cost_sheet_cm?: CmRow[];
}

export type CostSheetInsert = Omit<
  CostSheet,
  | "id"
  | "factory_id"
  | "created_at"
  | "updated_at"
  | "cost_sheet_fabrics"
  | "cost_sheet_trims"
  | "cost_sheet_processes"
  | "cost_sheet_commercial"
  | "cost_sheet_cm"
>;

export type FabricInsert = Omit<FabricRow, "id" | "cost_sheet_id"> & { sort_order?: number };
export type TrimInsert = Omit<TrimRow, "id" | "cost_sheet_id"> & { sort_order?: number };
export type ProcessInsert = Omit<ProcessRow, "id" | "cost_sheet_id"> & { sort_order?: number };
export type CommercialInsert = Omit<CommercialRow, "id" | "cost_sheet_id"> & { sort_order?: number };
export type CmInsert = Omit<CmRow, "id" | "cost_sheet_id">;

// ── Pure calculation ─────────────────────────────────────────────────────────

export function calcCostSheetTotals(
  costSheet: CostSheet,
  baseCurrency: string,
  baseExchangeRate: number
) {
  const toBase = (amount: number, rowCurrency: string, rowExRate: number) => {
    if (rowCurrency === baseCurrency) return amount;
    // Convert row currency → USD → base currency
    const usd = amount / rowExRate;
    return usd * baseExchangeRate;
  };

  // Fabric cost per dozen
  const fabricCostDz = (costSheet.cost_sheet_fabrics ?? []).reduce((sum, f) => {
    const consumption = f.consumption_per_dozen ?? 0;
    const wastageMultiplier = 1 + (f.wastage_pct ?? 0) / 100;
    const raw = consumption * f.price_per_unit * wastageMultiplier;
    return sum + toBase(raw, f.currency, f.exchange_rate);
  }, 0);

  // Trims cost per dozen (exclude buyer-supplied)
  const trimsCostDz = (costSheet.cost_sheet_trims ?? []).reduce((sum, t) => {
    if (t.is_buyer_supplied) return sum;
    const raw = (t.qty_per_garment ?? 0) * 12 * t.unit_price;
    return sum + toBase(raw, t.currency, t.exchange_rate);
  }, 0);

  // CM per dozen
  const cmRow = (costSheet.cost_sheet_cm ?? [])[0];
  let cmCostDz = 0;
  if (cmRow) {
    if (cmRow.cm_per_dozen != null) {
      cmCostDz = cmRow.cm_per_dozen;
    } else if (cmRow.sam != null && cmRow.labour_cost_per_minute != null) {
      const eff = (cmRow.efficiency_pct ?? 100) / 100;
      cmCostDz = (cmRow.labour_cost_per_minute * cmRow.sam) / eff * 12;
    }
    // Add overhead
    if (cmRow.overhead_type === "percentage") {
      cmCostDz = cmCostDz * (1 + cmRow.overhead_value / 100);
    } else {
      // flat per dozen
      cmCostDz = cmCostDz + cmRow.overhead_value;
    }
  }

  // Process cost per dozen
  const processCostDz = (costSheet.cost_sheet_processes ?? []).reduce((sum, p) => {
    const raw = p.cost_per_piece * 12;
    return sum + toBase(raw, p.currency, p.exchange_rate);
  }, 0);

  // Commercial cost per dozen
  const subtotalBeforeCommercial = fabricCostDz + trimsCostDz + cmCostDz + processCostDz;
  const targetQty = costSheet.target_quantity ?? 0;
  const dozensTotal = targetQty > 0 ? targetQty / 12 : 1;

  const commercialCostDz = (costSheet.cost_sheet_commercial ?? []).reduce((sum, c) => {
    let raw = 0;
    if (c.cost_type === "per_piece") {
      raw = c.amount * 12;
    } else if (c.cost_type === "per_shipment") {
      raw = c.amount / dozensTotal;
    } else if (c.cost_type === "percentage") {
      raw = subtotalBeforeCommercial * (c.amount / 100);
    } else {
      // default: treat as per_piece
      raw = c.amount * 12;
    }
    return sum + toBase(raw, c.currency, c.exchange_rate);
  }, 0);

  const totalCostDz = fabricCostDz + trimsCostDz + cmCostDz + processCostDz + commercialCostDz;
  const totalCostPc = totalCostDz / 12;
  const breakEvenPriceDz = totalCostDz;
  const breakEvenPricePc = totalCostPc;

  // Quoted margin
  const quotedPricePc = costSheet.quoted_price ?? 0;
  const quotedMarginPct =
    quotedPricePc > 0 ? ((quotedPricePc - totalCostPc) / quotedPricePc) * 100 : 0;

  // Buyer gap
  const buyerTargetPc =
    costSheet.buyer_target_price != null
      ? costSheet.target_price_type === "per_dozen"
        ? costSheet.buyer_target_price / 12
        : costSheet.buyer_target_price
      : null;
  const buyerGapPc = buyerTargetPc != null ? buyerTargetPc - totalCostPc : null;

  return {
    fabricCostDz,
    trimsCostDz,
    cmCostDz,
    processCostDz,
    commercialCostDz,
    totalCostDz,
    totalCostPc,
    breakEvenPriceDz,
    breakEvenPricePc,
    quotedMarginPct,
    buyerGapPc,
  };
}

// ── List ─────────────────────────────────────────────────────────────────────

export function useCostSheets() {
  const { factory } = useAuth();
  const [costSheets, setCostSheets] = useState<CostSheet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cost_sheets" as any)
      .select("*, cost_sheet_fabrics(count)")
      .eq("factory_id", factory.id)
      .eq("is_template", false)
      .order("created_at", { ascending: false });

    if (error) toast.error("Failed to load cost sheets", { description: error.message });
    else setCostSheets((data as unknown as CostSheet[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { costSheets, loading, refetch: fetch };
}

// ── Single cost sheet ────────────────────────────────────────────────────────

export function useCostSheet(id: string | undefined) {
  const [costSheet, setCostSheet] = useState<CostSheet | null>(null);
  const [loading, setLoading] = useState(!!id);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cost_sheets" as any)
      .select(
        "*, cost_sheet_fabrics(*), cost_sheet_trims(*), cost_sheet_processes(*), cost_sheet_commercial(*), cost_sheet_cm(*)"
      )
      .eq("id", id)
      .single();

    if (error) {
      toast.error("Failed to load cost sheet", { description: error.message });
      setLoading(false);
      return;
    }

    const cs = data as unknown as CostSheet;
    if (cs.cost_sheet_fabrics) {
      cs.cost_sheet_fabrics = [...cs.cost_sheet_fabrics].sort((a, b) => a.sort_order - b.sort_order);
    }
    if (cs.cost_sheet_trims) {
      cs.cost_sheet_trims = [...cs.cost_sheet_trims].sort((a, b) => a.sort_order - b.sort_order);
    }
    if (cs.cost_sheet_processes) {
      cs.cost_sheet_processes = [...cs.cost_sheet_processes].sort((a, b) => a.sort_order - b.sort_order);
    }
    if (cs.cost_sheet_commercial) {
      cs.cost_sheet_commercial = [...cs.cost_sheet_commercial].sort((a, b) => a.sort_order - b.sort_order);
    }
    setCostSheet(cs);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { costSheet, loading, refetch: fetch };
}

// ── Templates ────────────────────────────────────────────────────────────────

export function useCostSheetTemplates() {
  const { factory } = useAuth();
  const [templates, setTemplates] = useState<CostSheet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!factory?.id) return;
    setLoading(true);
    supabase
      .from("cost_sheets" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .eq("is_template", true)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load templates", { description: error.message });
        else setTemplates((data as unknown as CostSheet[]) ?? []);
        setLoading(false);
      });
  }, [factory?.id]);

  return { templates, loading };
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useCostSheetMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function createCostSheet(
    header: Omit<CostSheetInsert, "created_by">,
    fabrics: FabricInsert[] = [],
    trims: TrimInsert[] = [],
    processes: ProcessInsert[] = [],
    commercial: CommercialInsert[] = [],
    cm?: CmInsert
  ): Promise<CostSheet | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      const { data: cs, error: csErr } = await supabase
        .from("cost_sheets" as any)
        .insert({
          ...(header as any),
          factory_id: factory.id,
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (csErr) throw csErr;

      const costSheetId = (cs as any).id as string;

      if (fabrics.length > 0) {
        const { error } = await supabase.from("cost_sheet_fabrics" as any).insert(
          fabrics.map((f, i) => ({ ...f, cost_sheet_id: costSheetId, sort_order: f.sort_order ?? i }))
        );
        if (error) throw error;
      }
      if (trims.length > 0) {
        const { error } = await supabase.from("cost_sheet_trims" as any).insert(
          trims.map((t, i) => ({ ...t, cost_sheet_id: costSheetId, sort_order: t.sort_order ?? i }))
        );
        if (error) throw error;
      }
      if (processes.length > 0) {
        const { error } = await supabase.from("cost_sheet_processes" as any).insert(
          processes.map((p, i) => ({ ...p, cost_sheet_id: costSheetId, sort_order: p.sort_order ?? i }))
        );
        if (error) throw error;
      }
      if (commercial.length > 0) {
        const { error } = await supabase.from("cost_sheet_commercial" as any).insert(
          commercial.map((c, i) => ({ ...c, cost_sheet_id: costSheetId, sort_order: c.sort_order ?? i }))
        );
        if (error) throw error;
      }
      if (cm) {
        const { error } = await supabase.from("cost_sheet_cm" as any).insert({
          ...cm,
          cost_sheet_id: costSheetId,
        });
        if (error) throw error;
      }

      toast.success("Cost sheet created");
      return cs as unknown as CostSheet;
    } catch (e: any) {
      toast.error("Failed to create cost sheet", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateCostSheet(
    id: string,
    header: Partial<CostSheetInsert>,
    fabrics?: FabricInsert[],
    trims?: TrimInsert[],
    processes?: ProcessInsert[],
    commercial?: CommercialInsert[],
    cm?: CmInsert
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error: csErr } = await supabase
        .from("cost_sheets" as any)
        .update(header as any)
        .eq("id", id);
      if (csErr) throw csErr;

      if (fabrics !== undefined) {
        await supabase.from("cost_sheet_fabrics" as any).delete().eq("cost_sheet_id", id);
        if (fabrics.length > 0) {
          const { error } = await supabase.from("cost_sheet_fabrics" as any).insert(
            fabrics.map((f, i) => ({ ...f, cost_sheet_id: id, sort_order: f.sort_order ?? i }))
          );
          if (error) throw error;
        }
      }
      if (trims !== undefined) {
        await supabase.from("cost_sheet_trims" as any).delete().eq("cost_sheet_id", id);
        if (trims.length > 0) {
          const { error } = await supabase.from("cost_sheet_trims" as any).insert(
            trims.map((t, i) => ({ ...t, cost_sheet_id: id, sort_order: t.sort_order ?? i }))
          );
          if (error) throw error;
        }
      }
      if (processes !== undefined) {
        await supabase.from("cost_sheet_processes" as any).delete().eq("cost_sheet_id", id);
        if (processes.length > 0) {
          const { error } = await supabase.from("cost_sheet_processes" as any).insert(
            processes.map((p, i) => ({ ...p, cost_sheet_id: id, sort_order: p.sort_order ?? i }))
          );
          if (error) throw error;
        }
      }
      if (commercial !== undefined) {
        await supabase.from("cost_sheet_commercial" as any).delete().eq("cost_sheet_id", id);
        if (commercial.length > 0) {
          const { error } = await supabase.from("cost_sheet_commercial" as any).insert(
            commercial.map((c, i) => ({ ...c, cost_sheet_id: id, sort_order: c.sort_order ?? i }))
          );
          if (error) throw error;
        }
      }
      if (cm !== undefined) {
        await supabase.from("cost_sheet_cm" as any).delete().eq("cost_sheet_id", id);
        const { error } = await supabase.from("cost_sheet_cm" as any).insert({
          ...cm,
          cost_sheet_id: id,
        });
        if (error) throw error;
      }

      toast.success("Cost sheet updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update cost sheet", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function duplicateCostSheet(
    id: string,
    newName: string
  ): Promise<CostSheet | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      // Fetch original with all relations
      const { data: original, error: fetchErr } = await supabase
        .from("cost_sheets" as any)
        .select(
          "*, cost_sheet_fabrics(*), cost_sheet_trims(*), cost_sheet_processes(*), cost_sheet_commercial(*), cost_sheet_cm(*)"
        )
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const src = original as unknown as CostSheet;

      // Build header without id/timestamps/nested
      const {
        id: _id,
        factory_id: _fid,
        created_at: _ca,
        updated_at: _ua,
        cost_sheet_fabrics: _f,
        cost_sheet_trims: _t,
        cost_sheet_processes: _p,
        cost_sheet_commercial: _c,
        cost_sheet_cm: _cm,
        ...headerFields
      } = src;

      const { data: newCs, error: insErr } = await supabase
        .from("cost_sheets" as any)
        .insert({
          ...headerFields,
          factory_id: factory.id,
          style_description: newName,
          status: "draft",
          created_by: profile?.id ?? null,
          approved_by: null,
          approved_at: null,
        } as any)
        .select()
        .single();
      if (insErr) throw insErr;

      const newId = (newCs as any).id as string;

      // Copy child rows
      if (src.cost_sheet_fabrics && src.cost_sheet_fabrics.length > 0) {
        const { error } = await supabase.from("cost_sheet_fabrics" as any).insert(
          src.cost_sheet_fabrics.map(({ id: _rid, cost_sheet_id: _csid, ...rest }) => ({
            ...rest,
            cost_sheet_id: newId,
          }))
        );
        if (error) throw error;
      }
      if (src.cost_sheet_trims && src.cost_sheet_trims.length > 0) {
        const { error } = await supabase.from("cost_sheet_trims" as any).insert(
          src.cost_sheet_trims.map(({ id: _rid, cost_sheet_id: _csid, ...rest }) => ({
            ...rest,
            cost_sheet_id: newId,
          }))
        );
        if (error) throw error;
      }
      if (src.cost_sheet_processes && src.cost_sheet_processes.length > 0) {
        const { error } = await supabase.from("cost_sheet_processes" as any).insert(
          src.cost_sheet_processes.map(({ id: _rid, cost_sheet_id: _csid, ...rest }) => ({
            ...rest,
            cost_sheet_id: newId,
          }))
        );
        if (error) throw error;
      }
      if (src.cost_sheet_commercial && src.cost_sheet_commercial.length > 0) {
        const { error } = await supabase.from("cost_sheet_commercial" as any).insert(
          src.cost_sheet_commercial.map(({ id: _rid, cost_sheet_id: _csid, ...rest }) => ({
            ...rest,
            cost_sheet_id: newId,
          }))
        );
        if (error) throw error;
      }
      if (src.cost_sheet_cm && src.cost_sheet_cm.length > 0) {
        const { error } = await supabase.from("cost_sheet_cm" as any).insert(
          src.cost_sheet_cm.map(({ id: _rid, cost_sheet_id: _csid, ...rest }) => ({
            ...rest,
            cost_sheet_id: newId,
          }))
        );
        if (error) throw error;
      }

      toast.success("Cost sheet duplicated");
      return newCs as unknown as CostSheet;
    } catch (e: any) {
      toast.error("Failed to duplicate cost sheet", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: CostSheet["status"]): Promise<boolean> {
    const update: any = { status };
    if (status === "approved" && profile?.id) {
      update.approved_by = profile.id;
      update.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("cost_sheets" as any).update(update).eq("id", id);
    if (error) { toast.error("Failed to update status"); return false; }
    toast.success(`Marked as ${status}`);
    return true;
  }

  async function deleteCostSheet(id: string): Promise<boolean> {
    const { error } = await supabase.from("cost_sheets" as any).delete().eq("id", id);
    if (error) { toast.error("Failed to delete cost sheet"); return false; }
    toast.success("Cost sheet deleted");
    return true;
  }

  return {
    createCostSheet,
    updateCostSheet,
    duplicateCostSheet,
    updateStatus,
    deleteCostSheet,
    saving,
  };
}
