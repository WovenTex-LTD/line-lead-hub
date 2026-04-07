import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface FactoryFinanceSettings {
  id: string;
  factory_id: string;
  invoice_prefix: string;
  seller_name: string | null;
  seller_address: string | null;
  seller_city: string | null;
  seller_country: string | null;
  seller_phone: string | null;
  seller_email: string | null;
  tin_number: string | null;
  bin_number: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_routing_no: string | null;
  bank_swift: string | null;
  bank_branch: string | null;
  stamp_url: string | null;
  signature_url: string | null;
}

export type FinanceSettingsUpsert = Omit<FactoryFinanceSettings, "id" | "factory_id">;

export function useFactoryFinanceSettings() {
  const { factory } = useAuth();
  const [settings, setSettings] = useState<FactoryFinanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("factory_finance_settings")
      .select("*")
      .eq("factory_id", factory.id)
      .maybeSingle();

    if (error) toast.error("Failed to load finance settings", { description: error.message });
    else setSettings(data as unknown as FactoryFinanceSettings | null);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function saveSettings(values: FinanceSettingsUpsert): Promise<boolean> {
    if (!factory?.id) return false;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("factory_finance_settings")
        .upsert(
          { ...values, factory_id: factory.id } as any,
          { onConflict: "factory_id" }
        );
      if (error) throw error;
      toast.success("Finance settings saved");
      await fetch();
      return true;
    } catch (e: any) {
      toast.error("Failed to save settings", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { settings, loading, saving, saveSettings, refetch: fetch };
}
