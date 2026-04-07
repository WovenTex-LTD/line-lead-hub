import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  style_number: string | null;
  style_name: string | null;
  hs_code: string | null;
  unit: string | null;
  color: string | null;
  size_range: string | null;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  sort_order: number;
}

export interface InvoiceCharge {
  id: string;
  invoice_id: string;
  label: string;
  amount: number;
  is_deduct: boolean;
  sort_order: number;
}

export interface InvoiceTaxLine {
  id: string;
  invoice_id: string;
  label: string;
  rate_pct: number;
  amount: number;
  sort_order: number;
}

export interface Invoice {
  id: string;
  factory_id: string;
  invoice_number: string;
  invoice_type: "commercial" | "proforma" | "credit_note" | "debit_note";
  work_order_id: string | null;
  buyer_name: string;
  buyer_address: string | null;
  buyer_contact: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  exchange_rate: number;
  status: "draft" | "sent" | "paid" | "overdue";
  // Trade / LC
  payment_terms: string | null;
  lc_number: string | null;
  lc_date: string | null;
  contract_number: string | null;
  // Shipping
  port_of_loading: string | null;
  port_of_discharge: string | null;
  country_of_origin: string | null;
  country_of_dest: string | null;
  vessel_name: string | null;
  bl_number: string | null;
  bl_date: string | null;
  incoterms: string | null;
  // Packing
  packing_type: string | null;
  total_cartons: number | null;
  total_gross_weight: number | null;
  total_net_weight: number | null;
  total_cbm: number | null;
  // Financials
  discount_pct: number;
  bank_details: Record<string, string> | null;
  show_bank_details: boolean;
  selected_bank_account_id: string | null;
  notes: string | null;
  remarks: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  invoice_line_items?: InvoiceLineItem[];
  invoice_charges?: InvoiceCharge[];
  invoice_tax_lines?: InvoiceTaxLine[];
}

export type InvoiceInsert = Omit<
  Invoice,
  "id" | "factory_id" | "created_at" | "updated_at" | "invoice_line_items" | "invoice_charges" | "invoice_tax_lines"
>;

export type LineItemInsert = Omit<InvoiceLineItem, "id" | "invoice_id"> & { sort_order?: number };
export type ChargeInsert = Omit<InvoiceCharge, "id" | "invoice_id"> & { sort_order?: number };
export type TaxLineInsert = Omit<InvoiceTaxLine, "id" | "invoice_id"> & { sort_order?: number };

export function calcLineItemTotal(li: Pick<InvoiceLineItem, "quantity" | "unit_price" | "discount_pct">) {
  const gross = li.quantity * li.unit_price;
  return gross * (1 - (li.discount_pct ?? 0) / 100);
}

export function calcInvoiceTotals(
  lineItems: Pick<InvoiceLineItem, "quantity" | "unit_price" | "discount_pct">[],
  exchangeRate: number,
  discountPct = 0,
  charges: Pick<InvoiceCharge, "amount" | "is_deduct">[] = [],
  taxLines: Pick<InvoiceTaxLine, "amount">[] = []
) {
  const subtotal = lineItems.reduce((sum, li) => sum + calcLineItemTotal(li), 0);
  const discountAmt = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmt;
  const chargesTotal = charges.reduce((sum, c) => c.is_deduct ? sum - c.amount : sum + c.amount, 0);
  const taxTotal = taxLines.reduce((sum, t) => sum + t.amount, 0);
  const totalUsd = afterDiscount + chargesTotal + taxTotal;
  const totalBdt = totalUsd * exchangeRate;
  return { subtotal, discountAmt, afterDiscount, chargesTotal, taxTotal, totalUsd, totalBdt };
}

