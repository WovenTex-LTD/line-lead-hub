import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert empty string to null for UUID fields */
function uuidOrNull(val: string | null | undefined): string | null {
  if (!val || val.trim() === "") return null;
  return val;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  factory_id: string;
  direction: "in" | "out";
  category:
    | "invoice_payment"
    | "advance"
    | "supplier"
    | "btb_lc_maturity"
    | "payroll"
    | "export_cost"
    | "bank_charge"
    | "overhead"
    | "tax";
  buyer_name: string | null;
  buyer_profile_id: string | null;
  payee_name: string | null;
  original_amount: number;
  original_currency: string;
  exchange_rate: number;
  bdt_equivalent: number | null;
  usd_equivalent: number | null;
  bank_deductions: number;
  net_amount_credited: number | null;
  payment_date: string;
  due_date: string | null;
  payment_method: string;
  bank_reference: string | null;
  bank_account_id: string | null;
  linked_lc_id: string | null;
  linked_btb_lc_id: string | null;
  linked_shipment_id: string | null;
  linked_po_id: string | null;
  sub_category: string | null;
  sub_category_reference: string | null;
  description: string | null;
  status:
    | "pending_approval"
    | "approved"
    | "rejected"
    | "matched"
    | "unmatched"
    | "partial"
    | "void";
  recorded_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
  payment_allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_id: string;
  allocated_amount: number;
  allocated_currency: string;
  short_payment_reason: string | null;
  short_payment_note: string | null;
  forex_gain_loss: number;
  created_at: string;
  created_by: string | null;
}

export interface BuyerCredit {
  id: string;
  factory_id: string;
  buyer_name: string;
  buyer_profile_id: string | null;
  source_payment_id: string | null;
  original_amount: number;
  remaining_amount: number;
  currency: string;
  status: "parked" | "partially_allocated" | "fully_allocated";
  created_at: string;
  updated_at: string;
}

export interface BankTransaction {
  id: string;
  factory_id: string;
  bank_account_id: string | null;
  transaction_date: string;
  description: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  reference: string | null;
  matched_payment_id: string | null;
  match_confidence: string | null;
  reconciliation_status: string;
  imported_from: string;
  imported_at: string;
}

export interface ReceivablesAgeing {
  buyerName: string;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  over90: number;
  total: number;
  invoices: Array<{
    id: string;
    invoice_number: string;
    issue_date: string;
    due_date: string | null;
    total: number;
    paid: number;
    balance: number;
    daysOverdue: number;
  }>;
}

export interface PayablesAgeing {
  category: string;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  over90: number;
  total: number;
}

export interface CashFlowWeek {
  weekStart: string;
  weekEnd: string;
  label: string;
  expectedIn: number;
  expectedOut: number;
  net: number;
  projectedBalance: number;
  inflows: Array<{
    source: string;
    amount: number;
    reference: string;
    confidence: "confirmed" | "estimated";
  }>;
  outflows: Array<{
    source: string;
    amount: number;
    reference: string;
    confidence: "confirmed" | "estimated";
  }>;
  belowThreshold: boolean;
}

export interface PaymentSummary {
  totalReceivables: number;
  totalPayables: number;
  netPosition: number;
  receivedThisMonth: number;
  paidThisMonth: number;
}

export interface PaymentAlert {
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  linkedId: string;
  linkedType: string;
}

// ── Filter types ────────────────────────────────────────────────────────────

export interface PaymentFilters {
  direction?: string;
  category?: string;
  buyer?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  method?: string;
}

// ── 1. usePayments ──────────────────────────────────────────────────────────

export function usePayments(filters?: PaymentFilters) {
  const { factory } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    let query = supabase
      .from("payments")
      .select("*, payment_allocations(*)")
      .eq("factory_id", factory.id)
      .is("deleted_at", null)
      .order("payment_date", { ascending: false });

    if (filters?.direction && filters.direction !== "all") {
      query = query.eq("direction", filters.direction);
    }
    if (filters?.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }
    if (filters?.buyer && filters.buyer !== "all") {
      query = query.eq("buyer_name", filters.buyer);
    }
    if (filters?.dateFrom) {
      query = query.gte("payment_date", filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte("payment_date", filters.dateTo);
    }
    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters?.method && filters.method !== "all") {
      query = query.eq("payment_method", filters.method);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load payments", { description: error.message });
    } else {
      setPayments((data as unknown as Payment[]) ?? []);
    }
    setLoading(false);
  }, [
    factory?.id,
    filters?.direction,
    filters?.category,
    filters?.buyer,
    filters?.dateFrom,
    filters?.dateTo,
    filters?.status,
    filters?.method,
  ]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { payments, loading, refetch: fetch };
}

