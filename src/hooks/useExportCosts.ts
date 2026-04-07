import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportCost {
  id: string;
  factory_id: string;
  work_order_id: string | null;
  contract_id: string | null;
  lc_id: string | null;
  shipment_ref: string | null;
  category: string;
  description: string;
  vendor_name: string | null;
  amount: number;
  currency: string;
  exchange_rate: number;
  date_incurred: string;
  payment_status: "unpaid" | "paid" | "partial";
  payment_date: string | null;
  payment_reference: string | null;
  invoice_ref: string | null;
  bl_number: string | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ExportCostInsert = Omit<
  ExportCost,
  "id" | "factory_id" | "created_by" | "created_at" | "updated_at"
>;

// ── Fetch hook ──────────────────────────────────────────────────────────────

export interface ExportCostFilters {
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  workOrderId?: string;
  lcId?: string;
  paymentStatus?: string;
}

export function useExportCosts(filters?: ExportCostFilters) {
  const { factory } = useAuth();
  const [costs, setCosts] = useState<ExportCost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    let query = supabase
      .from("export_costs" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .order("date_incurred", { ascending: false });

    if (filters?.category) {
      query = query.eq("category", filters.category);
    }
    if (filters?.dateFrom) {
      query = query.gte("date_incurred", filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte("date_incurred", filters.dateTo);
    }
    if (filters?.workOrderId) {
      query = query.eq("work_order_id", filters.workOrderId);
    }
    if (filters?.lcId) {
      query = query.eq("lc_id", filters.lcId);
    }
    if (filters?.paymentStatus) {
      query = query.eq("payment_status", filters.paymentStatus);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Failed to load export costs", { description: error.message });
    } else {
      setCosts((data as unknown as ExportCost[]) ?? []);
    }
    setLoading(false);
  }, [factory?.id, filters?.category, filters?.dateFrom, filters?.dateTo, filters?.workOrderId, filters?.lcId, filters?.paymentStatus]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { costs, loading, refetch: fetch };
}

// ── Mutations hook ──────────────────────────────────────────────────────────

export function useExportCostMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  const createCost = useCallback(
    async (fields: ExportCostInsert): Promise<ExportCost | null> => {
      if (!factory?.id) {
        toast.error("No factory selected");
        return null;
      }
      setSaving(true);
      const payload = {
        ...fields,
        factory_id: factory.id,
        created_by: profile?.id ?? null,
        // Convert empty string UUIDs to null
        work_order_id: fields.work_order_id || null,
        contract_id: fields.contract_id || null,
        lc_id: fields.lc_id || null,
      };

      const { data, error } = await supabase
        .from("export_costs" as any)
        .insert(payload)
        .select("*")
        .single();

      setSaving(false);
      if (error) {
        toast.error("Failed to create export cost", { description: error.message });
        return null;
      }
      toast.success("Export cost created");
      return data as unknown as ExportCost;
    },
    [factory?.id, profile?.id]
  );

  const updateCost = useCallback(
    async (id: string, fields: Partial<ExportCostInsert>): Promise<boolean> => {
      setSaving(true);
      // Convert empty string UUIDs to null
      const payload: Record<string, any> = { ...fields };
      if ("work_order_id" in payload) payload.work_order_id = payload.work_order_id || null;
      if ("contract_id" in payload) payload.contract_id = payload.contract_id || null;
      if ("lc_id" in payload) payload.lc_id = payload.lc_id || null;

      const { error } = await supabase
        .from("export_costs" as any)
        .update(payload)
        .eq("id", id);

      setSaving(false);
      if (error) {
        toast.error("Failed to update export cost", { description: error.message });
        return false;
      }
      toast.success("Export cost updated");
      return true;
    },
    []
  );

  const updatePaymentStatus = useCallback(
    async (
      id: string,
      status: "unpaid" | "paid" | "partial",
      paymentDate?: string,
      paymentRef?: string
    ): Promise<boolean> => {
      setSaving(true);
      const payload: Record<string, any> = { payment_status: status };
      if (status === "paid" || status === "partial") {
        payload.payment_date = paymentDate || new Date().toISOString().slice(0, 10);
        if (paymentRef) payload.payment_reference = paymentRef;
      } else {
        payload.payment_date = null;
        payload.payment_reference = null;
      }

      const { error } = await supabase
        .from("export_costs" as any)
        .update(payload)
        .eq("id", id);

      setSaving(false);
      if (error) {
        toast.error("Failed to update payment status", { description: error.message });
        return false;
      }
      toast.success(`Payment status updated to ${status}`);
      return true;
    },
    []
  );

  const deleteCost = useCallback(async (id: string): Promise<boolean> => {
    setSaving(true);
    const { error } = await supabase
      .from("export_costs" as any)
      .delete()
      .eq("id", id);

    setSaving(false);
    if (error) {
      toast.error("Failed to delete export cost", { description: error.message });
      return false;
    }
    toast.success("Export cost deleted");
    return true;
  }, []);

  return { createCost, updateCost, updatePaymentStatus, deleteCost, saving };
}

// ── Summary hook ────────────────────────────────────────────────────────────

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface PaymentSummary {
  paid: number;
  unpaid: number;
  partial: number;
}

export interface MonthlyTotal {
  month: string;
  total: number;
}

export interface POTotal {
  workOrderId: string;
  poNumber: string;
  total: number;
}

export function useExportCostSummary() {
  const { factory } = useAuth();
  const [costs, setCosts] = useState<ExportCost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("export_costs" as any)
      .select("*")
      .eq("factory_id", factory.id);

    if (error) {
      toast.error("Failed to load cost summary", { description: error.message });
    } else {
      setCosts((data as unknown as ExportCost[]) ?? []);
    }
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const categoryTotals = useMemo<CategoryTotal[]>(() => {
    const map: Record<string, number> = {};
    for (const c of costs) {
      const converted = c.amount * (c.exchange_rate || 1);
      map[c.category] = (map[c.category] || 0) + converted;
    }
    return Object.entries(map)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [costs]);

  const paymentSummary = useMemo<PaymentSummary>(() => {
    const s: PaymentSummary = { paid: 0, unpaid: 0, partial: 0 };
    for (const c of costs) {
      const converted = c.amount * (c.exchange_rate || 1);
      if (c.payment_status === "paid") s.paid += converted;
      else if (c.payment_status === "partial") s.partial += converted;
      else s.unpaid += converted;
    }
    return s;
  }, [costs]);

  const monthlyTotals = useMemo<MonthlyTotal[]>(() => {
    const now = new Date();
    const months: MonthlyTotal[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      let total = 0;
      for (const c of costs) {
        if (c.date_incurred.startsWith(key)) {
          total += c.amount * (c.exchange_rate || 1);
        }
      }
      months.push({ month: label, total });
    }
    return months;
  }, [costs]);

  const poTotals = useMemo<POTotal[]>(() => {
    const map: Record<string, number> = {};
    for (const c of costs) {
      if (c.work_order_id) {
        const converted = c.amount * (c.exchange_rate || 1);
        map[c.work_order_id] = (map[c.work_order_id] || 0) + converted;
      }
    }
    return Object.entries(map)
      .map(([workOrderId, total]) => ({ workOrderId, poNumber: workOrderId, total }))
      .sort((a, b) => b.total - a.total);
  }, [costs]);

  const grandTotal = useMemo(() => {
    return costs.reduce((sum, c) => sum + c.amount * (c.exchange_rate || 1), 0);
  }, [costs]);

  return { categoryTotals, paymentSummary, monthlyTotals, poTotals, grandTotal, loading, refetch: fetch };
}
