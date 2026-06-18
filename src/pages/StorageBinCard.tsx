import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Warehouse, Search, Plus, Save, AlertTriangle, Unlock, ChevronDown, ChevronUp, X, Check, Layers } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { format } from "date-fns";
import { getTodayInTimezone } from "@/lib/date-utils";
import { useOfflineSubmission } from "@/hooks/useOfflineSubmission";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { NotesWithVoice } from "@/components/voice/NotesWithVoice";
import type { VoiceNotesHandle } from "@/components/voice/VoiceNotes";

interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  color: string | null;
  supplier_name: string | null;
  description: string | null;
  construction: string | null;
  width: string | null;
  package_qty: number | null;
}

interface BinCard {
  id: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  supplier_name: string | null;
  description: string | null;
  construction: string | null;
  color: string | null;
  width: string | null;
  package_qty: string | null;
  prepared_by: string | null;
  is_header_locked: boolean;
}

interface Transaction {
  id: string;
  transaction_date: string;
  receive_qty: number;
  issue_qty: number;
  ttl_receive: number;
  balance_qty: number;
  remarks: string | null;
  created_at: string | null;
  submitted_by?: string | null;
}

interface NewTransaction {
  receive_qty: string;
  issue_qty: string;
  remarks: string;
}

interface BulkBinCardInfo {
  workOrder: WorkOrder;
  binCard: BinCard | null;
  isNew: boolean;
  lastBalance: number;
  lastTtlReceive: number;
  hasTodayTransaction: boolean;
}

