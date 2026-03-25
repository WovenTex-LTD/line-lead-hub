import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface BuyerMembership {
  id: string;
  factory_id: string;
  is_active: boolean;
  company_name: string | null;
  created_at: string | null;
  factory_name: string;
  factory_timezone: string;
  po_count: number;
}

export function useBuyerMemberships() {
  const { user, isBuyerUser } = useAuth();
  const [memberships, setMemberships] = useState<BuyerMembership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !isBuyerUser()) {
      setMemberships([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchMemberships() {
      setLoading(true);

      // Fetch memberships with factory details
      const { data: membershipData, error: membershipError } = await supabase
        .from("buyer_factory_memberships")
        .select("id, factory_id, is_active, company_name, created_at, factory_accounts(name, timezone)")
        .eq("user_id", user!.id)
        .eq("is_active", true);

      if (cancelled) return;

      if (membershipError) {
        console.error("[useBuyerMemberships] Error:", membershipError.message);
        setLoading(false);
        return;
      }

      if (!membershipData || membershipData.length === 0) {
        setMemberships([]);
        setLoading(false);
        return;
      }

      // Fetch PO counts per factory
      const factoryIds = membershipData.map(m => m.factory_id);
      const { data: poCountData } = await supabase
        .from("buyer_po_access")
        .select("factory_id")
        .eq("user_id", user!.id)
        .in("factory_id", factoryIds);

      if (cancelled) return;

      // Count POs per factory
      const poCountMap = new Map<string, number>();
      for (const row of poCountData || []) {
        poCountMap.set(row.factory_id, (poCountMap.get(row.factory_id) || 0) + 1);
      }

      const result: BuyerMembership[] = membershipData.map(m => {
        const factory = m.factory_accounts as unknown as { name: string; timezone: string } | null;
        return {
          id: m.id,
          factory_id: m.factory_id,
          is_active: m.is_active,
          company_name: m.company_name,
          created_at: m.created_at,
          factory_name: factory?.name || "Unknown Factory",
          factory_timezone: factory?.timezone || "Asia/Dhaka",
          po_count: poCountMap.get(m.factory_id) || 0,
        };
      });

      setMemberships(result);
      setLoading(false);
    }

    fetchMemberships();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { memberships, loading, membershipCount: memberships.length };
}