async function generateInvoiceNumber(factoryId: string, prefix = "INV"): Promise<string> {
  const year = new Date().getFullYear();
  const pfx = `${prefix}-${year}-`;
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("factory_id", factoryId)
    .ilike("invoice_number", `${pfx}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    const seq = parseInt((data[0] as any).invoice_number.replace(pfx, ""), 10);
    return `${pfx}${String(seq + 1).padStart(3, "0")}`;
  }
  return `${pfx}001`;
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useInvoices() {
  const { factory } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*, invoice_line_items(*)")
      .eq("factory_id", factory.id)
      .order("created_at", { ascending: false });

    if (error) toast.error("Failed to load invoices", { description: error.message });
    else setInvoices((data as unknown as Invoice[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { invoices, loading, refetch: fetch };
}

// ── Single invoice ────────────────────────────────────────────────────────────

export function useInvoice(id: string | undefined) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(!!id);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*, invoice_line_items(*), invoice_charges(*), invoice_tax_lines(*)")
      .eq("id", id)
      .single();

    if (error) {
      toast.error("Failed to load invoice", { description: error.message });
      setLoading(false);
      return;
    }

    const inv = data as unknown as Invoice;
    if (inv.invoice_line_items) {
      inv.invoice_line_items = [...inv.invoice_line_items].sort((a, b) => a.sort_order - b.sort_order);
    }
    if (inv.invoice_charges) {
      inv.invoice_charges = [...inv.invoice_charges].sort((a, b) => a.sort_order - b.sort_order);
    }
    setInvoice(inv);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { invoice, loading, refetch: fetch };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useInvoiceMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function createInvoice(
    fields: Omit<InvoiceInsert, "invoice_number" | "created_by">,
    lineItems: LineItemInsert[],
    charges: ChargeInsert[] = [],
    taxLines: TaxLineInsert[] = []
  ): Promise<Invoice | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      const invoice_number = await generateInvoiceNumber(factory.id);
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          ...(fields as any),
          factory_id: factory.id,
          invoice_number,
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (invErr) throw invErr;

      const invoiceId = (inv as any).id as string;

      if (lineItems.length > 0) {
        const { error: liErr } = await supabase.from("invoice_line_items").insert(
          lineItems.map((li, i) => ({ ...li, invoice_id: invoiceId, sort_order: li.sort_order ?? i }))
        );
        if (liErr) throw liErr;
      }
      if (charges.length > 0) {
        const { error: cErr } = await supabase.from("invoice_charges").insert(
          charges.map((c, i) => ({ ...c, invoice_id: invoiceId, sort_order: c.sort_order ?? i }))
        );
        if (cErr) throw cErr;
      }
      if (taxLines.length > 0) {
        const { error: tErr } = await supabase.from("invoice_tax_lines").insert(
          taxLines.map((t, i) => ({ ...t, invoice_id: invoiceId, sort_order: t.sort_order ?? i }))
        );
        if (tErr) throw tErr;
      }

      toast.success(`Invoice ${invoice_number} created`);
      return inv as unknown as Invoice;
    } catch (e: any) {
      toast.error("Failed to create invoice", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateInvoice(
    id: string,
    fields: Partial<InvoiceInsert>,
    lineItems?: LineItemInsert[],
    charges?: ChargeInsert[],
    taxLines?: TaxLineInsert[]
  ): Promise<boolean> {
    setSaving(true);
    try {
      const { error: invErr } = await supabase.from("invoices").update(fields as any).eq("id", id);
      if (invErr) throw invErr;

      if (lineItems !== undefined) {
        await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
        if (lineItems.length > 0) {
          const { error: liErr } = await supabase.from("invoice_line_items").insert(
            lineItems.map((li, i) => ({ ...li, invoice_id: id, sort_order: li.sort_order ?? i }))
          );
          if (liErr) throw liErr;
        }
      }
      if (charges !== undefined) {
        await supabase.from("invoice_charges").delete().eq("invoice_id", id);
        if (charges.length > 0) {
          const { error: cErr } = await supabase.from("invoice_charges").insert(
            charges.map((c, i) => ({ ...c, invoice_id: id, sort_order: c.sort_order ?? i }))
          );
          if (cErr) throw cErr;
        }
      }
      if (taxLines !== undefined) {
        await supabase.from("invoice_tax_lines").delete().eq("invoice_id", id);
        if (taxLines.length > 0) {
          const { error: tErr } = await supabase.from("invoice_tax_lines").insert(
            taxLines.map((t, i) => ({ ...t, invoice_id: id, sort_order: t.sort_order ?? i }))
          );
          if (tErr) throw tErr;
        }
      }

      toast.success("Invoice updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update invoice", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: Invoice["status"]): Promise<boolean> {
    const { error } = await supabase.from("invoices").update({ status } as any).eq("id", id);
    if (error) { toast.error("Failed to update status"); return false; }
    toast.success(`Marked as ${status}`);
    return true;
  }

  async function deleteInvoice(id: string): Promise<boolean> {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast.error("Failed to delete invoice"); return false; }
    toast.success("Invoice deleted");
    return true;
  }

  return { createInvoice, updateInvoice, updateStatus, deleteInvoice, saving };
}

// ── Work order options ────────────────────────────────────────────────────────

export interface WorkOrderOption {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  style_number: string | null;
  hs_code: string | null;
  item: string | null;
  color: string | null;
  order_qty: number;
  selling_price: number | null;
}

export function useWorkOrderOptions() {
  const { factory } = useAuth();
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);

  useEffect(() => {
    if (!factory?.id) return;
    supabase
      .from("work_orders")
      .select("id, po_number, buyer, style, style_number, hs_code, item, color, order_qty, selling_price")
      .eq("factory_id", factory.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setWorkOrders((data as any[]) ?? []));
  }, [factory?.id]);

  return workOrders;
}
