import { useState, useEffect } from "react";
import {
  Settings, Loader2, Save, Building2, Landmark, FileText,
  ChevronDown, ChevronUp, Plus, Trash2, Star, Edit2, X, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useFactoryFinanceSettings } from "@/hooks/useFactoryFinanceSettings";
import { useFactoryBankAccounts, type FactoryBankAccount, type BankAccountInsert } from "@/hooks/useFactoryBankAccounts";
import { cn } from "@/lib/utils";

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

const EMPTY_BANK: BankAccountInsert = {
  account_label: "",
  bank_name: null,
  bank_address: null,
  account_name: null,
  account_number: null,
  iban: null,
  routing_number: null,
  swift_bic: null,
  branch: null,
  currency: "USD",
  is_default: false,
};

function BankAccountForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: BankAccountInsert;
  onSave: (v: BankAccountInsert) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<BankAccountInsert>(initial);
  const f = (field: keyof BankAccountInsert, value: string | null | boolean) =>
    setForm((p) => ({ ...p, [field]: value }));

  return (
    <div className="border border-border rounded-xl p-4 space-y-4 bg-muted/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Account Label *</Label>
          <Input value={form.account_label} onChange={(e) => f("account_label", e.target.value)} placeholder="e.g. USD Export Account" />
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Input value={form.currency ?? ""} onChange={(e) => f("currency", e.target.value.toUpperCase())} placeholder="USD" maxLength={5} />
        </div>
        <div className="space-y-1.5">
          <Label>Bank Name</Label>
          <Input value={form.bank_name ?? ""} onChange={(e) => f("bank_name", e.target.value || null)} placeholder="e.g. Dutch-Bangla Bank Ltd." />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Bank Address</Label>
          <Input value={form.bank_address ?? ""} onChange={(e) => f("bank_address", e.target.value || null)} placeholder="Full bank branch address" />
        </div>
        <div className="space-y-1.5">
          <Label>Account Name</Label>
          <Input value={form.account_name ?? ""} onChange={(e) => f("account_name", e.target.value || null)} placeholder="Account holder name" />
        </div>
        <div className="space-y-1.5">
          <Label>Account Number</Label>
          <Input value={form.account_number ?? ""} onChange={(e) => f("account_number", e.target.value || null)} placeholder="Account number" />
        </div>
        <div className="space-y-1.5">
          <Label>IBAN</Label>
          <Input value={form.iban ?? ""} onChange={(e) => f("iban", e.target.value.toUpperCase() || null)} placeholder="e.g. GB29NWBK60161331926819" />
        </div>
        <div className="space-y-1.5">
          <Label>SWIFT / BIC</Label>
          <Input value={form.swift_bic ?? ""} onChange={(e) => f("swift_bic", e.target.value.toUpperCase() || null)} placeholder="e.g. DBBLBDDH" />
        </div>
        <div className="space-y-1.5">
          <Label>Routing Number</Label>
          <Input value={form.routing_number ?? ""} onChange={(e) => f("routing_number", e.target.value || null)} placeholder="Bank routing / sort code" />
        </div>
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Input value={form.branch ?? ""} onChange={(e) => f("branch", e.target.value || null)} placeholder="Branch name" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => f("is_default", e.target.checked)}
            className="rounded border-border"
          />
          Set as default account
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1.5" />Cancel
          </Button>
          <Button
            type="button" size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={saving || !form.account_label.trim()}
            onClick={() => onSave(form)}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            Save Account
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function FinanceSettings() {
  const { settings, loading: loadingSettings, saving: savingSettings, saveSettings } = useFactoryFinanceSettings();
  const { accounts, loading: loadingBanks, saving: savingBanks, createAccount, updateAccount, deleteAccount, setDefault } = useFactoryBankAccounts();

  const [openSeller, setOpenSeller] = useState(true);
  const [openBank, setOpenBank] = useState(true);
  const [openInvoice, setOpenInvoice] = useState(true);

  // Invoice settings
  const [invoicePrefix, setInvoicePrefix] = useState("INV");

  // Seller / company info
  const [sellerName, setSellerName] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [sellerCity, setSellerCity] = useState("");
  const [sellerCountry, setSellerCountry] = useState("Bangladesh");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const [binNumber, setBinNumber] = useState("");

  // Bank UI state
  const [addingBank, setAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setInvoicePrefix(settings.invoice_prefix ?? "INV");
    setSellerName(settings.seller_name ?? "");
    setSellerAddress(settings.seller_address ?? "");
    setSellerCity(settings.seller_city ?? "");
    setSellerCountry(settings.seller_country ?? "Bangladesh");
    setSellerPhone(settings.seller_phone ?? "");
    setSellerEmail(settings.seller_email ?? "");
    setTinNumber(settings.tin_number ?? "");
    setBinNumber(settings.bin_number ?? "");
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      invoice_prefix: invoicePrefix.trim() || "INV",
      seller_name: sellerName.trim() || null,
      seller_address: sellerAddress.trim() || null,
      seller_city: sellerCity.trim() || null,
      seller_country: sellerCountry.trim() || null,
      seller_phone: sellerPhone.trim() || null,
      seller_email: sellerEmail.trim() || null,
      tin_number: tinNumber.trim() || null,
      bin_number: binNumber.trim() || null,
      bank_name: null,
      bank_account_name: null,
      bank_account_no: null,
      bank_routing_no: null,
      bank_swift: null,
      bank_branch: null,
      stamp_url: settings?.stamp_url ?? null,
      signature_url: settings?.signature_url ?? null,
    });
  };

  if (loadingSettings || loadingBanks) {
    return (
      <div className="py-6 space-y-4 max-w-3xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="py-3 md:py-4 lg:py-6 space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
          <Settings className="h-5 w-5 text-purple-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Finance Settings</h1>
          <p className="text-sm text-muted-foreground">Company info, bank accounts, and invoice preferences</p>
        </div>
      </div>

      {/* ── Invoice Preferences ── */}
      <Section icon={FileText} title="Invoice Preferences" description="Invoice numbering and defaults" open={openInvoice} onToggle={() => setOpenInvoice(!openInvoice)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="prefix">Invoice Number Prefix</Label>
            <Input id="prefix" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} placeholder="INV" maxLength={10} />
            <p className="text-xs text-muted-foreground">
              e.g. <span className="font-mono">INV</span> → <span className="font-mono">INV-2026-001</span>
            </p>
          </div>
        </div>
      </Section>

      {/* ── Company Information ── */}
      <Section icon={Building2} title="Company Information" description="Appears in the seller section of all invoices" open={openSeller} onToggle={() => setOpenSeller(!openSeller)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Company / Seller Name</Label>
            <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="e.g. WovenTex Ltd." />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Textarea value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} placeholder="Street address" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={sellerCity} onChange={(e) => setSellerCity(e.target.value)} placeholder="e.g. Dhaka" />
          </div>
          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input value={sellerCountry} onChange={(e) => setSellerCountry(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} placeholder="+880 ..." />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} placeholder="accounts@yourcompany.com" />
          </div>
          <div className="space-y-1.5">
            <Label>TIN Number</Label>
            <Input value={tinNumber} onChange={(e) => setTinNumber(e.target.value)} placeholder="Tax Identification Number" />
          </div>
          <div className="space-y-1.5">
            <Label>BIN Number</Label>
            <Input value={binNumber} onChange={(e) => setBinNumber(e.target.value)} placeholder="Business Identification Number" />
          </div>
        </div>
      </Section>

      {/* Save company settings */}
      <div className="flex justify-end">
        <Button type="submit" disabled={savingSettings} className="bg-purple-600 hover:bg-purple-700 text-white">
          {savingSettings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>

      {/* ── Bank Accounts (separate section, not inside form submit) ── */}
      <Section icon={Landmark} title="Bank Accounts" description={`${accounts.length} account${accounts.length !== 1 ? "s" : ""} — selectable per invoice`} open={openBank} onToggle={() => setOpenBank(!openBank)}>
        <div className="space-y-3">
          {/* Existing accounts */}
          {accounts.map((acct) => (
            <div key={acct.id}>
              {editingBankId === acct.id ? (
                <BankAccountForm
                  initial={{
                    account_label: acct.account_label,
                    bank_name: acct.bank_name,
                    bank_address: acct.bank_address,
                    account_name: acct.account_name,
                    account_number: acct.account_number,
                    iban: acct.iban,
                    routing_number: acct.routing_number,
                    swift_bic: acct.swift_bic,
                    branch: acct.branch,
                    currency: acct.currency,
                    is_default: acct.is_default,
                  }}
                  onSave={async (v) => {
                    const ok = await updateAccount(acct.id, v);
                    if (ok) setEditingBankId(null);
                  }}
                  onCancel={() => setEditingBankId(null)}
                  saving={savingBanks}
                />
              ) : (
                <div className={cn(
                  "flex items-start justify-between gap-3 p-4 rounded-xl border",
                  acct.is_default ? "border-purple-500/30 bg-purple-500/5" : "border-border bg-card"
                )}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{acct.account_label}</span>
                      {acct.currency && (
                        <span className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">{acct.currency}</span>
                      )}
                      {acct.is_default && (
                        <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 py-0">
                          <Star className="h-2.5 w-2.5 mr-1" />Default
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {acct.bank_name && <p>{acct.bank_name}{acct.branch ? ` · ${acct.branch}` : ""}</p>}
                      {acct.bank_address && <p>{acct.bank_address}</p>}
                      {acct.account_name && <p>A/C: {acct.account_name}</p>}
                      {acct.account_number && <p className="font-mono">No: {acct.account_number}</p>}
                      {acct.iban && <p className="font-mono">IBAN: {acct.iban}</p>}
                      {acct.swift_bic && <p className="font-mono">SWIFT: {acct.swift_bic}</p>}
                      {acct.routing_number && <p className="font-mono">Routing: {acct.routing_number}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!acct.is_default && (
                      <Button
                        type="button" variant="ghost" size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={() => setDefault(acct.id)}
                        title="Set as default"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingBankId(acct.id)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteAccount(acct.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add new account form */}
          {addingBank ? (
            <BankAccountForm
              initial={{ ...EMPTY_BANK, is_default: accounts.length === 0 }}
              onSave={async (v) => {
                const ok = await createAccount(v);
                if (ok) setAddingBank(false);
              }}
              onCancel={() => setAddingBank(false)}
              saving={savingBanks}
            />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setAddingBank(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Bank Account
            </Button>
          )}
        </div>
      </Section>

      <div className="pb-8" />
    </form>
  );
}