// ── 2. usePaymentMutations ──────────────────────────────────────────────────

export function usePaymentMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function recordPayment(
    fields: Partial<Payment>,
    allocations: {
      invoice_id: string;
      amount: number;
      short_payment_reason?: string;
      short_payment_note?: string;
    }[] = []
  ): Promise<Payment | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      const insertFields = {
        ...(fields as any),
        factory_id: factory.id,
        recorded_by: profile?.id ?? null,
        buyer_profile_id: uuidOrNull(fields.buyer_profile_id),
        bank_account_id: uuidOrNull(fields.bank_account_id),
        linked_lc_id: uuidOrNull(fields.linked_lc_id),
        linked_btb_lc_id: uuidOrNull(fields.linked_btb_lc_id),
        linked_shipment_id: uuidOrNull(fields.linked_shipment_id),
        linked_po_id: uuidOrNull(fields.linked_po_id),
      };
      delete insertFields.id;
      delete insertFields.created_at;
      delete insertFields.updated_at;
      delete insertFields.payment_allocations;

      const { data, error } = await supabase
        .from("payments")
        .insert(insertFields)
        .select()
        .single();
      if (error) throw error;

      const payment = data as unknown as Payment;

      // Create allocations
      if (allocations.length > 0) {
        const { error: allocErr } = await supabase
          .from("payment_allocations")
          .insert(
            allocations.map((a) => ({
              payment_id: payment.id,
              invoice_id: a.invoice_id,
              allocated_amount: a.amount,
              allocated_currency: fields.original_currency ?? "USD",
              short_payment_reason: a.short_payment_reason ?? null,
              short_payment_note: a.short_payment_note ?? null,
              created_by: profile?.id ?? null,
            }))
          );
        if (allocErr) throw allocErr;
      }

      // If advance or overpayment, create buyer credit
      if (
        fields.category === "advance" &&
        fields.buyer_name &&
        fields.direction === "in"
      ) {
        const { error: creditErr } = await supabase
          .from("buyer_credits")
          .insert({
            factory_id: factory.id,
            buyer_name: fields.buyer_name,
            buyer_profile_id: uuidOrNull(fields.buyer_profile_id),
            source_payment_id: payment.id,
            original_amount: fields.original_amount ?? 0,
            remaining_amount: fields.original_amount ?? 0,
            currency: fields.original_currency ?? "USD",
          });
        if (creditErr) throw creditErr;
      }

      // Log audit
      await supabase.from("payment_audit_log").insert({
        payment_id: payment.id,
        action: "created",
        performed_by: profile?.id ?? null,
        details: { allocations_count: allocations.length },
      } as any);

      toast.success("Payment recorded");
      return payment;
    } catch (e: any) {
      toast.error("Failed to record payment", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function approvePayment(id: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "approved",
          approved_by: profile?.id ?? null,
          approved_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("payment_audit_log").insert({
        payment_id: id,
        action: "approved",
        performed_by: profile?.id ?? null,
      } as any);

      toast.success("Payment approved");
      return true;
    } catch (e: any) {
      toast.error("Failed to approve payment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function rejectPayment(id: string, reason: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "rejected",
          rejection_reason: reason,
        } as any)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("payment_audit_log").insert({
        payment_id: id,
        action: "rejected",
        performed_by: profile?.id ?? null,
        details: { reason },
      } as any);

      toast.success("Payment rejected");
      return true;
    } catch (e: any) {
      toast.error("Failed to reject payment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function voidPayment(id: string, reason: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "void",
          deleted_at: new Date().toISOString(),
          deleted_by: profile?.id ?? null,
          deletion_reason: reason,
        } as any)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("payment_audit_log").insert({
        payment_id: id,
        action: "voided",
        performed_by: profile?.id ?? null,
        details: { reason },
      } as any);

      toast.success("Payment voided");
      return true;
    } catch (e: any) {
      toast.error("Failed to void payment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updatePayment(
    id: string,
    fields: Partial<Payment>
  ): Promise<boolean> {
    setSaving(true);
    try {
      const updateFields = { ...(fields as any) };
      // Convert all UUID fields
      if ("buyer_profile_id" in updateFields)
        updateFields.buyer_profile_id = uuidOrNull(updateFields.buyer_profile_id);
      if ("bank_account_id" in updateFields)
        updateFields.bank_account_id = uuidOrNull(updateFields.bank_account_id);
      if ("linked_lc_id" in updateFields)
        updateFields.linked_lc_id = uuidOrNull(updateFields.linked_lc_id);
      if ("linked_btb_lc_id" in updateFields)
        updateFields.linked_btb_lc_id = uuidOrNull(updateFields.linked_btb_lc_id);
      if ("linked_shipment_id" in updateFields)
        updateFields.linked_shipment_id = uuidOrNull(updateFields.linked_shipment_id);
      if ("linked_po_id" in updateFields)
        updateFields.linked_po_id = uuidOrNull(updateFields.linked_po_id);
      if ("approved_by" in updateFields)
        updateFields.approved_by = uuidOrNull(updateFields.approved_by);
      if ("deleted_by" in updateFields)
        updateFields.deleted_by = uuidOrNull(updateFields.deleted_by);
      delete updateFields.id;
      delete updateFields.factory_id;
      delete updateFields.created_at;
      delete updateFields.payment_allocations;

      const { error } = await supabase
        .from("payments")
        .update(updateFields)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("payment_audit_log").insert({
        payment_id: id,
        action: "updated",
        performed_by: profile?.id ?? null,
        details: { fields: Object.keys(fields) },
      } as any);

      toast.success("Payment updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update payment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(id: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
      toast.success("Payment deleted");
      return true;
    } catch (e: any) {
      toast.error("Failed to delete payment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function allocateToInvoice(
    paymentId: string,
    invoiceId: string,
    amount: number
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase.from("payment_allocations").insert({
        payment_id: paymentId,
        invoice_id: invoiceId,
        allocated_amount: amount,
        allocated_currency: "USD",
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
      toast.success("Payment allocated to invoice");
      return true;
    } catch (e: any) {
      toast.error("Failed to allocate payment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function removeAllocation(allocationId: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("payment_allocations")
        .delete()
        .eq("id", allocationId);
      if (error) throw error;
      toast.success("Allocation removed");
      return true;
    } catch (e: any) {
      toast.error("Failed to remove allocation", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    recordPayment,
    approvePayment,
    rejectPayment,
    voidPayment,
    updatePayment,
    deletePayment,
    allocateToInvoice,
    removeAllocation,
    saving,
  };
}

// ── 3. useBuyerCredits ──────────────────────────────────────────────────────

export function useBuyerCredits() {
  const { factory } = useAuth();
  const [credits, setCredits] = useState<BuyerCredit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("buyer_credits")
      .select("*")
      .eq("factory_id", factory.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load buyer credits", { description: error.message });
    } else {
      setCredits((data as unknown as BuyerCredit[]) ?? []);
    }
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { credits, loading, refetch: fetch };
}

// ── 4. useBuyerCreditMutations ──────────────────────────────────────────────

export function useBuyerCreditMutations() {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function allocateCredit(
    creditId: string,
    invoiceId: string,
    amount: number
  ): Promise<boolean> {
    setSaving(true);
    try {
      // Fetch current credit
      const { data: creditData, error: fetchErr } = await supabase
        .from("buyer_credits")
        .select("*")
        .eq("id", creditId)
        .single();
      if (fetchErr) throw fetchErr;

      const credit = creditData as unknown as BuyerCredit;
      if (amount > credit.remaining_amount) {
        toast.error("Allocation exceeds remaining credit amount");
        setSaving(false);
        return false;
      }

      const newRemaining = credit.remaining_amount - amount;
      const newStatus: BuyerCredit["status"] =
        newRemaining <= 0
          ? "fully_allocated"
          : newRemaining < credit.original_amount
          ? "partially_allocated"
          : "parked";

      // Create allocation record
      const { error: allocErr } = await supabase
        .from("payment_allocations")
        .insert({
          payment_id: uuidOrNull(credit.source_payment_id),
          invoice_id: invoiceId,
          allocated_amount: amount,
          allocated_currency: credit.currency,
          created_by: profile?.id ?? null,
        });
      if (allocErr) throw allocErr;

      // Update credit
      const { error: updErr } = await supabase
        .from("buyer_credits")
        .update({
          remaining_amount: newRemaining,
          status: newStatus,
        } as any)
        .eq("id", creditId);
      if (updErr) throw updErr;

      toast.success("Credit allocated to invoice");
      return true;
    } catch (e: any) {
      toast.error("Failed to allocate credit", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { allocateCredit, saving };
}

// ── 5. useReceivablesAgeing ─────────────────────────────────────────────────

export function useReceivablesAgeing() {
  const { factory } = useAuth();
  const [ageing, setAgeing] = useState<ReceivablesAgeing[]>([]);
  const [totals, setTotals] = useState({
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
    over90: 0,
    grandTotal: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    // Fetch unpaid invoices with allocations to calculate paid amounts
    const [invoicesRes, allocationsRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "*, invoice_line_items(*), invoice_charges(*), invoice_tax_lines(*)"
        )
        .eq("factory_id", factory.id)
        .in("status", ["sent", "overdue"])
        .order("due_date", { ascending: true }),
      supabase
        .from("payment_allocations")
        .select("invoice_id, allocated_amount"),
    ]);

    if (invoicesRes.error) {
      toast.error("Failed to load receivables", {
        description: invoicesRes.error.message,
      });
      setLoading(false);
      return;
    }

    const invoices = (invoicesRes.data as any[]) ?? [];
    const allAllocations = (allocationsRes.data as any[]) ?? [];

    // Build a map of total paid per invoice
    const paidMap: Record<string, number> = {};
    for (const alloc of allAllocations) {
      const invId = alloc.invoice_id as string;
      paidMap[invId] = (paidMap[invId] ?? 0) + (alloc.allocated_amount ?? 0);
    }

    const today = new Date();
    const buckets: Record<
      string,
      ReceivablesAgeing
    > = {};
    const totalBuckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0, grandTotal: 0 };

    for (const inv of invoices) {
      const buyer = inv.buyer_name as string;
      if (!buckets[buyer]) {
        buckets[buyer] = {
          buyerName: buyer,
          current: 0,
          d30: 0,
          d60: 0,
          d90: 0,
          over90: 0,
          total: 0,
          invoices: [],
        };
      }

      // Calculate invoice total
      const lineItems = (inv.invoice_line_items as any[]) ?? [];
      const charges = (inv.invoice_charges as any[]) ?? [];
      const taxLines = (inv.invoice_tax_lines as any[]) ?? [];
      const subtotal = lineItems.reduce(
        (sum: number, li: any) =>
          sum + li.quantity * li.unit_price * (1 - (li.discount_pct ?? 0) / 100),
        0
      );
      const discountAmt = subtotal * ((inv.discount_pct ?? 0) / 100);
      const afterDiscount = subtotal - discountAmt;
      const chargesTotal = charges.reduce(
        (sum: number, c: any) => (c.is_deduct ? sum - c.amount : sum + c.amount),
        0
      );
      const taxTotal = taxLines.reduce((sum: number, t: any) => sum + t.amount, 0);
      const total = afterDiscount + chargesTotal + taxTotal;
      const paid = paidMap[inv.id] ?? 0;
      const balance = total - paid;

      if (balance <= 0) continue;

      const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.issue_date);
      const daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Add invoice detail
      buckets[buyer].invoices.push({
        id: inv.id,
        invoice_number: inv.invoice_number ?? "",
        issue_date: inv.issue_date,
        due_date: inv.due_date ?? null,
        total,
        paid,
        balance,
        daysOverdue: Math.max(0, daysOverdue),
      });

      if (daysOverdue <= 0) {
        buckets[buyer].current += balance;
        totalBuckets.current += balance;
      } else if (daysOverdue <= 30) {
        buckets[buyer].d30 += balance;
        totalBuckets.d30 += balance;
      } else if (daysOverdue <= 60) {
        buckets[buyer].d60 += balance;
        totalBuckets.d60 += balance;
      } else if (daysOverdue <= 90) {
        buckets[buyer].d90 += balance;
        totalBuckets.d90 += balance;
      } else {
        buckets[buyer].over90 += balance;
        totalBuckets.over90 += balance;
      }
      buckets[buyer].total += balance;
      totalBuckets.grandTotal += balance;
    }

    const result = Object.values(buckets);
    setAgeing(result);
    setTotals(totalBuckets);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ageing, totals, loading };
}

// ── 6. usePayablesAgeing ────────────────────────────────────────────────────

export function usePayablesAgeing() {
  const { factory } = useAuth();
  const [ageing, setAgeing] = useState<PayablesAgeing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("factory_id", factory.id)
      .eq("direction", "out")
      .in("status", ["pending_approval", "approved"])
      .is("deleted_at", null)
      .order("due_date", { ascending: true });

    if (error) {
      toast.error("Failed to load payables", { description: error.message });
      setLoading(false);
      return;
    }

    const payments = (data as unknown as Payment[]) ?? [];
    const today = new Date();
    const buckets: Record<
      string,
      { current: number; d30: number; d60: number; d90: number; over90: number; total: number }
    > = {};

    for (const p of payments) {
      const cat = p.category;
      if (!buckets[cat]) {
        buckets[cat] = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0, total: 0 };
      }

      const amount = p.original_amount;
      const dueDate = p.due_date ? new Date(p.due_date) : new Date(p.payment_date);
      const daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysOverdue <= 0) {
        buckets[cat].current += amount;
      } else if (daysOverdue <= 30) {
        buckets[cat].d30 += amount;
      } else if (daysOverdue <= 60) {
        buckets[cat].d60 += amount;
      } else if (daysOverdue <= 90) {
        buckets[cat].d90 += amount;
      } else {
        buckets[cat].over90 += amount;
      }
      buckets[cat].total += amount;
    }

    const result: PayablesAgeing[] = Object.entries(buckets).map(
      ([category, b]) => ({ category, ...b })
    );
    setAgeing(result);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ageing, loading };
}

// ── 7. useCashFlowForecast ──────────────────────────────────────────────────

export function useCashFlowForecast(openingBalance: number, weeks: number = 8) {
  const { factory } = useAuth();
  const [weekData, setWeekData] = useState<CashFlowWeek[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + weeks * 7);
    const endStr = endDate.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    // Fetch data in parallel
    const [invoicesRes, masterLcsRes, btbLcsRes, pendingOutRes] = await Promise.all([
      // Unpaid invoices by due date (inflows)
      supabase
        .from("invoices")
        .select("id, invoice_number, due_date, buyer_name, invoice_line_items(*), invoice_charges(*), invoice_tax_lines(*)")
        .eq("factory_id", factory.id)
        .in("status", ["sent", "overdue"])
        .lte("due_date", endStr),
      // Master LC proceeds (inflows)
      supabase
        .from("master_lcs")
        .select("id, lc_number, maturity_date, lc_value_usd")
        .eq("factory_id", factory.id)
        .gte("maturity_date", todayStr)
        .lte("maturity_date", endStr),
      // BTB LC maturities (outflows)
      supabase
        .from("btb_lcs")
        .select("id, lc_number, maturity_date, lc_value_usd")
        .eq("factory_id", factory.id)
        .gte("maturity_date", todayStr)
        .lte("maturity_date", endStr),
      // Pending outgoing payments (outflows)
      supabase
        .from("payments")
        .select("*")
        .eq("factory_id", factory.id)
        .eq("direction", "out")
        .in("status", ["pending_approval", "approved"])
        .is("deleted_at", null)
        .gte("due_date", todayStr)
        .lte("due_date", endStr),
    ]);

    const invoices = (invoicesRes.data as any[]) ?? [];
    const masterLcs = (masterLcsRes.data as any[]) ?? [];
    const btbLcs = (btbLcsRes.data as any[]) ?? [];
    const pendingOut = (pendingOutRes.data as any[]) ?? [];

    // Build weekly buckets
    const weekBuckets: CashFlowWeek[] = [];
    let runningBalance = openingBalance;

    for (let w = 0; w < weeks; w++) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() + w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const wsStr = weekStart.toISOString().split("T")[0];
      const weStr = weekEnd.toISOString().split("T")[0];

      const inflows: CashFlowWeek["inflows"] = [];
      const outflows: CashFlowWeek["outflows"] = [];

      // Inflows from invoices
      for (const inv of invoices) {
        const dd = inv.due_date ?? inv.issue_date;
        if (dd >= wsStr && dd <= weStr) {
          const lineItems = (inv.invoice_line_items as any[]) ?? [];
          const charges = (inv.invoice_charges as any[]) ?? [];
          const taxLines = (inv.invoice_tax_lines as any[]) ?? [];
          const subtotal = lineItems.reduce(
            (s: number, li: any) =>
              s + li.quantity * li.unit_price * (1 - (li.discount_pct ?? 0) / 100),
            0
          );
          const total =
            subtotal -
            subtotal * ((inv.discount_pct ?? 0) / 100) +
            charges.reduce(
              (s: number, c: any) => (c.is_deduct ? s - c.amount : s + c.amount),
              0
            ) +
            taxLines.reduce((s: number, t: any) => s + t.amount, 0);

          inflows.push({
            source: `Invoice ${inv.invoice_number ?? ""}`,
            amount: total,
            reference: inv.id,
            confidence: "estimated",
          });
        }
      }

      // Inflows from LC maturities
      for (const lc of masterLcs) {
        if (lc.maturity_date >= wsStr && lc.maturity_date <= weStr) {
          inflows.push({
            source: `LC ${lc.lc_number ?? ""}`,
            amount: lc.lc_value_usd ?? 0,
            reference: lc.id,
            confidence: "confirmed",
          });
        }
      }

      // Outflows from BTB LC maturities
      for (const btb of btbLcs) {
        if (btb.maturity_date >= wsStr && btb.maturity_date <= weStr) {
          outflows.push({
            source: `BTB LC ${btb.lc_number ?? ""}`,
            amount: btb.lc_value_usd ?? 0,
            reference: btb.id,
            confidence: "confirmed",
          });
        }
      }

      // Outflows from pending payments
      for (const p of pendingOut) {
        const dd = p.due_date ?? p.payment_date;
        if (dd >= wsStr && dd <= weStr) {
          outflows.push({
            source: `${p.category}: ${p.payee_name ?? p.description ?? ""}`,
            amount: p.original_amount ?? 0,
            reference: p.id,
            confidence: p.status === "approved" ? "confirmed" : "estimated",
          });
        }
      }

      const expectedIn = inflows.reduce((s, i) => s + i.amount, 0);
      const expectedOut = outflows.reduce((s, o) => s + o.amount, 0);
      const net = expectedIn - expectedOut;
      runningBalance += net;

      weekBuckets.push({
        weekStart: wsStr,
        weekEnd: weStr,
        label: `Week ${w + 1}`,
        expectedIn,
        expectedOut,
        net,
        projectedBalance: runningBalance,
        inflows,
        outflows,
        belowThreshold: runningBalance < 0,
      });
    }

    setWeekData(weekBuckets);
    setLoading(false);
  }, [factory?.id, openingBalance, weeks]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { weeks: weekData, loading };
}

// ── 8. usePaymentSummary ────────────────────────────────────────────────────

export function usePaymentSummary() {
  const { factory } = useAuth();
  const [summary, setSummary] = useState<PaymentSummary>({
    totalReceivables: 0,
    totalPayables: 0,
    netPosition: 0,
    receivedThisMonth: 0,
    paidThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const [receivedRes, paidRes, receivablesRes, payablesRes] = await Promise.all([
      // Received this month (direction=in, approved/matched)
      supabase
        .from("payments")
        .select("original_amount, original_currency, usd_equivalent")
        .eq("factory_id", factory.id)
        .eq("direction", "in")
        .in("status", ["approved", "matched"])
        .is("deleted_at", null)
        .gte("payment_date", monthStart)
        .lte("payment_date", monthEnd),
      // Paid this month (direction=out, approved/matched)
      supabase
        .from("payments")
        .select("original_amount, original_currency, usd_equivalent")
        .eq("factory_id", factory.id)
        .eq("direction", "out")
        .in("status", ["approved", "matched"])
        .is("deleted_at", null)
        .gte("payment_date", monthStart)
        .lte("payment_date", monthEnd),
      // Total receivables — unpaid invoices
      supabase
        .from("invoices")
        .select("*, invoice_line_items(*), invoice_charges(*), invoice_tax_lines(*)")
        .eq("factory_id", factory.id)
        .in("status", ["sent", "overdue"]),
      // Total payables — pending outgoing
      supabase
        .from("payments")
        .select("original_amount, usd_equivalent")
        .eq("factory_id", factory.id)
        .eq("direction", "out")
        .in("status", ["pending_approval", "approved"])
        .is("deleted_at", null),
    ]);

    const receivedPayments = (receivedRes.data as any[]) ?? [];
    const receivedThisMonth = receivedPayments.reduce(
      (sum: number, p: any) => sum + (p.usd_equivalent ?? p.original_amount ?? 0),
      0
    );

    const paidPayments = (paidRes.data as any[]) ?? [];
    const paidThisMonth = paidPayments.reduce(
      (sum: number, p: any) => sum + (p.usd_equivalent ?? p.original_amount ?? 0),
      0
    );

    const receivableInvoices = (receivablesRes.data as any[]) ?? [];
    const totalReceivables = receivableInvoices.reduce((sum: number, inv: any) => {
      const lineItems = (inv.invoice_line_items as any[]) ?? [];
      const charges = (inv.invoice_charges as any[]) ?? [];
      const taxLines = (inv.invoice_tax_lines as any[]) ?? [];
      const subtotal = lineItems.reduce(
        (s: number, li: any) =>
          s + li.quantity * li.unit_price * (1 - (li.discount_pct ?? 0) / 100),
        0
      );
      const discountAmt = subtotal * ((inv.discount_pct ?? 0) / 100);
      const afterDiscount = subtotal - discountAmt;
      const chargesTotal = charges.reduce(
        (s: number, c: any) => (c.is_deduct ? s - c.amount : s + c.amount),
        0
      );
      const taxTotal = taxLines.reduce((s: number, t: any) => s + t.amount, 0);
      return sum + afterDiscount + chargesTotal + taxTotal;
    }, 0);

    const payablePayments = (payablesRes.data as any[]) ?? [];
    const totalPayables = payablePayments.reduce(
      (sum: number, p: any) => sum + (p.usd_equivalent ?? p.original_amount ?? 0),
      0
    );

    setSummary({
      totalReceivables,
      totalPayables,
      netPosition: totalReceivables - totalPayables,
      receivedThisMonth,
      paidThisMonth,
    });
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { summary, loading, refetch: fetch };
}

// ── 9. usePaymentAlerts ─────────────────────────────────────────────────────

export function usePaymentAlerts() {
  const { factory } = useAuth();
  const [alerts, setAlerts] = useState<PaymentAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const sevenDays = new Date(today);
    sevenDays.setDate(sevenDays.getDate() + 7);
    const sevenDaysStr = sevenDays.toISOString().split("T")[0];

    const [overdueRes, btbRes, unmatchedRes, shortRes] = await Promise.all([
      // Overdue receivables
      supabase
        .from("invoices")
        .select("id, invoice_number, buyer_name, due_date")
        .eq("factory_id", factory.id)
        .eq("status", "overdue"),
      // BTB LCs maturing within 7 days
      supabase
        .from("btb_lcs")
        .select("id, lc_number, maturity_date, lc_value_usd")
        .eq("factory_id", factory.id)
        .gte("maturity_date", todayStr)
        .lte("maturity_date", sevenDaysStr),
      // Unmatched payments
      supabase
        .from("payments")
        .select("id, buyer_name, payee_name, original_amount, direction")
        .eq("factory_id", factory.id)
        .eq("status", "unmatched")
        .is("deleted_at", null),
      // Short payments (allocations with short_payment_reason)
      supabase
        .from("payment_allocations")
        .select("id, payment_id, short_payment_reason, allocated_amount")
        .not("short_payment_reason", "is", null),
    ]);

    const result: PaymentAlert[] = [];

    // Overdue receivables
    for (const inv of (overdueRes.data as any[]) ?? []) {
      result.push({
        type: "overdue_receivable",
        severity: "critical",
        message: `Invoice ${inv.invoice_number} from ${inv.buyer_name} is overdue (due ${inv.due_date})`,
        linkedId: inv.id,
        linkedType: "invoice",
      });
    }

    // BTB LC maturities
    for (const btb of (btbRes.data as any[]) ?? []) {
      result.push({
        type: "btb_lc_maturing",
        severity: "warning",
        message: `BTB LC ${btb.lc_number} matures on ${btb.maturity_date} ($${(btb.lc_value_usd ?? 0).toLocaleString()})`,
        linkedId: btb.id,
        linkedType: "btb_lc",
      });
    }

    // Unmatched payments
    for (const p of (unmatchedRes.data as any[]) ?? []) {
      const name = p.direction === "in" ? p.buyer_name : p.payee_name;
      result.push({
        type: "unmatched_payment",
        severity: "warning",
        message: `Unmatched ${p.direction === "in" ? "incoming" : "outgoing"} payment of $${(p.original_amount ?? 0).toLocaleString()} from ${name ?? "Unknown"}`,
        linkedId: p.id,
        linkedType: "payment",
      });
    }

    // Short payments
    for (const alloc of (shortRes.data as any[]) ?? []) {
      result.push({
        type: "short_payment",
        severity: "info",
        message: `Short payment on allocation: ${alloc.short_payment_reason}`,
        linkedId: alloc.payment_id,
        linkedType: "payment",
      });
    }

    setAlerts(result);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { alerts, loading };
}

// ── 10. useBankReconciliation ───────────────────────────────────────────────

export function useBankReconciliation(bankAccountId?: string) {
  const { factory } = useAuth();
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    let query = supabase
      .from("bank_transactions")
      .select("*")
      .eq("factory_id", factory.id)
      .order("transaction_date", { ascending: false });

    if (bankAccountId && bankAccountId !== "all") {
      query = query.eq("bank_account_id", bankAccountId);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load bank transactions", {
        description: error.message,
      });
    } else {
      setTransactions((data as unknown as BankTransaction[]) ?? []);
    }
    setLoading(false);
  }, [factory?.id, bankAccountId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { transactions, loading, refetch: fetch };
}

// ── 11. useBankReconciliationMutations ──────────────────────────────────────

export function useBankReconciliationMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function importTransactions(
    rows: Partial<BankTransaction>[]
  ): Promise<boolean> {
    if (!factory?.id) return false;
    setSaving(true);
    try {
      const insertRows = rows.map((r) => ({
        ...(r as any),
        factory_id: factory.id,
        bank_account_id: uuidOrNull(r.bank_account_id),
        matched_payment_id: uuidOrNull(r.matched_payment_id),
        reconciliation_status: r.reconciliation_status ?? "unmatched",
        imported_from: r.imported_from ?? "manual",
      }));

      const { error } = await supabase
        .from("bank_transactions")
        .insert(insertRows);
      if (error) throw error;

      toast.success(`${rows.length} transaction(s) imported`);
      return true;
    } catch (e: any) {
      toast.error("Failed to import transactions", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function matchTransaction(
    bankTxId: string,
    paymentId: string
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bank_transactions")
        .update({
          matched_payment_id: paymentId,
          reconciliation_status: "matched",
        } as any)
        .eq("id", bankTxId);
      if (error) throw error;

      // Also update the payment status
      await supabase
        .from("payments")
        .update({ status: "matched" } as any)
        .eq("id", paymentId);

      toast.success("Transaction matched to payment");
      return true;
    } catch (e: any) {
      toast.error("Failed to match transaction", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function unmatchTransaction(bankTxId: string): Promise<boolean> {
    setSaving(true);
    try {
      // Get the current matched payment before unmatching
      const { data: txData } = await supabase
        .from("bank_transactions")
        .select("matched_payment_id")
        .eq("id", bankTxId)
        .single();

      const matchedPaymentId = (txData as any)?.matched_payment_id;

      const { error } = await supabase
        .from("bank_transactions")
        .update({
          matched_payment_id: null,
          reconciliation_status: "unmatched",
        } as any)
        .eq("id", bankTxId);
      if (error) throw error;

      // Revert payment status
      if (matchedPaymentId) {
        await supabase
          .from("payments")
          .update({ status: "unmatched" } as any)
          .eq("id", matchedPaymentId);
      }

      toast.success("Transaction unmatched");
      return true;
    } catch (e: any) {
      toast.error("Failed to unmatch transaction", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function markTimingDifference(bankTxId: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bank_transactions")
        .update({
          reconciliation_status: "timing_difference",
        } as any)
        .eq("id", bankTxId);
      if (error) throw error;

      toast.success("Marked as timing difference");
      return true;
    } catch (e: any) {
      toast.error("Failed to update transaction", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    importTransactions,
    matchTransaction,
    unmatchTransaction,
    markTimingDifference,
    saving,
  };
}
