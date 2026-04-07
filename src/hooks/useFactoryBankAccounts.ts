import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface FactoryBankAccount {
  id: string;
  factory_id: string;
  account_label: string;
  bank_name: string | null;
  bank_address: string | null;
  account_name: string | null;
  account_number: string | null;
  iban: string | null;
  routing_number: string | null;
  swift_bic: string | null;
  branch: string | null;
  currency: string | null;
  is_default: boolean;
  sort_order: number;
}

export type BankAccountInsert = Omit<FactoryBankAccount, "id" | "factory_id" | "sort_order">;

export function useFactoryBankAccounts() {
  const { factory } = useAuth();
  const [accounts, setAccounts] = useState<FactoryBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("factory_bank_accounts")
      .select("*")
      .eq("factory_id", factory.id)
      .order("sort_order", { ascending: true });

    if (error) toast.error("Failed to load bank accounts", { description: error.message });
    else setAccounts((data as unknown as FactoryBankAccount[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function createAccount(values: BankAccountInsert): Promise<boolean> {
    if (!factory?.id) return false;
    setSaving(true);
    try {
      const { error } = await supabase.from("factory_bank_accounts").insert({
        ...values,
        factory_id: factory.id,
        sort_order: accounts.length,
      } as any);
      if (error) throw error;
      // If this is the first account or marked default, ensure it's the only default
      if (values.is_default) await clearOtherDefaults(null);
      toast.success("Bank account added");
      await fetch();
      return true;
    } catch (e: any) {
      toast.error("Failed to add bank account", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateAccount(id: string, values: Partial<BankAccountInsert>): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase.from("factory_bank_accounts").update(values as any).eq("id", id);
      if (error) throw error;
      if (values.is_default) await clearOtherDefaults(id);
      toast.success("Bank account updated");
      await fetch();
      return true;
    } catch (e: any) {
      toast.error("Failed to update bank account", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(id: string): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase.from("factory_bank_accounts").delete().eq("id", id);
      if (error) throw error;
      toast.success("Bank account removed");
      await fetch();
      return true;
    } catch (e: any) {
      toast.error("Failed to remove bank account", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id: string): Promise<void> {
    await supabase.from("factory_bank_accounts").update({ is_default: false } as any).eq("factory_id", factory?.id ?? "");
    await supabase.from("factory_bank_accounts").update({ is_default: true } as any).eq("id", id);
    await fetch();
  }

  async function clearOtherDefaults(keepId: string | null) {
    if (!factory?.id) return;
    let q = supabase.from("factory_bank_accounts").update({ is_default: false } as any).eq("factory_id", factory.id);
    if (keepId) q = q.neq("id", keepId);
    await q;
  }

  const defaultAccount = accounts.find((a) => a.is_default) ?? accounts[0] ?? null;

  return { accounts, loading, saving, defaultAccount, createAccount, updateAccount, deleteAccount, setDefault, refetch: fetch };
}
