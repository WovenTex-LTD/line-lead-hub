import { useState, useEffect, useCallback } from "react";
import {
  Settings, Loader2, Save, Landmark, Bell, Plus, Trash2, Star,
  Edit2, X, Check, ChevronDown, ChevronUp, Phone, Mail, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Section component (matches FinanceSettings pattern) ────────────────────

function Section({
  icon: Icon, title, description, open, onToggle, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-purple-500" />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <>
          <Separator />
          <CardContent className="pt-5 pb-6 space-y-4">{children}</CardContent>
        </>
      )}
    </Card>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

interface BankRelationship {
  id: string;
  factory_id: string;
  bank_name: string;
  branch: string | null;
  rm_name: string | null;
  rm_phone: string | null;
  rm_email: string | null;
  lc_limit: number;
  lc_utilized: number;
  btb_limit: number;
  btb_utilized: number;
  is_primary: boolean;
  created_at: string;
}

type BankRelationshipInsert = Omit<BankRelationship, "id" | "factory_id" | "created_at">;

interface LCNotificationSettings {
  lc_expiry_warning_days: number;
  shipment_date_warning_days: number;
  btb_maturity_warning_days: number;
  presentation_deadline_warning_days: number;
  notify_on_amendment: boolean;
  notify_on_discrepancy: boolean;
  notify_on_payment: boolean;
}

const EMPTY_BANK: BankRelationshipInsert = {
  bank_name: "",
  branch: null,
  rm_name: null,
  rm_phone: null,
  rm_email: null,
  lc_limit: 0,
  lc_utilized: 0,
  btb_limit: 0,
  btb_utilized: 0,
  is_primary: false,
};

const DEFAULT_NOTIFICATION_SETTINGS: LCNotificationSettings = {
  lc_expiry_warning_days: 30,
  shipment_date_warning_days: 14,
  btb_maturity_warning_days: 7,
  presentation_deadline_warning_days: 5,
  notify_on_amendment: true,
  notify_on_discrepancy: true,
  notify_on_payment: true,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

function useBankRelationships() {
  const { factory } = useAuth();
  const [banks, setBanks] = useState<BankRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("lc_bank_relationships" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .order("is_primary", { ascending: false });
    if (error) toast.error("Failed to load bank relationships");
    else setBanks((data as unknown as BankRelationship[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { banks, loading, refetch: fetch };
}

function useBankRelationshipMutations() {
  const { factory } = useAuth();
  const [saving, setSaving] = useState(false);

  async function createBank(fields: BankRelationshipInsert): Promise<boolean> {
    if (!factory?.id) return false;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lc_bank_relationships" as any)
        .insert({ ...(fields as any), factory_id: factory.id });
      if (error) throw error;
      toast.success("Bank relationship added");
      return true;
    } catch (e: any) {
      toast.error("Failed to add bank", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateBank(id: string, fields: Partial<BankRelationshipInsert>): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lc_bank_relationships" as any)
        .update(fields as any)
        .eq("id", id);
      if (error) throw error;
      toast.success("Bank relationship updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update bank", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteBank(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("lc_bank_relationships" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete bank");
      return false;
    }
    toast.success("Bank relationship deleted");
    return true;
  }

  async function setPrimary(id: string): Promise<boolean> {
    if (!factory?.id) return false;
    try {
      // Clear primary on all banks
      await supabase
        .from("lc_bank_relationships" as any)
        .update({ is_primary: false } as any)
        .eq("factory_id", factory.id);
      // Set this one as primary
      const { error } = await supabase
        .from("lc_bank_relationships" as any)
        .update({ is_primary: true } as any)
        .eq("id", id);
      if (error) throw error;
      toast.success("Set as primary bank");
      return true;
    } catch (e: any) {
      toast.error("Failed to set primary", { description: e.message });
      return false;
    }
  }

  return { createBank, updateBank, deleteBank, setPrimary, saving };
}

function useLCNotificationSettings() {
  const { factory } = useAuth();
  const [settings, setSettings] = useState<LCNotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("lc_notification_settings" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .single();
    if (!error && data) {
      setSettings(data as unknown as LCNotificationSettings);
    }
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function saveSettings(values: LCNotificationSettings): Promise<boolean> {
    if (!factory?.id) return false;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lc_notification_settings" as any)
        .upsert({ ...(values as any), factory_id: factory.id });
      if (error) throw error;
      setSettings(values);
      toast.success("Notification settings saved");
      return true;
    } catch (e: any) {
      toast.error("Failed to save settings", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { settings, loading, saving, saveSettings };
}

// ── Utilisation bar ────────────────────────────────────────────────────────

function UtilisationBar({ label, utilized, limit }: { label: string; utilized: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((utilized / limit) * 100)) : 0;
  const fmtK = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{fmtK(utilized)} / {fmtK(limit)}</span>
      </div>
      <Progress value={pct} className="h-2" />
      <p className="text-[10px] text-muted-foreground text-right">{pct}% utilized</p>
    </div>
  );
}

// ── Bank relationship form ─────────────────────────────────────────────────

function BankRelationshipForm({
  initial, onSave, onCancel, saving,
}: {
  initial: BankRelationshipInsert;
  onSave: (v: BankRelationshipInsert) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<BankRelationshipInsert>(initial);
  const f = (field: keyof BankRelationshipInsert, value: any) =>
    setForm((p) => ({ ...p, [field]: value }));

  return (
    <div className="border border-border rounded-xl p-4 space-y-4 bg-muted/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Bank Name *</Label>
          <Input value={form.bank_name} onChange={(e) => f("bank_name", e.target.value)} placeholder="e.g. Dutch-Bangla Bank Ltd." />
        </div>
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Input value={form.branch ?? ""} onChange={(e) => f("branch", e.target.value || null)} placeholder="Branch name" />
        </div>
        <div className="space-y-1.5">
          <Label>RM Name</Label>
          <Input value={form.rm_name ?? ""} onChange={(e) => f("rm_name", e.target.value || null)} placeholder="Relationship Manager" />
        </div>
        <div className="space-y-1.5">
          <Label>RM Phone</Label>
          <Input value={form.rm_phone ?? ""} onChange={(e) => f("rm_phone", e.target.value || null)} placeholder="+880..." />
        </div>
        <div className="space-y-1.5">
          <Label>RM Email</Label>
          <Input type="email" value={form.rm_email ?? ""} onChange={(e) => f("rm_email", e.target.value || null)} placeholder="rm@bank.com" />
        </div>
        <div className="space-y-1.5">
          <Label>LC Limit ($)</Label>
          <Input type="number" value={form.lc_limit || ""} onChange={(e) => f("lc_limit", parseFloat(e.target.value) || 0)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>LC Utilized ($)</Label>
          <Input type="number" value={form.lc_utilized || ""} onChange={(e) => f("lc_utilized", parseFloat(e.target.value) || 0)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>BTB Limit ($)</Label>
          <Input type="number" value={form.btb_limit || ""} onChange={(e) => f("btb_limit", parseFloat(e.target.value) || 0)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>BTB Utilized ($)</Label>
          <Input type="number" value={form.btb_utilized || ""} onChange={(e) => f("btb_utilized", parseFloat(e.target.value) || 0)} placeholder="0" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={(e) => f("is_primary", e.target.checked)}
            className="rounded border-border"
          />
          Set as primary bank
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1.5" />Cancel
          </Button>
          <Button
            type="button" size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={saving || !form.bank_name.trim()}
            onClick={() => onSave(form)}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            Save Bank
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LCSettings() {
  const { banks, loading: loadingBanks, refetch: refetchBanks } = useBankRelationships();
  const { createBank, updateBank, deleteBank, setPrimary, saving: savingBanks } = useBankRelationshipMutations();
  const { settings: notifSettings, loading: loadingNotif, saving: savingNotif, saveSettings } = useLCNotificationSettings();

  const [openBanks, setOpenBanks] = useState(true);
  const [openNotifications, setOpenNotifications] = useState(true);

  // Bank UI state
  const [addingBank, setAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);

  // Notification form
  const [lcExpiryDays, setLcExpiryDays] = useState(30);
  const [shipmentDays, setShipmentDays] = useState(14);
  const [btbMaturityDays, setBtbMaturityDays] = useState(7);
  const [presentationDays, setPresentationDays] = useState(5);
  const [notifyAmendment, setNotifyAmendment] = useState(true);
  const [notifyDiscrepancy, setNotifyDiscrepancy] = useState(true);
  const [notifyPayment, setNotifyPayment] = useState(true);

  useEffect(() => {
    if (!notifSettings) return;
    setLcExpiryDays(notifSettings.lc_expiry_warning_days);
    setShipmentDays(notifSettings.shipment_date_warning_days);
    setBtbMaturityDays(notifSettings.btb_maturity_warning_days);
    setPresentationDays(notifSettings.presentation_deadline_warning_days);
    setNotifyAmendment(notifSettings.notify_on_amendment);
    setNotifyDiscrepancy(notifSettings.notify_on_discrepancy);
    setNotifyPayment(notifSettings.notify_on_payment);
  }, [notifSettings]);

  const handleSaveNotifications = async () => {
    await saveSettings({
      lc_expiry_warning_days: lcExpiryDays,
      shipment_date_warning_days: shipmentDays,
      btb_maturity_warning_days: btbMaturityDays,
      presentation_deadline_warning_days: presentationDays,
      notify_on_amendment: notifyAmendment,
      notify_on_discrepancy: notifyDiscrepancy,
      notify_on_payment: notifyPayment,
    });
  };

  if (loadingBanks || loadingNotif) {
    return (
      <div className="py-6 space-y-4 max-w-3xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
          <Settings className="h-5 w-5 text-purple-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">LC Settings</h1>
          <p className="text-sm text-muted-foreground">Bank relationships, limits, and notification preferences</p>
        </div>
      </div>

      {/* ── Bank Relationships ── */}
      <Section
        icon={Landmark}
        title="Bank Relationships"
        description={`${banks.length} bank${banks.length !== 1 ? "s" : ""} configured`}
        open={openBanks}
        onToggle={() => setOpenBanks(!openBanks)}
      >
        <div className="space-y-3">
          {/* Bank cards grid */}
          <div className="grid grid-cols-1 gap-3">
            {banks.map((bank) => (
              <div key={bank.id}>
                {editingBankId === bank.id ? (
                  <BankRelationshipForm
                    initial={{
                      bank_name: bank.bank_name,
                      branch: bank.branch,
                      rm_name: bank.rm_name,
                      rm_phone: bank.rm_phone,
                      rm_email: bank.rm_email,
                      lc_limit: bank.lc_limit,
                      lc_utilized: bank.lc_utilized,
                      btb_limit: bank.btb_limit,
                      btb_utilized: bank.btb_utilized,
                      is_primary: bank.is_primary,
                    }}
                    onSave={async (v) => {
                      const ok = await updateBank(bank.id, v);
                      if (ok) { setEditingBankId(null); refetchBanks(); }
                    }}
                    onCancel={() => setEditingBankId(null)}
                    saving={savingBanks}
                  />
                ) : (
                  <div className={cn(
                    "p-4 rounded-xl border",
                    bank.is_primary ? "border-purple-500/30 bg-purple-500/5" : "border-border bg-card"
                  )}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm">{bank.bank_name}</span>
                          {bank.branch && (
                            <span className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">{bank.branch}</span>
                          )}
                          {bank.is_primary && (
                            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 py-0">
                              <Star className="h-2.5 w-2.5 mr-1" />Primary
                            </Badge>
                          )}
                        </div>
                        {/* RM details */}
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {bank.rm_name && (
                            <p className="flex items-center gap-1.5">
                              <User className="h-3 w-3" />{bank.rm_name}
                            </p>
                          )}
                          {bank.rm_phone && (
                            <p className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3" />{bank.rm_phone}
                            </p>
                          )}
                          {bank.rm_email && (
                            <p className="flex items-center gap-1.5">
                              <Mail className="h-3 w-3" />{bank.rm_email}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!bank.is_primary && (
                          <Button
                            type="button" variant="ghost" size="sm"
                            className="h-8 text-xs text-muted-foreground"
                            onClick={async () => { await setPrimary(bank.id); refetchBanks(); }}
                            title="Set as primary"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingBankId(bank.id)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={async () => { await deleteBank(bank.id); refetchBanks(); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Utilisation bars */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <UtilisationBar label="LC Limit" utilized={bank.lc_utilized} limit={bank.lc_limit} />
                      <UtilisationBar label="BTB Limit" utilized={bank.btb_utilized} limit={bank.btb_limit} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add new bank */}
          {addingBank ? (
            <BankRelationshipForm
              initial={{ ...EMPTY_BANK, is_primary: banks.length === 0 }}
              onSave={async (v) => {
                const ok = await createBank(v);
                if (ok) { setAddingBank(false); refetchBanks(); }
              }}
              onCancel={() => setAddingBank(false)}
              saving={savingBanks}
            />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setAddingBank(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Bank
            </Button>
          )}
        </div>
      </Section>

      {/* ── Notification Preferences ── */}
      <Section
        icon={Bell}
        title="Notification Preferences"
        description="Warning thresholds and alert toggles for LC management"
        open={openNotifications}
        onToggle={() => setOpenNotifications(!openNotifications)}
      >
        <div className="space-y-5">
          {/* Warning days inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>LC Expiry Warning (days)</Label>
              <Input
                type="number" min={1} max={365}
                value={lcExpiryDays}
                onChange={(e) => setLcExpiryDays(parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">Alert when LC expires within this many days</p>
            </div>
            <div className="space-y-1.5">
              <Label>Shipment Date Warning (days)</Label>
              <Input
                type="number" min={1} max={365}
                value={shipmentDays}
                onChange={(e) => setShipmentDays(parseInt(e.target.value) || 14)}
              />
              <p className="text-xs text-muted-foreground">Alert when latest shipment date approaches</p>
            </div>
            <div className="space-y-1.5">
              <Label>BTB Maturity Warning (days)</Label>
              <Input
                type="number" min={1} max={365}
                value={btbMaturityDays}
                onChange={(e) => setBtbMaturityDays(parseInt(e.target.value) || 7)}
              />
              <p className="text-xs text-muted-foreground">Alert when BTB LC maturity date approaches</p>
            </div>
            <div className="space-y-1.5">
              <Label>Presentation Deadline Warning (days)</Label>
              <Input
                type="number" min={1} max={365}
                value={presentationDays}
                onChange={(e) => setPresentationDays(parseInt(e.target.value) || 5)}
              />
              <p className="text-xs text-muted-foreground">Alert when document presentation deadline approaches</p>
            </div>
          </div>

          <Separator />

          {/* Toggle switches */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Notify on Amendment</p>
                <p className="text-xs text-muted-foreground">Get alerted when an LC amendment is received</p>
              </div>
              <Switch checked={notifyAmendment} onCheckedChange={setNotifyAmendment} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Notify on Discrepancy</p>
                <p className="text-xs text-muted-foreground">Get alerted when a document discrepancy is raised</p>
              </div>
              <Switch checked={notifyDiscrepancy} onCheckedChange={setNotifyDiscrepancy} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Notify on Payment</p>
                <p className="text-xs text-muted-foreground">Get alerted when LC payment is received or BTB payment is due</p>
              </div>
              <Switch checked={notifyPayment} onCheckedChange={setNotifyPayment} />
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={savingNotif}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleSaveNotifications}
            >
              {savingNotif ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Notification Settings
            </Button>
          </div>
        </div>
      </Section>

      <div className="pb-8" />
    </div>
  );
}
