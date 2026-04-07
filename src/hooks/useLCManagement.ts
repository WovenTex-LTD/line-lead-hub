import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MasterLC {
  id: string;
  factory_id: string;
  lc_number: string;
  lc_type: string;
  buyer_name: string;
  applicant_name: string | null;
  applicant_bank_name: string | null;
  applicant_bank_swift: string | null;
  advising_bank_name: string | null;
  advising_bank_swift: string | null;
  beneficiary_bank_name: string | null;
  beneficiary_bank_branch: string | null;
  beneficiary_bank_swift: string | null;
  beneficiary_bank_account: string | null;
  currency: string;
  lc_value: number;
  tolerance_pct: number;
  issue_date: string;
  expiry_date: string;
  latest_shipment_date: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  incoterms: string | null;
  payment_terms: string | null;
  payment_type: string;
  tenor_days: number | null;
  contract_id: string | null;
  amendment_count: number;
  total_utilized: number;
  total_shipped: number;
  status: "received" | "advised" | "confirmed" | "partially_shipped" | "fully_shipped" | "expired" | "cancelled" | "closed";
  documents_required: string | null;
  special_conditions: string | null;
  notes: string | null;
  presentation_period: number;
  partial_shipment_allowed: boolean;
  transhipment_allowed: boolean;
  goods_description: string | null;
  hs_code: string | null;
  insurance_required: boolean;
  insurance_details: string | null;
  confirming_bank_name: string | null;
  confirming_bank_swift: string | null;
  expected_payment_date: string | null;
  docs_submitted_date: string | null;
  total_banking_costs: number;
  // Nested
  lc_doc_checklist?: LCDocChecklistItem[];
  lc_banking_costs?: LCBankingCost[];
  lc_discrepancies?: LCDiscrepancy[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Nested
  lc_amendments?: LCAmendment[];
  lc_shipments?: LCShipment[];
  btb_lcs?: BtbLC[];
}

export interface BtbLC {
  id: string;
  factory_id: string;
  master_lc_id: string | null;
  lc_number: string;
  supplier_name: string;
  supplier_bank_name: string | null;
  supplier_bank_swift: string | null;
  purpose: string;
  currency: string;
  lc_value: number;
  margin_pct: number;
  margin_amount: number | null;
  issue_date: string;
  expiry_date: string;
  maturity_date: string | null;
  acceptance_date: string | null;
  payment_date: string | null;
  tenor_days: number | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  status: "opened" | "docs_received" | "accepted" | "matured" | "paid" | "expired" | "cancelled";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LCAmendment {
  id: string;
  lc_id: string;
  amendment_number: number;
  amendment_date: string;
  description: string;
  value_change: number;
  new_expiry_date: string | null;
  new_shipment_date: string | null;
  changes: any;
  created_by: string | null;
  created_at: string;
}

export interface LCShipment {
  id: string;
  lc_id: string;
  shipment_number: number;
  shipment_date: string;
  bl_number: string | null;
  bl_date: string | null;
  invoice_number: string | null;
  invoice_value: number;
  quantity: number | null;
  vessel_name: string | null;
  container_number: string | null;
  docs_submitted_date: string | null;
  docs_accepted_date: string | null;
  payment_received_date: string | null;
  payment_amount: number | null;
  discrepancies: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface LCAlert {
  type: string;
  severity: string;
  lcNumber: string;
  message: string;
  date: string;
}

export interface LCDocChecklistItem {
  id: string;
  lc_id: string;
  document_name: string;
  description: string | null;
  originals_required: number;
  copies_required: number;
  special_instructions: string | null;
  status: "not_started" | "in_preparation" | "ready" | "submitted";
  completed_at: string | null;
  sort_order: number;
}

export interface LCBankingCost {
  id: string;
  lc_id: string | null;
  btb_lc_id: string | null;
  factory_id: string;
  cost_type: string;
  description: string | null;
  amount: number;
  currency: string;
  date_incurred: string;
  reference: string | null;
}

export interface LCDiscrepancy {
  id: string;
  lc_id: string;
  shipment_id: string | null;
  notice_date: string;
  discrepancy_items: any[];
  bank_charges: number;
  resolution: "buyer_authorized" | "docs_corrected" | "rejected" | "pending" | null;
  resolution_date: string | null;
  resolution_notes: string | null;
  status: "pending" | "resolved" | "rejected";
}

// ── List Master LCs ────────────────────────────────────────────────────────

export function useMasterLCs() {
  const { factory } = useAuth();
  const [lcs, setLcs] = useState<MasterLC[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("master_lcs" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .order("issue_date", { ascending: false });

    if (error) toast.error("Failed to load LCs", { description: error.message });
    else setLcs((data as unknown as MasterLC[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { lcs, loading, refetch: fetch };
}

// ── Single Master LC ───────────────────────────────────────────────────────

export function useMasterLC(id: string | undefined) {
  const [lc, setLc] = useState<MasterLC | null>(null);
  const [loading, setLoading] = useState(!!id);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("master_lcs" as any)
      .select("*, lc_amendments(*), lc_shipments(*), btb_lcs(*), lc_doc_checklist(*), lc_banking_costs(*), lc_discrepancies(*)")
      .eq("id", id)
      .single();

    if (error) {
      toast.error("Failed to load LC", { description: error.message });
      setLoading(false);
      return;
    }

    const record = data as unknown as MasterLC;
    if (record.lc_amendments) {
      record.lc_amendments = [...record.lc_amendments].sort(
        (a, b) => a.amendment_number - b.amendment_number
      );
    }
    if (record.lc_shipments) {
      record.lc_shipments = [...record.lc_shipments].sort(
        (a, b) => a.shipment_number - b.shipment_number
      );
    }
    setLc(record);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { lc, loading, refetch: fetch };
}

// ── List BTB LCs ───────────────────────────────────────────────────────────

export function useBtbLCs() {
  const { factory } = useAuth();
  const [btbLcs, setBtbLcs] = useState<BtbLC[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("btb_lcs" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .order("issue_date", { ascending: false });

    if (error) toast.error("Failed to load BTB LCs", { description: error.message });
    else setBtbLcs((data as unknown as BtbLC[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { btbLcs, loading, refetch: fetch };
}

// ── Master LC Mutations ────────────────────────────────────────────────────

export function useMasterLCMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function createLC(
    fields: Omit<
      MasterLC,
      | "id"
      | "factory_id"
      | "amendment_count"
      | "total_utilized"
      | "total_shipped"
      | "created_by"
      | "created_at"
      | "updated_at"
      | "lc_amendments"
      | "lc_shipments"
      | "btb_lcs"
    >
  ): Promise<MasterLC | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("master_lcs" as any)
        .insert({
          ...(fields as any),
          factory_id: factory.id,
          amendment_count: 0,
          total_utilized: 0,
          total_shipped: 0,
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      toast.success(`LC ${fields.lc_number} created`);
      return data as unknown as MasterLC;
    } catch (e: any) {
      toast.error("Failed to create LC", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateLC(
    id: string,
    fields: Partial<
      Omit<
        MasterLC,
        | "id"
        | "factory_id"
        | "created_at"
        | "updated_at"
        | "lc_amendments"
        | "lc_shipments"
        | "btb_lcs"
      >
    >
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("master_lcs" as any)
        .update(fields as any)
        .eq("id", id);
      if (error) throw error;

      toast.success("LC updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update LC", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(
    id: string,
    status: MasterLC["status"]
  ): Promise<boolean> {
    const { error } = await supabase
      .from("master_lcs" as any)
      .update({ status } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update status");
      return false;
    }
    toast.success(`Marked as ${status}`);
    return true;
  }

  async function deleteLC(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("master_lcs" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete LC");
      return false;
    }
    toast.success("LC deleted");
    return true;
  }

  async function addAmendment(
    lcId: string,
    fields: Omit<LCAmendment, "id" | "lc_id" | "amendment_number" | "created_by" | "created_at">
  ): Promise<boolean> {
    setSaving(true);
    try {
      // Get next amendment number
      const { data: existing } = await supabase
        .from("lc_amendments" as any)
        .select("amendment_number")
        .eq("lc_id", lcId)
        .order("amendment_number", { ascending: false })
        .limit(1);

      const nextNumber =
        existing && existing.length > 0
          ? (existing[0] as any).amendment_number + 1
          : 1;

      const { error } = await supabase
        .from("lc_amendments" as any)
        .insert({
          ...(fields as any),
          lc_id: lcId,
          amendment_number: nextNumber,
          created_by: profile?.id ?? null,
        });
      if (error) throw error;

      // Update master LC: increment amendment_count, apply value change and date changes
      const { data: lcData } = await supabase
        .from("master_lcs" as any)
        .select("amendment_count, lc_value, expiry_date, latest_shipment_date")
        .eq("id", lcId)
        .single();

      const currentCount = lcData ? (lcData as any).amendment_count ?? 0 : 0;
      const currentValue = lcData ? (lcData as any).lc_value ?? 0 : 0;
      const updateFields: Record<string, any> = {
        amendment_count: currentCount + 1,
      };

      // Apply value change if non-zero
      if (fields.value_change && fields.value_change !== 0) {
        updateFields.lc_value = currentValue + fields.value_change;
      }
      // Apply new expiry date if provided
      if (fields.new_expiry_date) {
        updateFields.expiry_date = fields.new_expiry_date;
      }
      // Apply new shipment date if provided
      if (fields.new_shipment_date) {
        updateFields.latest_shipment_date = fields.new_shipment_date;
      }

      await supabase
        .from("master_lcs" as any)
        .update(updateFields as any)
        .eq("id", lcId);

      toast.success(`Amendment #${nextNumber} added`);
      return true;
    } catch (e: any) {
      toast.error("Failed to add amendment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addShipment(
    lcId: string,
    fields: Omit<LCShipment, "id" | "lc_id" | "shipment_number" | "created_at">
  ): Promise<boolean> {
    setSaving(true);
    try {
      // Get next shipment number
      const { data: existing } = await supabase
        .from("lc_shipments" as any)
        .select("shipment_number")
        .eq("lc_id", lcId)
        .order("shipment_number", { ascending: false })
        .limit(1);

      const nextNumber =
        existing && existing.length > 0
          ? (existing[0] as any).shipment_number + 1
          : 1;

      const { error } = await supabase
        .from("lc_shipments" as any)
        .insert({
          ...(fields as any),
          lc_id: lcId,
          shipment_number: nextNumber,
        });
      if (error) throw error;

      // Update total_shipped on master LC
      const { data: shipments } = await supabase
        .from("lc_shipments" as any)
        .select("invoice_value")
        .eq("lc_id", lcId);

      const totalShipped = (shipments ?? []).reduce(
        (sum: number, s: any) => sum + (s.invoice_value ?? 0),
        0
      );
      await supabase
        .from("master_lcs" as any)
        .update({ total_shipped: totalShipped } as any)
        .eq("id", lcId);

      toast.success(`Shipment #${nextNumber} added`);
      return true;
    } catch (e: any) {
      toast.error("Failed to add shipment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    createLC,
    updateLC,
    updateStatus,
    deleteLC,
    addAmendment,
    addShipment,
    saving,
  };
}

// ── BTB LC Mutations ───────────────────────────────────────────────────────

export function useBtbLCMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function createBtbLC(
    fields: Omit<
      BtbLC,
      | "id"
      | "factory_id"
      | "created_by"
      | "created_at"
      | "updated_at"
    >
  ): Promise<BtbLC | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("btb_lcs" as any)
        .insert({
          ...(fields as any),
          factory_id: factory.id,
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // Recalculate total_utilized on linked master LC (BTB LCs only)
      if (fields.master_lc_id) {
        const { data: allBtb } = await supabase
          .from("btb_lcs" as any)
          .select("lc_value")
          .eq("master_lc_id", fields.master_lc_id)
          .not("status", "in", "('cancelled','expired')");

        const totalBtb = (allBtb ?? []).reduce((s: number, b: any) => s + (b.lc_value ?? 0), 0);

        await supabase
          .from("master_lcs" as any)
          .update({ total_utilized: totalBtb } as any)
          .eq("id", fields.master_lc_id);
      }

      toast.success(`BTB LC ${fields.lc_number} created`);
      return data as unknown as BtbLC;
    } catch (e: any) {
      toast.error("Failed to create BTB LC", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateBtbLC(
    id: string,
    fields: Partial<
      Omit<BtbLC, "id" | "factory_id" | "created_at" | "updated_at">
    >
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("btb_lcs" as any)
        .update(fields as any)
        .eq("id", id);
      if (error) throw error;

      // Recalculate total_utilized on linked master LC
      const { data: btbRecord } = await supabase
        .from("btb_lcs" as any)
        .select("master_lc_id")
        .eq("id", id)
        .single();

      const masterLcId = (btbRecord as any)?.master_lc_id;
      if (masterLcId) {
        const { data: allBtb } = await supabase
          .from("btb_lcs" as any)
          .select("lc_value")
          .eq("master_lc_id", masterLcId)
          .not("status", "in", "('cancelled','expired')");

        const totalBtb = (allBtb ?? []).reduce((s: number, b: any) => s + (b.lc_value ?? 0), 0);

        await supabase
          .from("master_lcs" as any)
          .update({ total_utilized: totalBtb } as any)
          .eq("id", masterLcId);
      }

      toast.success("BTB LC updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update BTB LC", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateBtbStatus(
    id: string,
    status: BtbLC["status"]
  ): Promise<boolean> {
    const { data: btbRecord } = await supabase
      .from("btb_lcs" as any)
      .select("master_lc_id")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("btb_lcs" as any)
      .update({ status } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update BTB LC status");
      return false;
    }

    // Recalculate total_utilized if status affects it
    const masterLcId = (btbRecord as any)?.master_lc_id;
    if (masterLcId) {
      const { data: allBtb } = await supabase
        .from("btb_lcs" as any)
        .select("lc_value")
        .eq("master_lc_id", masterLcId)
        .not("status", "in", "('cancelled','expired')");

      const totalBtb = (allBtb ?? []).reduce((s: number, b: any) => s + (b.lc_value ?? 0), 0);

      await supabase
        .from("master_lcs" as any)
        .update({ total_utilized: totalBtb } as any)
        .eq("id", masterLcId);
    }

    toast.success(`BTB LC marked as ${status}`);
    return true;
  }

  async function deleteBtbLC(id: string): Promise<boolean> {
    // Get master_lc_id before deleting
    const { data: btbRecord } = await supabase
      .from("btb_lcs" as any)
      .select("master_lc_id")
      .eq("id", id)
      .single();

    const masterLcId = (btbRecord as any)?.master_lc_id;

    const { error } = await supabase
      .from("btb_lcs" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete BTB LC");
      return false;
    }

    // Recalculate total_utilized on master LC
    if (masterLcId) {
      const { data: allBtb } = await supabase
        .from("btb_lcs" as any)
        .select("lc_value")
        .eq("master_lc_id", masterLcId)
        .not("status", "in", "('cancelled','expired')");

      const totalBtb = (allBtb ?? []).reduce((s: number, b: any) => s + (b.lc_value ?? 0), 0);

      await supabase
        .from("master_lcs" as any)
        .update({ total_utilized: totalBtb } as any)
        .eq("id", masterLcId);
    }

    toast.success("BTB LC deleted");
    return true;
  }

  return {
    createBtbLC,
    updateBtbLC,
    updateBtbStatus,
    deleteBtbLC,
    saving,
  };
}

// ── LC Alerts ──────────────────────────────────────────────────────────────

export function useLCAlerts() {
  const { factory } = useAuth();
  const [masterLcs, setMasterLcs] = useState<MasterLC[]>([]);
  const [btbLcs, setBtbLcs] = useState<BtbLC[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const [masterRes, btbRes] = await Promise.all([
      supabase
        .from("master_lcs" as any)
        .select("*")
        .eq("factory_id", factory.id)
        .not("status", "in", '("expired","cancelled","closed")'),
      supabase
        .from("btb_lcs" as any)
        .select("*")
        .eq("factory_id", factory.id)
        .not("status", "in", '("paid","expired","cancelled")'),
    ]);

    if (!masterRes.error) setMasterLcs((masterRes.data as unknown as MasterLC[]) ?? []);
    if (!btbRes.error) setBtbLcs((btbRes.data as unknown as BtbLC[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  const alerts = useMemo(() => {
    const result: LCAlert[] = [];
    const today = new Date();

    function daysUntil(dateStr: string): number {
      const target = new Date(dateStr);
      return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Expiring master LCs (within 30 days)
    for (const lc of masterLcs) {
      if (lc.expiry_date) {
        const days = daysUntil(lc.expiry_date);
        if (days >= 0 && days <= 30) {
          result.push({
            type: "lc_expiry",
            severity: days <= 7 ? "critical" : days <= 14 ? "warning" : "info",
            lcNumber: lc.lc_number,
            message: `LC ${lc.lc_number} expires in ${days} day${days !== 1 ? "s" : ""}`,
            date: lc.expiry_date,
          });
        }
      }

      // Latest shipment dates approaching (within 14 days)
      if (lc.latest_shipment_date) {
        const days = daysUntil(lc.latest_shipment_date);
        if (days >= 0 && days <= 14) {
          result.push({
            type: "shipment_deadline",
            severity: days <= 3 ? "critical" : days <= 7 ? "warning" : "info",
            lcNumber: lc.lc_number,
            message: `LC ${lc.lc_number} latest shipment date in ${days} day${days !== 1 ? "s" : ""}`,
            date: lc.latest_shipment_date,
          });
        }
      }
    }

    // BTB LCs maturing within 7/14/30 days
    for (const btb of btbLcs) {
      if (btb.maturity_date) {
        const days = daysUntil(btb.maturity_date);
        if (days >= 0 && days <= 30) {
          result.push({
            type: "btb_maturity",
            severity: days <= 7 ? "critical" : days <= 14 ? "warning" : "info",
            lcNumber: btb.lc_number,
            message: `BTB LC ${btb.lc_number} matures in ${days} day${days !== 1 ? "s" : ""} (${btb.supplier_name})`,
            date: btb.maturity_date,
          });
        }
      }
    }

    // Sort by date ascending (most urgent first)
    result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return result;
  }, [masterLcs, btbLcs]);

  return { alerts, loading };
}

// ── LC Doc Checklist ────────────────────────────────────────────────────────

export function useLCDocChecklist(lcId: string | undefined) {
  const [items, setItems] = useState<LCDocChecklistItem[]>([]);
  const [loading, setLoading] = useState(!!lcId);

  const fetch = useCallback(async () => {
    if (!lcId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("lc_doc_checklist" as any)
      .select("*")
      .eq("lc_id", lcId)
      .order("sort_order", { ascending: true });

    if (error) toast.error("Failed to load checklist", { description: error.message });
    else setItems((data as unknown as LCDocChecklistItem[]) ?? []);
    setLoading(false);
  }, [lcId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { items, loading, refetch: fetch };
}

export function useLCDocChecklistMutations() {
  const [saving, setSaving] = useState(false);

  async function addItem(
    lcId: string,
    fields: {
      document_name: string;
      description?: string | null;
      originals_required?: number;
      copies_required?: number;
      special_instructions?: string | null;
    }
  ): Promise<boolean> {
    setSaving(true);
    try {
      // Get next sort_order
      const { data: existing } = await supabase
        .from("lc_doc_checklist" as any)
        .select("sort_order")
        .eq("lc_id", lcId)
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextOrder =
        existing && existing.length > 0
          ? (existing[0] as any).sort_order + 1
          : 1;

      const { error } = await supabase
        .from("lc_doc_checklist" as any)
        .insert({
          lc_id: lcId,
          document_name: fields.document_name,
          description: fields.description ?? null,
          originals_required: fields.originals_required ?? 1,
          copies_required: fields.copies_required ?? 0,
          special_instructions: fields.special_instructions ?? null,
          status: "not_started",
          sort_order: nextOrder,
        } as any);
      if (error) throw error;

      toast.success(`Added "${fields.document_name}" to checklist`);
      return true;
    } catch (e: any) {
      toast.error("Failed to add checklist item", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateItemStatus(
    id: string,
    status: LCDocChecklistItem["status"]
  ): Promise<boolean> {
    setSaving(true);
    try {
      const updates: any = { status };
      if (status === "submitted") {
        updates.completed_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("lc_doc_checklist" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;

      toast.success(`Status updated to ${status}`);
      return true;
    } catch (e: any) {
      toast.error("Failed to update status", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lc_doc_checklist" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;

      toast.success("Checklist item removed");
      return true;
    } catch (e: any) {
      toast.error("Failed to delete item", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addDefaultChecklist(lcId: string): Promise<boolean> {
    setSaving(true);
    try {
      const defaultDocs = [
        "Commercial Invoice",
        "Packing List",
        "Bill of Lading",
        "Certificate of Origin",
        "Inspection Certificate",
        "Beneficiary Certificate",
        "Insurance Certificate",
        "Test Report",
        "Shipping Advice",
        "Weight Certificate",
      ];

      const rows = defaultDocs.map((name, idx) => ({
        lc_id: lcId,
        document_name: name,
        description: null,
        originals_required: 3,
        copies_required: 3,
        special_instructions: null,
        status: "not_started",
        sort_order: idx + 1,
      }));

      const { error } = await supabase
        .from("lc_doc_checklist" as any)
        .insert(rows as any);
      if (error) throw error;

      toast.success("Default checklist added (10 documents)");
      return true;
    } catch (e: any) {
      toast.error("Failed to add default checklist", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { addItem, updateItemStatus, deleteItem, addDefaultChecklist, saving };
}

// ── LC Banking Costs ──────────────────────────────────────────────────────

export function useLCBankingCosts(lcId?: string) {
  const { factory } = useAuth();
  const [costs, setCosts] = useState<LCBankingCost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    let query = supabase
      .from("lc_banking_costs" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .order("date_incurred", { ascending: false });

    if (lcId) {
      query = query.eq("lc_id", lcId);
    }

    const { data, error } = await query;

    if (error) toast.error("Failed to load banking costs", { description: error.message });
    else setCosts((data as unknown as LCBankingCost[]) ?? []);
    setLoading(false);
  }, [factory?.id, lcId]);

  useEffect(() => { fetch(); }, [fetch]);

  const totalCosts = useMemo(
    () => costs.reduce((sum, c) => sum + (c.amount ?? 0), 0),
    [costs]
  );

  return { costs, totalCosts, loading, refetch: fetch };
}

export function useLCBankingCostMutations() {
  const { factory } = useAuth();
  const [saving, setSaving] = useState(false);

  async function addCost(
    fields: Omit<LCBankingCost, "id">
  ): Promise<boolean> {
    if (!factory?.id) return false;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lc_banking_costs" as any)
        .insert({ ...(fields as any), factory_id: factory.id });
      if (error) throw error;

      // Recalculate total_banking_costs on the linked master LC
      const lcId = fields.lc_id;
      if (lcId) {
        const { data: allCosts } = await supabase
          .from("lc_banking_costs" as any)
          .select("amount")
          .eq("lc_id", lcId);

        const total = (allCosts ?? []).reduce((s: number, c: any) => s + (c.amount ?? 0), 0);

        await supabase
          .from("master_lcs" as any)
          .update({ total_banking_costs: total } as any)
          .eq("id", lcId);
      }

      toast.success("Banking cost added");
      return true;
    } catch (e: any) {
      toast.error("Failed to add banking cost", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateCost(
    id: string,
    fields: Partial<Omit<LCBankingCost, "id">>
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lc_banking_costs" as any)
        .update(fields as any)
        .eq("id", id);
      if (error) throw error;

      // Recalculate total_banking_costs on the linked master LC
      const { data: costRecord } = await supabase
        .from("lc_banking_costs" as any)
        .select("lc_id")
        .eq("id", id)
        .single();

      const lcId = (costRecord as any)?.lc_id;
      if (lcId) {
        const { data: allCosts } = await supabase
          .from("lc_banking_costs" as any)
          .select("amount")
          .eq("lc_id", lcId);

        const total = (allCosts ?? []).reduce((s: number, c: any) => s + (c.amount ?? 0), 0);

        await supabase
          .from("master_lcs" as any)
          .update({ total_banking_costs: total } as any)
          .eq("id", lcId);
      }

      toast.success("Banking cost updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update banking cost", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteCost(id: string): Promise<boolean> {
    setSaving(true);
    try {
      // Get lc_id before deleting so we can recalculate total
      const { data: costRecord } = await supabase
        .from("lc_banking_costs" as any)
        .select("lc_id")
        .eq("id", id)
        .single();

      const lcId = (costRecord as any)?.lc_id;

      const { error } = await supabase
        .from("lc_banking_costs" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;

      // Recalculate total_banking_costs on the linked master LC
      if (lcId) {
        const { data: allCosts } = await supabase
          .from("lc_banking_costs" as any)
          .select("amount")
          .eq("lc_id", lcId);

        const total = (allCosts ?? []).reduce((s: number, c: any) => s + (c.amount ?? 0), 0);

        await supabase
          .from("master_lcs" as any)
          .update({ total_banking_costs: total } as any)
          .eq("id", lcId);
      }

      toast.success("Banking cost deleted");
      return true;
    } catch (e: any) {
      toast.error("Failed to delete banking cost", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { addCost, updateCost, deleteCost, saving };
}

// ── LC Discrepancies ──────────────────────────────────────────────────────

export function useLCDiscrepancies(lcId: string | undefined) {
  const [discrepancies, setDiscrepancies] = useState<LCDiscrepancy[]>([]);
  const [loading, setLoading] = useState(!!lcId);

  const fetch = useCallback(async () => {
    if (!lcId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("lc_discrepancies" as any)
      .select("*")
      .eq("lc_id", lcId)
      .order("notice_date", { ascending: false });

    if (error) toast.error("Failed to load discrepancies", { description: error.message });
    else setDiscrepancies((data as unknown as LCDiscrepancy[]) ?? []);
    setLoading(false);
  }, [lcId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { discrepancies, loading, refetch: fetch };
}

export function useLCDiscrepancyMutations() {
  const [saving, setSaving] = useState(false);

  async function addDiscrepancy(
    lcId: string,
    fields: {
      notice_date: string;
      discrepancy_items: any[];
      bank_charges: number;
      shipment_id?: string | null;
    }
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lc_discrepancies" as any)
        .insert({
          lc_id: lcId,
          notice_date: fields.notice_date,
          discrepancy_items: fields.discrepancy_items,
          bank_charges: fields.bank_charges,
          shipment_id: fields.shipment_id ?? null,
          status: "pending",
          resolution: null,
        } as any);
      if (error) throw error;

      toast.success("Discrepancy recorded");
      return true;
    } catch (e: any) {
      toast.error("Failed to add discrepancy", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function resolveDiscrepancy(
    id: string,
    fields: {
      resolution: LCDiscrepancy["resolution"];
      resolution_date: string;
      resolution_notes?: string | null;
    }
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lc_discrepancies" as any)
        .update({
          resolution: fields.resolution,
          resolution_date: fields.resolution_date,
          resolution_notes: fields.resolution_notes ?? null,
          status: fields.resolution === "rejected" ? "rejected" : "resolved",
        } as any)
        .eq("id", id);
      if (error) throw error;

      toast.success("Discrepancy resolved");
      return true;
    } catch (e: any) {
      toast.error("Failed to resolve discrepancy", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { addDiscrepancy, resolveDiscrepancy, saving };
}

// ── LC Utilisation ────────────────────────────────────────────────────────

export function useLCUtilisation(lc: MasterLC | null) {
  return useMemo(() => {
    if (!lc) {
      return {
        totalDrawn: 0,
        remainingValue: 0,
        remainingWithTolerance: 0,
        totalQtyShipped: 0,
        canShipMore: false,
        utilisationPct: 0,
      };
    }

    const totalDrawn = (lc.lc_shipments ?? []).reduce(
      (sum, s) => sum + (s.invoice_value ?? 0),
      0
    );

    const maxDrawable = lc.lc_value * (1 + (lc.tolerance_pct ?? 0) / 100);
    const remainingValue = lc.lc_value - totalDrawn;
    const remainingWithTolerance = maxDrawable - totalDrawn;

    const totalQtyShipped = (lc.lc_shipments ?? []).reduce(
      (sum, s) => sum + (s.quantity ?? 0),
      0
    );

    const canShipMore = remainingWithTolerance > 0;
    const utilisationPct =
      lc.lc_value > 0 ? Math.round((totalDrawn / lc.lc_value) * 10000) / 100 : 0;

    // Per-shipment breakdown with running totals
    let cumulative = 0;
    const shipmentBreakdown = (lc.lc_shipments ?? []).map((s, i) => {
      cumulative += s.invoice_value ?? 0;
      return {
        number: s.shipment_number ?? (i + 1),
        blNumber: s.bl_number ?? "—",
        invoiceValue: s.invoice_value ?? 0,
        cumulative,
        remaining: maxDrawable - cumulative,
      };
    });

    return {
      totalDrawn,
      remainingValue,
      remainingWithTolerance,
      totalQtyShipped,
      canShipMore,
      utilisationPct,
      // Aliases used by LCDetail page
      lcValue: lc.lc_value,
      maxDrawable,
      pct: utilisationPct,
      remaining: remainingWithTolerance,
      shipments: shipmentBreakdown,
    };
  }, [lc]);
}

// ── BTB Maturity Calendar ─────────────────────────────────────────────────

export function useBtbMaturityCalendar() {
  const { factory } = useAuth();
  const [btbLcs, setBtbLcs] = useState<BtbLC[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const today = new Date();
    const ninetyDaysLater = new Date(today);
    ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);

    const todayStr = today.toISOString().split("T")[0];
    const endStr = ninetyDaysLater.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("btb_lcs" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .gte("maturity_date", todayStr)
      .lte("maturity_date", endStr)
      .order("maturity_date", { ascending: true });

    if (error) toast.error("Failed to load maturity calendar", { description: error.message });
    else setBtbLcs((data as unknown as BtbLC[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  const weeks = useMemo(() => {
    const result: Array<{
      weekStart: string;
      weekEnd: string;
      btbLcs: BtbLC[];
      totalAmount: number;
    }> = [];

    if (btbLcs.length === 0) return result;

    // Group by ISO week
    const weekMap = new Map<string, BtbLC[]>();

    for (const btb of btbLcs) {
      if (!btb.maturity_date) continue;
      const d = new Date(btb.maturity_date);
      // Get Monday of the week
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const key = monday.toISOString().split("T")[0];

      if (!weekMap.has(key)) weekMap.set(key, []);
      weekMap.get(key)!.push(btb);
    }

    for (const [weekStart, lcs] of weekMap) {
      const ws = new Date(weekStart);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);

      result.push({
        weekStart,
        weekEnd: we.toISOString().split("T")[0],
        btbLcs: lcs,
        totalAmount: lcs.reduce((sum, b) => sum + (b.lc_value ?? 0), 0),
      });
    }

    result.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    return result;
  }, [btbLcs]);

  return { weeks, loading };
}

// ── Bank Relationship Types ──────────────────────────────────────────────

export interface BankRelationship {
  id: string;
  factory_id: string;
  bank_name: string;
  branch_name: string | null;
  bank_address: string | null;
  swift_code: string | null;
  relationship_manager: string | null;
  rm_phone: string | null;
  rm_email: string | null;
  lc_limit: number;
  btb_lc_limit: number;
  current_lc_utilized: number;
  current_btb_utilized: number;
  overdraft_limit: number;
  loan_facilities: string | null;
  currency: string;
  account_number: string | null;
  is_primary: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LCNotificationSettings {
  id: string;
  factory_id: string;
  lc_expiry_warning_days: number;
  shipment_date_warning_days: number;
  btb_maturity_warning_days: number;
  presentation_deadline_warning_days: number;
  notify_on_amendment: boolean;
  notify_on_discrepancy: boolean;
  notify_on_payment: boolean;
}

// ── Bank Relationships ───────────────────────────────────────────────────

export function useBankRelationships() {
  const { factory } = useAuth();
  const [banks, setBanks] = useState<BankRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bank_relationships" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .order("bank_name", { ascending: true });

    if (error) toast.error("Failed to load bank relationships", { description: error.message });
    else setBanks((data as unknown as BankRelationship[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { banks, loading, refetch: fetch };
}

// ── Bank Relationship Mutations ──────────────────────────────────────────

export function useBankRelationshipMutations() {
  const { factory } = useAuth();
  const [saving, setSaving] = useState(false);

  async function createBank(
    fields: Omit<BankRelationship, "id" | "factory_id" | "created_at" | "updated_at">
  ): Promise<BankRelationship | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("bank_relationships" as any)
        .insert({
          ...(fields as any),
          factory_id: factory.id,
        })
        .select()
        .single();
      if (error) throw error;

      toast.success(`Bank "${fields.bank_name}" added`);
      return data as unknown as BankRelationship;
    } catch (e: any) {
      toast.error("Failed to create bank relationship", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateBank(
    id: string,
    fields: Partial<Omit<BankRelationship, "id" | "factory_id" | "created_at" | "updated_at">>
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bank_relationships" as any)
        .update(fields as any)
        .eq("id", id);
      if (error) throw error;

      toast.success("Bank relationship updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update bank relationship", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteBank(id: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bank_relationships" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;

      toast.success("Bank relationship deleted");
      return true;
    } catch (e: any) {
      toast.error("Failed to delete bank relationship", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { createBank, updateBank, deleteBank, saving };
}

// ── Bank Facility Utilisation ────────────────────────────────────────────

export function useBankFacilityUtilisation() {
  const { factory } = useAuth();
  const [utilisation, setUtilisation] = useState<Map<string, { lcUsed: number; btbUsed: number }>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const [masterRes, btbRes] = await Promise.all([
      supabase
        .from("master_lcs" as any)
        .select("lc_value, beneficiary_bank_name, status")
        .eq("factory_id", factory.id)
        .not("status", "in", '("expired","cancelled","closed")'),
      supabase
        .from("btb_lcs" as any)
        .select("lc_value, supplier_bank_name, status")
        .eq("factory_id", factory.id)
        .not("status", "in", '("paid","expired","cancelled")'),
    ]);

    // Also fetch bank relationships to map by name
    const { data: banks } = await supabase
      .from("bank_relationships" as any)
      .select("id, bank_name")
      .eq("factory_id", factory.id);

    const bankMap = new Map<string, string>();
    for (const b of (banks as unknown as Array<{ id: string; bank_name: string }>) ?? []) {
      bankMap.set(b.bank_name.toLowerCase(), b.id);
    }

    const result = new Map<string, { lcUsed: number; btbUsed: number }>();

    // Initialize all banks with zero
    for (const [, bankId] of bankMap) {
      result.set(bankId, { lcUsed: 0, btbUsed: 0 });
    }

    // Sum active master LCs by beneficiary bank
    for (const lc of (masterRes.data as unknown as Array<{ lc_value: number; beneficiary_bank_name: string | null; status: string }>) ?? []) {
      if (!lc.beneficiary_bank_name) continue;
      const bankId = bankMap.get(lc.beneficiary_bank_name.toLowerCase());
      if (!bankId) continue;
      const entry = result.get(bankId) ?? { lcUsed: 0, btbUsed: 0 };
      entry.lcUsed += lc.lc_value ?? 0;
      result.set(bankId, entry);
    }

    // Sum active BTB LCs by supplier bank
    for (const btb of (btbRes.data as unknown as Array<{ lc_value: number; supplier_bank_name: string | null; status: string }>) ?? []) {
      if (!btb.supplier_bank_name) continue;
      const bankId = bankMap.get(btb.supplier_bank_name.toLowerCase());
      if (!bankId) continue;
      const entry = result.get(bankId) ?? { lcUsed: 0, btbUsed: 0 };
      entry.btbUsed += btb.lc_value ?? 0;
      result.set(bankId, entry);
    }

    setUtilisation(result);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { utilisation, loading };
}

// ── LC Notification Settings ─────────────────────────────────────────────

export function useLCNotificationSettings() {
  const { factory } = useAuth();
  const [settings, setSettings] = useState<LCNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("lc_notification_settings" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .single();

    if (error && error.code === "PGRST116") {
      // No row found — upsert default
      const defaults = {
        factory_id: factory.id,
        lc_expiry_warning_days: 30,
        shipment_date_warning_days: 14,
        btb_maturity_warning_days: 14,
        presentation_deadline_warning_days: 7,
        notify_on_amendment: true,
        notify_on_discrepancy: true,
        notify_on_payment: true,
      };
      const { data: inserted, error: insertErr } = await supabase
        .from("lc_notification_settings" as any)
        .insert(defaults as any)
        .select()
        .single();

      if (insertErr) {
        toast.error("Failed to initialise notification settings", { description: insertErr.message });
      } else {
        setSettings(inserted as unknown as LCNotificationSettings);
      }
    } else if (error) {
      toast.error("Failed to load notification settings", { description: error.message });
    } else {
      setSettings(data as unknown as LCNotificationSettings);
    }

    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function saveSettings(
    fields: Partial<Omit<LCNotificationSettings, "id" | "factory_id">>
  ): Promise<boolean> {
    if (!settings?.id) return false;
    try {
      const { error } = await supabase
        .from("lc_notification_settings" as any)
        .update(fields as any)
        .eq("id", settings.id);
      if (error) throw error;

      setSettings((prev) => (prev ? { ...prev, ...fields } : prev));
      toast.success("Notification settings saved");
      return true;
    } catch (e: any) {
      toast.error("Failed to save notification settings", { description: e.message });
      return false;
    }
  }

  return { settings, loading, saveSettings };
}

// ── LC Report Data ───────────────────────────────────────────────────────

export function useLCReportData(filters?: {
  buyerName?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}) {
  const { factory } = useAuth();
  const [reportData, setReportData] = useState<{
    activeLCRegister: MasterLC[];
    btbRegister: BtbLC[];
    expiredWithUnusedValue: Array<MasterLC & { unusedValue: number }>;
    discrepancyFrequency: Map<string, number>;
    bankingCostSummary: Map<string, number>;
    buyerSummary: Map<string, { lcCount: number; totalValue: number; totalShipped: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const filterKey = useMemo(
    () => JSON.stringify(filters ?? {}),
    [filters]
  );

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    let masterQuery = supabase
      .from("master_lcs" as any)
      .select("*, lc_amendments(*), lc_shipments(*), btb_lcs(*), lc_banking_costs(*), lc_discrepancies(*)")
      .eq("factory_id", factory.id)
      .order("issue_date", { ascending: false });

    if (filters?.buyerName) {
      masterQuery = masterQuery.ilike("buyer_name", `%${filters.buyerName}%`);
    }
    if (filters?.dateFrom) {
      masterQuery = masterQuery.gte("issue_date", filters.dateFrom);
    }
    if (filters?.dateTo) {
      masterQuery = masterQuery.lte("issue_date", filters.dateTo);
    }
    if (filters?.status) {
      masterQuery = masterQuery.eq("status", filters.status);
    }

    const { data: masterData, error: masterErr } = await masterQuery;

    if (masterErr) {
      toast.error("Failed to load report data", { description: masterErr.message });
      setLoading(false);
      return;
    }

    const allLCs = (masterData as unknown as MasterLC[]) ?? [];

    // Active LC register: not expired/cancelled/closed
    const activeLCRegister = allLCs.filter(
      (lc) => !["expired", "cancelled", "closed"].includes(lc.status)
    );

    // BTB register: collect all nested btb_lcs
    const btbRegister: BtbLC[] = [];
    for (const lc of allLCs) {
      if (lc.btb_lcs) {
        btbRegister.push(...lc.btb_lcs);
      }
    }

    // Expired LCs with unused value
    const expiredWithUnusedValue = allLCs
      .filter((lc) => lc.status === "expired")
      .map((lc) => {
        const totalDrawn = (lc.lc_shipments ?? []).reduce(
          (sum, s) => sum + (s.invoice_value ?? 0),
          0
        );
        const unusedValue = lc.lc_value - totalDrawn;
        return { ...lc, unusedValue };
      })
      .filter((lc) => lc.unusedValue > 0);

    // Discrepancy frequency by type
    const discrepancyFrequency = new Map<string, number>();
    for (const lc of allLCs) {
      for (const disc of lc.lc_discrepancies ?? []) {
        for (const item of disc.discrepancy_items ?? []) {
          const type = typeof item === "string" ? item : (item as any).type ?? "Unknown";
          discrepancyFrequency.set(type, (discrepancyFrequency.get(type) ?? 0) + 1);
        }
      }
    }

    // Banking cost summary by cost_type
    const bankingCostSummary = new Map<string, number>();
    for (const lc of allLCs) {
      for (const cost of lc.lc_banking_costs ?? []) {
        const key = cost.cost_type ?? "Other";
        bankingCostSummary.set(key, (bankingCostSummary.get(key) ?? 0) + (cost.amount ?? 0));
      }
    }

    // Buyer-wise summary
    const buyerSummary = new Map<string, { lcCount: number; totalValue: number; totalShipped: number }>();
    for (const lc of allLCs) {
      const buyer = lc.buyer_name ?? "Unknown";
      const entry = buyerSummary.get(buyer) ?? { lcCount: 0, totalValue: 0, totalShipped: 0 };
      entry.lcCount += 1;
      entry.totalValue += lc.lc_value ?? 0;
      entry.totalShipped += lc.total_shipped ?? 0;
      buyerSummary.set(buyer, entry);
    }

    setReportData({
      activeLCRegister,
      btbRegister,
      expiredWithUnusedValue,
      discrepancyFrequency,
      bankingCostSummary,
      buyerSummary,
    });
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory?.id, filterKey]);

  useEffect(() => { fetch(); }, [fetch]);
  return { reportData, loading };
}
