import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, Upload, FileUp, Save, Package, Ship,
  DollarSign, FileText, Loader2, CheckCircle, AlertCircle, Sparkles,
  ChevronDown, ChevronUp, Building2, Landmark, Bell, ClipboardList, ScrollText, Users,
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
import { Badge } from "@/components/ui/badge";
import {
  useSalesContract,
  useSalesContractMutations,
  useExtractPO,
  type ExtractedPOData,
  type SalesContract,
  type ContractItemInsert,
} from "@/hooks/useSalesContracts";
import { useWorkOrderOptions } from "@/hooks/useInvoices";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ── Key generation ──────────────────────────────────────────────────────────

let _key = 0;
const nextKey = () => String(++_key);

// ── Row types ───────────────────────────────────────────────────────────────

interface ItemRow {
  key: string;
  po_number: string;
  style_ref: string;
  style_description: string;
  garment_type: string;
  fabric_composition: string;
  color: string;
  size_range: string;
  quantity: string;
  unit_price: string;
  price_type: string;
  delivery_date: string;
  ship_date: string;
  ex_factory_date: string;
  hs_code: string;
  remarks: string;
  work_order_id: string;
  end_customer: string;
}

function emptyItem(): ItemRow {
  return {
    key: nextKey(),
    po_number: "",
    style_ref: "",
    style_description: "",
    garment_type: "",
    fabric_composition: "",
    color: "",
    size_range: "",
    quantity: "",
    unit_price: "",
    price_type: "fob",
    delivery_date: "",
    ship_date: "",
    ex_factory_date: "",
    hs_code: "",
    remarks: "",
    work_order_id: "none",
    end_customer: "",
  };
}

