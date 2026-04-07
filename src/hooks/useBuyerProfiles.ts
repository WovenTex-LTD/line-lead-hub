import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface BuyerProfile {
  id: string;
  factory_id: string;
  company_name: string;
  display_name: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  default_payment_terms: string | null;
  default_incoterms: string | null;
  default_currency: string;
  agent_name: string | null;
  agent_contact: string | null;
  tax_id: string | null;
  notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BuyerProfileInsert = Omit<BuyerProfile, "id" | "factory_id" | "created_at" | "updated_at">;

export interface BuyerStats {
  buyerId: string;
  companyName: string;
  totalOrders: number;
  totalQuantity: number;
  orderValue: number;
  productionValue: number;
  activeOrders: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useBuyerProfiles() {
  const { factory } = useAuth();
  const [buyers, setBuyers] = useState<BuyerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("buyer_profiles")
      .select("*")
      .eq("factory_id", factory.id)
      .order("company_name", { ascending: true }) as any;

    if (error) toast.error("Failed to load buyer profiles", { description: error.message });
    else setBuyers((data as BuyerProfile[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { buyers, loading, refetch: fetch };
}

// ── Single buyer profile ──────────────────────────────────────────────────────

export function useBuyerProfile(id: string | undefined) {
  const [buyer, setBuyer] = useState<BuyerProfile | null>(null);
  const [loading, setLoading] = useState(!!id);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("buyer_profiles")
      .select("*")
      .eq("id", id)
      .single() as any;

    if (error) {
      toast.error("Failed to load buyer profile", { description: error.message });
      setLoading(false);
      return;
    }

    setBuyer(data as BuyerProfile);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { buyer, loading, refetch: fetch };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useBuyerProfileMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function createBuyer(fields: BuyerProfileInsert): Promise<BuyerProfile | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("buyer_profiles")
        .insert({
          ...(fields as any),
          factory_id: factory.id,
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      toast.success(`Buyer "${(data as any).company_name}" created`);
      return data as unknown as BuyerProfile;
    } catch (e: any) {
      toast.error("Failed to create buyer", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateBuyer(id: string, fields: Partial<BuyerProfileInsert>): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("buyer_profiles")
        .update(fields as any)
        .eq("id", id);
      if (error) throw error;

      toast.success("Buyer updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update buyer", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteBuyer(id: string): Promise<boolean> {
    const { error } = await supabase.from("buyer_profiles").delete().eq("id", id) as any;
    if (error) { toast.error("Failed to delete buyer"); return false; }
    toast.success("Buyer deleted");
    return true;
  }

  return { createBuyer, updateBuyer, deleteBuyer, saving };
}

// ── Buyer stats ───────────────────────────────────────────────────────────────

export function useBuyerStats() {
  const { factory } = useAuth();
  const [stats, setStats] = useState<Map<string, BuyerStats>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!factory?.id) return;
    setLoading(true);

    (async () => {
      try {
        // Fetch work orders grouped data
        const { data: orders, error: ordErr } = await supabase
          .from("work_orders")
          .select("id, buyer, order_qty, is_active, cm_per_dozen, commercial_price, created_at")
          .eq("factory_id", factory.id) as any;

        if (ordErr) throw ordErr;

        // Fetch sewing actuals joined with work orders for value calculation
        const { data: actuals, error: actErr } = await supabase
          .from("sewing_actuals")
          .select("good_today, work_order_id, work_orders!inner(factory_id, buyer, cm_per_dozen)")
          .eq("work_orders.factory_id", factory.id) as any;

        if (actErr) throw actErr;

        // Aggregate stats per buyer
        const map = new Map<string, BuyerStats>();

        for (const wo of (orders ?? []) as any[]) {
          const key = (wo.buyer ?? "").toUpperCase();
          if (!key) continue;

          let entry = map.get(key);
          if (!entry) {
            entry = {
              buyerId: key,
              companyName: wo.buyer,
              totalOrders: 0,
              totalQuantity: 0,
              orderValue: 0,
              productionValue: 0,
              activeOrders: 0,
              firstOrderDate: null,
              lastOrderDate: null,
            };
            map.set(key, entry);
          }

          entry.totalOrders += 1;
          const qty = wo.order_qty ?? 0;
          entry.totalQuantity += qty;
          // Order value = qty × commercial price per piece (if set)
          const commercialPrice = wo.commercial_price ?? 0;
          if (commercialPrice > 0 && qty > 0) entry.orderValue += qty * commercialPrice;
          if (wo.is_active) entry.activeOrders += 1;

          const d = wo.created_at as string | null;
          if (d) {
            if (!entry.firstOrderDate || d < entry.firstOrderDate) entry.firstOrderDate = d;
            if (!entry.lastOrderDate || d > entry.lastOrderDate) entry.lastOrderDate = d;
          }
        }

        // Aggregate value from sewing actuals
        for (const row of (actuals ?? []) as any[]) {
          const wo = row.work_orders;
          if (!wo) continue;
          const key = (wo.buyer ?? "").toUpperCase();
          const entry = map.get(key);
          if (!entry) continue;

          const cmPerDozen = wo.cm_per_dozen ?? 0;
          const goodToday = row.good_today ?? 0;
          entry.productionValue += (goodToday * cmPerDozen) / 12;
        }

        setStats(map);
      } catch (e: any) {
        toast.error("Failed to load buyer stats", { description: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [factory?.id]);

  return { stats, loading };
}

// ── Buyer work orders ─────────────────────────────────────────────────────────

export function useBuyerOrders(buyerName: string | undefined) {
  const { factory } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(!!buyerName);

  useEffect(() => {
    if (!factory?.id || !buyerName) return;
    setLoading(true);

    supabase
      .from("work_orders")
      .select("id, po_number, style, item, color, order_qty, status, is_active, cm_per_dozen, created_at, planned_ex_factory")
      .eq("factory_id", factory.id)
      .ilike("buyer", buyerName)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load buyer orders", { description: error.message });
        else setOrders((data as any[]) ?? []);
        setLoading(false);
      });
  }, [factory?.id, buyerName]);

  return { orders, loading };
}

// ── Buyer contracts ───────────────────────────────────────────────────────────

export function useBuyerContracts(buyerName: string | undefined) {
  const { factory } = useAuth();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(!!buyerName);

  useEffect(() => {
    if (!factory?.id || !buyerName) return;
    setLoading(true);

    supabase
      .from("sales_contracts")
      .select("*")
      .eq("factory_id", factory.id)
      .ilike("buyer_name", buyerName)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load buyer contracts", { description: error.message });
        else setContracts((data as any[]) ?? []);
        setLoading(false);
      });
  }, [factory?.id, buyerName]);

  return { contracts, loading };
}

// ── Buyer invoices ────────────────────────────────────────────────────────────

export function useBuyerInvoices(buyerName: string | undefined) {
  const { factory } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(!!buyerName);

  useEffect(() => {
    if (!factory?.id || !buyerName) return;
    setLoading(true);

    supabase
      .from("invoices")
      .select("*")
      .eq("factory_id", factory.id)
      .ilike("buyer_name", buyerName)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load buyer invoices", { description: error.message });
        else setInvoices((data as any[]) ?? []);
        setLoading(false);
      });
  }, [factory?.id, buyerName]);

  return { invoices, loading };
}
