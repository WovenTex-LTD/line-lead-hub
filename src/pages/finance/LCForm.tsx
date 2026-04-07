import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Landmark, Save, Upload, FileUp, Loader2, Sparkles,
  ChevronDown, ChevronUp, Shield, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  useMasterLC,
  useMasterLCs,
  useMasterLCMutations,
  useBtbLCMutations,
  type MasterLC,
  type BtbLC,
} from "@/hooks/useLCManagement";
import { useSalesContracts } from "@/hooks/useSalesContracts";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

// ── Constants ───────────────────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP"];
const LC_TYPES = [
  { value: "irrevocable", label: "Irrevocable" },
  { value: "revocable", label: "Revocable" },
  { value: "confirmed", label: "Confirmed" },
  { value: "standby", label: "Standby" },
  { value: "transferable", label: "Transferable" },
];
const PAYMENT_TYPES = [
  { value: "at_sight", label: "At Sight" },
  { value: "deferred", label: "Deferred" },
  { value: "usance", label: "Usance" },
  { value: "mixed", label: "Mixed" },
];
const INCOTERMS_OPTIONS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"];
const LC_STATUSES = [
  { value: "received", label: "Received" },
  { value: "advised", label: "Advised" },
  { value: "confirmed", label: "Confirmed" },
  { value: "partially_shipped", label: "Partially Shipped" },
  { value: "fully_shipped", label: "Fully Shipped" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "closed", label: "Closed" },
];
const BTB_PURPOSES = [
  { value: "fabric", label: "Fabric" },
  { value: "trims", label: "Trims" },
  { value: "accessories", label: "Accessories" },
  { value: "washing", label: "Washing" },
  { value: "other", label: "Other" },
];

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

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

// ── Extracted field label ───────────────────────────────────────────────────

