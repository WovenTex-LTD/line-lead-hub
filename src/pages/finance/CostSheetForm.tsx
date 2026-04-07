import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, Calculator, Save, GripVertical,
  Package, Scissors, Settings, DollarSign, Ship, Layers,
  Loader2, ChevronDown, ChevronUp,
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
  useCostSheet,
  useCostSheetMutations,
  useCostSheetTemplates,
  calcCostSheetTotals,
  type CostSheet,
  type FabricInsert,
  type TrimInsert,
  type ProcessInsert,
  type CommercialInsert,
  type CmInsert,
} from "@/hooks/useCostSheets";
import { useWorkOrderOptions } from "@/hooks/useInvoices";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ── Key generation ────────────────────────────────────────────────────────────

let _key = 0;
const nextKey = () => String(++_key);

// ── Row types (local form state with key) ─────────────────────────────────────

interface FabricFormRow {
  key: string;
  fabric_type: string;
  description: string;
  composition: string;
  construction: string;
  gsm: string;
  width: string;
  consumption_per_dozen: string;
  consumption_unit: string;
  wastage_pct: string;
  marker_efficiency: string;
  price_per_unit: string;
  price_unit: string;
  currency: string;
  exchange_rate: string;
  source: string;
  supplier_name: string;
  greige_cost: string;
  dyeing_finishing_cost: string;
  show_greige: boolean;
}

interface TrimFormRow {
  key: string;
  category: string;
  item_name: string;
  description: string;
  qty_per_garment: string;
  unit_of_measure: string;
  unit_price: string;
  currency: string;
  exchange_rate: string;
  supplier_name: string;
  is_buyer_supplied: boolean;
  specifications: string;
}

interface ProcessFormRow {
  key: string;
  category: string;
  process_name: string;
  description: string;
  placement: string;
  cost_per_piece: string;
  currency: string;
  exchange_rate: string;
  supplier_name: string;
  is_outsourced: boolean;
}

interface CommercialFormRow {
  key: string;
  category: string;
  item_name: string;
  description: string;
  cost_type: string;
  amount: string;
  currency: string;
  exchange_rate: string;
}

// ── Default row factories ─────────────────────────────────────────────────────

function emptyFabric(): FabricFormRow {
  return {
    key: nextKey(), fabric_type: "shell", description: "", composition: "",
    construction: "plain", gsm: "", width: "", consumption_per_dozen: "",
    consumption_unit: "yards", wastage_pct: "5", marker_efficiency: "",
    price_per_unit: "", price_unit: "yard", currency: "USD", exchange_rate: "1",
    source: "local", supplier_name: "", greige_cost: "", dyeing_finishing_cost: "",
    show_greige: false,
  };
}

function emptyTrim(category: string = "Custom"): TrimFormRow {
  return {
    key: nextKey(), category, item_name: "", description: "",
    qty_per_garment: "", unit_of_measure: "pcs", unit_price: "",
    currency: "USD", exchange_rate: "1", supplier_name: "",
    is_buyer_supplied: false, specifications: "",
  };
}

function emptyProcess(category: string = "Special"): ProcessFormRow {
  return {
    key: nextKey(), category, process_name: "", description: "",
    placement: "", cost_per_piece: "", currency: "USD", exchange_rate: "1",
    supplier_name: "", is_outsourced: false,
  };
}

