import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Plus, Search, Pencil, Trash2, Building2, Globe,
  Mail, Phone, Package, DollarSign, Calendar, TrendingUp,
  ArrowUpRight, Clock, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card, CardContent,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useBuyerProfiles,
  useBuyerProfileMutations,
  useBuyerStats,
  type BuyerProfile,
  type BuyerProfileInsert,
} from "@/hooks/useBuyerProfiles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Empty form state ────────────────────────────────────────────────────────

const EMPTY_FORM: BuyerProfileInsert = {
  company_name: "",
  display_name: null,
  country: null,
  city: null,
  address: null,
  contact_person: null,
  phone: null,
  email: null,
  website: null,
  default_payment_terms: null,
  default_incoterms: null,
  default_currency: "USD",
  agent_name: null,
  agent_contact: null,
  tax_id: null,
  notes: null,
  tags: null,
  is_active: true,
  created_by: null,
};

// ── Summary card ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", color)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <p className="text-xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function BuyerList() {
  const navigate = useNavigate();
  const { buyers, loading, refetch } = useBuyerProfiles();
  const { createBuyer, updateBuyer, deleteBuyer, saving } = useBuyerProfileMutations();
  const { stats, loading: statsLoading } = useBuyerStats();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState<BuyerProfile | null>(null);
  const [form, setForm] = useState<BuyerProfileInsert>({ ...EMPTY_FORM });
  const [tagsInput, setTagsInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BuyerProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Computed summaries ──────────────────────────────────────────────────

  const summaries = useMemo(() => {
    const allStats = Array.from(stats.values());
    const activeBuyers = allStats.filter((s) => s.activeOrders > 0).length;
    const totalOrderValue = allStats.reduce((sum, s) => sum + s.orderValue, 0);
    const totalProductionValue = allStats.reduce((sum, s) => sum + s.productionValue, 0);
    const totalOrders = allStats.reduce((sum, s) => sum + s.totalOrders, 0);
    const totalQuantity = allStats.reduce((sum, s) => sum + s.totalQuantity, 0);
    const avgOrderValue = totalOrders > 0 ? totalOrderValue / totalOrders : 0;
    return {
      totalBuyers: buyers.length,
      activeBuyers,
      totalOrderValue,
      totalProductionValue,
      totalOrders,
      totalQuantity,
      avgOrderValue,
    };
  }, [buyers, stats]);

  // ── Filtered buyers ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return buyers;
    const q = search.toLowerCase();
    return buyers.filter((b) =>
      b.company_name.toLowerCase().includes(q) ||
      (b.country ?? "").toLowerCase().includes(q) ||
      (b.contact_person ?? "").toLowerCase().includes(q)
    );
  }, [buyers, search]);

  // ── Get stats for a buyer by matching company name ────────────────────

  function getStats(buyer: BuyerProfile) {
    return stats.get(buyer.company_name.toUpperCase()) ?? null;
  }

  // ── Dialog open/close ─────────────────────────────────────────────────

  function openCreateDialog() {
    setEditingBuyer(null);
    setForm({ ...EMPTY_FORM });
    setTagsInput("");
    setDialogOpen(true);
  }

  function openEditDialog(buyer: BuyerProfile) {
    setEditingBuyer(buyer);
    setForm({
      company_name: buyer.company_name,
      display_name: buyer.display_name,
      country: buyer.country,
      city: buyer.city,
      address: buyer.address,
      contact_person: buyer.contact_person,
      phone: buyer.phone,
      email: buyer.email,
      website: buyer.website,
      default_payment_terms: buyer.default_payment_terms,
      default_incoterms: buyer.default_incoterms,
      default_currency: buyer.default_currency,
      agent_name: buyer.agent_name,
      agent_contact: buyer.agent_contact,
      tax_id: buyer.tax_id,
      notes: buyer.notes,
      tags: buyer.tags,
      is_active: buyer.is_active,
      created_by: buyer.created_by,
    });
    setTagsInput((buyer.tags ?? []).join(", "));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingBuyer(null);
  }

  // ── Form helpers ──────────────────────────────────────────────────────

  function setField<K extends keyof BuyerProfileInsert>(key: K, value: BuyerProfileInsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setFieldStr(key: keyof BuyerProfileInsert, value: string) {
    setField(key, value || null as any);
  }

  // ── Submit ────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!form.company_name.trim()) {
      toast.error("Company name is required");
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = { ...form, tags: tags.length > 0 ? tags : null };

    if (editingBuyer) {
      const ok = await updateBuyer(editingBuyer.id, payload);
      if (ok) { refetch(); closeDialog(); }
    } else {
      const result = await createBuyer(payload);
      if (result) { refetch(); closeDialog(); }
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteBuyer(deleteTarget.id);
    if (ok) refetch();
    setDeleteTarget(null);
    setDeleting(false);
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-400" />
            <h1 className="text-xl md:text-2xl font-bold">Buyer Summary</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Buyer profiles, order history, and profitability
          </p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline">Add Buyer</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          label="Buyers"
          value={loading ? "..." : summaries.totalBuyers}
          icon={Users}
          color="bg-purple-500/10 text-purple-500"
        />
        <SummaryCard
          label="Active"
          value={statsLoading ? "..." : summaries.activeBuyers}
          icon={Building2}
          color="bg-emerald-500/10 text-emerald-500"
        />
        <SummaryCard
          label="Order Value"
          value={statsLoading ? "..." : `$${fmtCompact(summaries.totalOrderValue)}`}
          icon={DollarSign}
          color="bg-blue-500/10 text-blue-500"
        />
        <SummaryCard
          label="Production Value"
          value={statsLoading ? "..." : `$${fmtCompact(summaries.totalProductionValue)}`}
          icon={TrendingUp}
          color="bg-emerald-500/10 text-emerald-600"
        />
        <SummaryCard
          label="Total Orders"
          value={statsLoading ? "..." : summaries.totalOrders}
          icon={Package}
          color="bg-amber-500/10 text-amber-500"
        />
        <SummaryCard
          label="Avg/Order"
          value={statsLoading ? "..." : `$${fmtCompact(summaries.avgOrderValue)}`}
          icon={BarChart3}
          color="bg-violet-500/10 text-violet-500"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by company, country, or contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Buyer cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="font-medium text-muted-foreground">
            {buyers.length === 0 ? "No buyers yet" : "No buyers match your search"}
          </p>
          {buyers.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />Add first buyer
            </Button>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence>
            {filtered.map((buyer) => {
              const s = getStats(buyer);
              return (
                <motion.div
                  key={buyer.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <Card
                    className="border-border bg-card hover:border-purple-500/30 hover:bg-muted/20 transition-all cursor-pointer group"
                    onClick={() => navigate(`/finance/buyers/${buyer.id}`)}
                  >
                    <CardContent className="p-5">
                      {/* Top row: company + actions */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold truncate group-hover:text-purple-400 transition-colors">
                            {buyer.company_name}
                          </h3>
                          {(buyer.country || buyer.city) && (
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                              <Globe className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {[buyer.city, buyer.country].filter(Boolean).join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                        <div
                          className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => openEditDialog(buyer)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(buyer)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Contact info */}
                      {(buyer.contact_person || buyer.email || buyer.phone) && (
                        <div className="space-y-1 mb-3">
                          {buyer.contact_person && (
                            <p className="text-sm text-muted-foreground truncate">
                              {buyer.contact_person}
                            </p>
                          )}
                          <div className="flex items-center gap-3">
                            {buyer.email && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{buyer.email}</span>
                              </div>
                            )}
                            {buyer.phone && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3 shrink-0" />
                                <span className="truncate">{buyer.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Financial metrics grid */}
                      <div className="grid grid-cols-2 gap-2 py-2.5 border-t border-border/60">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Order Value</p>
                          <p className="text-sm font-bold tabular-nums">${fmtCompact(s?.orderValue ?? 0)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Production Value</p>
                          <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">${fmtCompact(s?.productionValue ?? 0)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Orders</p>
                          <p className="text-sm font-semibold tabular-nums">{s?.totalOrders ?? 0}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Qty</p>
                          <p className="text-sm font-semibold tabular-nums">{fmtCompact(s?.totalQuantity ?? 0)} pcs</p>
                        </div>
                      </div>

                      {/* Avg order + payment terms */}
                      <div className="flex items-center gap-3 py-2 border-t border-border/40 text-xs text-muted-foreground">
                        {(s?.totalOrders ?? 0) > 0 && (s?.orderValue ?? 0) > 0 && (
                          <div className="flex items-center gap-1" title="Average order value">
                            <BarChart3 className="h-3 w-3" />
                            <span>Avg: <strong className="text-foreground">${fmtCompact((s!.orderValue) / s!.totalOrders)}</strong>/order</span>
                          </div>
                        )}
                        {buyer.default_payment_terms && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span className="truncate">{buyer.default_payment_terms}</span>
                          </div>
                        )}
                        {buyer.default_incoterms && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/50">{buyer.default_incoterms}</Badge>
                        )}
                      </div>

                      {/* Bottom row: badges + date */}
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(s?.activeOrders ?? 0) > 0 && (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]"
                            >
                              <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />
                              {s!.activeOrders} active
                            </Badge>
                          )}
                          {(s?.activeOrders ?? 0) === 0 && (s?.totalOrders ?? 0) > 0 && (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border/50 text-[10px]">
                              No active orders
                            </Badge>
                          )}
                          {(buyer.tags ?? []).slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="bg-purple-500/5 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[10px]"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          {s?.lastOrderDate && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Calendar className="h-2.5 w-2.5" />
                              Last: {fmtDate(s.lastOrderDate)}
                            </div>
                          )}
                          {s?.firstOrderDate && s?.lastOrderDate && s.firstOrderDate !== s.lastOrderDate && (
                            <div className="text-[9px] text-muted-foreground/60">
                              Since {fmtDate(s.firstOrderDate)}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Add/Edit Buyer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBuyer ? "Edit Buyer" : "Add Buyer"}</DialogTitle>
            <DialogDescription>
              {editingBuyer
                ? "Update the buyer profile details."
                : "Create a new buyer profile for your factory."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Company info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name *</Label>
                <Input
                  id="company_name"
                  value={form.company_name}
                  onChange={(e) => setField("company_name", e.target.value)}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="display_name">Display Name</Label>
                <Input
                  id="display_name"
                  value={form.display_name ?? ""}
                  onChange={(e) => setFieldStr("display_name", e.target.value)}
                  placeholder="Short name or alias"
                />
              </div>
            </div>

            {/* Location */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={form.country ?? ""}
                  onChange={(e) => setFieldStr("country", e.target.value)}
                  placeholder="e.g. United Kingdom"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city ?? ""}
                  onChange={(e) => setFieldStr("city", e.target.value)}
                  placeholder="e.g. London"
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={form.address ?? ""}
                  onChange={(e) => setFieldStr("address", e.target.value)}
                  placeholder="Street address"
                />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_person">Contact Person</Label>
                <Input
                  id="contact_person"
                  value={form.contact_person ?? ""}
                  onChange={(e) => setFieldStr("contact_person", e.target.value)}
                  placeholder="Primary contact name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone ?? ""}
                  onChange={(e) => setFieldStr("phone", e.target.value)}
                  placeholder="+1 234 567 890"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setFieldStr("email", e.target.value)}
                  placeholder="buyer@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={form.website ?? ""}
                  onChange={(e) => setFieldStr("website", e.target.value)}
                  placeholder="https://company.com"
                />
              </div>
            </div>

            {/* Commercial defaults */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="default_payment_terms">Payment Terms</Label>
                <Input
                  id="default_payment_terms"
                  value={form.default_payment_terms ?? ""}
                  onChange={(e) => setFieldStr("default_payment_terms", e.target.value)}
                  placeholder="e.g. Net 30, LC at sight"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_incoterms">Incoterms</Label>
                <Select
                  value={form.default_incoterms ?? ""}
                  onValueChange={(v) => setField("default_incoterms", v || null)}
                >
                  <SelectTrigger id="default_incoterms">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["FOB", "CIF", "CFR", "EXW", "DDP", "DAP", "FCA", "CPT", "CIP"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_currency">Currency</Label>
                <Select
                  value={form.default_currency}
                  onValueChange={(v) => setField("default_currency", v)}
                >
                  <SelectTrigger id="default_currency">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["USD", "EUR", "GBP", "JPY", "CNY", "BDT", "LKR", "INR", "AED"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Agent */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agent_name">Agent Name</Label>
                <Input
                  id="agent_name"
                  value={form.agent_name ?? ""}
                  onChange={(e) => setFieldStr("agent_name", e.target.value)}
                  placeholder="Buying agent / sourcing office"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent_contact">Agent Contact</Label>
                <Input
                  id="agent_contact"
                  value={form.agent_contact ?? ""}
                  onChange={(e) => setFieldStr("agent_contact", e.target.value)}
                  placeholder="Agent phone or email"
                />
              </div>
            </div>

            {/* Tax ID + Tags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tax_id">Tax ID</Label>
                <Input
                  id="tax_id"
                  value={form.tax_id ?? ""}
                  onChange={(e) => setFieldStr("tax_id", e.target.value)}
                  placeholder="VAT / Tax registration number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="premium, europe, denim (comma-separated)"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes ?? ""}
                onChange={(e) => setFieldStr("notes", e.target.value)}
                placeholder="Internal notes about this buyer..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {saving
                ? (editingBuyer ? "Updating..." : "Creating...")
                : (editingBuyer ? "Update Buyer" : "Create Buyer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete buyer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">{deleteTarget?.company_name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
