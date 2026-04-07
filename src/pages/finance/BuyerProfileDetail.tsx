import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Globe,
  Mail,
  Phone,
  Package,
  DollarSign,
  FileText,
  Receipt,
  TrendingUp,
  Pencil,
  Trash2,
  Calendar,
  ExternalLink,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  useBuyerProfile,
  useBuyerProfileMutations,
  useBuyerOrders,
  useBuyerContracts,
  useBuyerInvoices,
  useBuyerStats,
  type BuyerProfile,
} from "@/hooks/useBuyerProfiles";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "\u2014";
  return format(new Date(d), "dd MMM yyyy");
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

// ── Detail Field ────────────────────────────────────────────────────────────

function DetailField({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="text-sm">{value || "\u2014"}</p>
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  delay = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
            <span className="text-muted-foreground/40">{icon}</span>
          </div>
          <p className="text-2xl font-bold font-mono">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Status Badge helpers ────────────────────────────────────────────────────

const ORDER_STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const CONTRACT_STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_production: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  shipped: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  sent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  overdue: "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function StatusBadge({ status, styles }: { status: string; styles: Record<string, string> }) {
  const cls = styles[status] || "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return (
    <span className={cn("inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border capitalize", cls)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Edit Dialog ─────────────────────────────────────────────────────────────

function EditBuyerDialog({
  open,
  onOpenChange,
  buyer,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyer: BuyerProfile;
  onSave: (data: Partial<BuyerProfile>) => Promise<boolean>;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    company_name: buyer.company_name ?? "",
    display_name: buyer.display_name ?? "",
    address: buyer.address ?? "",
    city: buyer.city ?? "",
    country: buyer.country ?? "",
    contact_person: buyer.contact_person ?? "",
    phone: buyer.phone ?? "",
    email: buyer.email ?? "",
    website: buyer.website ?? "",
    payment_terms: buyer.payment_terms ?? "",
    incoterms: buyer.incoterms ?? "",
    currency: buyer.default_currency ?? "USD",
    agent_name: buyer.agent_name ?? "",
    agent_contact: buyer.agent_contact ?? "",
    tax_id: buyer.tax_id ?? "",
    tags: (buyer.tags ?? []).join(", "),
    notes: buyer.notes ?? "",
    is_active: buyer.is_active ?? true,
  });

  const update = (field: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.company_name.trim()) {
      toast.error("Company name is required");
      return;
    }
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const ok = await onSave({
      company_name: form.company_name.trim(),
      display_name: form.display_name.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      payment_terms: form.payment_terms.trim() || null,
      incoterms: form.incoterms.trim() || null,
      default_currency: form.currency || "USD",
      agent_name: form.agent_name.trim() || null,
      agent_contact: form.agent_contact.trim() || null,
      tax_id: form.tax_id.trim() || null,
      tags,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    } as Partial<BuyerProfile>);

    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Buyer Profile</DialogTitle>
          <DialogDescription>Update buyer information below.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <Label>Company Name *</Label>
            <Input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={form.display_name} onChange={(e) => update("display_name", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => update("country", e.target.value)} />
          </div>

          <Separator className="sm:col-span-2" />

          <div className="space-y-2">
            <Label>Contact Person</Label>
            <Input value={form.contact_person} onChange={(e) => update("contact_person", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={form.website} onChange={(e) => update("website", e.target.value)} />
          </div>

          <Separator className="sm:col-span-2" />

          <div className="space-y-2">
            <Label>Payment Terms</Label>
            <Input value={form.payment_terms} onChange={(e) => update("payment_terms", e.target.value)} placeholder="e.g. Net 30" />
          </div>
          <div className="space-y-2">
            <Label>Incoterms</Label>
            <Select value={form.incoterms} onValueChange={(v) => update("incoterms", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select incoterms" />
              </SelectTrigger>
              <SelectContent>
                {["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => update("currency", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {["USD", "EUR", "GBP", "BDT", "JPY", "CAD", "AUD"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tax ID</Label>
            <Input value={form.tax_id} onChange={(e) => update("tax_id", e.target.value)} />
          </div>

          <Separator className="sm:col-span-2" />

          <div className="space-y-2">
            <Label>Agent Name</Label>
            <Input value={form.agent_name} onChange={(e) => update("agent_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Agent Contact</Label>
            <Input value={form.agent_contact} onChange={(e) => update("agent_contact", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={(e) => update("tags", e.target.value)} placeholder="e.g. premium, EU, recurring" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
              className="rounded border-border"
            />
            <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function BuyerProfileDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { buyer, loading, refetch } = useBuyerProfile(id);
  const { updateBuyer, deleteBuyer, saving } = useBuyerProfileMutations();
  const buyerName = buyer?.company_name;
  const { orders, loading: ordersLoading } = useBuyerOrders(buyerName);
  const { contracts, loading: contractsLoading } = useBuyerContracts(buyerName);
  const { invoices, loading: invoicesLoading } = useBuyerInvoices(buyerName);
  const { stats, loading: statsLoading } = useBuyerStats();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!id) return;
    const ok = await deleteBuyer(id);
    if (ok) navigate("/finance/buyers");
  };

  const handleSave = async (data: Partial<BuyerProfile>) => {
    if (!id) return false;
    const ok = await updateBuyer(id, data);
    if (ok) refetch();
    return ok;
  };

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-6 space-y-4 max-w-5xl">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!buyer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Building2 className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-muted-foreground">Buyer profile not found</p>
        <Button variant="outline" onClick={() => navigate("/finance/buyers")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Buyers
        </Button>
      </div>
    );
  }

  // ── Computed ─────────────────────────────────────────────────────────────

  const buyerStats = buyerName ? stats.get(buyerName.toUpperCase()) : undefined;
  const totalOrders = buyerStats?.totalOrders ?? orders?.length ?? 0;
  const totalQty = buyerStats?.totalQuantity ?? 0;
  const orderValue = buyerStats?.orderValue ?? 0;
  const productionValue = buyerStats?.productionValue ?? 0;
  const activeOrders = buyerStats?.activeOrders ?? 0;

  // Profitability data from orders with CM info
  const profitableOrders = (orders ?? []).filter(
    (o: any) => o.cm_dozen != null && o.sewing_output_actual != null && o.sewing_output_actual > 0
  );

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-6 max-w-5xl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/finance/buyers")}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{buyer.company_name}</h1>
              {buyer.country && (
                <Badge variant="outline" className="text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  {buyer.country}
                </Badge>
              )}
              <span
                className={cn(
                  "inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border",
                  buyer.is_active
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                )}
              >
                {buyer.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            {buyer.display_name && buyer.display_name !== buyer.company_name && (
              <p className="text-sm text-muted-foreground mt-0.5">{buyer.display_name}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total Orders"
          value={fmtInt(totalOrders)}
          sub="work orders"
          icon={<Package className="h-4 w-4" />}
          delay={0}
        />
        <KpiCard
          label="Total Quantity"
          value={fmtInt(totalQty)}
          sub="pieces ordered"
          icon={<Users className="h-4 w-4" />}
          delay={0.05}
        />
        <KpiCard
          label="Order Value"
          value={`$${fmt(orderValue)}`}
          sub="commercial value"
          icon={<DollarSign className="h-4 w-4" />}
          delay={0.1}
        />
        <KpiCard
          label="Production Value"
          value={`$${fmt(productionValue)}`}
          sub="actual output earned"
          icon={<TrendingUp className="h-4 w-4" />}
          delay={0.15}
        />
        <KpiCard
          label="Active Orders"
          value={fmtInt(activeOrders)}
          sub="in progress"
          icon={<TrendingUp className="h-4 w-4" />}
          delay={0.15}
        />
      </div>

      {/* ── Profile Overview ─────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profile Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
              {/* Company Info */}
              <DetailField label="Company Name" value={buyer.company_name} icon={<Building2 className="h-3 w-3" />} />
              <DetailField label="Display Name" value={buyer.display_name} />
              <DetailField label="Country" value={buyer.country} icon={<Globe className="h-3 w-3" />} />
              <DetailField label="City" value={buyer.city} />
              <DetailField label="Address" value={buyer.address} />

              <div className="sm:col-span-2 lg:col-span-3">
                <Separator className="my-2" />
              </div>

              {/* Contact */}
              <DetailField label="Contact Person" value={buyer.contact_person} icon={<Users className="h-3 w-3" />} />
              <DetailField label="Phone" value={buyer.phone} icon={<Phone className="h-3 w-3" />} />
              <DetailField label="Email" value={buyer.email} icon={<Mail className="h-3 w-3" />} />
              {buyer.website && (
                <DetailField
                  label="Website"
                  value={
                    <a href={buyer.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1">
                      {buyer.website} <ExternalLink className="h-3 w-3" />
                    </a>
                  }
                />
              )}

              <div className="sm:col-span-2 lg:col-span-3">
                <Separator className="my-2" />
              </div>

              {/* Defaults */}
              <DetailField label="Payment Terms" value={buyer.payment_terms} icon={<Calendar className="h-3 w-3" />} />
              <DetailField label="Incoterms" value={buyer.incoterms} />
              <DetailField label="Currency" value={buyer.default_currency} icon={<DollarSign className="h-3 w-3" />} />

              {/* Agent */}
              {(buyer.agent_name || buyer.agent_contact) && (
                <>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Separator className="my-2" />
                  </div>
                  <DetailField label="Agent Name" value={buyer.agent_name} />
                  <DetailField label="Agent Contact" value={buyer.agent_contact} />
                </>
              )}

              {/* Tax ID */}
              {buyer.tax_id && (
                <DetailField label="Tax ID" value={buyer.tax_id} />
              )}
            </div>

            {/* Tags */}
            {buyer.tags && buyer.tags.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {buyer.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {buyer.notes && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{buyer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="orders" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="contracts" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Contracts</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Invoices</span>
            </TabsTrigger>
            <TabsTrigger value="profitability" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Profitability</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Orders Tab ──────────────────────────────────────────────── */}
          <TabsContent value="orders">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Work Orders</CardTitle>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded" />
                    ))}
                  </div>
                ) : !orders || orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No orders found for this buyer.</p>
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PO Number</TableHead>
                          <TableHead>Style</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Color</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">CM/Dz</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ex-Factory</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((order: any) => (
                          <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50">
                            <TableCell className="font-mono text-sm">{order.po_number || "\u2014"}</TableCell>
                            <TableCell>{order.style || "\u2014"}</TableCell>
                            <TableCell>{order.item || "\u2014"}</TableCell>
                            <TableCell>{order.color || "\u2014"}</TableCell>
                            <TableCell className="text-right font-mono">{order.order_qty ? fmtInt(order.order_qty) : "\u2014"}</TableCell>
                            <TableCell className="text-right font-mono">{order.cm_dozen ? fmt(order.cm_dozen) : "\u2014"}</TableCell>
                            <TableCell>
                              <StatusBadge status={order.status || "active"} styles={ORDER_STATUS_STYLES} />
                            </TableCell>
                            <TableCell>{fmtDate(order.ex_factory_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Contracts Tab ───────────────────────────────────────────── */}
          <TabsContent value="contracts">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sales Contracts</CardTitle>
              </CardHeader>
              <CardContent>
                {contractsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded" />
                    ))}
                  </div>
                ) : !contracts || contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No contracts found for this buyer.</p>
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contract #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Total Qty</TableHead>
                          <TableHead className="text-right">Total Value</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contracts.map((contract: any) => (
                          <TableRow
                            key={contract.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/finance/contracts/${contract.id}`)}
                          >
                            <TableCell className="font-mono text-sm">{contract.contract_number || "\u2014"}</TableCell>
                            <TableCell>{fmtDate(contract.contract_date)}</TableCell>
                            <TableCell className="text-right font-mono">{contract.total_qty ? fmtInt(contract.total_qty) : "\u2014"}</TableCell>
                            <TableCell className="text-right font-mono">
                              {contract.total_value ? `${contract.currency || "USD"} ${fmt(contract.total_value)}` : "\u2014"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={contract.status || "draft"} styles={CONTRACT_STATUS_STYLES} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Invoices Tab ────────────────────────────────────────────── */}
          <TabsContent value="invoices">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded" />
                    ))}
                  </div>
                ) : !invoices || invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No invoices found for this buyer.</p>
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((invoice: any) => (
                          <TableRow
                            key={invoice.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/finance/invoices/${invoice.id}`)}
                          >
                            <TableCell className="font-mono text-sm">{invoice.invoice_number || "\u2014"}</TableCell>
                            <TableCell>{fmtDate(invoice.invoice_date)}</TableCell>
                            <TableCell className="text-right font-mono">
                              {invoice.total_amount ? `${invoice.currency || "USD"} ${fmt(invoice.total_amount)}` : "\u2014"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={invoice.status || "draft"} styles={INVOICE_STATUS_STYLES} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Profitability Tab ───────────────────────────────────────── */}
          <TabsContent value="profitability">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Profitability by PO</CardTitle>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded" />
                    ))}
                  </div>
                ) : profitableOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No profitability data available. Sewing actuals and CM data are required for margin calculations.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto -mx-6">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Style</TableHead>
                            <TableHead className="text-right">Output (pcs)</TableHead>
                            <TableHead className="text-right">CM/Dz</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Est. Cost</TableHead>
                            <TableHead className="text-right">Margin</TableHead>
                            <TableHead className="text-right">Margin %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profitableOrders.map((order: any) => {
                            const output = order.sewing_output_actual ?? 0;
                            const cmDz = order.cm_dozen ?? 0;
                            const revenue = (output / 12) * cmDz;
                            const costPerDz = order.cost_per_dozen ?? cmDz * 0.7;
                            const cost = (output / 12) * costPerDz;
                            const margin = revenue - cost;
                            const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

                            return (
                              <TableRow key={order.id}>
                                <TableCell className="font-mono text-sm">{order.po_number || "\u2014"}</TableCell>
                                <TableCell>{order.style || "\u2014"}</TableCell>
                                <TableCell className="text-right font-mono">{fmtInt(output)}</TableCell>
                                <TableCell className="text-right font-mono">${fmt(cmDz)}</TableCell>
                                <TableCell className="text-right font-mono">${fmt(revenue)}</TableCell>
                                <TableCell className="text-right font-mono">${fmt(cost)}</TableCell>
                                <TableCell className={cn("text-right font-mono font-medium", margin >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  ${fmt(margin)}
                                </TableCell>
                                <TableCell className={cn("text-right font-mono", marginPct >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {marginPct.toFixed(1)}%
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Simple margin bar chart */}
                    <div className="mt-6 space-y-3">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Margin by PO</p>
                      {profitableOrders.map((order: any) => {
                        const output = order.sewing_output_actual ?? 0;
                        const cmDz = order.cm_dozen ?? 0;
                        const revenue = (output / 12) * cmDz;
                        const costPerDz = order.cost_per_dozen ?? cmDz * 0.7;
                        const cost = (output / 12) * costPerDz;
                        const margin = revenue - cost;
                        const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
                        const maxPct = 50;
                        const barWidth = Math.min(Math.abs(marginPct) / maxPct * 100, 100);

                        return (
                          <div key={order.id} className="flex items-center gap-3">
                            <span className="text-xs font-mono w-28 truncate shrink-0">{order.po_number || "N/A"}</span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden relative">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  margin >= 0 ? "bg-emerald-500/60" : "bg-red-500/60"
                                )}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-mono w-16 text-right shrink-0", margin >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {marginPct.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ── Edit Dialog ──────────────────────────────────────────────────── */}
      {editOpen && (
        <EditBuyerDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          buyer={buyer}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {/* ── Delete Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Buyer Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{buyer.company_name}</strong>? This action cannot be undone.
              Associated orders, contracts, and invoices will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