// ── Constants ───────────────────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP"];
const INCOTERMS_OPTIONS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"];
const SHIPMENT_MODES = ["By Sea", "By Air", "By Sea and Air"];
const PRICE_TYPES = [
  { value: "fob", label: "FOB" },
  { value: "cm", label: "CM" },
  { value: "cif", label: "CIF" },
  { value: "cfr", label: "CFR" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function rowValue(row: ItemRow): number {
  return (parseFloat(row.quantity) || 0) * (parseFloat(row.unit_price) || 0);
}

// ── Collapsible Section ─────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
  badge,
}: {
  title: string;
  icon?: React.ElementType;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
          {badge && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {badge}
            </Badge>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
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

// ── Confidence indicator ────────────────────────────────────────────────────

function ConfidenceIndicator({ value, label }: { value: unknown; label: string }) {
  const found = value !== null && value !== undefined && value !== "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5",
        found
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {found ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <AlertCircle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function ContractForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const extractedDocId = searchParams.get("extracted");
  const isEdit = !!id;

  const { contract, loading: loadingContract } = useSalesContract(id);
  const { createContract, updateContract, saving } = useSalesContractMutations();
  const { uploading, extractedData, uploadAndExtract, reset: resetExtraction } = useExtractPO();
  const workOrders = useWorkOrderOptions();

  // ── Section open state ──────────────────────────────────────────────────
  const [openPOUpload, setOpenPOUpload] = useState(!isEdit);
  const [openLC, setOpenLC] = useState(false);
  const [openCommission, setOpenCommission] = useState(false);
  const [openApplicant, setOpenApplicant] = useState(false);
  const [openBeneficiaryBank, setOpenBeneficiaryBank] = useState(false);
  const [openNotifyParty, setOpenNotifyParty] = useState(false);
  const [openDocumentsRequired, setOpenDocumentsRequired] = useState(false);
  const [openAdditionalClauses, setOpenAdditionalClauses] = useState(false);

  // ── Header fields ───────────────────────────────────────────────────────
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [contractDate, setContractDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [season, setSeason] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [contractTitle, setContractTitle] = useState("IRREVOCABLE SALES CONTRACT");
  const [totalValueText, setTotalValueText] = useState("");

  // ── Applicant fields ───────────────────────────────────────────────────
  const [applicantName, setApplicantName] = useState("");
  const [applicantAddress, setApplicantAddress] = useState("");
  const [applicantBankName, setApplicantBankName] = useState("");
  const [applicantBankAddress, setApplicantBankAddress] = useState("");
  const [applicantBankIban, setApplicantBankIban] = useState("");
  const [applicantBankSwift, setApplicantBankSwift] = useState("");
  const [applicantBankAccount, setApplicantBankAccount] = useState("");

  // ── Beneficiary Bank fields ────────────────────────────────────────────
  const [beneficiaryBankName, setBeneficiaryBankName] = useState("");
  const [beneficiaryBankBranch, setBeneficiaryBankBranch] = useState("");
  const [beneficiaryBankAddress, setBeneficiaryBankAddress] = useState("");
  const [beneficiaryBankSwift, setBeneficiaryBankSwift] = useState("");
  const [beneficiaryBankAccount, setBeneficiaryBankAccount] = useState("");

  // ── Notify Party fields ────────────────────────────────────────────────
  const [notifyPartyName, setNotifyPartyName] = useState("");
  const [notifyPartyAddress, setNotifyPartyAddress] = useState("");
  const [notifyPartyContact, setNotifyPartyContact] = useState("");
  const [notifyPartyNote, setNotifyPartyNote] = useState("");

  // ── Terms fields ────────────────────────────────────────────────────────
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [incoterms, setIncoterms] = useState("FOB");
  const [portOfLoading, setPortOfLoading] = useState("Chittagong, Bangladesh");
  const [portOfDischarge, setPortOfDischarge] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("Bangladesh");
  const [shipmentMode, setShipmentMode] = useState("By Sea");
  const [placeOfDelivery, setPlaceOfDelivery] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [tolerancePct, setTolerancePct] = useState("5");

  // ── LC fields ───────────────────────────────────────────────────────────
  const [lcRequired, setLcRequired] = useState(false);
  const [lcNumber, setLcNumber] = useState("");
  const [lcDate, setLcDate] = useState("");
  const [lcExpiryDate, setLcExpiryDate] = useState("");

  // ── Commission fields ───────────────────────────────────────────────────
  const [commissionPct, setCommissionPct] = useState("");
  const [agentName, setAgentName] = useState("");
  const [commissionPerPiece, setCommissionPerPiece] = useState("");
  const [agentBankName, setAgentBankName] = useState("");
  const [agentBankAddress, setAgentBankAddress] = useState("");
  const [agentBankAccount, setAgentBankAccount] = useState("");
  const [agentBankIban, setAgentBankIban] = useState("");
  const [agentBankSwift, setAgentBankSwift] = useState("");

  // ── Documents & Clauses ────────────────────────────────────────────────
  const [documentsRequired, setDocumentsRequired] = useState("");
  const [additionalClauses, setAdditionalClauses] = useState("");

  // ── Line items ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);

  // ── Notes ───────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  // ── Drag and drop state ─────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const [extractionSource, setExtractionSource] = useState<ExtractedPOData | null>(null);

  // ── Populate on edit ────────────────────────────────────────────────────
  useEffect(() => {
    if (!contract || !isEdit) return;
    setBuyerName(contract.buyer_name);
    setBuyerAddress(contract.buyer_address ?? "");
    setBuyerContact(contract.buyer_contact ?? "");
    setContractDate(contract.contract_date);
    setSeason(contract.season ?? "");
    setCurrency(contract.currency);
    setExchangeRate(String(contract.exchange_rate));
    setPaymentTerms(contract.payment_terms ?? "");
    setDeliveryTerms(contract.delivery_terms ?? "");
    setIncoterms(contract.incoterms ?? "FOB");
    setPortOfLoading(contract.port_of_loading ?? "Chittagong, Bangladesh");
    setPortOfDischarge(contract.port_of_discharge ?? "");
    setCountryOfOrigin(contract.country_of_origin ?? "Bangladesh");
    setLcRequired(contract.lc_required);
    setLcNumber(contract.lc_number ?? "");
    setLcDate(contract.lc_date ?? "");
    setLcExpiryDate(contract.lc_expiry_date ?? "");
    setCommissionPct(contract.commission_pct ? String(contract.commission_pct) : "");
    setAgentName(contract.agent_name ?? "");
    setNotes(contract.notes ?? "");
    setInternalNotes(contract.internal_notes ?? "");

    // New header fields
    setContractTitle((contract as any).contract_title ?? "IRREVOCABLE SALES CONTRACT");
    setTotalValueText((contract as any).total_value_text ?? "");

    // Applicant fields
    setApplicantName((contract as any).applicant_name ?? "");
    setApplicantAddress((contract as any).applicant_address ?? "");
    setApplicantBankName((contract as any).applicant_bank_name ?? "");
    setApplicantBankAddress((contract as any).applicant_bank_address ?? "");
    setApplicantBankIban((contract as any).applicant_bank_iban ?? "");
    setApplicantBankSwift((contract as any).applicant_bank_swift ?? "");
    setApplicantBankAccount((contract as any).applicant_bank_account ?? "");

    // Beneficiary Bank fields
    setBeneficiaryBankName((contract as any).beneficiary_bank_name ?? "");
    setBeneficiaryBankBranch((contract as any).beneficiary_bank_branch ?? "");
    setBeneficiaryBankAddress((contract as any).beneficiary_bank_address ?? "");
    setBeneficiaryBankSwift((contract as any).beneficiary_bank_swift ?? "");
    setBeneficiaryBankAccount((contract as any).beneficiary_bank_account ?? "");

    // Notify Party fields
    setNotifyPartyName((contract as any).notify_party_name ?? "");
    setNotifyPartyAddress((contract as any).notify_party_address ?? "");
    setNotifyPartyContact((contract as any).notify_party_contact ?? "");
    setNotifyPartyNote((contract as any).notify_party_note ?? "");

    // Additional Terms fields
    setShipmentMode((contract as any).shipment_mode ?? "By Sea");
    setPlaceOfDelivery((contract as any).place_of_delivery ?? "");
    setExpiryDate((contract as any).expiry_date ?? "");
    setTolerancePct((contract as any).tolerance_pct ? String((contract as any).tolerance_pct) : "5");

    // Additional Commission fields
    setCommissionPerPiece((contract as any).commission_per_piece ? String((contract as any).commission_per_piece) : "");
    setAgentBankName((contract as any).agent_bank_name ?? "");
    setAgentBankAddress((contract as any).agent_bank_address ?? "");
    setAgentBankAccount((contract as any).agent_bank_account ?? "");
    setAgentBankIban((contract as any).agent_bank_iban ?? "");
    setAgentBankSwift((contract as any).agent_bank_swift ?? "");

    // Documents & Clauses
    setDocumentsRequired((contract as any).documents_required ?? "");
    setAdditionalClauses((contract as any).additional_clauses ?? "");

    if (contract.lc_required) setOpenLC(true);
    if (contract.commission_pct > 0 || contract.agent_name) setOpenCommission(true);
    if ((contract as any).applicant_name) setOpenApplicant(true);
    if ((contract as any).beneficiary_bank_name) setOpenBeneficiaryBank(true);
    if ((contract as any).notify_party_name) setOpenNotifyParty(true);
    if ((contract as any).documents_required) setOpenDocumentsRequired(true);
    if ((contract as any).additional_clauses) setOpenAdditionalClauses(true);

    const ci = contract.sales_contract_items;
    if (ci && ci.length > 0) {
      setItems(
        ci.map((it) => ({
          key: nextKey(),
          po_number: it.po_number ?? "",
          style_ref: it.style_ref,
          style_description: it.style_description ?? "",
          garment_type: it.garment_type ?? "",
          fabric_composition: it.fabric_composition ?? "",
          color: it.color ?? "",
          size_range: it.size_range ?? "",
          quantity: String(it.quantity),
          unit_price: String(it.unit_price),
          price_type: it.price_type ?? "fob",
          delivery_date: it.delivery_date ?? "",
          ship_date: it.ship_date ?? "",
          ex_factory_date: it.ex_factory_date ?? "",
          hs_code: it.hs_code ?? "",
          remarks: it.remarks ?? "",
          work_order_id: it.work_order_id ?? "none",
          end_customer: (it as any).end_customer ?? "",
        }))
      );
    }
  }, [contract, isEdit]);

  // ── Load extracted document from URL param ──────────────────────────────
  useEffect(() => {
    if (!extractedDocId) return;

    async function loadExtractedDoc() {
      const { data, error } = await supabase
        .from("sales_contract_documents" as any)
        .select("*")
        .eq("id", extractedDocId)
        .single();

      if (error || !data) {
        toast.error("Failed to load extracted PO data");
        return;
      }

      const doc = data as any;
      if (doc.extraction_status !== "completed" || !doc.extracted_data) {
        toast.error("PO extraction is not yet complete or failed");
        return;
      }

      const extracted = doc.extracted_data as ExtractedPOData;
      applyExtractedData(extracted);
      setExtractionSource(extracted);
      toast.success("PO data loaded from extraction");
    }

    loadExtractedDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedDocId]);

  // ── Apply extracted data to form ────────────────────────────────────────
  const applyExtractedData = useCallback(
    (data: ExtractedPOData) => {
      if (data.buyer_name) setBuyerName(data.buyer_name);
      if (data.buyer_address) setBuyerAddress(data.buyer_address);
      if (data.currency) setCurrency(data.currency);
      if (data.payment_terms) setPaymentTerms(data.payment_terms);
      if (data.delivery_terms) setDeliveryTerms(data.delivery_terms);
      if (data.incoterms) setIncoterms(data.incoterms);
      if (data.port_of_loading) setPortOfLoading(data.port_of_loading);
      if (data.port_of_discharge) setPortOfDischarge(data.port_of_discharge);
      if (data.country_of_origin) setCountryOfOrigin(data.country_of_origin);
      if (data.lc_number) {
        setLcRequired(true);
        setLcNumber(data.lc_number);
        setOpenLC(true);
      }
      if (data.special_instructions) setNotes(data.special_instructions);

      // Build line items from extraction
      if (data.items && data.items.length > 0) {
        setItems(
          data.items.map((it) => ({
            key: nextKey(),
            po_number: it.po_number ?? data.po_number ?? "",
            style_ref: it.style_ref ?? data.style_ref ?? "",
            style_description: it.style_description ?? data.style_description ?? "",
            garment_type: data.garment_type ?? "",
            fabric_composition: data.fabric_composition ?? "",
            color: it.color ?? "",
            size_range: it.size_range ?? data.size_range ?? "",
            quantity: it.quantity != null ? String(it.quantity) : "",
            unit_price: it.unit_price != null ? String(it.unit_price) : "",
            price_type: data.price_type ?? "fob",
            delivery_date: it.delivery_date ?? data.delivery_date ?? "",
            ship_date: data.ship_date ?? "",
            ex_factory_date: data.ex_factory_date ?? "",
            hs_code: "",
            remarks: "",
            work_order_id: "none",
            end_customer: "",
          }))
        );
      } else {
        // Single item from top-level fields
        setItems([
          {
            key: nextKey(),
            po_number: data.po_number ?? "",
            style_ref: data.style_ref ?? "",
            style_description: data.style_description ?? "",
            garment_type: data.garment_type ?? "",
            fabric_composition: data.fabric_composition ?? "",
            color: data.colors?.join(", ") ?? "",
            size_range: data.size_range ?? "",
            quantity: data.quantity != null ? String(data.quantity) : "",
            unit_price: data.unit_price != null ? String(data.unit_price) : "",
            price_type: data.price_type ?? "fob",
            delivery_date: data.delivery_date ?? "",
            ship_date: data.ship_date ?? "",
            ex_factory_date: data.ex_factory_date ?? "",
            hs_code: "",
            remarks: "",
            work_order_id: "none",
            end_customer: "",
          },
        ]);
      }

      setExtractionSource(data);
    },
    []
  );

  // ── Watch extractedData from hook (live upload) ─────────────────────────
  useEffect(() => {
    if (extractedData) {
      applyExtractedData(extractedData);
    }
  }, [extractedData, applyExtractedData]);

  // ── File upload handler ─────────────────────────────────────────────────
  const handleFileUpload = useCallback(
    async (file: File) => {
      const validTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
      ];
      if (!validTypes.includes(file.type)) {
        toast.error("Unsupported file type. Please upload a PDF or image.");
        return;
      }
      await uploadAndExtract(file);
    },
    [uploadAndExtract]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
      e.target.value = "";
    },
    [handleFileUpload]
  );

  const clearExtraction = useCallback(() => {
    resetExtraction();
    setExtractionSource(null);
    setBuyerName("");
    setBuyerAddress("");
    setBuyerContact("");
    setPaymentTerms("");
    setDeliveryTerms("");
    setIncoterms("FOB");
    setPortOfLoading("Chittagong, Bangladesh");
    setPortOfDischarge("");
    setCountryOfOrigin("Bangladesh");
    setLcRequired(false);
    setLcNumber("");
    setLcDate("");
    setLcExpiryDate("");
    setNotes("");
    setItems([emptyItem()]);
    toast.info("Extracted data cleared");
  }, [resetExtraction]);

  // ── Row helpers ─────────────────────────────────────────────────────────
  const updateItem = (key: string, field: keyof Omit<ItemRow, "key">, value: string) =>
    setItems((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );

  // ── Totals ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalQty = items.reduce(
      (sum, r) => sum + (parseFloat(r.quantity) || 0),
      0
    );
    const totalValue = items.reduce((sum, r) => sum + rowValue(r), 0);
    return { count: items.length, totalQty, totalValue };
  }, [items]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!buyerName.trim()) {
      toast.error("Buyer name is required");
      return;
    }

    const validItems = items.filter(
      (r) => r.style_ref.trim() && (parseFloat(r.quantity) || 0) > 0
    );
    if (validItems.length === 0) {
      toast.error("At least one line item with style ref and quantity is required");
      return;
    }

    const header = {
      buyer_name: buyerName.trim(),
      buyer_address: buyerAddress.trim() || null,
      buyer_contact: buyerContact.trim() || null,
      contract_date: contractDate,
      season: season.trim() || null,
      currency,
      exchange_rate: parseFloat(exchangeRate) || 1,
      contract_title: contractTitle.trim() || "IRREVOCABLE SALES CONTRACT",
      total_value_text: totalValueText.trim() || null,
      // Applicant
      applicant_name: applicantName.trim() || null,
      applicant_address: applicantAddress.trim() || null,
      applicant_bank_name: applicantBankName.trim() || null,
      applicant_bank_address: applicantBankAddress.trim() || null,
      applicant_bank_iban: applicantBankIban.trim() || null,
      applicant_bank_swift: applicantBankSwift.trim() || null,
      applicant_bank_account: applicantBankAccount.trim() || null,
      // Beneficiary Bank
      beneficiary_bank_name: beneficiaryBankName.trim() || null,
      beneficiary_bank_branch: beneficiaryBankBranch.trim() || null,
      beneficiary_bank_address: beneficiaryBankAddress.trim() || null,
      beneficiary_bank_swift: beneficiaryBankSwift.trim() || null,
      beneficiary_bank_account: beneficiaryBankAccount.trim() || null,
      // Notify Party
      notify_party_name: notifyPartyName.trim() || null,
      notify_party_address: notifyPartyAddress.trim() || null,
      notify_party_contact: notifyPartyContact.trim() || null,
      notify_party_note: notifyPartyNote.trim() || null,
      // Terms
      payment_terms: paymentTerms.trim() || null,
      delivery_terms: deliveryTerms.trim() || null,
      incoterms: incoterms || null,
      port_of_loading: portOfLoading.trim() || null,
      port_of_discharge: portOfDischarge.trim() || null,
      country_of_origin: countryOfOrigin.trim() || "Bangladesh",
      shipment_mode: shipmentMode || null,
      place_of_delivery: placeOfDelivery.trim() || null,
      expiry_date: expiryDate || null,
      tolerance_pct: parseFloat(tolerancePct) || 5,
      // LC
      lc_required: lcRequired,
      lc_number: lcRequired ? lcNumber.trim() || null : null,
      lc_date: lcRequired && lcDate ? lcDate : null,
      lc_expiry_date: lcRequired && lcExpiryDate ? lcExpiryDate : null,
      // Commission
      commission_pct: parseFloat(commissionPct) || 0,
      agent_name: agentName.trim() || null,
      commission_per_piece: parseFloat(commissionPerPiece) || null,
      agent_bank_name: agentBankName.trim() || null,
      agent_bank_address: agentBankAddress.trim() || null,
      agent_bank_account: agentBankAccount.trim() || null,
      agent_bank_iban: agentBankIban.trim() || null,
      agent_bank_swift: agentBankSwift.trim() || null,
      // Documents & Clauses
      documents_required: documentsRequired.trim() || null,
      additional_clauses: additionalClauses.trim() || null,
      // Status & meta
      status: (isEdit ? contract?.status : "draft") as SalesContract["status"],
      notes: notes.trim() || null,
      internal_notes: internalNotes.trim() || null,
      total_quantity: totals.totalQty,
      total_value: totals.totalValue,
      contract_number: isEdit ? contract?.contract_number ?? "" : "",
      created_by: null,
    };

    const lineItems: ContractItemInsert[] = validItems.map((r, i) => ({
      po_number: r.po_number.trim() || null,
      style_ref: r.style_ref.trim(),
      style_description: r.style_description.trim() || null,
      garment_type: r.garment_type.trim() || null,
      fabric_composition: r.fabric_composition.trim() || null,
      color: r.color.trim() || null,
      size_range: r.size_range.trim() || null,
      quantity: parseFloat(r.quantity) || 0,
      unit_price: parseFloat(r.unit_price) || 0,
      price_type: r.price_type || "fob",
      delivery_date: r.delivery_date || null,
      ship_date: r.ship_date || null,
      ex_factory_date: r.ex_factory_date || null,
      hs_code: r.hs_code.trim() || null,
      remarks: r.remarks.trim() || null,
      work_order_id:
        r.work_order_id && r.work_order_id !== "none" ? r.work_order_id : null,
      end_customer: r.end_customer.trim() || null,
      sort_order: i,
    }));

    if (isEdit && id) {
      const ok = await updateContract(id, header, lineItems);
      if (ok) navigate(`/finance/contracts/${id}`);
    } else {
      const sc = await createContract(header as any, lineItems);
      if (sc) navigate(`/finance/contracts/${sc.id}`);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────
  if (isEdit && loadingContract) {
    return (
      <div className="py-6 space-y-4 max-w-4xl">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="py-3 md:py-4 lg:py-6 space-y-4 max-w-4xl pb-32">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() =>
            navigate(
              isEdit && id
                ? `/finance/contracts/${id}`
                : "/finance/contracts"
            )
          }
          className="-ml-2 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {isEdit
              ? `Edit ${contract?.contract_number ?? "Contract"}`
              : "New Sales Contract"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Update contract details"
              : extractionSource
              ? "Review extracted PO data and save"
              : "Create a new sales contract"}
          </p>
        </div>
      </div>

      {/* ── 1. PO Upload Section ─────────────────────────────────────── */}
      <Section
        title="PO Upload & AI Extraction"
        icon={Sparkles}
        open={openPOUpload}
        onToggle={() => setOpenPOUpload((v) => !v)}
        badge={extractionSource ? "Extracted" : undefined}
      >
        {extractionSource ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">
                  PO data extracted successfully
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearExtraction}
              >
                Clear extracted data
              </Button>
            </div>

            {/* Confidence indicators */}
            <div className="flex flex-wrap gap-2">
              <ConfidenceIndicator
                value={extractionSource.buyer_name}
                label="Buyer"
              />
              <ConfidenceIndicator
                value={extractionSource.po_number}
                label="PO Number"
              />
              <ConfidenceIndicator
                value={extractionSource.style_ref}
                label="Style"
              />
              <ConfidenceIndicator
                value={
                  extractionSource.quantity ??
                  (extractionSource.items && extractionSource.items.length > 0
                    ? "found"
                    : null)
                }
                label="Quantity"
              />
              <ConfidenceIndicator
                value={
                  extractionSource.unit_price ??
                  (extractionSource.items?.[0]?.unit_price ?? null)
                }
                label="Price"
              />
              <ConfidenceIndicator
                value={extractionSource.payment_terms}
                label="Payment Terms"
              />
              <ConfidenceIndicator
                value={extractionSource.incoterms}
                label="Incoterms"
              />
              <ConfidenceIndicator
                value={extractionSource.delivery_date}
                label="Delivery Date"
              />
              <ConfidenceIndicator
                value={extractionSource.lc_number}
                label="LC Number"
              />
              <ConfidenceIndicator
                value={
                  extractionSource.items && extractionSource.items.length > 1
                    ? `${extractionSource.items.length} items`
                    : null
                }
                label="Multi-Item"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload a Purchase Order (PDF or image) to auto-extract buyer
              details, styles, quantities, and pricing using AI.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50",
                uploading && "pointer-events-none opacity-60"
              )}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Extracting PO data...
                  </span>
                  <span className="text-xs text-muted-foreground">
                    AI is reading and parsing the document
                  </span>
                </div>
              ) : (
                <>
                  <FileUp className="h-8 w-8 text-muted-foreground mb-3" />
                  <span className="text-sm font-medium">
                    Drag and drop a PO file here
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    PDF, PNG, JPG, or WEBP
                  </span>
                  <label className="mt-3">
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="pointer-events-none"
                      tabIndex={-1}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose file
                    </Button>
                  </label>
                </>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* ── 2. Contract Header ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Contract Header
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contract Title</Label>
              <Input
                value={contractTitle}
                onChange={(e) => setContractTitle(e.target.value)}
                placeholder="IRREVOCABLE SALES CONTRACT"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total Value (Words)</Label>
              <Input
                value={totalValueText}
                onChange={(e) => setTotalValueText(e.target.value)}
                placeholder='e.g., US Dollars Two Hundred Twenty Thousand...'
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                Buyer Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="e.g., H&M, Zara, Next"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Buyer Contact</Label>
              <Input
                value={buyerContact}
                onChange={(e) => setBuyerContact(e.target.value)}
                placeholder="Contact name / email"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Buyer Address</Label>
            <Textarea
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
              placeholder="Full buyer address"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Contract Date</Label>
              <Input
                type="date"
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Season</Label>
              <Input
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="e.g., SS26, AW26"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Exchange Rate</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 2b. Applicant Section ──────────────────────────────────── */}
      <Section
        title="Applicant"
        icon={Building2}
        open={openApplicant}
        onToggle={() => setOpenApplicant((v) => !v)}
        badge={applicantName ? applicantName : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Applicant Name</Label>
            <Input
              value={applicantName}
              onChange={(e) => setApplicantName(e.target.value)}
              placeholder="e.g., CLIP DEAL TRADING CO. LLC"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Applicant Address</Label>
          <Textarea
            value={applicantAddress}
            onChange={(e) => setApplicantAddress(e.target.value)}
            placeholder="Full applicant address"
            rows={2}
          />
        </div>
        <Separator />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Applicant Bank Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Bank Name</Label>
            <Input
              value={applicantBankName}
              onChange={(e) => setApplicantBankName(e.target.value)}
              placeholder="Applicant's bank name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bank Address</Label>
            <Input
              value={applicantBankAddress}
              onChange={(e) => setApplicantBankAddress(e.target.value)}
              placeholder="Bank address"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>IBAN</Label>
            <Input
              value={applicantBankIban}
              onChange={(e) => setApplicantBankIban(e.target.value)}
              placeholder="IBAN"
            />
          </div>
          <div className="space-y-1.5">
            <Label>SWIFT Code</Label>
            <Input
              value={applicantBankSwift}
              onChange={(e) => setApplicantBankSwift(e.target.value)}
              placeholder="SWIFT/BIC"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input
              value={applicantBankAccount}
              onChange={(e) => setApplicantBankAccount(e.target.value)}
              placeholder="Account number"
            />
          </div>
        </div>
      </Section>

      {/* ── 2c. Beneficiary Bank Section ─────────────────────────────── */}
      <Section
        title="Beneficiary Bank"
        icon={Landmark}
        open={openBeneficiaryBank}
        onToggle={() => setOpenBeneficiaryBank((v) => !v)}
        badge={beneficiaryBankName ? beneficiaryBankName : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Bank Name</Label>
            <Input
              value={beneficiaryBankName}
              onChange={(e) => setBeneficiaryBankName(e.target.value)}
              placeholder="e.g., EXPORT IMPORT BANK OF BANGLADESH PLC"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Input
              value={beneficiaryBankBranch}
              onChange={(e) => setBeneficiaryBankBranch(e.target.value)}
              placeholder="Branch name"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Bank Address</Label>
          <Input
            value={beneficiaryBankAddress}
            onChange={(e) => setBeneficiaryBankAddress(e.target.value)}
            placeholder="Full bank address"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>SWIFT Code</Label>
            <Input
              value={beneficiaryBankSwift}
              onChange={(e) => setBeneficiaryBankSwift(e.target.value)}
              placeholder="SWIFT/BIC"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input
              value={beneficiaryBankAccount}
              onChange={(e) => setBeneficiaryBankAccount(e.target.value)}
              placeholder="Account number"
            />
          </div>
        </div>
      </Section>

      {/* ── 2d. Notify Party Section ─────────────────────────────────── */}
      <Section
        title="Notify Party"
        icon={Bell}
        open={openNotifyParty}
        onToggle={() => setOpenNotifyParty((v) => !v)}
        badge={notifyPartyName ? notifyPartyName : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Notify Party Name</Label>
            <Input
              value={notifyPartyName}
              onChange={(e) => setNotifyPartyName(e.target.value)}
              placeholder="e.g., BAGATELLE INTERNATIONAL INC."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input
              value={notifyPartyContact}
              onChange={(e) => setNotifyPartyContact(e.target.value)}
              placeholder="Contact person / phone / email"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notify Party Address</Label>
          <Textarea
            value={notifyPartyAddress}
            onChange={(e) => setNotifyPartyAddress(e.target.value)}
            placeholder="Full address"
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea
            value={notifyPartyNote}
            onChange={(e) => setNotifyPartyNote(e.target.value)}
            placeholder='e.g., "Bagatelle International Inc. is the ultimate buyer..."'
            rows={2}
          />
        </div>
      </Section>

      {/* ── 3. Terms Section ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Ship className="h-4 w-4 text-muted-foreground" />
            Terms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment Terms</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g., 30% TT advance, 70% against documents"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Delivery Terms</Label>
              <Input
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                placeholder="e.g., 90 days from LC date"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Incoterms</Label>
              <Select value={incoterms} onValueChange={setIncoterms}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCOTERMS_OPTIONS.map((ic) => (
                    <SelectItem key={ic} value={ic}>
                      {ic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Port of Loading</Label>
              <Input
                value={portOfLoading}
                onChange={(e) => setPortOfLoading(e.target.value)}
                placeholder="Chittagong, Bangladesh"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Port of Discharge</Label>
              <Input
                value={portOfDischarge}
                onChange={(e) => setPortOfDischarge(e.target.value)}
                placeholder="e.g., Rotterdam, Netherlands"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Country of Origin</Label>
              <Input
                value={countryOfOrigin}
                onChange={(e) => setCountryOfOrigin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Shipment Mode</Label>
              <Select value={shipmentMode} onValueChange={setShipmentMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIPMENT_MODES.map((sm) => (
                    <SelectItem key={sm} value={sm}>
                      {sm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Place of Delivery</Label>
              <Input
                value={placeOfDelivery}
                onChange={(e) => setPlaceOfDelivery(e.target.value)}
                placeholder="e.g., Jebel Ali, UAE"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tolerance %</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={tolerancePct}
                onChange={(e) => setTolerancePct(e.target.value)}
                placeholder="5"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contract Expiry Date</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. LC Section ────────────────────────────────────────────── */}
      <Section
        title="Letter of Credit (LC)"
        icon={DollarSign}
        open={openLC}
        onToggle={() => setOpenLC((v) => !v)}
        badge={lcRequired ? "Required" : undefined}
      >
        <div className="flex items-center gap-3 mb-4">
          <Switch
            checked={lcRequired}
            onCheckedChange={setLcRequired}
            id="lc-required"
          />
          <Label htmlFor="lc-required" className="cursor-pointer">
            LC Required
          </Label>
        </div>
        <AnimatePresence>
          {lcRequired && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>LC Number</Label>
                  <Input
                    value={lcNumber}
                    onChange={(e) => setLcNumber(e.target.value)}
                    placeholder="LC number"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>LC Date</Label>
                  <Input
                    type="date"
                    value={lcDate}
                    onChange={(e) => setLcDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>LC Expiry Date</Label>
                  <Input
                    type="date"
                    value={lcExpiryDate}
                    onChange={(e) => setLcExpiryDate(e.target.value)}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      {/* ── 5. Commission Section ────────────────────────────────────── */}
      <Section
        title="Commission"
        icon={DollarSign}
        open={openCommission}
        onToggle={() => setOpenCommission((v) => !v)}
        badge={
          parseFloat(commissionPct) > 0
            ? `${commissionPct}%`
            : undefined
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Commission %</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Commission Per Piece ({currency})</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={commissionPerPiece}
              onChange={(e) => setCommissionPerPiece(e.target.value)}
              placeholder="e.g., 0.20"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Agent Name</Label>
            <Input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Agent / buying house name"
            />
          </div>
        </div>
        <Separator />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent Bank Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Agent Bank Name</Label>
            <Input
              value={agentBankName}
              onChange={(e) => setAgentBankName(e.target.value)}
              placeholder="Bank name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Agent Bank Address</Label>
            <Input
              value={agentBankAddress}
              onChange={(e) => setAgentBankAddress(e.target.value)}
              placeholder="Bank address"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input
              value={agentBankAccount}
              onChange={(e) => setAgentBankAccount(e.target.value)}
              placeholder="Account number"
            />
          </div>
          <div className="space-y-1.5">
            <Label>IBAN</Label>
            <Input
              value={agentBankIban}
              onChange={(e) => setAgentBankIban(e.target.value)}
              placeholder="IBAN"
            />
          </div>
          <div className="space-y-1.5">
            <Label>SWIFT Code</Label>
            <Input
              value={agentBankSwift}
              onChange={(e) => setAgentBankSwift(e.target.value)}
              placeholder="SWIFT/BIC"
            />
          </div>
        </div>
      </Section>

      {/* ── 6. Line Items Section ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Line Items
              <Badge variant="secondary" className="ml-1 text-xs">
                {items.length}
              </Badge>
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((p) => [...p, emptyItem()])}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <AnimatePresence initial={false}>
            {items.map((row, idx) => (
              <motion.div
                key={row.key}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="relative rounded-lg border p-4 space-y-3"
              >
                {/* Row header */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Item {idx + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      Value:{" "}
                      <span className="font-medium text-foreground">
                        {currency} {fmt(rowValue(row))}
                      </span>
                    </span>
                    {items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() =>
                          setItems((p) => p.filter((r) => r.key !== row.key))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Row 1: PO, Style, Description */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">PO Number</Label>
                    <Input
                      value={row.po_number}
                      onChange={(e) =>
                        updateItem(row.key, "po_number", e.target.value)
                      }
                      placeholder="PO#"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Style Ref <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={row.style_ref}
                      onChange={(e) =>
                        updateItem(row.key, "style_ref", e.target.value)
                      }
                      placeholder="Style reference"
                      required
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={row.style_description}
                      onChange={(e) =>
                        updateItem(row.key, "style_description", e.target.value)
                      }
                      placeholder="Style description"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Row 2: Garment type, Fabric, Color, Size */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Garment Type</Label>
                    <Input
                      value={row.garment_type}
                      onChange={(e) =>
                        updateItem(row.key, "garment_type", e.target.value)
                      }
                      placeholder="e.g., T-Shirt"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fabric Composition</Label>
                    <Input
                      value={row.fabric_composition}
                      onChange={(e) =>
                        updateItem(
                          row.key,
                          "fabric_composition",
                          e.target.value
                        )
                      }
                      placeholder="e.g., 100% Cotton"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Color</Label>
                    <Input
                      value={row.color}
                      onChange={(e) =>
                        updateItem(row.key, "color", e.target.value)
                      }
                      placeholder="Color(s)"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Size Range</Label>
                    <Input
                      value={row.size_range}
                      onChange={(e) =>
                        updateItem(row.key, "size_range", e.target.value)
                      }
                      placeholder="S-XL"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Row 3: Qty, Price, Price Type, HS Code */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Quantity <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={row.quantity}
                      onChange={(e) =>
                        updateItem(row.key, "quantity", e.target.value)
                      }
                      placeholder="0"
                      required
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Unit Price ({currency}){" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.unit_price}
                      onChange={(e) =>
                        updateItem(row.key, "unit_price", e.target.value)
                      }
                      placeholder="0.00"
                      required
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Price Type</Label>
                    <Select
                      value={row.price_type}
                      onValueChange={(v) =>
                        updateItem(row.key, "price_type", v)
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_TYPES.map((pt) => (
                          <SelectItem key={pt.value} value={pt.value}>
                            {pt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">HS Code</Label>
                    <Input
                      value={row.hs_code}
                      onChange={(e) =>
                        updateItem(row.key, "hs_code", e.target.value)
                      }
                      placeholder="HS code"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Row 4: Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Delivery Date</Label>
                    <Input
                      type="date"
                      value={row.delivery_date}
                      onChange={(e) =>
                        updateItem(row.key, "delivery_date", e.target.value)
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ship Date</Label>
                    <Input
                      type="date"
                      value={row.ship_date}
                      onChange={(e) =>
                        updateItem(row.key, "ship_date", e.target.value)
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ex-Factory Date</Label>
                    <Input
                      type="date"
                      value={row.ex_factory_date}
                      onChange={(e) =>
                        updateItem(row.key, "ex_factory_date", e.target.value)
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Row 5: Work order link, End Customer, Remarks */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Link to Work Order</Label>
                    <Select
                      value={row.work_order_id}
                      onValueChange={(v) =>
                        updateItem(row.key, "work_order_id", v)
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="None (optional)" />
                      </SelectTrigger>
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
                  <div className="space-y-1">
                    <Label className="text-xs">End Customer</Label>
                    <Input
                      value={row.end_customer}
                      onChange={(e) =>
                        updateItem(row.key, "end_customer", e.target.value)
                      }
                      placeholder='e.g., TJ Maxx, Nordstrom Rack'
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Remarks</Label>
                    <Input
                      value={row.remarks}
                      onChange={(e) =>
                        updateItem(row.key, "remarks", e.target.value)
                      }
                      placeholder="Notes for this item"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {items.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No items yet. Click "Add Item" to add a line item.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 7a. Documents Required Section ─────────────────────────── */}
      <Section
        title="Documents Required"
        icon={ClipboardList}
        open={openDocumentsRequired}
        onToggle={() => setOpenDocumentsRequired((v) => !v)}
        badge={documentsRequired ? "Filled" : undefined}
      >
        <div className="space-y-1.5">
          <Label>Required Shipping Documents</Label>
          <Textarea
            value={documentsRequired}
            onChange={(e) => setDocumentsRequired(e.target.value)}
            placeholder={"1. Signed commercial invoice in triplicate\n2. Full set of clean on-board ocean bill of lading\n3. Packing list in triplicate\n4. Certificate of origin (GSP Form A)\n5. Inspection certificate\n6. Beneficiary certificate"}
            rows={8}
          />
          <p className="text-xs text-muted-foreground">
            List all documents required for shipment and LC negotiation.
          </p>
        </div>
      </Section>

      {/* ── 7b. Additional Clauses Section ────────────────────────────── */}
      <Section
        title="Additional Clauses"
        icon={ScrollText}
        open={openAdditionalClauses}
        onToggle={() => setOpenAdditionalClauses((v) => !v)}
        badge={additionalClauses ? "Filled" : undefined}
      >
        <div className="space-y-1.5">
          <Label>Additional Clauses</Label>
          <Textarea
            value={additionalClauses}
            onChange={(e) => setAdditionalClauses(e.target.value)}
            placeholder="Any additional contract clauses, special conditions, or amendments..."
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            Free text for any additional clauses or special conditions not covered above.
          </p>
        </div>
      </Section>

      {/* ── 8. Notes Section ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Contract Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes visible on the contract document"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              These notes will appear on printed/exported contract documents.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Internal notes (not shown on documents)"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Internal only. Not included in any exported documents.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── 8. Summary Footer (sticky) ───────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3 gap-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              Items:{" "}
              <span className="font-semibold text-foreground">
                {totals.count}
              </span>
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-muted-foreground">
              Total Qty:{" "}
              <span className="font-semibold text-foreground">
                {new Intl.NumberFormat("en-US").format(totals.totalQty)}
              </span>
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-muted-foreground">
              Total Value:{" "}
              <span className="font-semibold text-foreground">
                {currency} {fmt(totals.totalValue)}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigate(
                  isEdit && id
                    ? `/finance/contracts/${id}`
                    : "/finance/contracts"
                )
              }
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isEdit ? "Update Contract" : "Create Contract"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