export default function StorageBinCard() {
  const navigate = useNavigate();
  const { user, profile, factory, isStorageUser, isAdminOrHigher } = useAuth();
  const { t } = useTranslation();

  const { submit: offlineSubmit } = useOfflineSubmission();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const voiceRef = useRef<VoiceNotesHandle>(null);
  const [headerSaving, setHeaderSaving] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Multi-select state
  const [selectedWorkOrders, setSelectedWorkOrders] = useState<WorkOrder[]>([]);

  // Single mode state (used when exactly 1 PO selected)
  const [binCard, setBinCard] = useState<BinCard | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [headerFields, setHeaderFields] = useState({
    supplier_name: "",
    description: "",
    construction: "",
    color: "",
    width: "",
    package_qty: "",
    prepared_by: "",
  });
  const [newTxn, setNewTxn] = useState<NewTransaction>({
    receive_qty: "",
    issue_qty: "",
    remarks: "",
  });

  // Bulk mode state (used when 2+ POs selected)
  const [bulkBinCards, setBulkBinCards] = useState<BulkBinCardInfo[]>([]);
  const [bulkTxn, setBulkTxn] = useState<NewTransaction>({
    receive_qty: "",
    issue_qty: "",
    remarks: "",
  });
  const [bulkLoaded, setBulkLoaded] = useState(false);
  const [bulkHeaderLocked, setBulkHeaderLocked] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [existingGroupId, setExistingGroupId] = useState<string | null>(null);
  const [existingGroupFound, setExistingGroupFound] = useState(false);

  const isBulkMode = selectedWorkOrders.length > 1;
  const selectedWorkOrder = selectedWorkOrders.length === 1 ? selectedWorkOrders[0] : null;

  // Compute deterministic signature from sorted work order IDs
  function computePoSetSignature(workOrderIds: string[]): string {
    return [...workOrderIds].sort().join(",");
  }

  const canAccess = isStorageUser() || isAdminOrHigher();

  // Fetch work orders on mount
  useEffect(() => {
    if (profile?.factory_id && canAccess) {
      fetchWorkOrders();
    }
  }, [profile?.factory_id, canAccess]);

  async function fetchWorkOrders() {
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select("id, po_number, buyer, style, item, color, supplier_name, description, construction, width, package_qty")
        .eq("factory_id", profile!.factory_id!)
        .eq("is_active", true)
        .order("po_number", { ascending: true });

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (error) {
      console.error("Error fetching work orders:", error);
    }
  }

  const getSearchableValue = (wo: WorkOrder) => {
    return [
      wo.po_number,
      wo.buyer,
      wo.style,
      wo.item,
      wo.description,
    ].filter(Boolean).join(" ").toLowerCase();
  };

  // Toggle a work order in/out of selection
  function toggleWorkOrder(wo: WorkOrder) {
    setSelectedWorkOrders(prev => {
      const exists = prev.find(s => s.id === wo.id);
      if (exists) return prev.filter(s => s.id !== wo.id);
      return [...prev, wo];
    });
  }

  // Remove a PO from selection
  function removeWorkOrder(woId: string) {
    setSelectedWorkOrders(prev => prev.filter(s => s.id !== woId));
    // If removing from bulk and going to 1, reset bulk state
    if (selectedWorkOrders.length <= 2) {
      setBulkBinCards([]);
      setBulkLoaded(false);
      setBulkHeaderLocked(false);
      setBulkTxn({ receive_qty: "", issue_qty: "", remarks: "" });
      setGroupName("");
      setExistingGroupId(null);
      setExistingGroupFound(false);
    }
  }

  // Reset all selection
  function resetSelection() {
    setSelectedWorkOrders([]);
    setBinCard(null);
    setTransactions([]);
    setBulkBinCards([]);
    setBulkLoaded(false);
    setBulkHeaderLocked(false);
    setBulkTxn({ receive_qty: "", issue_qty: "", remarks: "" });
    setNewTxn({ receive_qty: "", issue_qty: "", remarks: "" });
    setShowAllTransactions(false);
    setGroupName("");
    setExistingGroupId(null);
    setExistingGroupFound(false);
  }

  // Handle popover close — trigger appropriate load
  async function handleApplySelection() {
    setSearchOpen(false);

    if (selectedWorkOrders.length === 0) {
      resetSelection();
      return;
    }

    if (selectedWorkOrders.length === 1) {
      // Single mode: load like before
      await handleSingleSelect(selectedWorkOrders[0]);
    } else {
      // Bulk mode: load all bin cards
      await handleBulkLoad();
    }
  }

  // Single mode: load or create bin card (original behavior)
  async function handleSingleSelect(wo: WorkOrder) {
    setLoading(true);
    setBulkBinCards([]);
    setBulkLoaded(false);

    try {
      const { data: existingCard, error: fetchError } = await supabase
        .from("storage_bin_cards")
        .select("*")
        .eq("factory_id", profile!.factory_id!)
        .eq("work_order_id", wo.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingCard) {
        setBinCard(existingCard as BinCard);
        setHeaderFields({
          supplier_name: existingCard.supplier_name || wo.supplier_name || "",
          description: existingCard.description || wo.description || wo.item || "",
          construction: existingCard.construction || wo.construction || "",
          color: existingCard.color || wo.color || "",
          width: existingCard.width || wo.width || "",
          package_qty: existingCard.package_qty || (wo.package_qty?.toString() || ""),
          prepared_by: existingCard.prepared_by || profile?.full_name || "",
        });
        await loadTransactions(existingCard.id);
      } else {
        const newCard = {
          factory_id: profile!.factory_id!,
          work_order_id: wo.id,
          buyer: wo.buyer,
          style: wo.style,
          supplier_name: wo.supplier_name || null,
          description: wo.description || wo.item || null,
          construction: wo.construction || null,
          color: wo.color || null,
          width: wo.width || null,
          package_qty: wo.package_qty?.toString() || null,
          prepared_by: profile?.full_name || null,
          prepared_by_user_id: user?.id,
          is_header_locked: false,
        };

        const { data: createdCard, error: createError } = await supabase
          .from("storage_bin_cards")
          .insert(newCard)
          .select()
          .single();

        if (createError) throw createError;

        setBinCard(createdCard as BinCard);
        setHeaderFields({
          supplier_name: wo.supplier_name || "",
          description: wo.description || wo.item || "",
          construction: wo.construction || "",
          color: wo.color || "",
          width: wo.width || "",
          package_qty: wo.package_qty?.toString() || "",
          prepared_by: profile?.full_name || "",
        });
        setTransactions([]);
      }
    } catch (error) {
      console.error("Error loading bin card:", error);
      toast.error("Error", { description: "Failed to load bin card" });
    } finally {
      setLoading(false);
    }
  }

  // Bulk mode: load/create bin cards for all selected POs
  async function handleBulkLoad() {
    setLoading(true);
    setBinCard(null);
    setTransactions([]);
    setExistingGroupId(null);
    setExistingGroupFound(false);
    setGroupName("");
    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

    try {
      // Compute po_set_signature for this selection
      const signature = computePoSetSignature(selectedWorkOrders.map(wo => wo.id));

      // Check if an existing group with this exact PO set already exists
      const { data: existingGroupCards } = await supabase
        .from("storage_bin_cards")
        .select("bin_group_id, group_name, po_set_signature")
        .eq("factory_id", profile!.factory_id!)
        .eq("po_set_signature", signature)
        .not("bin_group_id", "is", null)
        .limit(1);

      if (existingGroupCards && existingGroupCards.length > 0) {
        setExistingGroupId(existingGroupCards[0].bin_group_id);
        setExistingGroupFound(true);
        if (existingGroupCards[0].group_name) {
          setGroupName(existingGroupCards[0].group_name);
        }
      }

      const results: BulkBinCardInfo[] = [];

      for (const wo of selectedWorkOrders) {
        // Check for existing bin card
        const { data: existingCard } = await supabase
          .from("storage_bin_cards")
          .select("*")
          .eq("factory_id", profile!.factory_id!)
          .eq("work_order_id", wo.id)
          .maybeSingle();

        let binCardData = existingCard;
        let isNew = false;

        if (!existingCard) {
          // Auto-create bin card with work order defaults (unlocked so user can edit header)
          const { data: created, error: createError } = await supabase
            .from("storage_bin_cards")
            .insert({
              factory_id: profile!.factory_id!,
              work_order_id: wo.id,
              buyer: wo.buyer,
              style: wo.style,
              supplier_name: wo.supplier_name || null,
              description: wo.description || wo.item || null,
              construction: wo.construction || null,
              color: wo.color || null,
              width: wo.width || null,
              package_qty: wo.package_qty?.toString() || null,
              prepared_by: profile?.full_name || null,
              prepared_by_user_id: user?.id,
              is_header_locked: false,
            })
            .select()
            .single();

          if (createError) throw createError;
          binCardData = created;
          isNew = true;
        }

        // Get latest transaction for balance
        const { data: latestTxns } = await supabase
          .from("storage_bin_card_transactions")
          .select("balance_qty, ttl_receive, transaction_date")
          .eq("bin_card_id", binCardData!.id)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        const latestTxn = latestTxns?.[0];
        const lastBalance = latestTxn?.balance_qty ?? 0;
        const lastTtlReceive = latestTxn?.ttl_receive ?? 0;
        const hasTodayTransaction = latestTxn?.transaction_date === today;

        results.push({
          workOrder: wo,
          binCard: binCardData as BinCard,
          isNew,
          lastBalance,
          lastTtlReceive,
          hasTodayTransaction,
        });
      }

      // Pre-populate shared header from first existing bin card with data, or first PO's work order
      const firstExisting = results.find(r => !r.isNew && r.binCard);
      const firstWo = selectedWorkOrders[0];
      if (firstExisting?.binCard) {
        const bc = firstExisting.binCard;
        setHeaderFields({
          supplier_name: bc.supplier_name || firstWo.supplier_name || "",
          description: bc.description || firstWo.description || firstWo.item || "",
          construction: bc.construction || firstWo.construction || "",
          color: bc.color || firstWo.color || "",
          width: bc.width || firstWo.width || "",
          package_qty: bc.package_qty || (firstWo.package_qty?.toString() || ""),
          prepared_by: bc.prepared_by || profile?.full_name || "",
        });
      } else {
        setHeaderFields({
          supplier_name: firstWo.supplier_name || "",
          description: firstWo.description || firstWo.item || "",
          construction: firstWo.construction || "",
          color: firstWo.color || "",
          width: firstWo.width || "",
          package_qty: firstWo.package_qty?.toString() || "",
          prepared_by: profile?.full_name || "",
        });
      }

      // Determine bulk lock state: locked only if ALL existing cards are locked
      const existingCards = results.filter(r => !r.isNew && r.binCard);
      const allLocked = existingCards.length > 0 && existingCards.every(r => r.binCard!.is_header_locked);
      setBulkHeaderLocked(allLocked);

      setBulkBinCards(results);
      setBulkLoaded(true);
    } catch (error) {
      console.error("Error loading bulk bin cards:", error);
      toast.error("Error", { description: "Failed to load bin cards" });
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions(binCardId: string) {
    const { data, error } = await supabase
      .from("storage_bin_card_transactions")
      .select("*")
      .eq("bin_card_id", binCardId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading transactions:", error);
      return;
    }

    setTransactions(data || []);
  }

  // Single mode balance calculations (keep original behavior)
  const lastBalance = transactions.length > 0
    ? transactions[transactions.length - 1].balance_qty
    : 0;

  const lastTtlReceive = transactions.length > 0
    ? transactions[transactions.length - 1].ttl_receive
    : 0;

  const previewReceive = parseInt(newTxn.receive_qty) || 0;
  const previewIssue = parseInt(newTxn.issue_qty) || 0;
  const previewTtlReceive = lastTtlReceive + previewReceive;
  const previewBalance = lastBalance + previewReceive - previewIssue;
  const wouldGoNegative = previewBalance < 0;

  // Bulk mode balance calculations
  const bulkReceive = parseInt(bulkTxn.receive_qty) || 0;
  const bulkIssue = parseInt(bulkTxn.issue_qty) || 0;

  const bulkPreviews = useMemo(() => {
    return bulkBinCards.map(item => {
      if (item.hasTodayTransaction) {
        return { ...item, previewBalance: item.lastBalance, previewTtlReceive: item.lastTtlReceive, wouldGoNegative: false, skipped: true };
      }
      const previewTtlReceive = item.lastTtlReceive + bulkReceive;
      const previewBalance = item.lastBalance + bulkReceive - bulkIssue;
      return { ...item, previewBalance, previewTtlReceive, wouldGoNegative: previewBalance < 0, skipped: false };
    });
  }, [bulkBinCards, bulkReceive, bulkIssue]);

  const submittableBulk = bulkPreviews.filter(item => !item.skipped && (!item.wouldGoNegative || isAdminOrHigher()));
  const anyBulkNegative = bulkPreviews.some(item => !item.skipped && item.wouldGoNegative);

  async function saveHeaderFields() {
    if (!binCard) return;

    setHeaderSaving(true);
    try {
      const { error } = await supabase
        .from("storage_bin_cards")
        .update({
          supplier_name: headerFields.supplier_name || null,
          description: headerFields.description || null,
          construction: headerFields.construction || null,
          color: headerFields.color || null,
          width: headerFields.width || null,
          package_qty: headerFields.package_qty || null,
          prepared_by: headerFields.prepared_by || null,
          is_header_locked: true,
        })
        .eq("id", binCard.id);

      if (error) throw error;

      setBinCard({ ...binCard, is_header_locked: true });
      toast.success("Header saved", { description: "Bin card header has been saved and locked." });
    } catch (error) {
      console.error("Error saving header:", error);
      toast.error("Error", { description: "Failed to save header" });
    } finally {
      setHeaderSaving(false);
    }
  }

  async function unlockHeader() {
    if (!binCard) return;

    setHeaderSaving(true);
    try {
      const { error } = await supabase
        .from("storage_bin_cards")
        .update({ is_header_locked: false })
        .eq("id", binCard.id);

      if (error) throw error;

      setBinCard({ ...binCard, is_header_locked: false });
      toast.success("Header unlocked", { description: "Header is now editable." });
    } catch (error) {
      console.error("Error unlocking header:", error);
      toast.error("Error", { description: "Failed to unlock header" });
    } finally {
      setHeaderSaving(false);
    }
  }

  // Bulk mode: save shared header to ALL bin cards
  async function saveBulkHeader() {
    const binCardIds = bulkBinCards.filter(b => b.binCard).map(b => b.binCard!.id);
    if (binCardIds.length === 0) return;

    const signature = computePoSetSignature(selectedWorkOrders.map(wo => wo.id));

    setHeaderSaving(true);
    try {
      const { error } = await supabase
        .from("storage_bin_cards")
        .update({
          supplier_name: headerFields.supplier_name || null,
          description: headerFields.description || null,
          construction: headerFields.construction || null,
          color: headerFields.color || null,
          width: headerFields.width || null,
          package_qty: headerFields.package_qty || null,
          prepared_by: headerFields.prepared_by || null,
          is_header_locked: true,
          po_set_signature: signature,
          group_name: groupName.trim() || null,
        })
        .in("id", binCardIds);

      if (error) throw error;

      setBulkHeaderLocked(true);
      toast.success("Header saved", { description: `Bin card header saved and locked for ${binCardIds.length} POs.` });
    } catch (error) {
      console.error("Error saving bulk header:", error);
      toast.error("Error", { description: "Failed to save header" });
    } finally {
      setHeaderSaving(false);
    }
  }

  // Bulk mode: unlock ALL bin cards
  async function unlockBulkHeader() {
    const binCardIds = bulkBinCards.filter(b => b.binCard).map(b => b.binCard!.id);
    if (binCardIds.length === 0) return;

    setHeaderSaving(true);
    try {
      const { error } = await supabase
        .from("storage_bin_cards")
        .update({ is_header_locked: false })
        .in("id", binCardIds);

      if (error) throw error;

      setBulkHeaderLocked(false);
      toast.success("Header unlocked", { description: "Header is now editable." });
    } catch (error) {
      console.error("Error unlocking bulk header:", error);
      toast.error("Error", { description: "Failed to unlock header" });
    } finally {
      setHeaderSaving(false);
    }
  }

  // Single mode submit (original behavior)
  async function submitTransaction() {
    if (!binCard || !profile?.factory_id) return;

    if (wouldGoNegative && !isAdminOrHigher()) {
      toast.error("Invalid transaction", { description: "Balance cannot go negative. Reduce issue quantity." });
      return;
    }

    if (previewReceive === 0 && previewIssue === 0) {
      toast.error("Invalid transaction", { description: "Enter a receive or issue quantity." });
      return;
    }

    setSaving(true);

    try {
      const newTransaction = {
        bin_card_id: binCard.id,
        factory_id: profile.factory_id,
        transaction_date: getTodayInTimezone(factory?.timezone || "Asia/Dhaka"),
        receive_qty: previewReceive,
        issue_qty: previewIssue,
        ttl_receive: previewTtlReceive,
        balance_qty: previewBalance,
        remarks: newTxn.remarks || null,
        submitted_by: user?.id,
      };

      const result = await offlineSubmit("storage_bin_cards", "storage_bin_card_transactions", newTransaction as Record<string, unknown>, {
        showSuccessToast: false,
        showQueuedToast: true,
      });

      if (result.queued) {
        if (voiceRef.current?.hasPending()) {
          toast.error("Voice note not saved — you were offline when this was queued.");
        }
        setNewTxn({ receive_qty: "", issue_qty: "", remarks: "" });
        navigate("/storage/history");
        return;
      }

      if (!result.success) {
        if (result.error?.includes("duplicate") || result.error?.includes("uq_bin_card_transaction_date")) {
          toast.error("Duplicate entry", { description: "A transaction already exists for this date. Please edit the existing entry instead." });
          setSaving(false);
          return;
        }
        throw new Error(result.error);
      }

      const savedId = (result.data as any[] | undefined)?.[0]?.id ?? "";
      if (savedId && voiceRef.current?.hasPending()) {
        try { await voiceRef.current.commit(savedId); }
        catch (e: any) { toast.error(e?.message || "Voice note couldn't be saved"); }
      }

      await loadTransactions(binCard.id);
      setNewTxn({ receive_qty: "", issue_qty: "", remarks: "" });
      toast.success("Transaction saved", { description: "Entry has been recorded." });
      navigate("/storage/history");
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast.error("Error", { description: "Failed to save transaction" });
    } finally {
      setSaving(false);
    }
  }

  // Bulk mode submit
  async function submitBulkTransactions() {
    if (!profile?.factory_id) return;

    if (bulkReceive === 0 && bulkIssue === 0) {
      toast.error("Invalid transaction", { description: "Enter a receive or issue quantity." });
      return;
    }

    if (submittableBulk.length === 0) {
      toast.error("No valid entries", { description: "All POs either have today's entry or would go negative." });
      return;
    }

    setSaving(true);
    const batchId = crypto.randomUUID();
    // Reuse existing group ID if same PO set was previously submitted, otherwise create new
    const binGroupId = existingGroupId || crypto.randomUUID();
    const signature = computePoSetSignature(selectedWorkOrders.map(wo => wo.id));
    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

    // Set bin_group_id + po_set_signature + group_name + apply shared header to all bin cards
    const allBinCardIds = bulkBinCards.filter(b => b.binCard).map(b => b.binCard!.id);
    if (allBinCardIds.length > 0) {
      const { error: headerError } = await supabase
        .from("storage_bin_cards")
        .update({
          bin_group_id: binGroupId,
          po_set_signature: signature,
          group_name: groupName.trim() || null,
          supplier_name: headerFields.supplier_name || null,
          description: headerFields.description || null,
          construction: headerFields.construction || null,
          color: headerFields.color || null,
          width: headerFields.width || null,
          package_qty: headerFields.package_qty || null,
          prepared_by: headerFields.prepared_by || null,
          is_header_locked: true,
        })
        .in("id", allBinCardIds);

      if (headerError) {
        console.error("Error updating bin card headers:", headerError);
        toast.error("Error", { description: "Failed to save shared header" });
        setSaving(false);
        return;
      }
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const item of submittableBulk) {
      const payload = {
        bin_card_id: item.binCard!.id,
        factory_id: profile.factory_id,
        transaction_date: today,
        receive_qty: bulkReceive,
        issue_qty: bulkIssue,
        ttl_receive: item.previewTtlReceive,
        balance_qty: item.previewBalance,
        remarks: bulkTxn.remarks || null,
        submitted_by: user?.id,
        batch_id: batchId,
      };

      const result = await offlineSubmit(
        "storage_bin_cards",
        "storage_bin_card_transactions",
        payload as Record<string, unknown>,
        { showSuccessToast: false, showQueuedToast: false }
      );

      if (result.queued || result.success) {
        successCount++;
      } else {
        failCount++;
        const po = item.workOrder.po_number;
        if (result.error?.includes("duplicate") || result.error?.includes("uq_bin_card_transaction_date")) {
          errors.push(`${po}: already has today's entry`);
        } else {
          errors.push(`${po}: ${result.error}`);
        }
      }
    }

    if (successCount > 0 && failCount === 0) {
      toast.success(`${successCount} entries saved`, {
        description: `Batch applied to ${successCount} POs`,
      });
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`${successCount} saved, ${failCount} failed`, {
        description: errors.join("; "),
      });
    } else {
      toast.error("All entries failed", { description: errors.join("; ") });
    }

    if (successCount > 0) {
      navigate("/storage/history");
    }

    setSaving(false);
  }

  if (!canAccess) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('storagePage.accessDenied')}
        description={t('storagePage.storageRoleRequired')}
        iconClassName="text-warning"
      />
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 md:space-y-6 px-2 sm:px-4 pt-4 pb-24 md:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Warehouse className="h-7 w-7 md:h-8 md:w-8 text-orange-600 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">{t('storagePage.binCardRecord')}</h1>
          <p className="text-xs md:text-sm text-muted-foreground">{t('storagePage.dailyStorageEntry')}</p>
        </div>
      </div>

      {/* Step 1: PO Selector (Multi-select) */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center justify-between">
            <span>{t('storagePage.step1SelectPO')}</span>
            {selectedWorkOrders.length > 0 && (
              <Button variant="ghost" size="sm" onClick={resetSelection} className="text-xs">
                {t('storagePage.clearAll')}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 space-y-3">
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start min-w-0">
                <Search className="mr-2 h-4 w-4" />
                <span className="truncate">
                  {selectedWorkOrders.length === 0
                    ? t('storagePage.searchByPOBuyer')
                    : selectedWorkOrders.length === 1
                      ? `${selectedWorkOrders[0].po_number} - ${selectedWorkOrders[0].buyer} / ${selectedWorkOrders[0].style}`
                      : `${selectedWorkOrders.length} POs selected`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[400px] p-0" align="start">
              <Command shouldFilter={true}>
                <CommandInput placeholder={t('storagePage.searchByPOBuyer')} />
                <CommandList>
                  <CommandEmpty>No work orders found.</CommandEmpty>
                  <CommandGroup>
                    {workOrders.map(wo => {
                      const isSelected = selectedWorkOrders.some(s => s.id === wo.id);
                      return (
                        <CommandItem
                          key={wo.id}
                          value={getSearchableValue(wo)}
                          onSelect={() => toggleWorkOrder(wo)}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <Checkbox
                              checked={isSelected}
                              className="pointer-events-none"
                            />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-medium">{wo.po_number}</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {wo.buyer} / {wo.style} {wo.item ? `/ ${wo.item}` : ""}
                              </span>
                            </div>
                            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
                {selectedWorkOrders.length > 0 && (
                  <div className="border-t p-2">
                    <Button size="sm" className="w-full" onClick={handleApplySelection}>
                      Apply ({selectedWorkOrders.length} selected)
                    </Button>
                  </div>
                )}
              </Command>
            </PopoverContent>
          </Popover>

          {/* Selected PO chips */}
          {selectedWorkOrders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedWorkOrders.map(wo => (
                <Badge key={wo.id} variant="secondary" className="flex items-center gap-1 pl-2.5 pr-1 py-1">
                  <span className="text-xs">{wo.po_number}</span>
                  <button
                    onClick={() => removeWorkOrder(wo.id)}
                    className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {isBulkMode && (
                <Badge variant="info" className="text-xs">
                  <Layers className="h-3 w-3 mr-1" />
                  {t('storagePage.bulkEntry')}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* ===== SINGLE MODE (1 PO selected) ===== */}
      {!isBulkMode && binCard && !loading && (
        <>
          {/* Step 2: Header Fields */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>{t('storagePage.step2BinCardHeader')}</span>
                <div className="flex items-center gap-2">
                  {binCard.is_header_locked && (
                    <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
                      {t('storagePage.locked')}
                    </span>
                  )}
                  {binCard.is_header_locked && (isAdminOrHigher() || isStorageUser()) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={unlockHeader}
                      disabled={headerSaving}
                    >
                      {headerSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Unlock className="mr-2 h-4 w-4" />
                      )}
                      {t('storagePage.unlock')}
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>{t('storagePage.buyerLabel')}</Label>
                  <Input value={selectedWorkOrder?.buyer || ""} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>{t('storagePage.styleLabel')}</Label>
                  <Input value={selectedWorkOrder?.style || ""} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>{t('storagePage.supplierName')}</Label>
                  <Input
                    value={headerFields.supplier_name}
                    onChange={e => setHeaderFields({...headerFields, supplier_name: e.target.value})}
                    disabled={binCard.is_header_locked && !isAdminOrHigher()}
                    placeholder="Enter supplier name"
                  />
                </div>
                <div>
                  <Label>{t('storagePage.descriptionLabel')}</Label>
                  <Input
                    value={headerFields.description}
                    onChange={e => setHeaderFields({...headerFields, description: e.target.value})}
                    disabled={binCard.is_header_locked && !isAdminOrHigher()}
                    placeholder="Item description"
                  />
                </div>
                <div>
                  <Label>{t('storagePage.constructionLabel')}</Label>
                  <Input
                    value={headerFields.construction}
                    onChange={e => setHeaderFields({...headerFields, construction: e.target.value})}
                    disabled={binCard.is_header_locked && !isAdminOrHigher()}
                    placeholder="Construction details"
                  />
                </div>
                <div>
                  <Label>{t('storagePage.preparedByLabel')}</Label>
                  <Input
                    value={headerFields.prepared_by}
                    onChange={e => setHeaderFields({...headerFields, prepared_by: e.target.value})}
                    disabled={binCard.is_header_locked && !isAdminOrHigher()}
                  />
                </div>
                <div>
                  <Label>{t('storagePage.colorLabel')}</Label>
                  <Input
                    value={headerFields.color}
                    onChange={e => setHeaderFields({...headerFields, color: e.target.value})}
                    disabled={binCard.is_header_locked && !isAdminOrHigher()}
                    placeholder="Color"
                  />
                </div>
                <div>
                  <Label>{t('storagePage.widthLabel')}</Label>
                  <Input
                    value={headerFields.width}
                    onChange={e => setHeaderFields({...headerFields, width: e.target.value})}
                    disabled={binCard.is_header_locked && !isAdminOrHigher()}
                    placeholder="Width"
                  />
                </div>
                <div>
                  <Label>{t('storagePage.packageQtyLabel')}</Label>
                  <Input
                    value={headerFields.package_qty}
                    onChange={e => setHeaderFields({...headerFields, package_qty: e.target.value})}
                    disabled={binCard.is_header_locked && !isAdminOrHigher()}
                    placeholder="Package quantity"
                  />
                </div>
              </div>
              {!binCard.is_header_locked && (
                <Button onClick={saveHeaderFields} className="mt-4" disabled={headerSaving}>
                  {headerSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t('storagePage.saveAndLockHeader')}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Transaction Grid (Single Mode) */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg">{t('storagePage.step3DailyTransaction')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-3 sm:px-6">
              {/* Existing transactions table */}
              {(() => {
                const newestTransactions = transactions.slice(0, 3);
                const olderTransactions = transactions.slice(3);
                const hasOlderTransactions = olderTransactions.length > 0;

                return (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('storagePage.dateCol')}</TableHead>
                          <TableHead className="text-right">{t('storagePage.receiveQtyCol')}</TableHead>
                          <TableHead className="text-right">{t('storagePage.ttlReceiveCol')}</TableHead>
                          <TableHead className="text-right">{t('storagePage.issueQtyCol')}</TableHead>
                          <TableHead className="text-right">{t('storagePage.balanceCol')}</TableHead>
                          <TableHead>{t('storagePage.remarksCol')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              {t('storagePage.noTransactions')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {newestTransactions.map(txn => (
                              <TableRow key={txn.id}>
                                <TableCell>{format(new Date(txn.transaction_date), "dd/MM/yyyy")}</TableCell>
                                <TableCell className="text-right">{txn.receive_qty}</TableCell>
                                <TableCell className="text-right font-medium">{txn.ttl_receive}</TableCell>
                                <TableCell className="text-right">{txn.issue_qty}</TableCell>
                                <TableCell className={`text-right font-medium ${txn.balance_qty < 0 ? 'text-destructive' : ''}`}>
                                  {txn.balance_qty}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate">{txn.remarks || "-"}</TableCell>
                              </TableRow>
                            ))}

                            {hasOlderTransactions && (
                              <TableRow>
                                <TableCell colSpan={6} className="p-0">
                                  <Button
                                    variant="ghost"
                                    className="w-full h-10 rounded-none hover:bg-muted/50"
                                    onClick={() => setShowAllTransactions(!showAllTransactions)}
                                  >
                                    {showAllTransactions ? (
                                      <>
                                        <ChevronUp className="mr-2 h-4 w-4" />
                                        Hide older entries ({olderTransactions.length})
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="mr-2 h-4 w-4" />
                                        Show {olderTransactions.length} older {olderTransactions.length === 1 ? 'entry' : 'entries'}
                                      </>
                                    )}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )}

                            {showAllTransactions && olderTransactions.map(txn => (
                              <TableRow key={txn.id}>
                                <TableCell>{format(new Date(txn.transaction_date), "dd/MM/yyyy")}</TableCell>
                                <TableCell className="text-right">{txn.receive_qty}</TableCell>
                                <TableCell className="text-right font-medium">{txn.ttl_receive}</TableCell>
                                <TableCell className="text-right">{txn.issue_qty}</TableCell>
                                <TableCell className={`text-right font-medium ${txn.balance_qty < 0 ? 'text-destructive' : ''}`}>
                                  {txn.balance_qty}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate">{txn.remarks || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}

              {/* New entry row */}
              <div className="border rounded-lg p-3 sm:p-4 bg-muted/30">
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm sm:text-base">
                  <Plus className="h-4 w-4" />
                  Add Today's Entry ({format(new Date(), "dd/MM/yyyy")})
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label>Receive Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      value={newTxn.receive_qty}
                      onChange={e => setNewTxn({...newTxn, receive_qty: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Issue Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      value={newTxn.issue_qty}
                      onChange={e => setNewTxn({...newTxn, issue_qty: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>TTL Receive (calc)</Label>
                    <Input value={previewTtlReceive} disabled className="bg-muted" />
                  </div>
                  <div>
                    <Label>Balance (calc)</Label>
                    <Input
                      value={previewBalance}
                      disabled
                      className={`bg-muted ${wouldGoNegative ? 'text-destructive border-destructive' : ''}`}
                    />
                  </div>
                  <div>
                    <NotesWithVoice
                      ref={voiceRef}
                      label="Remarks"
                      value={newTxn.remarks}
                      onChange={(v) => setNewTxn({ ...newTxn, remarks: v })}
                      placeholder="Optional notes"
                      recordType="storage_bin_card_transactions"
                      recordId={null}
                      deferred
                    />
                  </div>
                </div>

                {wouldGoNegative && (
                  <p className="text-sm text-destructive mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Balance would go negative. Reduce issue quantity.
                  </p>
                )}

                <Button
                  onClick={submitTransaction}
                  disabled={saving || (wouldGoNegative && !isAdminOrHigher())}
                  className="mt-4 w-full sm:w-auto"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Entry
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ===== BULK MODE (2+ POs selected) ===== */}
      {isBulkMode && bulkLoaded && !loading && (
        <>
          {/* Step 2: Bin Card Details (Summary + Shared Header) */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>Step 2: Bin Card Header</span>
                <div className="flex items-center gap-2">
                  {bulkHeaderLocked && (
                    <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
                      Locked
                    </span>
                  )}
                  {bulkHeaderLocked && (isAdminOrHigher() || isStorageUser()) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={unlockBulkHeader}
                      disabled={headerSaving}
                    >
                      {headerSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Unlock className="mr-2 h-4 w-4" />
                      )}
                      Unlock
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 space-y-4">
              {/* Section A: Selected POs Summary */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO NUMBER</TableHead>
                      <TableHead>BUYER</TableHead>
                      <TableHead>STYLE</TableHead>
                      <TableHead className="text-right">BALANCE</TableHead>
                      <TableHead>STATUS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkPreviews.map(item => (
                      <TableRow key={item.workOrder.id}>
                        <TableCell className="font-medium">{item.workOrder.po_number}</TableCell>
                        <TableCell>{item.workOrder.buyer}</TableCell>
                        <TableCell>{item.workOrder.style}</TableCell>
                        <TableCell className="text-right">{item.lastBalance}</TableCell>
                        <TableCell>
                          {item.hasTodayTransaction ? (
                            <Badge variant="warning" className="text-xs">Has entry</Badge>
                          ) : item.isNew ? (
                            <Badge variant="info" className="text-xs">New card</Badge>
                          ) : (
                            <Badge variant="success" className="text-xs">Ready</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {bulkPreviews.some(item => item.hasTodayTransaction) && (
                <p className="text-sm text-warning flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  POs marked "Has entry" already have today's transaction and will be skipped.
                </p>
              )}

              {/* Existing group indicator */}
              {existingGroupFound && (
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  <Layers className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    <strong>Existing group found</strong> — continuing shared ledger
                    {groupName && <> ({groupName})</>}
                  </span>
                </div>
              )}

              {/* Group Name (optional) */}
              <div>
                <Label>GROUP NAME (optional)</Label>
                <Input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g. Fabric Lot A, Batch March-01"
                />
              </div>

              {/* Section B: Shared Bin Card Header Fields */}
              <div className="grid grid-cols-1 gap-3">
                {(() => {
                  const poNumbers = selectedWorkOrders.map(wo => wo.po_number);
                  const buyers = [...new Set(selectedWorkOrders.map(wo => wo.buyer))];
                  const styles = [...new Set(selectedWorkOrders.map(wo => wo.style))];
                  return (
                    <>
                      <div>
                        <Label>PO NUMBERS</Label>
                        <Input value={poNumbers.join(", ")} disabled className="bg-muted" />
                      </div>
                      <div>
                        <Label>BUYER</Label>
                        <Input value={buyers.join(", ")} disabled className="bg-muted" />
                      </div>
                      <div>
                        <Label>STYLE</Label>
                        <Input value={styles.join(", ")} disabled className="bg-muted" />
                      </div>
                    </>
                  );
                })()}
                <div>
                  <Label>SUPPLIER NAME</Label>
                  <Input
                    value={headerFields.supplier_name}
                    onChange={e => setHeaderFields({...headerFields, supplier_name: e.target.value})}
                    disabled={bulkHeaderLocked && !isAdminOrHigher()}
                    placeholder="Enter supplier name"
                  />
                </div>
                <div>
                  <Label>DESCRIPTION</Label>
                  <Input
                    value={headerFields.description}
                    onChange={e => setHeaderFields({...headerFields, description: e.target.value})}
                    disabled={bulkHeaderLocked && !isAdminOrHigher()}
                    placeholder="Item description"
                  />
                </div>
                <div>
                  <Label>CONSTRUCTION</Label>
                  <Input
                    value={headerFields.construction}
                    onChange={e => setHeaderFields({...headerFields, construction: e.target.value})}
                    disabled={bulkHeaderLocked && !isAdminOrHigher()}
                    placeholder="Construction details"
                  />
                </div>
                <div>
                  <Label>PREPARED BY</Label>
                  <Input
                    value={headerFields.prepared_by}
                    onChange={e => setHeaderFields({...headerFields, prepared_by: e.target.value})}
                    disabled={bulkHeaderLocked && !isAdminOrHigher()}
                  />
                </div>
                <div>
                  <Label>COLOR</Label>
                  <Input
                    value={headerFields.color}
                    onChange={e => setHeaderFields({...headerFields, color: e.target.value})}
                    disabled={bulkHeaderLocked && !isAdminOrHigher()}
                    placeholder="Color"
                  />
                </div>
                <div>
                  <Label>WIDTH</Label>
                  <Input
                    value={headerFields.width}
                    onChange={e => setHeaderFields({...headerFields, width: e.target.value})}
                    disabled={bulkHeaderLocked && !isAdminOrHigher()}
                    placeholder="Width"
                  />
                </div>
                <div>
                  <Label>PACKAGE QTY</Label>
                  <Input
                    value={headerFields.package_qty}
                    onChange={e => setHeaderFields({...headerFields, package_qty: e.target.value})}
                    disabled={bulkHeaderLocked && !isAdminOrHigher()}
                    placeholder="Package quantity"
                  />
                </div>
              </div>
              {!bulkHeaderLocked && (
                <Button onClick={saveBulkHeader} disabled={headerSaving}>
                  {headerSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save & Lock Header
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Daily Transaction Entry */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg">Step 3: Daily Transaction Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-3 sm:px-6">
              <div className="border rounded-lg p-3 sm:p-4 bg-muted/30">
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm sm:text-base">
                  <Layers className="h-4 w-4" />
                  Apply to {submittableBulk.length} PO{submittableBulk.length !== 1 ? 's' : ''} ({format(new Date(), "dd/MM/yyyy")})
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label>Receive Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      value={bulkTxn.receive_qty}
                      onChange={e => setBulkTxn({...bulkTxn, receive_qty: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Issue Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      value={bulkTxn.issue_qty}
                      onChange={e => setBulkTxn({...bulkTxn, issue_qty: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Remarks</Label>
                    <Textarea
                      value={bulkTxn.remarks}
                      onChange={e => setBulkTxn({...bulkTxn, remarks: e.target.value})}
                      placeholder="Optional notes (applies to all)"
                      className="h-10 min-h-0"
                    />
                  </div>
                </div>
              </div>

              {/* Per-PO calculation preview (always shown) */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO</TableHead>
                      <TableHead className="text-right">PREV BALANCE</TableHead>
                      <TableHead className="text-right">TTL RECEIVE (calc)</TableHead>
                      <TableHead className="text-right">BALANCE (calc)</TableHead>
                      <TableHead>STATUS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkPreviews.map(item => (
                      <TableRow key={item.workOrder.id} className={item.skipped ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{item.workOrder.po_number}</TableCell>
                        <TableCell className="text-right">{item.lastBalance}</TableCell>
                        <TableCell className="text-right font-mono">
                          {item.skipped ? '-' : item.previewTtlReceive}
                        </TableCell>
                        <TableCell className={`text-right font-mono font-medium ${item.wouldGoNegative ? 'text-destructive' : ''}`}>
                          {item.skipped ? '-' : item.previewBalance}
                        </TableCell>
                        <TableCell>
                          {item.skipped ? (
                            <span className="text-xs text-muted-foreground">Skipped</span>
                          ) : item.wouldGoNegative ? (
                            <Badge variant="destructive" className="text-xs">Negative</Badge>
                          ) : (
                            <Badge variant="success" className="text-xs">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {anyBulkNegative && !isAdminOrHigher() && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Some POs would go negative and will be excluded. Reduce issue quantity.
                </p>
              )}

              <Button
                onClick={submitBulkTransactions}
                disabled={saving || submittableBulk.length === 0}
                className="w-full sm:w-auto"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Submit {submittableBulk.length} {submittableBulk.length === 1 ? 'Entry' : 'Entries'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
