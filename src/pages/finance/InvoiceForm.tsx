import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus, Trash2, ArrowLeft, Save, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  useInvoice, useInvoiceMutations, useWorkOrderOptions, calcInvoiceTotals, calcLineItemTotal,
  type LineItemInsert, type ChargeInsert, type TaxLineInsert,
} from "@/hooks/useInvoices";
import { useFactoryBankAccounts } from "@/hooks/useFactoryBankAccounts";
import { useFinancePortal } from "@/contexts/FinancePortalContext";
import { cn } from "@/lib/utils";

let _key = 0;
const nextKey = () => String(++_key);

interface LineRow {
  key: string;
  description: string;
  style_number: string;
  style_name: string;
  hs_code: string;
  unit: string;
  color: string;
  size_range: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
}

interface ChargeRow { key: string; label: string; amount: string; is_deduct: boolean; }
interface TaxRow { key: string; label: string; rate_pct: string; amount: string; }

function emptyLine(): LineRow {
  return { key: nextKey(), description: "", style_number: "", style_name: "", hs_code: "", unit: "PCS", color: "", size_range: "", quantity: "", unit_price: "", discount_pct: "0" };
}
function emptyCharge(): ChargeRow { return { key: nextKey(), label: "", amount: "", is_deduct: false }; }
function emptyTax(): TaxRow { return { key: nextKey(), label: "", rate_pct: "", amount: "" }; }

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const CURRENCIES = ["USD", "EUR", "GBP", "BDT"];
const INCOTERMS = ["FOB", "CFR", "CIF", "EXW", "FCA", "CPT", "CIP", "DAP", "DDP", "FAS"];
const INVOICE_TYPES = [
  { value: "commercial", label: "Commercial Invoice" },
  { value: "proforma", label: "Proforma Invoice" },
  { value: "credit_note", label: "Credit Note" },
  { value: "debit_note", label: "Debit Note" },
];
const UNITS = ["PCS", "DZN", "SET", "KG", "CTN", "M", "YD", "PR"];

