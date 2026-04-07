import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  RotateCcw,
  Receipt,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { useInvoice, useInvoiceMutations, calcInvoiceTotals, type Invoice } from "@/hooks/useInvoices";
import { useFactoryFinanceSettings } from "@/hooks/useFactoryFinanceSettings";
import { useFactoryBankAccounts } from "@/hooks/useFactoryBankAccounts";
import { useUserSignature } from "@/hooks/useUserSignature";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<Invoice["status"], { label: string; pill: string }> = {
  draft:   { label: "Draft",   pill: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  sent:    { label: "Sent",    pill: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  paid:    { label: "Paid",    pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  overdue: { label: "Overdue", pill: "bg-red-500/10 text-red-400 border-red-500/20" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export default function InvoiceDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { invoice, loading, refetch } = useInvoice(id);
  const { updateStatus, deleteInvoice } = useInvoiceMutations();
  const { settings } = useFactoryFinanceSettings();
  const { accounts: bankAccounts, defaultAccount } = useFactoryBankAccounts();
  const { signature } = useUserSignature();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(true);

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setPdfLoading(true);
    try {
      const bankAccount = invoice.selected_bank_account_id
        ? bankAccounts.find((a) => a.id === invoice.selected_bank_account_id) ?? defaultAccount
        : defaultAccount;
      const sigUrl = includeSignature ? (signature?.signature_url ?? null) : null;
      await generateInvoicePdf(invoice, settings, bankAccount ?? null, sigUrl);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleStatus = async (status: Invoice["status"]) => {
    if (!id) return;
    setStatusLoading(true);
    const ok = await updateStatus(id, status);
    if (ok) refetch();
    setStatusLoading(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    const ok = await deleteInvoice(id);
    if (ok) navigate("/finance/invoices");
  };

  if (loading) {
    return (
      <div className="py-6 space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Receipt className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-muted-foreground">Invoice not found</p>
        <Button variant="outline" onClick={() => navigate("/finance/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
      </div>
    );
  }

  const lineItems = invoice.invoice_line_items ?? [];
  const { totalUsd, totalBdt } = calcInvoiceTotals(lineItems, invoice.exchange_rate);
  const cfg = STATUS_CONFIG[invoice.status];

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/finance/invoices")}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold font-mono">{invoice.invoice_number}</h1>
              <span className={cn("inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border", cfg.pill)}>
                {cfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {invoice.buyer_name} · Issued {fmtDate(invoice.issue_date)}
              {invoice.due_date && ` · Due ${fmtDate(invoice.due_date)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 mr-1">
            <Switch id="inv-sig-toggle" checked={includeSignature} onCheckedChange={setIncludeSignature} className="scale-75" />
            <Label htmlFor="inv-sig-toggle" className="text-[10px] text-muted-foreground cursor-pointer">Sign</Label>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {pdfLoading
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Download className="h-3.5 w-3.5 mr-1.5" />}
            <span>Download PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/finance/invoices/${id}/edit`)}
          >
            <Edit className="h-3.5 w-3.5 mr-1.5" />
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

      {/* Status actions */}
      <div className="flex flex-wrap gap-2 items-center">
        {invoice.status !== "sent" && invoice.status !== "paid" && (
          <Button
            variant="outline"
            size="sm"
            disabled={statusLoading}
            onClick={() => handleStatus("sent")}
            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Mark Sent
          </Button>
        )}
        {invoice.status !== "paid" && (
          <Button
            variant="outline"
            size="sm"
            disabled={statusLoading}
            onClick={() => handleStatus("paid")}
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Mark Paid
          </Button>
        )}
        {invoice.status !== "overdue" && invoice.status !== "paid" && (
          <Button
            variant="outline"
            size="sm"
            disabled={statusLoading}
            onClick={() => handleStatus("overdue")}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
            Mark Overdue
          </Button>
        )}
        {invoice.status !== "draft" && (
          <Button
            variant="ghost"
            size="sm"
            disabled={statusLoading}
            onClick={() => handleStatus("draft")}
            className="text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Revert to Draft
          </Button>
        )}
        {statusLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Meta */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 text-sm">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Buyer</p>
              <p className="font-semibold">{invoice.buyer_name}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Issue Date</p>
              <p className="font-semibold">{fmtDate(invoice.issue_date)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Due Date</p>
              <p className="font-semibold">{invoice.due_date ? fmtDate(invoice.due_date) : "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Rate</p>
              <p className="font-semibold font-mono">
                {invoice.currency} · ৳{fmt(invoice.exchange_rate)}/USD
              </p>
            </div>
          </div>

          {invoice.notes && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Line Items
            <span className="text-xs font-normal text-muted-foreground">({lineItems.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground italic">No line items added</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/finance/invoices/${id}/edit`)}
              >
                <Edit className="h-3.5 w-3.5 mr-1.5" />
                Add Items
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop table header */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_120px_80px_120px_120px] gap-3 pb-2 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Description</span>
                <span>Style</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Total</span>
              </div>

              {lineItems.map((li, i) => (
                <div
                  key={li.id}
                  className={cn(
                    "grid grid-cols-1 sm:grid-cols-[1fr_120px_80px_120px_120px] gap-x-3 gap-y-0.5 py-3 text-sm",
                    i < lineItems.length - 1 && "border-b border-border/50"
                  )}
                >
                  <span className="font-medium">{li.description}</span>
                  <span className="text-muted-foreground font-mono text-xs sm:self-center">
                    {li.style_number || "—"}
                  </span>
                  <span className="sm:text-right sm:self-center text-muted-foreground">
                    <span className="sm:hidden text-xs">Qty: </span>
                    {li.quantity.toLocaleString()}
                  </span>
                  <span className="sm:text-right sm:self-center font-mono">
                    <span className="sm:hidden text-xs">@ </span>
                    ${fmt(li.unit_price)}
                  </span>
                  <span className="sm:text-right sm:self-center font-semibold font-mono">
                    ${fmt(li.quantity * li.unit_price)}
                  </span>
                </div>
              ))}

              {/* Totals */}
              <div className="mt-4 pt-4 border-t border-border space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total (USD)</span>
                  <span className="text-xl font-bold">${fmt(totalUsd)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total (BDT @ ৳{fmt(invoice.exchange_rate)})</span>
                  <span className="text-lg font-semibold text-muted-foreground">৳{fmt(totalBdt)}</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {invoice.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the invoice and all its line items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