function ExtractedLabel({
  children,
  extracted,
  required,
}: {
  children: React.ReactNode;
  extracted?: boolean;
  required?: boolean;
}) {
  return (
    <Label className="flex items-center gap-1.5">
      {children}
      {required && <span className="text-destructive">*</span>}
      {extracted && (
        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
      )}
    </Label>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function LCForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const lcType = searchParams.get("type") ?? "master";
  const isMaster = lcType !== "btb";
  const isBtb = lcType === "btb";
  const isEdit = !!id;

  // ── Hooks ──────────────────────────────────────────────────────────────
  const { lc: masterLcData, loading: loadingMasterLC } = useMasterLC(
    isMaster && isEdit ? id : undefined
  );
  const { createLC, updateLC, saving: savingMaster } = useMasterLCMutations();
  const { createBtbLC, updateBtbLC, saving: savingBtb } = useBtbLCMutations();
  const { contracts, loading: loadingContracts } = useSalesContracts();
  const { lcs: masterLcsList, loading: loadingMasterLCs } = useMasterLCs();

  const saving = isMaster ? savingMaster : savingBtb;

  // ── BTB edit: load single BTB LC manually ──────────────────────────────
  const [btbLcData, setBtbLcData] = useState<BtbLC | null>(null);
  const [loadingBtbLC, setLoadingBtbLC] = useState(false);

  useEffect(() => {
    if (!isEdit || isMaster || !id) return;
    setLoadingBtbLC(true);
    supabase
      .from("btb_lcs" as any)
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load BTB LC", { description: error.message });
        else setBtbLcData(data as unknown as BtbLC);
        setLoadingBtbLC(false);
      });
  }, [id, isEdit, isMaster]);

  const loadingExisting = isMaster ? loadingMasterLC : loadingBtbLC;

  // ── Upload / extraction state ──────────────────────────────────────────
  const [step, setStep] = useState<"upload" | "form">(
    isEdit || isBtb ? "form" : "upload"
  );
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [extractedFields, setExtractedFields] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Section open state ────────────────────────────────────────────────
  const [openEssentials, setOpenEssentials] = useState(true);
  const [openTerms, setOpenTerms] = useState(false);
  const [openBanks, setOpenBanks] = useState(false);
  const [openGoods, setOpenGoods] = useState(false);
  const [openNotes, setOpenNotes] = useState(true);

  // ── Master LC fields ──────────────────────────────────────────────────
  const [lcNumber, setLcNumber] = useState("");
  const [lcTypeField, setLcTypeField] = useState("irrevocable");
  const [buyerName, setBuyerName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [lcValue, setLcValue] = useState("");
  const [tolerancePct, setTolerancePct] = useState("5");
  const [issueDate, setIssueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expiryDate, setExpiryDate] = useState("");
  const [latestShipmentDate, setLatestShipmentDate] = useState("");
  const [status, setStatus] = useState("received");

  // Banks
  const [applicantBankName, setApplicantBankName] = useState("");
  const [applicantBankSwift, setApplicantBankSwift] = useState("");
  const [advisingBankName, setAdvisingBankName] = useState("");
  const [advisingBankSwift, setAdvisingBankSwift] = useState("");
  const [beneficiaryBankName, setBeneficiaryBankName] = useState("");
  const [beneficiaryBankBranch, setBeneficiaryBankBranch] = useState("");
  const [beneficiaryBankSwift, setBeneficiaryBankSwift] = useState("");
  const [beneficiaryBankAccount, setBeneficiaryBankAccount] = useState("");
  const [confirmingBankName, setConfirmingBankName] = useState("");
  const [confirmingBankSwift, setConfirmingBankSwift] = useState("");

  // Terms
  const [portOfLoading, setPortOfLoading] = useState("Chittagong, Bangladesh");
  const [portOfDischarge, setPortOfDischarge] = useState("");
  const [incoterms, setIncoterms] = useState("FOB");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paymentType, setPaymentType] = useState("at_sight");
  const [tenorDays, setTenorDays] = useState("");
  const [presentationPeriod, setPresentationPeriod] = useState("21");
  const [partialShipmentAllowed, setPartialShipmentAllowed] = useState(true);
  const [transhipmentAllowed, setTranshipmentAllowed] = useState(true);

  // Goods & docs
  const [goodsDescription, setGoodsDescription] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [insuranceRequired, setInsuranceRequired] = useState(false);
  const [insuranceDetails, setInsuranceDetails] = useState("");
  const [documentsRequired, setDocumentsRequired] = useState("");
  const [specialConditions, setSpecialConditions] = useState("");

  // Notes & linked
  const [notes, setNotes] = useState("");
  const [contractId, setContractId] = useState("none");

  // ── BTB LC fields ─────────────────────────────────────────────────────
  const [masterLcId, setMasterLcId] = useState("none");
  const [supplierName, setSupplierName] = useState("");
  const [purpose, setPurpose] = useState("fabric");
  const [marginPct, setMarginPct] = useState("10");
  const [maturityDate, setMaturityDate] = useState("");
  const [acceptanceDate, setAcceptanceDate] = useState("");

  // ── Helper: is a field AI-extracted? ──────────────────────────────────
  const wasExtracted = useCallback(
    (field: string) => extractedFields.has(field),
    [extractedFields]
  );

  // ── Upload & extract LC ───────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Unsupported file type", {
        description: "Please upload a PDF, PNG, JPG, or WEBP file.",
      });
      return;
    }

    setUploading(true);

    try {
      setUploading(false);
      setExtracting(true);

      // Send file directly to edge function as base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:...;base64, prefix
        };
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-lc", {
        body: {
          file_base64: base64,
          file_name: file.name,
          file_type: file.type,
        },
      });

      if (error) throw error;
      if (!data?.success || !data?.data) {
        toast.warning("Could not extract LC fields", { description: data?.parse_error || "The document may not be a standard LC format. Please fill in the fields manually." });
        setExtracting(false);
        setStep("form");
        return;
      }

      // Apply extracted data
      const extracted = data.data as Record<string, any>;
      const fields = new Set<string>();

      const applyField = (
        key: string,
        setter: (v: any) => void,
        val: any,
      ) => {
        if (val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0)) {
          // Convert arrays to newline-separated strings for textarea fields
          if (Array.isArray(val)) val = val.join("\n");
          setter(typeof val === "number" ? String(val) : val);
          fields.add(key);
        }
      };

      applyField("lc_number", setLcNumber, extracted.lc_number);
      applyField("lc_type", setLcTypeField, extracted.lc_type);
      applyField("buyer_name", setBuyerName, extracted.buyer_name);
      applyField("currency", setCurrency, extracted.currency);
      applyField("lc_value", setLcValue, extracted.lc_value);
      applyField("tolerance_pct", setTolerancePct, extracted.tolerance_pct);
      applyField("issue_date", setIssueDate, extracted.issue_date);
      applyField("expiry_date", setExpiryDate, extracted.expiry_date);
      applyField("latest_shipment_date", setLatestShipmentDate, extracted.latest_shipment_date);
      applyField("payment_terms", setPaymentTerms, extracted.payment_terms);
      applyField("payment_type", setPaymentType, extracted.payment_type);
      applyField("tenor_days", setTenorDays, extracted.tenor_days);
      applyField("presentation_period", setPresentationPeriod, extracted.presentation_period);
      applyField("port_of_loading", setPortOfLoading, extracted.port_of_loading);
      applyField("port_of_discharge", setPortOfDischarge, extracted.port_of_discharge);
      applyField("incoterms", setIncoterms, extracted.incoterms);
      applyField("goods_description", setGoodsDescription, extracted.goods_description);
      applyField("hs_code", setHsCode, extracted.hs_code);
      applyField("documents_required", setDocumentsRequired, extracted.documents_required);
      applyField("special_conditions", setSpecialConditions, extracted.special_conditions);
      applyField("applicant_bank_name", setApplicantBankName, extracted.applicant_bank_name);
      applyField("applicant_bank_swift", setApplicantBankSwift, extracted.applicant_bank_swift);
      applyField("advising_bank_name", setAdvisingBankName, extracted.advising_bank_name);
      applyField("advising_bank_swift", setAdvisingBankSwift, extracted.advising_bank_swift);
      applyField("beneficiary_bank_name", setBeneficiaryBankName, extracted.beneficiary_bank_name);
      applyField("beneficiary_bank_branch", setBeneficiaryBankBranch, extracted.beneficiary_bank_branch);
      applyField("beneficiary_bank_swift", setBeneficiaryBankSwift, extracted.beneficiary_bank_swift);
      applyField("beneficiary_bank_account", setBeneficiaryBankAccount, extracted.beneficiary_bank_account);
      applyField("confirming_bank_name", setConfirmingBankName, extracted.confirming_bank_name);
      applyField("confirming_bank_swift", setConfirmingBankSwift, extracted.confirming_bank_swift);
      applyField("insurance_details", setInsuranceDetails, extracted.insurance_details);

      if (extracted.partial_shipment_allowed !== undefined) {
        setPartialShipmentAllowed(!!extracted.partial_shipment_allowed);
        fields.add("partial_shipment_allowed");
      }
      if (extracted.transhipment_allowed !== undefined) {
        setTranshipmentAllowed(!!extracted.transhipment_allowed);
        fields.add("transhipment_allowed");
      }
      if (extracted.insurance_required !== undefined) {
        setInsuranceRequired(!!extracted.insurance_required);
        fields.add("insurance_required");
      }

      setExtractedFields(fields);

      // Open sections that have data
      const hasTerms = ["payment_terms", "payment_type", "incoterms", "port_of_discharge", "tenor_days", "presentation_period"].some(k => fields.has(k));
      const hasBanks = ["applicant_bank_name", "advising_bank_name", "beneficiary_bank_name", "confirming_bank_name"].some(k => fields.has(k));
      const hasGoods = ["goods_description", "hs_code", "documents_required", "special_conditions"].some(k => fields.has(k));

      if (hasTerms) setOpenTerms(true);
      if (hasBanks) setOpenBanks(true);
      if (hasGoods) setOpenGoods(true);

      setExtracting(false);
      setStep("form");
      toast.success("LC document processed", {
        description: `Extracted ${fields.size} fields from your document.`,
      });
    } catch (err: any) {
      setUploading(false);
      setExtracting(false);
      toast.error("Failed to process LC document", {
        description: err?.message ?? "Please try again or enter details manually.",
      });
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ── Populate on edit (Master LC) ───────────────────────────────────────
  useEffect(() => {
    if (!masterLcData || !isEdit || !isMaster) return;
    const lc = masterLcData;
    setLcNumber(lc.lc_number);
    setLcTypeField(lc.lc_type);
    setBuyerName(lc.buyer_name);
    setCurrency(lc.currency);
    setLcValue(String(lc.lc_value));
    setTolerancePct(String(lc.tolerance_pct));
    setIssueDate(lc.issue_date);
    setExpiryDate(lc.expiry_date);
    setLatestShipmentDate(lc.latest_shipment_date ?? "");
    setStatus(lc.status);
    setApplicantBankName(lc.applicant_bank_name ?? "");
    setApplicantBankSwift(lc.applicant_bank_swift ?? "");
    setAdvisingBankName(lc.advising_bank_name ?? "");
    setAdvisingBankSwift(lc.advising_bank_swift ?? "");
    setBeneficiaryBankName(lc.beneficiary_bank_name ?? "");
    setBeneficiaryBankBranch(lc.beneficiary_bank_branch ?? "");
    setBeneficiaryBankSwift(lc.beneficiary_bank_swift ?? "");
    setBeneficiaryBankAccount(lc.beneficiary_bank_account ?? "");
    setPortOfLoading(lc.port_of_loading ?? "Chittagong, Bangladesh");
    setPortOfDischarge(lc.port_of_discharge ?? "");
    setIncoterms(lc.incoterms ?? "FOB");
    setPaymentTerms(lc.payment_terms ?? "");
    setPaymentType(lc.payment_type);
    setTenorDays(lc.tenor_days != null ? String(lc.tenor_days) : "");
    setContractId(lc.contract_id ?? "none");
    setDocumentsRequired(lc.documents_required ?? "");
    setSpecialConditions(lc.special_conditions ?? "");
    setNotes(lc.notes ?? "");
    setPresentationPeriod(String(lc.presentation_period ?? 21));
    setPartialShipmentAllowed(lc.partial_shipment_allowed ?? true);
    setTranshipmentAllowed(lc.transhipment_allowed ?? true);
    setGoodsDescription(lc.goods_description ?? "");
    setHsCode(lc.hs_code ?? "");
    setConfirmingBankName(lc.confirming_bank_name ?? "");
    setConfirmingBankSwift(lc.confirming_bank_swift ?? "");
    setInsuranceRequired(lc.insurance_required ?? false);
    setInsuranceDetails(lc.insurance_details ?? "");

    // Open sections with data
    if (lc.advising_bank_name || lc.beneficiary_bank_name || lc.confirming_bank_name) setOpenBanks(true);
    if (lc.payment_terms || lc.port_of_discharge) setOpenTerms(true);
    if (lc.goods_description || lc.documents_required) setOpenGoods(true);
  }, [masterLcData, isEdit, isMaster]);

  // ── Populate on edit (BTB LC) ──────────────────────────────────────────
  useEffect(() => {
    if (!btbLcData || !isEdit || isMaster) return;
    const btb = btbLcData;
    setLcNumber(btb.lc_number);
    setMasterLcId(btb.master_lc_id ?? "none");
    setSupplierName(btb.supplier_name);
    setPurpose(btb.purpose);
    setCurrency(btb.currency);
    setLcValue(String(btb.lc_value));
    setMarginPct(String(btb.margin_pct));
    setIssueDate(btb.issue_date);
    setExpiryDate(btb.expiry_date);
    setMaturityDate(btb.maturity_date ?? "");
    setAcceptanceDate(btb.acceptance_date ?? "");
    setTenorDays(btb.tenor_days != null ? String(btb.tenor_days) : "");
    setPortOfLoading(btb.port_of_loading ?? "");
    setPortOfDischarge(btb.port_of_discharge ?? "Chittagong, Bangladesh");
    setNotes(btb.notes ?? "");
  }, [btbLcData, isEdit, isMaster]);

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!lcNumber.trim()) {
      toast.error("LC number is required");
      return;
    }

    if (isMaster) {
      if (!buyerName.trim()) {
        toast.error("Buyer name is required");
        return;
      }
      if (!lcValue || parseFloat(lcValue) <= 0) {
        toast.error("LC value must be greater than 0");
        return;
      }
      if (!issueDate || !expiryDate) {
        toast.error("Issue date and expiry date are required");
        return;
      }

      const fields = {
        lc_number: lcNumber.trim(),
        lc_type: lcTypeField,
        buyer_name: buyerName.trim(),
        currency,
        lc_value: parseFloat(lcValue),
        tolerance_pct: parseFloat(tolerancePct) || 5,
        issue_date: issueDate,
        expiry_date: expiryDate,
        latest_shipment_date: latestShipmentDate || null,
        applicant_name: null,
        applicant_bank_name: applicantBankName.trim() || null,
        applicant_bank_swift: applicantBankSwift.trim() || null,
        advising_bank_name: advisingBankName.trim() || null,
        advising_bank_swift: advisingBankSwift.trim() || null,
        beneficiary_bank_name: beneficiaryBankName.trim() || null,
        beneficiary_bank_branch: beneficiaryBankBranch.trim() || null,
        beneficiary_bank_swift: beneficiaryBankSwift.trim() || null,
        beneficiary_bank_account: beneficiaryBankAccount.trim() || null,
        port_of_loading: portOfLoading.trim() || null,
        port_of_discharge: portOfDischarge.trim() || null,
        incoterms: incoterms || null,
        payment_terms: paymentTerms.trim() || null,
        payment_type: paymentType,
        tenor_days:
          paymentType === "deferred" || paymentType === "usance"
            ? parseInt(tenorDays) || null
            : null,
        contract_id: contractId !== "none" ? contractId : null,
        documents_required: (Array.isArray(documentsRequired) ? documentsRequired.join("\n") : String(documentsRequired ?? "")).trim() || null,
        special_conditions: (typeof specialConditions === "string" ? specialConditions : String(specialConditions ?? "")).trim() || null,
        notes: (typeof notes === "string" ? notes : String(notes ?? "")).trim() || null,
        presentation_period: parseInt(presentationPeriod) || 21,
        partial_shipment_allowed: partialShipmentAllowed,
        transhipment_allowed: transhipmentAllowed,
        goods_description: goodsDescription.trim() || null,
        hs_code: hsCode.trim() || null,
        confirming_bank_name: confirmingBankName.trim() || null,
        confirming_bank_swift: confirmingBankSwift.trim() || null,
        insurance_required: insuranceRequired,
        insurance_details: insuranceRequired
          ? insuranceDetails.trim() || null
          : null,
        status: (isEdit ? status : "received") as MasterLC["status"],
      };

      if (isEdit && id) {
        const ok = await updateLC(id, fields);
        if (ok) navigate(`/finance/lc/${id}`);
      } else {
        console.log("Creating master LC with fields:", fields);
        const created = await createLC(fields as any);
        console.log("Create result:", created);
        if (created) navigate(`/finance/lc/${created.id}`);
      }
    } else {
      // BTB LC
      if (!supplierName.trim()) {
        toast.error("Supplier name is required");
        return;
      }
      if (!lcValue || parseFloat(lcValue) <= 0) {
        toast.error("LC value must be greater than 0");
        return;
      }
      if (!issueDate || !expiryDate) {
        toast.error("Issue date and expiry date are required");
        return;
      }

      const fields = {
        lc_number: lcNumber.trim(),
        master_lc_id: (masterLcId && masterLcId !== "none") ? masterLcId : null,
        supplier_name: supplierName.trim(),
        purpose,
        currency,
        lc_value: parseFloat(lcValue),
        margin_pct: parseFloat(marginPct) || 10,
        margin_amount: null,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        maturity_date: maturityDate || null,
        acceptance_date: acceptanceDate || null,
        payment_date: null,
        tenor_days: parseInt(tenorDays) || null,
        port_of_loading: portOfLoading.trim() || null,
        port_of_discharge: portOfDischarge.trim() || null,
        status: (isEdit ? btbLcData?.status : "opened") as BtbLC["status"],
        notes: (typeof notes === "string" ? notes : String(notes ?? "")).trim() || null,
        supplier_bank_name: null,
        supplier_bank_swift: null,
      };

      if (isEdit && id) {
        const ok = await updateBtbLC(id, fields);
        if (ok) navigate(masterLcId !== "none" ? `/finance/lc/${masterLcId}` : "/finance/lc");
      } else {
        const created = await createBtbLC(fields as any);
        if (created) navigate(masterLcId !== "none" ? `/finance/lc/${masterLcId}` : "/finance/lc");
      }
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────
  if (isEdit && loadingExisting) {
    return (
      <div className="py-6 space-y-4 max-w-4xl">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 1 — Upload
  // ════════════════════════════════════════════════════════════════════════

  if (step === "upload") {
    return (
      <div className="py-3 md:py-4 lg:py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate("/finance/lc")}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Upload LC Document</h1>
            <p className="text-sm text-muted-foreground">
              Upload an LC document or enter details manually
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {uploading || extracting ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="border-2 border-dashed border-purple-300 dark:border-purple-700">
                <CardContent className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-purple-600 dark:text-purple-400 animate-spin" />
                    </div>
                    <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-purple-500 animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">
                      {uploading ? "Uploading document..." : "Reading LC document..."}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {uploading
                        ? "Sending file to storage"
                        : "Extracting fields from your LC document. This may take a moment."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Card
                className={cn(
                  "border-2 border-dashed transition-colors cursor-pointer",
                  dragOver
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                    : "border-muted-foreground/25 hover:border-purple-400 hover:bg-muted/30"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <CardContent className="flex flex-col items-center justify-center py-24 gap-5">
                  <div
                    className={cn(
                      "h-20 w-20 rounded-full flex items-center justify-center transition-colors",
                      dragOver
                        ? "bg-purple-200 dark:bg-purple-800"
                        : "bg-muted"
                    )}
                  >
                    <FileUp
                      className={cn(
                        "h-10 w-10 transition-colors",
                        dragOver
                          ? "text-purple-600 dark:text-purple-300"
                          : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold mb-1.5">
                      Upload LC Document
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Upload the LC document from your bank. The system will read
                      it and fill in the details for you.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Choose file
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      PDF, PNG, JPG, WEBP
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </CardContent>
              </Card>

              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
                >
                  Skip — Enter manually
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 2 — Review & Save Form
  // ════════════════════════════════════════════════════════════════════════

  return (
    <form
      onSubmit={handleSubmit}
      className="py-3 md:py-4 lg:py-6 space-y-4 max-w-4xl pb-32"
    >
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            if (!isEdit && isMaster && !isBtb) {
              setStep("upload");
            } else {
              navigate(
                isEdit && id ? `/finance/lc/${id}` : "/finance/lc"
              );
            }
          }}
          className="-ml-2 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {isEdit
              ? `Edit ${isMaster ? "Master" : "BTB"} LC Details`
              : `New ${isMaster ? "Master" : "Back-to-Back"} LC`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {extractedFields.size > 0 ? (
              <>
                <Sparkles className="inline h-3.5 w-3.5 text-purple-500 mr-1" />
                {extractedFields.size} fields auto-filled from your document.
                Review and save.
              </>
            ) : isEdit ? (
              `Update ${isMaster ? "master" : "BTB"} LC details`
            ) : (
              `Fill in the details for your new ${isMaster ? "master" : "back-to-back"} letter of credit`
            )}
          </p>
        </div>
      </div>

      {/* ── Extraction Summary Banner ──────────────────────────────────── */}
      {extractedFields.size > 0 && !isEdit && (
        <div className="flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3">
          <Sparkles className="h-5 w-5 text-purple-500 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-purple-400">
              Extracted {extractedFields.size} fields from your document.
            </span>{" "}
            <span className="text-muted-foreground">Review the highlighted fields and save.</span>
          </div>
        </div>
      )}

      {isMaster ? (
        <>
          {/* ══════════════════════════════════════════════════════════════
              MASTER LC — STEPPED FORM
              ══════════════════════════════════════════════════════════ */}

          {/* ── Step 2a: Essentials ──────────────────────────────────── */}
          <Section
            title="Essentials"
            icon={Landmark}
            open={openEssentials}
            onToggle={() => setOpenEssentials((v) => !v)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel required extracted={wasExtracted("lc_number")}>
                  LC Number
                </ExtractedLabel>
                <Input
                  value={lcNumber}
                  onChange={(e) => setLcNumber(e.target.value)}
                  placeholder="e.g., LC-2026-001"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel required extracted={wasExtracted("buyer_name")}>
                  Buyer Name
                </ExtractedLabel>
                <Input
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="e.g., H&M, Zara"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel required extracted={wasExtracted("lc_value")}>
                  LC Value
                </ExtractedLabel>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={lcValue}
                  onChange={(e) => setLcValue(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("currency")}>
                  Currency
                </ExtractedLabel>
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
                <ExtractedLabel required extracted={wasExtracted("issue_date")}>
                  Issue Date
                </ExtractedLabel>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel required extracted={wasExtracted("expiry_date")}>
                  Expiry Date
                </ExtractedLabel>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("latest_shipment_date")}>
                  Latest Shipment Date
                </ExtractedLabel>
                <Input
                  type="date"
                  value={latestShipmentDate}
                  onChange={(e) => setLatestShipmentDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LC_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* ── Step 2b: Terms ───────────────────────────────────────── */}
          <Section
            title="Terms"
            icon={Shield}
            open={openTerms}
            onToggle={() => setOpenTerms((v) => !v)}
            badge={
              [paymentType !== "at_sight" && paymentType, incoterms]
                .filter(Boolean)
                .join(", ") || undefined
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("lc_type")}>
                  LC Type
                </ExtractedLabel>
                <Select value={lcTypeField} onValueChange={setLcTypeField}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("payment_terms")}>
                  Payment Terms
                </ExtractedLabel>
                <Input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="e.g., 90 days from B/L date"
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("payment_type")}>
                  Payment Type
                </ExtractedLabel>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(paymentType === "deferred" || paymentType === "usance") && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <ExtractedLabel extracted={wasExtracted("tenor_days")}>
                    Tenor (Days)
                  </ExtractedLabel>
                  <Input
                    type="number"
                    min="0"
                    value={tenorDays}
                    onChange={(e) => setTenorDays(e.target.value)}
                    placeholder="e.g., 90"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("tolerance_pct")}>
                  Tolerance %
                </ExtractedLabel>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={tolerancePct}
                  onChange={(e) => setTolerancePct(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("presentation_period")}>
                  Presentation Period (days)
                </ExtractedLabel>
                <Input
                  type="number"
                  min="0"
                  value={presentationPeriod}
                  onChange={(e) => setPresentationPeriod(e.target.value)}
                  placeholder="21"
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("incoterms")}>
                  Incoterms
                </ExtractedLabel>
                <Select value={incoterms} onValueChange={setIncoterms}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOTERMS_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("port_of_loading")}>
                  Port of Loading
                </ExtractedLabel>
                <Input
                  value={portOfLoading}
                  onChange={(e) => setPortOfLoading(e.target.value)}
                  placeholder="Chittagong, Bangladesh"
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("port_of_discharge")}>
                  Port of Discharge
                </ExtractedLabel>
                <Input
                  value={portOfDischarge}
                  onChange={(e) => setPortOfDischarge(e.target.value)}
                  placeholder="Destination port"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <ExtractedLabel extracted={wasExtracted("partial_shipment_allowed")}>
                    Partial Shipment
                  </ExtractedLabel>
                  <p className="text-xs text-muted-foreground">
                    Allow partial shipments
                  </p>
                </div>
                <Switch
                  checked={partialShipmentAllowed}
                  onCheckedChange={setPartialShipmentAllowed}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <ExtractedLabel extracted={wasExtracted("transhipment_allowed")}>
                    Transhipment
                  </ExtractedLabel>
                  <p className="text-xs text-muted-foreground">
                    Allow transhipment
                  </p>
                </div>
                <Switch
                  checked={transhipmentAllowed}
                  onCheckedChange={setTranshipmentAllowed}
                />
              </div>
            </div>
          </Section>

          {/* ── Step 2c: Banks ───────────────────────────────────────── */}
          <Section
            title="Banks"
            icon={Landmark}
            open={openBanks}
            onToggle={() => setOpenBanks((v) => !v)}
            badge={
              [applicantBankName, advisingBankName, beneficiaryBankName, confirmingBankName]
                .filter(Boolean)
                .join(", ") || undefined
            }
          >
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Applicant / Issuing Bank
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("applicant_bank_name")}>
                  Bank Name
                </ExtractedLabel>
                <Input
                  value={applicantBankName}
                  onChange={(e) => setApplicantBankName(e.target.value)}
                  placeholder="Issuing bank name"
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("applicant_bank_swift")}>
                  SWIFT Code
                </ExtractedLabel>
                <Input
                  value={applicantBankSwift}
                  onChange={(e) => setApplicantBankSwift(e.target.value)}
                  placeholder="SWIFT / BIC code"
                />
              </div>
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Advising Bank
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("advising_bank_name")}>
                  Bank Name
                </ExtractedLabel>
                <Input
                  value={advisingBankName}
                  onChange={(e) => setAdvisingBankName(e.target.value)}
                  placeholder="Advising bank name"
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("advising_bank_swift")}>
                  SWIFT Code
                </ExtractedLabel>
                <Input
                  value={advisingBankSwift}
                  onChange={(e) => setAdvisingBankSwift(e.target.value)}
                  placeholder="SWIFT / BIC code"
                />
              </div>
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Beneficiary Bank
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("beneficiary_bank_name")}>
                  Bank Name
                </ExtractedLabel>
                <Input
                  value={beneficiaryBankName}
                  onChange={(e) => setBeneficiaryBankName(e.target.value)}
                  placeholder="Beneficiary bank name"
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("beneficiary_bank_branch")}>
                  Branch
                </ExtractedLabel>
                <Input
                  value={beneficiaryBankBranch}
                  onChange={(e) => setBeneficiaryBankBranch(e.target.value)}
                  placeholder="Branch name"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("beneficiary_bank_swift")}>
                  SWIFT Code
                </ExtractedLabel>
                <Input
                  value={beneficiaryBankSwift}
                  onChange={(e) => setBeneficiaryBankSwift(e.target.value)}
                  placeholder="SWIFT / BIC code"
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("beneficiary_bank_account")}>
                  Account Number
                </ExtractedLabel>
                <Input
                  value={beneficiaryBankAccount}
                  onChange={(e) => setBeneficiaryBankAccount(e.target.value)}
                  placeholder="Account number"
                />
              </div>
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Confirming Bank
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("confirming_bank_name")}>
                  Bank Name
                </ExtractedLabel>
                <Input
                  value={confirmingBankName}
                  onChange={(e) => setConfirmingBankName(e.target.value)}
                  placeholder="Confirming bank name"
                />
              </div>
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("confirming_bank_swift")}>
                  SWIFT Code
                </ExtractedLabel>
                <Input
                  value={confirmingBankSwift}
                  onChange={(e) => setConfirmingBankSwift(e.target.value)}
                  placeholder="SWIFT / BIC code"
                />
              </div>
            </div>
          </Section>

          {/* ── Step 2d: Goods & Documents ───────────────────────────── */}
          <Section
            title="Goods & Documents"
            icon={FileText}
            open={openGoods}
            onToggle={() => setOpenGoods((v) => !v)}
          >
            <div className="space-y-1.5">
              <ExtractedLabel extracted={wasExtracted("goods_description")}>
                Goods Description
              </ExtractedLabel>
              <Textarea
                value={goodsDescription}
                onChange={(e) => setGoodsDescription(e.target.value)}
                placeholder="Description of goods as per LC terms"
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("hs_code")}>
                  HS Code
                </ExtractedLabel>
                <Input
                  value={hsCode}
                  onChange={(e) => setHsCode(e.target.value)}
                  placeholder="e.g. 6204.62"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <ExtractedLabel extracted={wasExtracted("insurance_required")}>
                    Insurance Required
                  </ExtractedLabel>
                  <p className="text-xs text-muted-foreground">
                    Insurance coverage needed
                  </p>
                </div>
                <Switch
                  checked={insuranceRequired}
                  onCheckedChange={setInsuranceRequired}
                />
              </div>
            </div>

            {insuranceRequired && (
              <div className="space-y-1.5">
                <ExtractedLabel extracted={wasExtracted("insurance_details")}>
                  Insurance Details
                </ExtractedLabel>
                <Textarea
                  value={insuranceDetails}
                  onChange={(e) => setInsuranceDetails(e.target.value)}
                  placeholder="Coverage type, amount, provider details..."
                  rows={3}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <ExtractedLabel extracted={wasExtracted("documents_required")}>
                Documents Required
              </ExtractedLabel>
              <Textarea
                value={documentsRequired}
                onChange={(e) => setDocumentsRequired(e.target.value)}
                placeholder="List required documents (bill of lading, invoice, packing list, etc.)"
                rows={4}
              />
            </div>

            <div className="space-y-1.5">
              <ExtractedLabel extracted={wasExtracted("special_conditions")}>
                Special Conditions
              </ExtractedLabel>
              <Textarea
                value={specialConditions}
                onChange={(e) => setSpecialConditions(e.target.value)}
                placeholder="Any special LC conditions or clauses"
                rows={3}
              />
            </div>
          </Section>

          {/* ── Step 2e: Notes ───────────────────────────────────────── */}
          <Section
            title="Notes"
            open={openNotes}
            onToggle={() => setOpenNotes((v) => !v)}
          >
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Sales Contract (optional)</Label>
              <Select value={contractId} onValueChange={setContractId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a contract..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked contract</SelectItem>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contract_number} - {c.buyer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>
        </>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════
              BTB LC FORM
              ══════════════════════════════════════════════════════════ */}

          {/* ── 1. BTB Header ─────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Landmark className="h-4 w-4 text-muted-foreground" />
                BTB LC Header
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    LC Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={lcNumber}
                    onChange={(e) => setLcNumber(e.target.value)}
                    placeholder="e.g., BTB-2026-001"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Master LC (optional)</Label>
                  <Select value={masterLcId} onValueChange={(val) => {
                    setMasterLcId(val);
                    if (val !== "none") {
                      const selected = masterLcsList.find((l) => l.id === val);
                      if (selected) {
                        if (!lcNumber.trim()) {
                          setLcNumber(`BTB-${selected.lc_number}`);
                        }
                        setCurrency(selected.currency);
                      }
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select master LC..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No linked master LC</SelectItem>
                      {masterLcsList.map((lc) => (
                        <SelectItem key={lc.id} value={lc.id}>
                          {lc.lc_number} - {lc.buyer_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Supplier Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Supplier / vendor name"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label>Purpose</Label>
                  <Select value={purpose} onValueChange={setPurpose}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BTB_PURPOSES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Label>
                    LC Value <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={lcValue}
                    onChange={(e) => setLcValue(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Margin %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={marginPct}
                    onChange={(e) => setMarginPct(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 2. Dates ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    Issue Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Expiry Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Maturity Date</Label>
                  <Input
                    type="date"
                    value={maturityDate}
                    onChange={(e) => setMaturityDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Acceptance Date</Label>
                  <Input
                    type="date"
                    value={acceptanceDate}
                    onChange={(e) => setAcceptanceDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tenor (Days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={tenorDays}
                    onChange={(e) => setTenorDays(e.target.value)}
                    placeholder="e.g., 90"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 3. Shipping ───────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Shipping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Port of Loading</Label>
                  <Input
                    value={portOfLoading}
                    onChange={(e) => setPortOfLoading(e.target.value)}
                    placeholder="Origin port"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Port of Discharge</Label>
                  <Input
                    value={portOfDischarge}
                    onChange={(e) => setPortOfDischarge(e.target.value)}
                    placeholder="Chittagong, Bangladesh"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 4. Notes ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Submit Bar ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate(
                isEdit && id ? `/finance/lc/${id}` : "/finance/lc"
              )
            }
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isEdit
                  ? "Save Changes"
                  : isMaster ? "Log Master LC" : "Log BTB LC"}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