function Section({
  title, open, onToggle, children,
}: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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

export default function InvoiceForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { invoice, loading: loadingInvoice } = useInvoice(id);
  const { createInvoice, updateInvoice, saving } = useInvoiceMutations();
  const workOrders = useWorkOrderOptions();
  const { accounts: bankAccounts, defaultAccount } = useFactoryBankAccounts();
  const { bdtToUsd } = useFinancePortal();

  // ── Section open state ──────────────────────────────────────────────────
  const [openBuyer, setOpenBuyer] = useState(true);
  const [openTrade, setOpenTrade] = useState(false);
  const [openShipping, setOpenShipping] = useState(false);
  const [openPacking, setOpenPacking] = useState(false);
  const [openCharges, setOpenCharges] = useState(false);
  const [openTax, setOpenTax] = useState(false);
  const [openBank, setOpenBank] = useState(false);
  const [openRemarks, setOpenRemarks] = useState(false);

  // ── Core fields ──────────────────────────────────────────────────────────
  const [invoiceType, setInvoiceType] = useState<"commercial" | "proforma" | "credit_note" | "debit_note">("commercial");
  const [selectedWoId, setSelectedWoId] = useState("none");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(String(bdtToUsd));

  // ── Buyer ────────────────────────────────────────────────────────────────
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerContact, setBuyerContact] = useState("");

  // ── Trade ────────────────────────────────────────────────────────────────
  const [paymentTerms, setPaymentTerms] = useState("");
  const [lcNumber, setLcNumber] = useState("");
  const [lcDate, setLcDate] = useState("");
  const [contractNumber, setContractNumber] = useState("");

  // ── Shipping ─────────────────────────────────────────────────────────────
  const [portOfLoading, setPortOfLoading] = useState("");
  const [portOfDischarge, setPortOfDischarge] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("Bangladesh");
  const [countryOfDest, setCountryOfDest] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [blNumber, setBlNumber] = useState("");
  const [blDate, setBlDate] = useState("");
  const [incoterms, setIncoterms] = useState("FOB");

  // ── Packing ──────────────────────────────────────────────────────────────
  const [packingType, setPackingType] = useState("");
  const [totalCartons, setTotalCartons] = useState("");
  const [totalGrossWeight, setTotalGrossWeight] = useState("");
  const [totalNetWeight, setTotalNetWeight] = useState("");
  const [totalCbm, setTotalCbm] = useState("");

  // ── Line items ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<LineRow[]>([emptyLine()]);

  // ── Charges & tax ────────────────────────────────────────────────────────
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [taxLines, setTaxLines] = useState<TaxRow[]>([]);
  const [discountPct, setDiscountPct] = useState("0");

  // ── Bank / remarks ───────────────────────────────────────────────────────
  const [showBankDetails, setShowBankDetails] = useState(true);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("none");
  const [remarks, setRemarks] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [notes, setNotes] = useState("");

  // ── Populate on edit ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!invoice || !isEdit) return;
    setInvoiceType(invoice.invoice_type ?? "commercial");
    setSelectedWoId(invoice.work_order_id ?? "none");
    setIssueDate(invoice.issue_date);
    setDueDate(invoice.due_date ?? "");
    setCurrency(invoice.currency);
    setExchangeRate(String(invoice.exchange_rate));
    setBuyerName(invoice.buyer_name);
    setBuyerAddress(invoice.buyer_address ?? "");
    setBuyerContact(invoice.buyer_contact ?? "");
    setPaymentTerms(invoice.payment_terms ?? "");
    setLcNumber(invoice.lc_number ?? "");
    setLcDate(invoice.lc_date ?? "");
    setContractNumber(invoice.contract_number ?? "");
    setPortOfLoading(invoice.port_of_loading ?? "");
    setPortOfDischarge(invoice.port_of_discharge ?? "");
    setCountryOfOrigin(invoice.country_of_origin ?? "Bangladesh");
    setCountryOfDest(invoice.country_of_dest ?? "");
    setVesselName(invoice.vessel_name ?? "");
    setBlNumber(invoice.bl_number ?? "");
    setBlDate(invoice.bl_date ?? "");
    setIncoterms(invoice.incoterms ?? "FOB");
    setPackingType(invoice.packing_type ?? "");
    setTotalCartons(invoice.total_cartons != null ? String(invoice.total_cartons) : "");
    setTotalGrossWeight(invoice.total_gross_weight != null ? String(invoice.total_gross_weight) : "");
    setTotalNetWeight(invoice.total_net_weight != null ? String(invoice.total_net_weight) : "");
    setTotalCbm(invoice.total_cbm != null ? String(invoice.total_cbm) : "");
    setDiscountPct(String(invoice.discount_pct ?? 0));
    setShowBankDetails(invoice.show_bank_details ?? true);
    setSelectedBankAccountId(invoice.selected_bank_account_id ?? "none");
    setRemarks(invoice.remarks ?? "");
    setInternalNotes(invoice.internal_notes ?? "");
    setNotes(invoice.notes ?? "");

    const items = invoice.invoice_line_items;
    if (items && items.length > 0) {
      setRows(items.map((li) => ({
        key: nextKey(),
        description: li.description,
        style_number: li.style_number ?? "",
        style_name: li.style_name ?? "",
        hs_code: li.hs_code ?? "",
        unit: li.unit ?? "PCS",
        color: li.color ?? "",
        size_range: li.size_range ?? "",
        quantity: String(li.quantity),
        unit_price: String(li.unit_price),
        discount_pct: String(li.discount_pct ?? 0),
      })));
    }
    if (invoice.invoice_charges && invoice.invoice_charges.length > 0) {
      setCharges(invoice.invoice_charges.map((c) => ({
        key: nextKey(), label: c.label, amount: String(c.amount), is_deduct: c.is_deduct,
      })));
      setOpenCharges(true);
    }
    if (invoice.invoice_tax_lines && invoice.invoice_tax_lines.length > 0) {
      setTaxLines(invoice.invoice_tax_lines.map((t) => ({
        key: nextKey(), label: t.label, rate_pct: String(t.rate_pct), amount: String(t.amount),
      })));
      setOpenTax(true);
    }
  }, [invoice, isEdit]);

  // Keep new invoices aligned with live BDT/USD rate.
  useEffect(() => {
    if (!isEdit && currency === "USD") {
      setExchangeRate(String(bdtToUsd));
    }
  }, [bdtToUsd, isEdit, currency]);

  // Auto-select default bank account for new invoices
  useEffect(() => {
    if (!isEdit && defaultAccount && selectedBankAccountId === "none") {
      setSelectedBankAccountId(defaultAccount.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAccount, isEdit]);

  // Auto-fill from work order when PO is selected
  useEffect(() => {
    if (!selectedWoId || selectedWoId === "none") return;
    const wo = workOrders.find((w) => w.id === selectedWoId);
    if (!wo) return;

    // Buyer name
    if (!buyerName) setBuyerName(wo.buyer);

    // Auto-populate the first (or only empty) line row
    setRows((prev) => {
      const hasData = prev.some((r) => r.description.trim() || r.quantity || r.unit_price);
      const newRow: LineRow = {
        key: nextKey(),
        description: wo.item || wo.style || "",
        style_number: wo.style_number || wo.style || "",
        style_name: wo.style || "",
        hs_code: wo.hs_code || "",
        unit: "PCS",
        color: wo.color || "",
        size_range: "",
        quantity: wo.order_qty ? String(wo.order_qty) : "",
        unit_price: wo.selling_price ? String(wo.selling_price) : "",
        discount_pct: "0",
      };
      // If only one empty row exists, replace it; otherwise prepend
      if (prev.length === 1 && !prev[0].description.trim() && !prev[0].quantity && !prev[0].unit_price) {
        return [newRow];
      }
      // If already has data don't overwrite
      return hasData ? prev : [newRow];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWoId, workOrders]);

  // ── Row helpers ──────────────────────────────────────────────────────────
  const updateRow = (key: string, field: keyof Omit<LineRow, "key">, value: string) =>
    setRows((p) => p.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const updateCharge = (key: string, field: keyof Omit<ChargeRow, "key">, value: string | boolean) =>
    setCharges((p) => p.map((c) => c.key === key ? { ...c, [field]: value } : c));

  const updateTax = (key: string, field: keyof Omit<TaxRow, "key">, value: string) =>
    setTaxLines((p) => p.map((t) => t.key === key ? { ...t, [field]: value } : t));

  // ── Totals ───────────────────────────────────────────────────────────────
  const rate = parseFloat(exchangeRate) || bdtToUsd;
  const { subtotal, discountAmt, afterDiscount, chargesTotal, taxTotal, totalUsd, totalBdt } =
    calcInvoiceTotals(
      rows.map((r) => ({ quantity: parseFloat(r.quantity) || 0, unit_price: parseFloat(r.unit_price) || 0, discount_pct: parseFloat(r.discount_pct) || 0 })),
      rate,
      parseFloat(discountPct) || 0,
      charges.map((c) => ({ amount: parseFloat(c.amount) || 0, is_deduct: c.is_deduct })),
      taxLines.map((t) => ({ amount: parseFloat(t.amount) || 0 }))
    );

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerName.trim()) return;

    const lineItems: LineItemInsert[] = rows
      .filter((r) => r.description.trim())
      .map((r, i) => ({
        description: r.description.trim(),
        style_number: r.style_number.trim() || null,
        style_name: r.style_name.trim() || null,
        hs_code: r.hs_code.trim() || null,
        unit: r.unit || "PCS",
        color: r.color.trim() || null,
        size_range: r.size_range.trim() || null,
        quantity: parseFloat(r.quantity) || 0,
        unit_price: parseFloat(r.unit_price) || 0,
        discount_pct: parseFloat(r.discount_pct) || 0,
        sort_order: i,
      }));

    const chargeItems: ChargeInsert[] = charges
      .filter((c) => c.label.trim())
      .map((c, i) => ({
        label: c.label.trim(),
        amount: parseFloat(c.amount) || 0,
        is_deduct: c.is_deduct,
        sort_order: i,
      }));

    const taxItems: TaxLineInsert[] = taxLines
      .filter((t) => t.label.trim())
      .map((t, i) => ({
        label: t.label.trim(),
        rate_pct: parseFloat(t.rate_pct) || 0,
        amount: parseFloat(t.amount) || 0,
        sort_order: i,
      }));

    const fields = {
      invoice_type: invoiceType,
      buyer_name: buyerName.trim(),
      buyer_address: buyerAddress.trim() || null,
      buyer_contact: buyerContact.trim() || null,
      work_order_id: (selectedWoId && selectedWoId !== "none") ? selectedWoId : null,
      issue_date: issueDate,
      due_date: dueDate || null,
      currency,
      exchange_rate: rate,
      status: (isEdit ? invoice?.status : "draft") as Invoice["status"],
      payment_terms: paymentTerms.trim() || null,
      lc_number: lcNumber.trim() || null,
      lc_date: lcDate || null,
      contract_number: contractNumber.trim() || null,
      port_of_loading: portOfLoading.trim() || null,
      port_of_discharge: portOfDischarge.trim() || null,
      country_of_origin: countryOfOrigin.trim() || null,
      country_of_dest: countryOfDest.trim() || null,
      vessel_name: vesselName.trim() || null,
      bl_number: blNumber.trim() || null,
      bl_date: blDate || null,
      incoterms: incoterms || null,
      packing_type: packingType.trim() || null,
      total_cartons: totalCartons ? parseInt(totalCartons) : null,
      total_gross_weight: totalGrossWeight ? parseFloat(totalGrossWeight) : null,
      total_net_weight: totalNetWeight ? parseFloat(totalNetWeight) : null,
      total_cbm: totalCbm ? parseFloat(totalCbm) : null,
      discount_pct: parseFloat(discountPct) || 0,
      show_bank_details: showBankDetails,
      selected_bank_account_id: (selectedBankAccountId && selectedBankAccountId !== "none") ? selectedBankAccountId : null,
      remarks: remarks.trim() || null,
      internal_notes: internalNotes.trim() || null,
      notes: notes.trim() || null,
      bank_details: null,
      ...(!isEdit && { created_by: null }),
    };

    if (isEdit && id) {
      const ok = await updateInvoice(id, fields, lineItems, chargeItems, taxItems);
      if (ok) navigate(`/finance/invoices/${id}`);
    } else {
      const inv = await createInvoice(fields, lineItems, chargeItems, taxItems);
      if (inv) navigate(`/finance/invoices/${inv.id}`);
    }
  };

  if (isEdit && loadingInvoice) {
    return (
      <div className="py-6 space-y-4 max-w-4xl">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="py-3 md:py-4 lg:py-6 space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          type="button" variant="ghost" size="icon"
          onClick={() => navigate(isEdit && id ? `/finance/invoices/${id}` : "/finance/invoices")}
          className="-ml-2 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {isEdit ? `Edit ${invoice?.invoice_number ?? "Invoice"}` : "New Invoice"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Update invoice details" : "Create a commercial invoice"}
          </p>
        </div>
      </div>

      {/* ── Invoice Details (always open) ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Invoice Type</Label>
              <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as typeof invoiceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Link to Work Order</Label>
              <Select value={selectedWoId} onValueChange={setSelectedWoId}>
                <SelectTrigger><SelectValue placeholder="None (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {workOrders.map((wo) => (
                    <SelectItem key={wo.id} value={wo.id}>
                      {wo.po_number} — {wo.buyer} · {wo.style}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Issue Date *</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Exchange Rate (BDT per 1 USD)</Label>
              <Input type="number" min="1" step="0.01" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Buyer Information ── */}
      <Section title="Buyer Information" open={openBuyer} onToggle={() => setOpenBuyer(!openBuyer)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Buyer Name *</Label>
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="e.g. H&M Bangladesh" required />
          </div>
          <div className="space-y-1.5">
            <Label>Buyer Contact</Label>
            <Input value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} placeholder="Name / email / phone" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Buyer Address</Label>
          <Textarea value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="Full billing address" rows={2} />
        </div>
      </Section>

      {/* ── Trade / LC ── */}
      <Section title="Trade & Payment Terms" open={openTrade} onToggle={() => setOpenTrade(!openTrade)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Payment Terms</Label>
            <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days net, LC at sight" />
          </div>
          <div className="space-y-1.5">
            <Label>Contract Number</Label>
            <Input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="Sales contract ref" />
          </div>
          <div className="space-y-1.5">
            <Label>LC Number</Label>
            <Input value={lcNumber} onChange={(e) => setLcNumber(e.target.value)} placeholder="Letter of credit number" />
          </div>
          <div className="space-y-1.5">
            <Label>LC Date</Label>
            <Input type="date" value={lcDate} onChange={(e) => setLcDate(e.target.value)} />
          </div>
        </div>
      </Section>

      {/* ── Shipping ── */}
      <Section title="Shipment Details" open={openShipping} onToggle={() => setOpenShipping(!openShipping)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Port of Loading</Label>
            <Input value={portOfLoading} onChange={(e) => setPortOfLoading(e.target.value)} placeholder="e.g. Chittagong" />
          </div>
          <div className="space-y-1.5">
            <Label>Port of Discharge</Label>
            <Input value={portOfDischarge} onChange={(e) => setPortOfDischarge(e.target.value)} placeholder="e.g. Rotterdam" />
          </div>
          <div className="space-y-1.5">
            <Label>Country of Origin</Label>
            <Input value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Country of Destination</Label>
            <Input value={countryOfDest} onChange={(e) => setCountryOfDest(e.target.value)} placeholder="e.g. Germany" />
          </div>
          <div className="space-y-1.5">
            <Label>Incoterms</Label>
            <Select value={incoterms} onValueChange={setIncoterms}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCOTERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vessel / Flight Name</Label>
            <Input value={vesselName} onChange={(e) => setVesselName(e.target.value)} placeholder="Vessel or flight number" />
          </div>
          <div className="space-y-1.5">
            <Label>B/L or AWB Number</Label>
            <Input value={blNumber} onChange={(e) => setBlNumber(e.target.value)} placeholder="Bill of lading number" />
          </div>
          <div className="space-y-1.5">
            <Label>B/L Date</Label>
            <Input type="date" value={blDate} onChange={(e) => setBlDate(e.target.value)} />
          </div>
        </div>
      </Section>

      {/* ── Line Items (always open) ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-sm font-semibold">Line Items</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((p) => [...p, emptyLine()])}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Desktop header */}
          <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_80px_80px_90px_90px_60px_36px] gap-2 text-[11px] font-medium text-muted-foreground pb-1">
            <span>Description *</span>
            <span>Style No. / Name</span>
            <span>HS Code</span>
            <span>Unit</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span>Disc %</span>
            <span />
          </div>

          {rows.map((row) => (
            <div key={row.key} className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-[2fr_1fr_80px_80px_90px_90px_60px_36px] gap-2 items-start pb-3 lg:pb-0 border-b lg:border-none border-border/50 last:border-none">
              <Input placeholder="Description *" value={row.description} onChange={(e) => updateRow(row.key, "description", e.target.value)} />
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                <Input placeholder="Style no." value={row.style_number} onChange={(e) => updateRow(row.key, "style_number", e.target.value)} />
                <Input className="hidden lg:flex" placeholder="Style name" value={row.style_name} onChange={(e) => updateRow(row.key, "style_name", e.target.value)} />
              </div>
              <Input placeholder="HS code" value={row.hs_code} onChange={(e) => updateRow(row.key, "hs_code", e.target.value)} />
              <Select value={row.unit} onValueChange={(v) => updateRow(row.key, "unit", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" placeholder="0" min="0" value={row.quantity} onChange={(e) => updateRow(row.key, "quantity", e.target.value)} />
              <Input type="number" placeholder="0.00" min="0" step="0.01" value={row.unit_price} onChange={(e) => updateRow(row.key, "unit_price", e.target.value)} />
              <Input type="number" placeholder="0" min="0" max="100" step="0.1" value={row.discount_pct} onChange={(e) => updateRow(row.key, "discount_pct", e.target.value)} />
              <Button
                type="button" variant="ghost" size="icon"
                className="text-muted-foreground hover:text-destructive h-9 w-9 shrink-0"
                onClick={() => setRows((p) => p.length > 1 ? p.filter((r) => r.key !== row.key) : p)}
                disabled={rows.length === 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              {/* Mobile totals per row */}
              {(parseFloat(row.quantity) > 0 && parseFloat(row.unit_price) > 0) && (
                <div className="lg:hidden text-xs text-muted-foreground text-right col-span-full">
                  Line total: <span className="font-semibold text-foreground">
                    {currency} {fmt(calcLineItemTotal({ quantity: parseFloat(row.quantity) || 0, unit_price: parseFloat(row.unit_price) || 0, discount_pct: parseFloat(row.discount_pct) || 0 }))}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Invoice-level discount */}
          <div className="pt-2 flex items-center gap-4">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Invoice Discount (%)</Label>
            <Input
              type="number" min="0" max="100" step="0.1" className="w-28"
              value={discountPct} onChange={(e) => setDiscountPct(e.target.value)}
            />
          </div>

          {/* Totals summary */}
          <div className="border-t border-border pt-4 space-y-1.5 text-sm">
            {subtotal !== afterDiscount && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{currency} {fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount ({discountPct}%)</span>
                  <span>- {currency} {fmt(discountAmt)}</span>
                </div>
              </>
            )}
            {charges.length > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Charges / Deductions</span>
                <span className={cn(chargesTotal < 0 && "text-red-400")}>
                  {chargesTotal >= 0 ? "+" : ""}{currency} {fmt(Math.abs(chargesTotal))}
                </span>
              </div>
            )}
            {taxTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span>+ {currency} {fmt(taxTotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center font-bold text-base pt-1">
              <span>Total ({currency})</span>
              <span>{currency} {fmt(totalUsd)}</span>
            </div>
            {currency !== "BDT" && (
              <div className="flex justify-between text-muted-foreground">
                <span>Equivalent (BDT @ ৳{fmt(rate)})</span>
                <span>৳{fmt(totalBdt)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Packing ── */}
      <Section title="Packing Details" open={openPacking} onToggle={() => setOpenPacking(!openPacking)}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <Label>Packing Type</Label>
            <Input value={packingType} onChange={(e) => setPackingType(e.target.value)} placeholder="e.g. Poly bag in carton" />
          </div>
          <div className="space-y-1.5">
            <Label>Total Cartons</Label>
            <Input type="number" min="0" value={totalCartons} onChange={(e) => setTotalCartons(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Gross Weight (kg)</Label>
            <Input type="number" min="0" step="0.01" value={totalGrossWeight} onChange={(e) => setTotalGrossWeight(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Net Weight (kg)</Label>
            <Input type="number" min="0" step="0.01" value={totalNetWeight} onChange={(e) => setTotalNetWeight(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Total CBM</Label>
            <Input type="number" min="0" step="0.001" value={totalCbm} onChange={(e) => setTotalCbm(e.target.value)} placeholder="0.000" />
          </div>
        </div>
      </Section>

      {/* ── Charges & Deductions ── */}
      <Section title="Charges & Deductions" open={openCharges} onToggle={() => setOpenCharges(!openCharges)}>
        <div className="space-y-2">
          <div className="hidden sm:grid sm:grid-cols-[1fr_130px_120px_36px] gap-2 text-[11px] font-medium text-muted-foreground pb-1">
            <span>Label</span>
            <span>Amount ({currency})</span>
            <span>Type</span>
            <span />
          </div>
          {charges.map((c) => (
            <div key={c.key} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_120px_36px] gap-2 items-center">
              <Input placeholder="e.g. Freight, Insurance" value={c.label} onChange={(e) => updateCharge(c.key, "label", e.target.value)} />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={c.amount} onChange={(e) => updateCharge(c.key, "amount", e.target.value)} />
              <Select value={c.is_deduct ? "deduct" : "charge"} onValueChange={(v) => updateCharge(c.key, "is_deduct", v === "deduct")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="charge">Add (charge)</SelectItem>
                  <SelectItem value="deduct">Subtract (deduction)</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-9 w-9"
                onClick={() => setCharges((p) => p.filter((x) => x.key !== c.key))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setCharges((p) => [...p, emptyCharge()])}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Charge
          </Button>
        </div>
      </Section>

      {/* ── Tax Lines ── */}
      <Section title="Tax Lines" open={openTax} onToggle={() => setOpenTax(!openTax)}>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Amount auto-calculates from rate × subtotal after discount. Override manually if needed.
          </p>
          <div className="hidden sm:grid sm:grid-cols-[1fr_110px_160px_36px] gap-2 text-[11px] font-medium text-muted-foreground pb-1">
            <span>Label</span>
            <span>Rate (%)</span>
            <span>Amount ({currency}) — auto</span>
            <span />
          </div>
          {taxLines.map((t) => {
            const autoAmount = afterDiscount > 0 && parseFloat(t.rate_pct) > 0
              ? String(Math.round(afterDiscount * (parseFloat(t.rate_pct) / 100) * 100) / 100)
              : "";
            const isAutoAmount = t.amount === "" || t.amount === autoAmount;
            return (
              <div key={t.key} className="grid grid-cols-1 sm:grid-cols-[1fr_110px_160px_36px] gap-2 items-center">
                <Input placeholder="e.g. VAT, AIT" value={t.label} onChange={(e) => updateTax(t.key, "label", e.target.value)} />
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={t.rate_pct}
                  onChange={(e) => {
                    const rate = e.target.value;
                    const auto = afterDiscount > 0 && parseFloat(rate) > 0
                      ? String(Math.round(afterDiscount * (parseFloat(rate) / 100) * 100) / 100)
                      : "";
                    setTaxLines((p) => p.map((x) => x.key === t.key ? { ...x, rate_pct: rate, amount: auto } : x));
                  }}
                />
                <div className="relative">
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder={autoAmount || "0.00"}
                    value={t.amount}
                    onChange={(e) => updateTax(t.key, "amount", e.target.value)}
                    className={isAutoAmount ? "pr-12" : ""}
                  />
                  {isAutoAmount && autoAmount && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-500 font-medium pointer-events-none">auto</span>
                  )}
                </div>
                <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-9 w-9"
                  onClick={() => setTaxLines((p) => p.filter((x) => x.key !== t.key))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={() => setTaxLines((p) => [...p, emptyTax()])}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Tax Line
          </Button>
        </div>
      </Section>

      {/* ── Bank Details ── */}
      <Section title="Bank Details on Invoice" open={openBank} onToggle={() => setOpenBank(!openBank)}>
        <div className="flex items-center gap-3 mb-4">
          <Switch id="show-bank" checked={showBankDetails} onCheckedChange={setShowBankDetails} />
          <Label htmlFor="show-bank" className="text-sm">Show bank details on PDF</Label>
        </div>
        {showBankDetails && (
          <div className="space-y-1.5">
            <Label>Bank Account to Print</Label>
            {bankAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No bank accounts configured. Add them in Finance Settings.
              </p>
            ) : (
              <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {bankAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_label}
                      {acc.is_default ? " (default)" : ""}
                      {acc.bank_name ? ` — ${acc.bank_name}` : ""}
                      {acc.currency ? ` · ${acc.currency}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </Section>

      {/* ── Remarks ── */}
      <Section title="Notes & Remarks" open={openRemarks} onToggle={() => setOpenRemarks(!openRemarks)}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Remarks (visible on invoice)</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Payment instructions, special terms, etc." rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (visible on invoice)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Internal Notes (not on PDF)</Label>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Internal reference only" rows={2} />
          </div>
        </div>
      </Section>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 pb-8">
        <Button type="button" variant="outline"
          onClick={() => navigate(isEdit && id ? `/finance/invoices/${id}` : "/finance/invoices")}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !buyerName.trim()} className="bg-purple-600 hover:bg-purple-700 text-white">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {isEdit ? "Save Changes" : "Create Invoice"}
        </Button>
      </div>
    </form>
  );
}

type Invoice = import("@/hooks/useInvoices").Invoice;