function emptyCommercial(category: string = "Other"): CommercialFormRow {
  return {
    key: nextKey(), category, item_name: "", description: "",
    cost_type: "per_piece", amount: "", currency: "USD", exchange_rate: "1",
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GARMENT_TYPES = [
  { value: "woven_top", label: "Woven Top" },
  { value: "knit_top", label: "Knit Top" },
  { value: "woven_bottom", label: "Woven Bottom" },
  { value: "knit_bottom", label: "Knit Bottom" },
  { value: "jacket", label: "Jacket" },
  { value: "dress", label: "Dress" },
  { value: "activewear", label: "Activewear" },
  { value: "denim", label: "Denim" },
  { value: "other", label: "Other" },
];

const FABRIC_TYPES = [
  { value: "shell", label: "Shell" },
  { value: "lining", label: "Lining" },
  { value: "pocket", label: "Pocket" },
  { value: "collar", label: "Collar" },
  { value: "other", label: "Other" },
];

const CONSTRUCTION_TYPES = [
  { value: "plain", label: "Plain" },
  { value: "twill", label: "Twill" },
  { value: "jersey", label: "Jersey" },
  { value: "rib", label: "Rib" },
  { value: "fleece", label: "Fleece" },
  { value: "denim", label: "Denim" },
  { value: "other", label: "Other" },
];

const CONSUMPTION_UNITS = ["yards", "metres", "kg"];
const PRICE_UNITS = ["yard", "metre", "kg"];
const FABRIC_SOURCES = [
  { value: "local", label: "Local" },
  { value: "import_china", label: "Import (China)" },
  { value: "import_india", label: "Import (India)" },
  { value: "buyer_nominated", label: "Buyer Nominated" },
];

const TRIM_PRESETS = ["Thread", "Button", "Zipper", "Label", "Interlining", "Elastic", "Polybag", "Carton", "Hanger", "Custom"];
const TRIM_UNITS = ["pcs", "metres", "yards", "gross", "rolls", "cones"];

const PROCESS_PRESETS = ["Wash", "Print", "Embroidery", "Testing", "Inspection", "Special"];
const COMMERCIAL_PRESETS = ["Freight", "C&F", "Documentation", "Banking", "Courier", "Commission", "Duty", "Other"];

const CURRENCIES = ["USD", "EUR", "GBP"];
const PRICE_TYPES = [
  { value: "fob", label: "FOB" },
  { value: "cm", label: "CM" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function calcFabricCostDz(row: FabricFormRow): number {
  const consumption = parseFloat(row.consumption_per_dozen) || 0;
  const wastage = 1 + (parseFloat(row.wastage_pct) || 0) / 100;
  const price = parseFloat(row.price_per_unit) || 0;
  return consumption * price * wastage;
}

function calcTrimCostDz(row: TrimFormRow): number {
  if (row.is_buyer_supplied) return 0;
  const qty = parseFloat(row.qty_per_garment) || 0;
  const price = parseFloat(row.unit_price) || 0;
  return qty * 12 * price;
}

function calcProcessCostDz(row: ProcessFormRow): number {
  return (parseFloat(row.cost_per_piece) || 0) * 12;
}

// ── Collapsible Section ───────────────────────────────────────────────────────

function Section({
  title, icon: Icon, open, onToggle, children, badge,
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
          {badge && <Badge variant="secondary" className="ml-2 text-xs">{badge}</Badge>}
        </span>
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function CostSheetForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { costSheet, loading: loadingCostSheet } = useCostSheet(id);
  const { createCostSheet, updateCostSheet, saving } = useCostSheetMutations();
  const { templates } = useCostSheetTemplates();
  const workOrders = useWorkOrderOptions();

  // ── Section open state ──────────────────────────────────────────────────
  const [openHeader, setOpenHeader] = useState(true);
  const [openFabric, setOpenFabric] = useState(true);
  const [openTrims, setOpenTrims] = useState(true);
  const [openCm, setOpenCm] = useState(true);
  const [openProcesses, setOpenProcesses] = useState(false);
  const [openCommercial, setOpenCommercial] = useState(false);

  // ── Header fields ───────────────────────────────────────────────────────
  const [buyerName, setBuyerName] = useState("");
  const [styleRef, setStyleRef] = useState("");
  const [styleDescription, setStyleDescription] = useState("");
  const [garmentType, setGarmentType] = useState("woven_top");
  const [fabricComposition, setFabricComposition] = useState("");
  const [headerGsm, setHeaderGsm] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [buyerTargetPrice, setBuyerTargetPrice] = useState("");
  const [targetPriceType, setTargetPriceType] = useState("fob");
  const [season, setSeason] = useState("");
  const [programName, setProgramName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [selectedWoId, setSelectedWoId] = useState("none");
  const [notes, setNotes] = useState("");
  const [isTemplate, setIsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("none");

  // ── Fabric rows ─────────────────────────────────────────────────────────
  const [fabricRows, setFabricRows] = useState<FabricFormRow[]>([]);

  // ── Trim rows ───────────────────────────────────────────────────────────
  const [trimRows, setTrimRows] = useState<TrimFormRow[]>([]);

  // ── CM state ────────────────────────────────────────────────────────────
  const [cmMode, setCmMode] = useState<"flat" | "sam">("flat");
  const [cmPerDozen, setCmPerDozen] = useState("");
  const [sam, setSam] = useState("");
  const [efficiencyPct, setEfficiencyPct] = useState("60");
  const [labourCostPerMinute, setLabourCostPerMinute] = useState("");
  const [overheadType, setOverheadType] = useState("percentage");
  const [overheadValue, setOverheadValue] = useState("0");

  // ── Process rows ────────────────────────────────────────────────────────
  const [processRows, setProcessRows] = useState<ProcessFormRow[]>([]);

  // ── Commercial rows ─────────────────────────────────────────────────────
  const [commercialRows, setCommercialRows] = useState<CommercialFormRow[]>([]);

  // ── Summary ─────────────────────────────────────────────────────────────
  const [desiredMargin, setDesiredMargin] = useState("");

  // ── Build a virtual CostSheet for calcCostSheetTotals ───────────────────
  const totals = useMemo(() => {
    const virtual: CostSheet = {
      id: "", factory_id: "", buyer_name: buyerName, style_ref: styleRef,
      style_description: null, garment_type: null, fabric_composition: null,
      gsm: null, target_quantity: parseFloat(targetQuantity) || null,
      buyer_target_price: parseFloat(buyerTargetPrice) || null,
      target_price_type: targetPriceType, season: null, program_name: null,
      currency, exchange_rate: parseFloat(exchangeRate) || 1,
      quoted_price: null, desired_margin_pct: parseFloat(desiredMargin) || null,
      work_order_id: null, is_template: false, template_name: null,
      status: "draft", created_by: null, approved_by: null, approved_at: null,
      notes: null, created_at: "", updated_at: "",
      cost_sheet_fabrics: fabricRows.map((f, i) => ({
        id: f.key, cost_sheet_id: "",
        fabric_type: f.fabric_type, description: f.description || null,
        composition: f.composition || null, construction: f.construction || null,
        gsm: parseFloat(f.gsm) || null, width: parseFloat(f.width) || null,
        consumption_per_dozen: parseFloat(f.consumption_per_dozen) || null,
        consumption_unit: f.consumption_unit, wastage_pct: parseFloat(f.wastage_pct) || 0,
        marker_efficiency: parseFloat(f.marker_efficiency) || null,
        price_per_unit: parseFloat(f.price_per_unit) || 0, price_unit: f.price_unit,
        currency: f.currency, exchange_rate: parseFloat(f.exchange_rate) || 1,
        source: f.source || null, supplier_name: f.supplier_name || null,
        greige_cost: parseFloat(f.greige_cost) || null,
        dyeing_finishing_cost: parseFloat(f.dyeing_finishing_cost) || null,
        sort_order: i,
      })),
      cost_sheet_trims: trimRows.map((t, i) => ({
        id: t.key, cost_sheet_id: "",
        category: t.category, item_name: t.item_name,
        description: t.description || null,
        qty_per_garment: parseFloat(t.qty_per_garment) || null,
        unit_of_measure: t.unit_of_measure || null,
        unit_price: parseFloat(t.unit_price) || 0,
        currency: t.currency, exchange_rate: parseFloat(t.exchange_rate) || 1,
        supplier_name: t.supplier_name || null,
        is_buyer_supplied: t.is_buyer_supplied,
        specifications: t.specifications || null,
        sort_order: i,
      })),
      cost_sheet_processes: processRows.map((p, i) => ({
        id: p.key, cost_sheet_id: "",
        category: p.category, process_name: p.process_name,
        description: p.description || null, placement: p.placement || null,
        cost_per_piece: parseFloat(p.cost_per_piece) || 0,
        currency: p.currency, exchange_rate: parseFloat(p.exchange_rate) || 1,
        supplier_name: p.supplier_name || null,
        is_outsourced: p.is_outsourced, sort_order: i,
      })),
      cost_sheet_commercial: commercialRows.map((c, i) => ({
        id: c.key, cost_sheet_id: "",
        category: c.category, item_name: c.item_name,
        description: c.description || null, cost_type: c.cost_type,
        amount: parseFloat(c.amount) || 0,
        currency: c.currency, exchange_rate: parseFloat(c.exchange_rate) || 1,
        sort_order: i,
      })),
      cost_sheet_cm: [{
        id: "cm", cost_sheet_id: "",
        cm_per_dozen: cmMode === "flat" ? (parseFloat(cmPerDozen) || null) : null,
        sam: cmMode === "sam" ? (parseFloat(sam) || null) : null,
        efficiency_pct: cmMode === "sam" ? (parseFloat(efficiencyPct) || null) : null,
        labour_cost_per_minute: cmMode === "sam" ? (parseFloat(labourCostPerMinute) || null) : null,
        overhead_type: overheadType,
        overhead_value: parseFloat(overheadValue) || 0,
      }],
    };
    return calcCostSheetTotals(virtual, currency, parseFloat(exchangeRate) || 1);
  }, [
    buyerName, styleRef, targetQuantity, buyerTargetPrice, targetPriceType,
    currency, exchangeRate, desiredMargin, fabricRows, trimRows, processRows,
    commercialRows, cmMode, cmPerDozen, sam, efficiencyPct, labourCostPerMinute,
    overheadType, overheadValue,
  ]);

  const quotedPrice = useMemo(() => {
    const margin = parseFloat(desiredMargin) || 0;
    if (margin <= 0 || margin >= 100) return totals.totalCostPc;
    return totals.totalCostPc / (1 - margin / 100);
  }, [desiredMargin, totals.totalCostPc]);

  // ── Populate on edit ────────────────────────────────────────────────────
  useEffect(() => {
    if (!costSheet || !isEdit) return;
    setBuyerName(costSheet.buyer_name);
    setStyleRef(costSheet.style_ref);
    setStyleDescription(costSheet.style_description ?? "");
    setGarmentType(costSheet.garment_type ?? "woven_top");
    setFabricComposition(costSheet.fabric_composition ?? "");
    setHeaderGsm(costSheet.gsm != null ? String(costSheet.gsm) : "");
    setTargetQuantity(costSheet.target_quantity != null ? String(costSheet.target_quantity) : "");
    setBuyerTargetPrice(costSheet.buyer_target_price != null ? String(costSheet.buyer_target_price) : "");
    setTargetPriceType(costSheet.target_price_type ?? "fob");
    setSeason(costSheet.season ?? "");
    setProgramName(costSheet.program_name ?? "");
    setCurrency(costSheet.currency);
    setExchangeRate(String(costSheet.exchange_rate));
    setSelectedWoId(costSheet.work_order_id ?? "none");
    setNotes(costSheet.notes ?? "");
    setIsTemplate(costSheet.is_template);
    setTemplateName(costSheet.template_name ?? "");
    setDesiredMargin(costSheet.desired_margin_pct != null ? String(costSheet.desired_margin_pct) : "");

    // Fabric rows
    if (costSheet.cost_sheet_fabrics && costSheet.cost_sheet_fabrics.length > 0) {
      setFabricRows(costSheet.cost_sheet_fabrics.map((f) => ({
        key: nextKey(),
        fabric_type: f.fabric_type,
        description: f.description ?? "",
        composition: f.composition ?? "",
        construction: f.construction ?? "plain",
        gsm: f.gsm != null ? String(f.gsm) : "",
        width: f.width != null ? String(f.width) : "",
        consumption_per_dozen: f.consumption_per_dozen != null ? String(f.consumption_per_dozen) : "",
        consumption_unit: f.consumption_unit,
        wastage_pct: String(f.wastage_pct),
        marker_efficiency: f.marker_efficiency != null ? String(f.marker_efficiency) : "",
        price_per_unit: String(f.price_per_unit),
        price_unit: f.price_unit,
        currency: f.currency,
        exchange_rate: String(f.exchange_rate),
        source: f.source ?? "local",
        supplier_name: f.supplier_name ?? "",
        greige_cost: f.greige_cost != null ? String(f.greige_cost) : "",
        dyeing_finishing_cost: f.dyeing_finishing_cost != null ? String(f.dyeing_finishing_cost) : "",
        show_greige: f.greige_cost != null || f.dyeing_finishing_cost != null,
      })));
    }

    // Trim rows
    if (costSheet.cost_sheet_trims && costSheet.cost_sheet_trims.length > 0) {
      setTrimRows(costSheet.cost_sheet_trims.map((t) => ({
        key: nextKey(),
        category: t.category,
        item_name: t.item_name,
        description: t.description ?? "",
        qty_per_garment: t.qty_per_garment != null ? String(t.qty_per_garment) : "",
        unit_of_measure: t.unit_of_measure ?? "pcs",
        unit_price: String(t.unit_price),
        currency: t.currency,
        exchange_rate: String(t.exchange_rate),
        supplier_name: t.supplier_name ?? "",
        is_buyer_supplied: t.is_buyer_supplied,
        specifications: t.specifications ?? "",
      })));
    }

    // CM
    const cm = costSheet.cost_sheet_cm?.[0];
    if (cm) {
      if (cm.cm_per_dozen != null) {
        setCmMode("flat");
        setCmPerDozen(String(cm.cm_per_dozen));
      } else {
        setCmMode("sam");
        setSam(cm.sam != null ? String(cm.sam) : "");
        setEfficiencyPct(cm.efficiency_pct != null ? String(cm.efficiency_pct) : "60");
        setLabourCostPerMinute(cm.labour_cost_per_minute != null ? String(cm.labour_cost_per_minute) : "");
      }
      setOverheadType(cm.overhead_type);
      setOverheadValue(String(cm.overhead_value));
    }

    // Process rows
    if (costSheet.cost_sheet_processes && costSheet.cost_sheet_processes.length > 0) {
      setProcessRows(costSheet.cost_sheet_processes.map((p) => ({
        key: nextKey(),
        category: p.category,
        process_name: p.process_name,
        description: p.description ?? "",
        placement: p.placement ?? "",
        cost_per_piece: String(p.cost_per_piece),
        currency: p.currency,
        exchange_rate: String(p.exchange_rate),
        supplier_name: p.supplier_name ?? "",
        is_outsourced: p.is_outsourced,
      })));
      setOpenProcesses(true);
    }

    // Commercial rows
    if (costSheet.cost_sheet_commercial && costSheet.cost_sheet_commercial.length > 0) {
      setCommercialRows(costSheet.cost_sheet_commercial.map((c) => ({
        key: nextKey(),
        category: c.category,
        item_name: c.item_name,
        description: c.description ?? "",
        cost_type: c.cost_type,
        amount: String(c.amount),
        currency: c.currency,
        exchange_rate: String(c.exchange_rate),
      })));
      setOpenCommercial(true);
    }
  }, [costSheet, isEdit]);

  // ── Template loading ────────────────────────────────────────────────────
  useEffect(() => {
    if (isEdit || selectedTemplateId === "none") return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;

    // Populate header
    if (tpl.garment_type) setGarmentType(tpl.garment_type);
    if (tpl.fabric_composition) setFabricComposition(tpl.fabric_composition);
    if (tpl.gsm != null) setHeaderGsm(String(tpl.gsm));
    if (tpl.currency) setCurrency(tpl.currency);
    if (tpl.exchange_rate) setExchangeRate(String(tpl.exchange_rate));
    if (tpl.notes) setNotes(tpl.notes);

    toast.success("Template loaded", { description: tpl.template_name ?? "Template applied to form" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);

  // ── Row update helpers ──────────────────────────────────────────────────
  const updateFabric = (key: string, field: keyof FabricFormRow, value: any) =>
    setFabricRows((p) => p.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const updateTrim = (key: string, field: keyof TrimFormRow, value: any) =>
    setTrimRows((p) => p.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const updateProcess = (key: string, field: keyof ProcessFormRow, value: any) =>
    setProcessRows((p) => p.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const updateCommercial = (key: string, field: keyof CommercialFormRow, value: any) =>
    setCommercialRows((p) => p.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const moveFabric = (index: number, dir: -1 | 1) => {
    setFabricRows((p) => {
      const next = [...p];
      const target = index + dir;
      if (target < 0 || target >= next.length) return p;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerName.trim() || !styleRef.trim()) {
      toast.error("Buyer name and style ref are required");
      return;
    }

    const fabrics: FabricInsert[] = fabricRows.map((f, i) => ({
      fabric_type: f.fabric_type,
      description: f.description || null,
      composition: f.composition || null,
      construction: f.construction || null,
      gsm: parseFloat(f.gsm) || null,
      width: parseFloat(f.width) || null,
      consumption_per_dozen: parseFloat(f.consumption_per_dozen) || null,
      consumption_unit: f.consumption_unit,
      wastage_pct: parseFloat(f.wastage_pct) || 0,
      marker_efficiency: parseFloat(f.marker_efficiency) || null,
      price_per_unit: parseFloat(f.price_per_unit) || 0,
      price_unit: f.price_unit,
      currency: f.currency,
      exchange_rate: parseFloat(f.exchange_rate) || 1,
      source: f.source || null,
      supplier_name: f.supplier_name || null,
      greige_cost: parseFloat(f.greige_cost) || null,
      dyeing_finishing_cost: parseFloat(f.dyeing_finishing_cost) || null,
      sort_order: i,
    }));

    const trims: TrimInsert[] = trimRows.map((t, i) => ({
      category: t.category,
      item_name: t.item_name,
      description: t.description || null,
      qty_per_garment: parseFloat(t.qty_per_garment) || null,
      unit_of_measure: t.unit_of_measure || null,
      unit_price: parseFloat(t.unit_price) || 0,
      currency: t.currency,
      exchange_rate: parseFloat(t.exchange_rate) || 1,
      supplier_name: t.supplier_name || null,
      is_buyer_supplied: t.is_buyer_supplied,
      specifications: t.specifications || null,
      sort_order: i,
    }));

    const processes: ProcessInsert[] = processRows.map((p, i) => ({
      category: p.category,
      process_name: p.process_name,
      description: p.description || null,
      placement: p.placement || null,
      cost_per_piece: parseFloat(p.cost_per_piece) || 0,
      currency: p.currency,
      exchange_rate: parseFloat(p.exchange_rate) || 1,
      supplier_name: p.supplier_name || null,
      is_outsourced: p.is_outsourced,
      sort_order: i,
    }));

    const commercial: CommercialInsert[] = commercialRows.map((c, i) => ({
      category: c.category,
      item_name: c.item_name,
      description: c.description || null,
      cost_type: c.cost_type,
      amount: parseFloat(c.amount) || 0,
      currency: c.currency,
      exchange_rate: parseFloat(c.exchange_rate) || 1,
      sort_order: i,
    }));

    const cm: CmInsert = {
      cm_per_dozen: cmMode === "flat" ? (parseFloat(cmPerDozen) || null) : null,
      sam: cmMode === "sam" ? (parseFloat(sam) || null) : null,
      efficiency_pct: cmMode === "sam" ? (parseFloat(efficiencyPct) || null) : null,
      labour_cost_per_minute: cmMode === "sam" ? (parseFloat(labourCostPerMinute) || null) : null,
      overhead_type: overheadType,
      overhead_value: parseFloat(overheadValue) || 0,
    };

    const header = {
      buyer_name: buyerName.trim(),
      style_ref: styleRef.trim(),
      style_description: styleDescription.trim() || null,
      garment_type: garmentType || null,
      fabric_composition: fabricComposition.trim() || null,
      gsm: parseFloat(headerGsm) || null,
      target_quantity: parseFloat(targetQuantity) || null,
      buyer_target_price: parseFloat(buyerTargetPrice) || null,
      target_price_type: targetPriceType,
      season: season.trim() || null,
      program_name: programName.trim() || null,
      currency,
      exchange_rate: parseFloat(exchangeRate) || 1,
      quoted_price: quotedPrice > 0 ? parseFloat(quotedPrice.toFixed(4)) : null,
      desired_margin_pct: parseFloat(desiredMargin) || null,
      work_order_id: (selectedWoId && selectedWoId !== "none") ? selectedWoId : null,
      is_template: isTemplate,
      template_name: isTemplate ? (templateName.trim() || null) : null,
      status: (isEdit ? costSheet?.status : "draft") as CostSheet["status"],
      approved_by: isEdit ? (costSheet?.approved_by ?? null) : null,
      approved_at: isEdit ? (costSheet?.approved_at ?? null) : null,
      notes: notes.trim() || null,
    };

    if (isEdit && id) {
      const ok = await updateCostSheet(id, header, fabrics, trims, processes, commercial, cm);
      if (ok) navigate(`/finance/costing/${id}`);
    } else {
      const cs = await createCostSheet(header, fabrics, trims, processes, commercial, cm);
      if (cs) navigate(`/finance/costing/${cs.id}`);
    }
  };

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (isEdit && loadingCostSheet) {
    return (
      <div className="py-6 space-y-4 max-w-5xl">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="py-3 md:py-4 lg:py-6 space-y-4 max-w-5xl">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Button
          type="button" variant="ghost" size="icon"
          onClick={() => navigate(isEdit && id ? `/finance/costing/${id}` : "/finance/costing")}
          className="-ml-2 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {isEdit ? `Edit Cost Sheet` : "New Cost Sheet"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? `Editing ${costSheet?.style_ref ?? ""}` : "Build your garment cost breakdown"}
          </p>
        </div>
      </div>

      {/* Template Loader (new only) */}
      {!isEdit && templates.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
              <Label className="shrink-0 text-sm">Load from Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.template_name || t.style_ref}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 1. Header Section ──────────────────────────────────────────── */}
      <Section title="Style Details" icon={Package} open={openHeader} onToggle={() => setOpenHeader((v) => !v)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Buyer Name */}
          <div className="space-y-1.5">
            <Label>Buyer Name <span className="text-destructive">*</span></Label>
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="e.g. H&M" required />
          </div>

          {/* Style Ref */}
          <div className="space-y-1.5">
            <Label>Style Ref <span className="text-destructive">*</span></Label>
            <Input value={styleRef} onChange={(e) => setStyleRef(e.target.value)} placeholder="e.g. SS25-1001" required />
          </div>

          {/* Garment Type */}
          <div className="space-y-1.5">
            <Label>Garment Type</Label>
            <Select value={garmentType} onValueChange={setGarmentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GARMENT_TYPES.map((gt) => (
                  <SelectItem key={gt.value} value={gt.value}>{gt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fabric Composition */}
          <div className="space-y-1.5">
            <Label>Fabric Composition</Label>
            <Input value={fabricComposition} onChange={(e) => setFabricComposition(e.target.value)} placeholder="e.g. 100% Cotton" />
          </div>

          {/* GSM */}
          <div className="space-y-1.5">
            <Label>GSM</Label>
            <Input type="number" value={headerGsm} onChange={(e) => setHeaderGsm(e.target.value)} placeholder="e.g. 180" />
          </div>

          {/* Target Quantity */}
          <div className="space-y-1.5">
            <Label>Target Quantity (pcs)</Label>
            <Input type="number" value={targetQuantity} onChange={(e) => setTargetQuantity(e.target.value)} placeholder="e.g. 5000" />
          </div>

          {/* Buyer Target Price */}
          <div className="space-y-1.5">
            <Label>Buyer Target Price</Label>
            <Input type="number" step="0.01" value={buyerTargetPrice} onChange={(e) => setBuyerTargetPrice(e.target.value)} placeholder="e.g. 8.50" />
          </div>

          {/* Target Price Type */}
          <div className="space-y-1.5">
            <Label>Price Type</Label>
            <Select value={targetPriceType} onValueChange={setTargetPriceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRICE_TYPES.map((pt) => (
                  <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Season */}
          <div className="space-y-1.5">
            <Label>Season</Label>
            <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="e.g. SS25" />
          </div>

          {/* Program Name */}
          <div className="space-y-1.5">
            <Label>Program</Label>
            <Input value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="e.g. Basics" />
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Exchange Rate */}
          <div className="space-y-1.5">
            <Label>Exchange Rate</Label>
            <Input type="number" step="0.0001" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
          </div>

          {/* Work Order */}
          <div className="space-y-1.5">
            <Label>Work Order (optional)</Label>
            <Select value={selectedWoId} onValueChange={setSelectedWoId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {workOrders.map((wo) => (
                  <SelectItem key={wo.id} value={wo.id}>
                    {wo.po_number ? `${wo.po_number} - ${wo.buyer}` : wo.buyer} {wo.style ? `(${wo.style})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Style Description */}
        <div className="space-y-1.5">
          <Label>Style Description</Label>
          <Textarea value={styleDescription} onChange={(e) => setStyleDescription(e.target.value)} placeholder="Detailed style description..." rows={2} />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
        </div>

        {/* Template toggle */}
        <div className="flex items-center gap-4 pt-2">
          <div className="flex items-center gap-2">
            <Switch checked={isTemplate} onCheckedChange={setIsTemplate} />
            <Label className="text-sm">Save as template</Label>
          </div>
          {isTemplate && (
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="max-w-xs"
            />
          )}
        </div>
      </Section>

      {/* ─── 2. Fabric Section ──────────────────────────────────────────── */}
      <Section
        title="Fabrics"
        icon={Layers}
        open={openFabric}
        onToggle={() => setOpenFabric((v) => !v)}
        badge={fabricRows.length > 0 ? String(fabricRows.length) : undefined}
      >
        <AnimatePresence mode="popLayout">
          {fabricRows.map((row, idx) => (
            <motion.div
              key={row.key}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="cursor-grab text-muted-foreground hover:text-foreground"
                    onClick={() => moveFabric(idx, -1)}
                    disabled={idx === 0}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <Badge variant="outline" className="text-xs">
                    {FABRIC_TYPES.find((ft) => ft.value === row.fabric_type)?.label ?? row.fabric_type}
                  </Badge>
                  {row.description && <span className="text-sm text-muted-foreground">{row.description}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-primary">
                    ${fmt(calcFabricCostDz(row))}/dz
                  </span>
                  <Button
                    type="button" variant="ghost" size="icon"
                    onClick={() => setFabricRows((p) => p.filter((r) => r.key !== row.key))}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* Fabric Type */}
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={row.fabric_type} onValueChange={(v) => updateFabric(row.key, "fabric_type", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FABRIC_TYPES.map((ft) => (
                        <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input className="h-8 text-xs" value={row.description} onChange={(e) => updateFabric(row.key, "description", e.target.value)} placeholder="e.g. Main body" />
                </div>

                {/* Composition */}
                <div className="space-y-1">
                  <Label className="text-xs">Composition</Label>
                  <Input className="h-8 text-xs" value={row.composition} onChange={(e) => updateFabric(row.key, "composition", e.target.value)} placeholder="100% Cotton" />
                </div>

                {/* Construction */}
                <div className="space-y-1">
                  <Label className="text-xs">Construction</Label>
                  <Select value={row.construction} onValueChange={(v) => updateFabric(row.key, "construction", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONSTRUCTION_TYPES.map((ct) => (
                        <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* GSM */}
                <div className="space-y-1">
                  <Label className="text-xs">GSM</Label>
                  <Input className="h-8 text-xs" type="number" value={row.gsm} onChange={(e) => updateFabric(row.key, "gsm", e.target.value)} />
                </div>

                {/* Width */}
                <div className="space-y-1">
                  <Label className="text-xs">Width</Label>
                  <Input className="h-8 text-xs" type="number" value={row.width} onChange={(e) => updateFabric(row.key, "width", e.target.value)} placeholder="inches" />
                </div>

                {/* Consumption/Dozen */}
                <div className="space-y-1">
                  <Label className="text-xs">Consumption/Dz</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={row.consumption_per_dozen} onChange={(e) => updateFabric(row.key, "consumption_per_dozen", e.target.value)} />
                </div>

                {/* Consumption Unit */}
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Select value={row.consumption_unit} onValueChange={(v) => updateFabric(row.key, "consumption_unit", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONSUMPTION_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Wastage % */}
                <div className="space-y-1">
                  <Label className="text-xs">Wastage %</Label>
                  <Input className="h-8 text-xs" type="number" step="0.1" value={row.wastage_pct} onChange={(e) => updateFabric(row.key, "wastage_pct", e.target.value)} />
                </div>

                {/* Marker Efficiency */}
                <div className="space-y-1">
                  <Label className="text-xs">Marker Eff. %</Label>
                  <Input className="h-8 text-xs" type="number" step="0.1" value={row.marker_efficiency} onChange={(e) => updateFabric(row.key, "marker_efficiency", e.target.value)} />
                </div>

                {/* Price/Unit */}
                <div className="space-y-1">
                  <Label className="text-xs">Price/Unit</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={row.price_per_unit} onChange={(e) => updateFabric(row.key, "price_per_unit", e.target.value)} />
                </div>

                {/* Price Unit */}
                <div className="space-y-1">
                  <Label className="text-xs">Price Unit</Label>
                  <Select value={row.price_unit} onValueChange={(v) => updateFabric(row.key, "price_unit", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRICE_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Currency */}
                <div className="space-y-1">
                  <Label className="text-xs">Currency</Label>
                  <Select value={row.currency} onValueChange={(v) => updateFabric(row.key, "currency", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Exchange Rate */}
                <div className="space-y-1">
                  <Label className="text-xs">Ex. Rate</Label>
                  <Input className="h-8 text-xs" type="number" step="0.0001" value={row.exchange_rate} onChange={(e) => updateFabric(row.key, "exchange_rate", e.target.value)} />
                </div>

                {/* Source */}
                <div className="space-y-1">
                  <Label className="text-xs">Source</Label>
                  <Select value={row.source} onValueChange={(v) => updateFabric(row.key, "source", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FABRIC_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Supplier */}
                <div className="space-y-1">
                  <Label className="text-xs">Supplier</Label>
                  <Input className="h-8 text-xs" value={row.supplier_name} onChange={(e) => updateFabric(row.key, "supplier_name", e.target.value)} placeholder="Supplier name" />
                </div>
              </div>

              {/* Greige / Dyeing toggle */}
              <div className="pt-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={row.show_greige}
                    onCheckedChange={(v) => updateFabric(row.key, "show_greige", v)}
                  />
                  <Label className="text-xs text-muted-foreground">Show greige & dyeing/finishing cost breakdown</Label>
                </div>
                {row.show_greige && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Greige Cost</Label>
                      <Input className="h-8 text-xs" type="number" step="0.01" value={row.greige_cost} onChange={(e) => updateFabric(row.key, "greige_cost", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Dyeing/Finishing Cost</Label>
                      <Input className="h-8 text-xs" type="number" step="0.01" value={row.dyeing_finishing_cost} onChange={(e) => updateFabric(row.key, "dyeing_finishing_cost", e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <Button type="button" variant="outline" size="sm" onClick={() => setFabricRows((p) => [...p, emptyFabric()])}>
          <Plus className="h-4 w-4 mr-1" /> Add Fabric
        </Button>
      </Section>

      {/* ─── 3. Trims Section ───────────────────────────────────────────── */}
      <Section
        title="Trims & Accessories"
        icon={Scissors}
        open={openTrims}
        onToggle={() => setOpenTrims((v) => !v)}
        badge={trimRows.length > 0 ? String(trimRows.length) : undefined}
      >
        {/* Quick-add presets */}
        <div className="flex flex-wrap gap-2">
          {TRIM_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setTrimRows((p) => [...p, emptyTrim(preset)])}
            >
              <Plus className="h-3 w-3 mr-1" /> {preset}
            </Button>
          ))}
        </div>

        <AnimatePresence mode="popLayout">
          {trimRows.map((row) => (
            <motion.div
              key={row.key}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "border rounded-lg p-4 space-y-3",
                row.is_buyer_supplied && "opacity-60 bg-muted/30"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{row.category}</Badge>
                  {row.item_name && <span className="text-sm text-muted-foreground">{row.item_name}</span>}
                  {row.is_buyer_supplied && <Badge variant="secondary" className="text-xs">Buyer Supplied</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-primary">
                    ${fmt(calcTrimCostDz(row))}/dz
                  </span>
                  <Button
                    type="button" variant="ghost" size="icon"
                    onClick={() => setTrimRows((p) => p.filter((r) => r.key !== row.key))}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* Item Name */}
                <div className="space-y-1">
                  <Label className="text-xs">Item Name</Label>
                  <Input className="h-8 text-xs" value={row.item_name} onChange={(e) => updateTrim(row.key, "item_name", e.target.value)} placeholder="e.g. Main label" />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input className="h-8 text-xs" value={row.description} onChange={(e) => updateTrim(row.key, "description", e.target.value)} />
                </div>

                {/* Qty/Garment */}
                <div className="space-y-1">
                  <Label className="text-xs">Qty/Garment</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={row.qty_per_garment} onChange={(e) => updateTrim(row.key, "qty_per_garment", e.target.value)} />
                </div>

                {/* UOM */}
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Select value={row.unit_of_measure} onValueChange={(v) => updateTrim(row.key, "unit_of_measure", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRIM_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Unit Price */}
                <div className="space-y-1">
                  <Label className="text-xs">Unit Price</Label>
                  <Input className="h-8 text-xs" type="number" step="0.001" value={row.unit_price} onChange={(e) => updateTrim(row.key, "unit_price", e.target.value)} />
                </div>

                {/* Currency */}
                <div className="space-y-1">
                  <Label className="text-xs">Currency</Label>
                  <Select value={row.currency} onValueChange={(v) => updateTrim(row.key, "currency", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Exchange Rate */}
                <div className="space-y-1">
                  <Label className="text-xs">Ex. Rate</Label>
                  <Input className="h-8 text-xs" type="number" step="0.0001" value={row.exchange_rate} onChange={(e) => updateTrim(row.key, "exchange_rate", e.target.value)} />
                </div>

                {/* Supplier */}
                <div className="space-y-1">
                  <Label className="text-xs">Supplier</Label>
                  <Input className="h-8 text-xs" value={row.supplier_name} onChange={(e) => updateTrim(row.key, "supplier_name", e.target.value)} />
                </div>

                {/* Specifications */}
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Specifications</Label>
                  <Input className="h-8 text-xs" value={row.specifications} onChange={(e) => updateTrim(row.key, "specifications", e.target.value)} placeholder="Size, color, etc." />
                </div>

                {/* Buyer Supplied Toggle */}
                <div className="flex items-center gap-2 pt-4">
                  <Switch
                    checked={row.is_buyer_supplied}
                    onCheckedChange={(v) => updateTrim(row.key, "is_buyer_supplied", v)}
                  />
                  <Label className="text-xs">Buyer supplied</Label>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </Section>

      {/* ─── 4. CM Section ──────────────────────────────────────────────── */}
      <Section title="CM (Cut & Make)" icon={Settings} open={openCm} onToggle={() => setOpenCm((v) => !v)}>
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant={cmMode === "flat" ? "default" : "outline"}
              size="sm"
              onClick={() => setCmMode("flat")}
            >
              Enter Flat CM
            </Button>
            <Button
              type="button"
              variant={cmMode === "sam" ? "default" : "outline"}
              size="sm"
              onClick={() => setCmMode("sam")}
            >
              <Calculator className="h-4 w-4 mr-1" /> Calculate from SAM
            </Button>
          </div>

          {cmMode === "flat" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>CM per Dozen</Label>
                <Input type="number" step="0.01" value={cmPerDozen} onChange={(e) => setCmPerDozen(e.target.value)} placeholder="e.g. 24.00" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>SAM (Standard Allowed Minutes)</Label>
                <Input type="number" step="0.01" value={sam} onChange={(e) => setSam(e.target.value)} placeholder="e.g. 18.5" />
              </div>
              <div className="space-y-1.5">
                <Label>Efficiency %</Label>
                <Input type="number" step="0.1" value={efficiencyPct} onChange={(e) => setEfficiencyPct(e.target.value)} placeholder="e.g. 60" />
              </div>
              <div className="space-y-1.5">
                <Label>Labour Cost / Minute</Label>
                <Input type="number" step="0.001" value={labourCostPerMinute} onChange={(e) => setLabourCostPerMinute(e.target.value)} placeholder="e.g. 0.035" />
              </div>
            </div>
          )}

          {/* Overhead */}
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Overhead Type</Label>
              <Select value={overheadType} onValueChange={setOverheadType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed (per dozen)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Overhead Value</Label>
              <Input type="number" step="0.01" value={overheadValue} onChange={(e) => setOverheadValue(e.target.value)} placeholder={overheadType === "percentage" ? "e.g. 15" : "e.g. 3.50"} />
            </div>
          </div>

          {/* Calculated CM display */}
          <div className="flex items-center gap-6 p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">CM / Dozen</p>
              <p className="text-lg font-semibold">${fmt(totals.cmCostDz)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CM / Piece</p>
              <p className="text-lg font-semibold">${fmt(totals.cmCostDz / 12)}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── 5. Processes Section ───────────────────────────────────────── */}
      <Section
        title="Processes"
        icon={Settings}
        open={openProcesses}
        onToggle={() => setOpenProcesses((v) => !v)}
        badge={processRows.length > 0 ? String(processRows.length) : undefined}
      >
        {/* Quick-add presets */}
        <div className="flex flex-wrap gap-2">
          {PROCESS_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setProcessRows((p) => [...p, emptyProcess(preset)])}
            >
              <Plus className="h-3 w-3 mr-1" /> {preset}
            </Button>
          ))}
        </div>

        <AnimatePresence mode="popLayout">
          {processRows.map((row) => (
            <motion.div
              key={row.key}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{row.category}</Badge>
                  {row.process_name && <span className="text-sm text-muted-foreground">{row.process_name}</span>}
                  {row.is_outsourced && <Badge variant="secondary" className="text-xs">Outsourced</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-primary">
                    ${fmt(calcProcessCostDz(row))}/dz
                  </span>
                  <Button
                    type="button" variant="ghost" size="icon"
                    onClick={() => setProcessRows((p) => p.filter((r) => r.key !== row.key))}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* Process Name */}
                <div className="space-y-1">
                  <Label className="text-xs">Process Name</Label>
                  <Input className="h-8 text-xs" value={row.process_name} onChange={(e) => updateProcess(row.key, "process_name", e.target.value)} placeholder="e.g. Enzyme wash" />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input className="h-8 text-xs" value={row.description} onChange={(e) => updateProcess(row.key, "description", e.target.value)} />
                </div>

                {/* Placement */}
                <div className="space-y-1">
                  <Label className="text-xs">Placement</Label>
                  <Input className="h-8 text-xs" value={row.placement} onChange={(e) => updateProcess(row.key, "placement", e.target.value)} placeholder="e.g. Front chest" />
                </div>

                {/* Cost/Piece */}
                <div className="space-y-1">
                  <Label className="text-xs">Cost/Piece</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={row.cost_per_piece} onChange={(e) => updateProcess(row.key, "cost_per_piece", e.target.value)} />
                </div>

                {/* Currency */}
                <div className="space-y-1">
                  <Label className="text-xs">Currency</Label>
                  <Select value={row.currency} onValueChange={(v) => updateProcess(row.key, "currency", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Exchange Rate */}
                <div className="space-y-1">
                  <Label className="text-xs">Ex. Rate</Label>
                  <Input className="h-8 text-xs" type="number" step="0.0001" value={row.exchange_rate} onChange={(e) => updateProcess(row.key, "exchange_rate", e.target.value)} />
                </div>

                {/* Supplier */}
                <div className="space-y-1">
                  <Label className="text-xs">Supplier</Label>
                  <Input className="h-8 text-xs" value={row.supplier_name} onChange={(e) => updateProcess(row.key, "supplier_name", e.target.value)} />
                </div>

                {/* Outsourced Toggle */}
                <div className="flex items-center gap-2 pt-4">
                  <Switch
                    checked={row.is_outsourced}
                    onCheckedChange={(v) => updateProcess(row.key, "is_outsourced", v)}
                  />
                  <Label className="text-xs">Outsourced</Label>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </Section>

      {/* ─── 6. Commercial Costs Section ────────────────────────────────── */}
      <Section
        title="Commercial Costs"
        icon={Ship}
        open={openCommercial}
        onToggle={() => setOpenCommercial((v) => !v)}
        badge={commercialRows.length > 0 ? String(commercialRows.length) : undefined}
      >
        {/* Quick-add presets */}
        <div className="flex flex-wrap gap-2">
          {COMMERCIAL_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setCommercialRows((p) => [...p, emptyCommercial(preset)])}
            >
              <Plus className="h-3 w-3 mr-1" /> {preset}
            </Button>
          ))}
        </div>

        <AnimatePresence mode="popLayout">
          {commercialRows.map((row) => {
            // Calculate this row's cost/dozen for display
            const targetQty = parseFloat(targetQuantity) || 0;
            const dozensTotal = targetQty > 0 ? targetQty / 12 : 1;
            const amt = parseFloat(row.amount) || 0;
            let rowCostDz = 0;
            if (row.cost_type === "per_piece") rowCostDz = amt * 12;
            else if (row.cost_type === "per_shipment") rowCostDz = amt / dozensTotal;
            else if (row.cost_type === "percentage") {
              const sub = totals.fabricCostDz + totals.trimsCostDz + totals.cmCostDz + totals.processCostDz;
              rowCostDz = sub * (amt / 100);
            }

            return (
              <motion.div
                key={row.key}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{row.category}</Badge>
                    {row.item_name && <span className="text-sm text-muted-foreground">{row.item_name}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-primary">
                      ${fmt(rowCostDz)}/dz
                    </span>
                    <Button
                      type="button" variant="ghost" size="icon"
                      onClick={() => setCommercialRows((p) => p.filter((r) => r.key !== row.key))}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {/* Item Name */}
                  <div className="space-y-1">
                    <Label className="text-xs">Item Name</Label>
                    <Input className="h-8 text-xs" value={row.item_name} onChange={(e) => updateCommercial(row.key, "item_name", e.target.value)} placeholder="e.g. Sea freight" />
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input className="h-8 text-xs" value={row.description} onChange={(e) => updateCommercial(row.key, "description", e.target.value)} />
                  </div>

                  {/* Cost Type */}
                  <div className="space-y-1">
                    <Label className="text-xs">Cost Type</Label>
                    <Select value={row.cost_type} onValueChange={(v) => updateCommercial(row.key, "cost_type", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_piece">Per Piece</SelectItem>
                        <SelectItem value="per_shipment">Per Shipment</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Amount */}
                  <div className="space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <Input className="h-8 text-xs" type="number" step="0.01" value={row.amount} onChange={(e) => updateCommercial(row.key, "amount", e.target.value)} />
                  </div>

                  {/* Currency */}
                  <div className="space-y-1">
                    <Label className="text-xs">Currency</Label>
                    <Select value={row.currency} onValueChange={(v) => updateCommercial(row.key, "currency", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Exchange Rate */}
                  <div className="space-y-1">
                    <Label className="text-xs">Ex. Rate</Label>
                    <Input className="h-8 text-xs" type="number" step="0.0001" value={row.exchange_rate} onChange={(e) => updateCommercial(row.key, "exchange_rate", e.target.value)} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </Section>

      {/* ─── 7. Live Cost Summary ───────────────────────────────────────── */}
      <Card className="sticky bottom-4 z-10 border-primary/20 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" />
            Cost Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Fabric</p>
              <p className="text-sm font-semibold">${fmt(totals.fabricCostDz)}/dz</p>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Trims</p>
              <p className="text-sm font-semibold">${fmt(totals.trimsCostDz)}/dz</p>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">CM</p>
              <p className="text-sm font-semibold">${fmt(totals.cmCostDz)}/dz</p>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Processes</p>
              <p className="text-sm font-semibold">${fmt(totals.processCostDz)}/dz</p>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Commercial</p>
              <p className="text-sm font-semibold">${fmt(totals.commercialCostDz)}/dz</p>
            </div>
            <div className="text-center p-2 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-xs text-muted-foreground font-medium">Total</p>
              <p className="text-sm font-bold text-primary">${fmt(totals.totalCostDz)}/dz</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            {/* Total per piece */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Cost per Piece</p>
              <p className="text-xl font-bold">${fmt(totals.totalCostPc)}</p>
            </div>

            {/* Desired margin */}
            <div className="space-y-1.5">
              <Label className="text-xs">Desired Margin %</Label>
              <Input type="number" step="0.1" value={desiredMargin} onChange={(e) => setDesiredMargin(e.target.value)} placeholder="e.g. 15" />
            </div>

            {/* Quoted price */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Quoted Price/pc</p>
              <p className="text-xl font-bold text-primary">${fmt(quotedPrice)}</p>
            </div>

            {/* Buyer target comparison */}
            {buyerTargetPrice && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Buyer Target Gap/pc</p>
                {totals.buyerGapPc != null ? (
                  <p className={cn(
                    "text-xl font-bold",
                    totals.buyerGapPc >= 0 ? "text-green-600" : "text-destructive"
                  )}>
                    {totals.buyerGapPc >= 0 ? "+" : ""}{fmt(totals.buyerGapPc)}
                  </p>
                ) : (
                  <p className="text-xl font-bold text-muted-foreground">--</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {isEdit ? "Update Cost Sheet" : "Save Cost Sheet"}
            </Button>
            {!isEdit && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setIsTemplate(true);
                  // Trigger submit after state update
                  setTimeout(() => {
                    const form = document.querySelector("form");
                    if (form) form.requestSubmit();
                  }, 0);
                }}
              >
                <Layers className="h-4 w-4 mr-2" />
                Save as Template
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
