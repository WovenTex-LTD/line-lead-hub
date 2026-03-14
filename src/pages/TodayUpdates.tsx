import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { effectivePoly, effectiveCarton } from "@/lib/finishing-utils";
import { useMidnightRefresh } from "@/hooks/useMidnightRefresh";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Package, Search, RefreshCw, Scissors, Warehouse, CalendarDays, Layers, ChevronDown, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CuttingSubmissionView } from "@/components/CuttingSubmissionView";
import { SewingSubmissionView, SewingTargetData, SewingActualData } from "@/components/SewingSubmissionView";
import { formatTimeInTimezone, getTodayInTimezone, toISODate } from "@/lib/date-utils";
import { subDays, format } from "date-fns";
import { StorageBinCardDetailModal } from "@/components/StorageBinCardDetailModal";
import { FinishingSubmissionView, FinishingTargetData, FinishingActualData } from "@/components/FinishingSubmissionView";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { DollarSign, TrendingUp as TrendingUpIcon, TrendingDown } from "lucide-react";
import { DailyReportButton, DailyReportData, DailyReportSewingLine, DailyReportCuttingLine, DailyReportFinishingLine, DailyReportNote } from "@/components/DailyProductionReport";
import { ReportExportDialog } from "@/components/ReportExportDialog";

interface SewingUpdate {
  id: string;
  line_id: string;
  output_qty: number;
  target_qty: number | null;
  manpower: number | null;
  reject_qty: number | null;
  rework_qty: number | null;
  stage_progress: number | null;
  ot_hours: number | null;
  ot_manpower: number | null;
  has_blocker: boolean | null;
  blocker_description: string | null;
  blocker_impact: string | null;
  blocker_owner: string | null;
  blocker_status: string | null;
  notes: string | null;
  submitted_at: string | null;
  production_date: string;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string } | null;
}

interface FinishingDailyLog {
  id: string;
  line_id: string | null;
  work_order_id: string | null;
  production_date: string;
  submitted_at: string;
  log_type: 'TARGET' | 'OUTPUT';
  thread_cutting: number | null;
  inside_check: number | null;
  top_side_check: number | null;
  buttoning: number | null;
  iron: number | null;
  get_up: number | null;
  poly: number | null;
  carton: number | null;
  planned_hours: number | null;
  actual_hours: number | null;
  m_power_planned: number | null;
  m_power_actual: number | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  ot_hours_planned: number | null;
  ot_manpower_planned: number | null;
  remarks: string | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string; cm_per_dozen?: number | null } | null;
}

interface CuttingActual {
  id: string;
  line_id: string;
  work_order_id: string;
  man_power: number | null;
  marker_capacity: number | null;
  lay_capacity: number | null;
  cutting_capacity: number | null;
  under_qty: number | null;
  day_cutting: number;
  day_input: number;
  total_cutting: number | null;
  total_input: number | null;
  balance: number | null;
  submitted_at: string | null;
  production_date: string;
  colour: string | null;
  order_qty: number | null;
  leftover_recorded: boolean | null;
  leftover_type: string | null;
  leftover_unit: string | null;
  leftover_quantity: number | null;
  leftover_notes: string | null;
  leftover_location: string | null;
  leftover_photo_urls: string[] | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  hours_actual: number | null;
  actual_per_hour: number | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string; cm_per_dozen?: number | null } | null;
}

interface CuttingTargetFull {
  id: string;
  line_id: string;
  work_order_id: string;
  production_date: string;
  man_power: number;
  marker_capacity: number;
  lay_capacity: number;
  cutting_capacity: number;
  under_qty: number | null;
  day_cutting: number;
  day_input: number;
  order_qty: number | null;
  buyer: string | null;
  style: string | null;
  po_no: string | null;
  colour: string | null;
  submitted_at: string | null;
  ot_hours_planned: number | null;
  ot_manpower_planned: number | null;
  hours_planned: number | null;
  target_per_hour: number | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string } | null;
}

interface SewingTargetRow {
  id: string;
  line_id: string;
  work_order_id: string;
  production_date: string;
  per_hour_target: number;
  manpower_planned: number;
  ot_hours_planned: number;
  hours_planned: number | null;
  target_total_planned: number | null;
  planned_stage_progress: number;
  next_milestone: string | null;
  estimated_ex_factory: string | null;
  is_late: boolean | null;
  remarks: string | null;
  submitted_at: string | null;
  stages: { name: string } | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string } | null;
}

interface SewingActualRow {
  id: string;
  line_id: string;
  work_order_id: string;
  production_date: string;
  good_today: number;
  reject_today: number;
  rework_today: number;
  cumulative_good_total: number;
  manpower_actual: number;
  ot_hours_actual: number;
  ot_manpower_actual: number | null;
  hours_actual: number | null;
  actual_per_hour: number | null;
  actual_stage_progress: number;
  has_blocker: boolean | null;
  blocker_description: string | null;
  blocker_impact: string | null;
  blocker_owner: string | null;
  blocker_type_id: string | null;
  remarks: string | null;
  submitted_at: string | null;
  stages: { name: string } | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string; cm_per_dozen?: number | null } | null;
}

interface StorageTransaction {
  id: string;
  receive_qty: number;
  issue_qty: number;
  balance_qty: number;
  transaction_date: string;
  created_at: string | null;
  batch_id: string | null;
  storage_bin_cards: {
    id: string;
    buyer: string | null;
    style: string | null;
    bin_group_id: string | null;
    group_name: string | null;
    po_set_signature: string | null;
    work_orders: { po_number: string } | null;
  } | null;
}

interface GroupedStorageRow {
  groupKey: string;
  groupName: string | null;
  isGroup: boolean;
  transactions: StorageTransaction[];
  totalReceived: number;
  totalIssued: number;
  totalBalance: number;
  latestTime: string | null;
  style: string | null;
}

export default function TodayUpdates() {
  const { profile, factory } = useAuth();

  // Helper to format time in factory timezone
  const formatTime = (dateString: string) => {
    const timezone = factory?.timezone || "Asia/Dhaka";
    return formatTimeInTimezone(dateString, timezone);
  };
  const renderPct = (pct: number | null) => {
    if (pct === null) return <span className="text-muted-foreground">—</span>;
    const color = pct >= 100 ? "text-green-600" : pct >= 90 ? "text-green-500" : pct >= 70 ? "text-amber-600" : "text-red-600";
    return <span className={`font-mono font-semibold text-sm ${color}`}>{Math.round(pct)}%</span>;
  };

  const navigate = useNavigate();
  const { headcountCost, isConfigured: costConfigured } = useHeadcountCost();
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const json = await res.json();
        if (!cancelled && json?.rates?.BDT) {
          setBdtToUsd(1 / json.rates.BDT);
        }
      } catch {
        if (!cancelled) setBdtToUsd(1 / 121);
      }
    }
    fetchRate();
    return () => { cancelled = true; };
  }, []);

  const [loading, setLoading] = useState(true);
  const [sewingUpdates, setSewingUpdates] = useState<SewingUpdate[]>([]);
  const [sewingTargets, setSewingTargets] = useState<SewingTargetRow[]>([]);
  const [sewingActuals, setSewingActuals] = useState<SewingActualRow[]>([]);
  const [finishingDailyLogs, setFinishingDailyLogs] = useState<FinishingDailyLog[]>([]);
  const [cuttingActuals, setCuttingActuals] = useState<CuttingActual[]>([]);
  const [cuttingTargets, setCuttingTargets] = useState<CuttingTargetFull[]>([]);
  const [storageTransactions, setStorageTransactions] = useState<StorageTransaction[]>([]);
  const [productionNotes, setProductionNotes] = useState<DailyReportNote[]>([]);
  const [selectedCuttingTarget, setSelectedCuttingTarget] = useState<CuttingTargetFull | null>(null);
  const [cuttingTargetModalOpen, setCuttingTargetModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return ["all", "storage", "cutting", "sewing", "finishing"].includes(tab ?? "")
      ? (tab as string)
      : "all";
  });
  const [sewingViewOpen, setSewingViewOpen] = useState(false);
  const [sewingViewKey, setSewingViewKey] = useState<string | null>(null);
  const [selectedLegacySewing, setSelectedLegacySewing] = useState<SewingUpdate | null>(null);
  const [selectedCutting, setSelectedCutting] = useState<any>(null);
  const [cuttingModalOpen, setCuttingModalOpen] = useState(false);
  const [selectedBinCard, setSelectedBinCard] = useState<any>(null);
  const [binCardTransactions, setBinCardTransactions] = useState<any[]>([]);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [storageLoading, setStorageLoading] = useState(false);
  const [selectedGroupedCards, setSelectedGroupedCards] = useState<{
    groupName: string;
    cards: {
      binCard: { id: string; buyer: string | null; style: string | null; po_number: string | null; supplier_name: string | null; description: string | null; construction: string | null; color: string | null; width: string | null; package_qty: string | null; prepared_by: string | null };
      transactions: any[];
    }[];
  } | null>(null);

  const [selectedFinishingLog, setSelectedFinishingLog] = useState<FinishingDailyLog | null>(null);
  const [finishingLogModalOpen, setFinishingLogModalOpen] = useState(false);
  const [financialsExpanded, setFinancialsExpanded] = useState(false);
  const [expandedStorageGroups, setExpandedStorageGroups] = useState<Set<string>>(new Set());

  // Date picker state
  const timezone = factory?.timezone || "Asia/Dhaka";
  const todayStr = getTodayInTimezone(timezone);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(todayStr + "T00:00:00"));

  // Re-sync when factory timezone loads
  useEffect(() => {
    if (factory?.timezone) {
      const factoryToday = getTodayInTimezone(factory.timezone);
      const currentStr = format(selectedDate, "yyyy-MM-dd");
      // Only re-sync if we're still on the initial date
      if (currentStr === todayStr || currentStr === format(new Date(), "yyyy-MM-dd")) {
        setSelectedDate(new Date(factoryToday + "T00:00:00"));
      }
    }
  }, [factory?.timezone]);

  const selectedDateStr = toISODate(selectedDate, timezone);
  const isToday = selectedDateStr === todayStr;

  // Auto-refresh at midnight (factory timezone) and on tab refocus
  useMidnightRefresh(useCallback((newDate: string) => {
    setSelectedDate(new Date(newDate + "T00:00:00"));
  }, []));

  useEffect(() => {
    if (profile?.factory_id) {
      fetchTodayUpdates();
    }
  }, [profile?.factory_id, selectedDateStr]);

  async function fetchTodayUpdates() {
    if (!profile?.factory_id) return;
    setLoading(true);
    const today = selectedDateStr;

    try {
      const [sewingRes, sewingTargetsRes, sewingActualsRes, finishingRes, cuttingRes, cuttingTargetsRes, storageRes, notesRes] = await Promise.all([
        supabase
          .from('production_updates_sewing')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style)')
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('sewing_targets')
          .select('*, stages:planned_stage_id(name), lines(line_id, name), work_orders(po_number, buyer, style)')
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('sewing_actuals')
          .select('*, stages:actual_stage_id(name), lines(line_id, name), work_orders(po_number, buyer, style, cm_per_dozen)')
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('finishing_daily_logs')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style, cm_per_dozen)')
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('cutting_actuals')
          .select('*, lines!cutting_actuals_line_id_fkey(line_id, name), work_orders(po_number, buyer, style, order_qty, color, cm_per_dozen)')
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('cutting_targets')
          .select('*, lines!cutting_targets_line_id_fkey(line_id, name), work_orders(po_number, buyer, style, order_qty, color)')
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('storage_bin_card_transactions')
          .select('*, storage_bin_cards(id, buyer, style, bin_group_id, group_name, po_set_signature, work_orders(po_number))')
          .eq('factory_id', profile.factory_id)
          .eq('transaction_date', today)
          .order('created_at', { ascending: false }),
        supabase
          .from('production_notes')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style)')
          .eq('factory_id', profile.factory_id)
          .gte('created_at', `${today}T00:00:00`)
          .lte('created_at', `${today}T23:59:59`)
          .order('created_at', { ascending: false }),
      ]);

      setSewingUpdates(sewingRes.data || []);
      setSewingTargets(sewingTargetsRes.data as SewingTargetRow[] || []);
      setSewingActuals(sewingActualsRes.data as SewingActualRow[] || []);
      setFinishingDailyLogs(finishingRes.data as FinishingDailyLog[] || []);
      setCuttingActuals(cuttingRes.data as CuttingActual[] || []);
      setCuttingTargets(cuttingTargetsRes.data as CuttingTargetFull[] || []);
      setStorageTransactions(storageRes.data as StorageTransaction[] || []);
      setProductionNotes((notesRes.data || []).map((n: any) => ({
        title: n.title || "",
        body: n.body || "",
        department: n.department || null,
        lineName: n.lines?.name || null,
        poNumber: n.work_orders?.po_number || null,
        tag: n.tag || "other",
        impact: n.impact || null,
        status: n.status || "open",
        authorName: null,
      })));
    } catch (error) {
      console.error('Error fetching updates:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredSewing = sewingUpdates.filter(u => 
    (u.lines?.name || u.lines?.line_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.work_orders?.po_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFinishing = finishingDailyLogs.filter(s =>
    (s.work_orders?.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.work_orders?.buyer || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.work_orders?.style || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCutting = cuttingActuals.filter(c =>
    (c.lines?.name || c.lines?.line_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.work_orders?.po_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCuttingTargets = cuttingTargets.filter(t =>
    (t.lines?.name || t.lines?.line_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.work_orders?.po_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSewingTargets = sewingTargets.filter(t =>
    (t.lines?.name || t.lines?.line_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.work_orders?.po_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSewingActuals = sewingActuals.filter(a =>
    (a.lines?.name || a.lines?.line_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.work_orders?.po_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredStorage = (storageTransactions || []).filter(s =>
    (s.storage_bin_cards?.work_orders?.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.storage_bin_cards?.style || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group storage transactions by po_set_signature or batch_id
  const groupedStorageRows = useMemo((): GroupedStorageRow[] => {
    const groupMap = new Map<string, StorageTransaction[]>();
    const singles: StorageTransaction[] = [];

    filteredStorage.forEach(txn => {
      const groupKey = txn.storage_bin_cards?.po_set_signature || txn.storage_bin_cards?.bin_group_id;
      if (groupKey) {
        const existing = groupMap.get(groupKey) || [];
        existing.push(txn);
        groupMap.set(groupKey, existing);
      } else {
        singles.push(txn);
      }
    });

    const rows: GroupedStorageRow[] = [];

    // Add grouped rows
    groupMap.forEach((txns, groupKey) => {
      if (txns.length > 1) {
        const groupName = txns[0].storage_bin_cards?.group_name || `Group (${txns.length} POs)`;
        rows.push({
          groupKey,
          groupName,
          isGroup: true,
          transactions: txns,
          totalReceived: txns.reduce((s, t) => s + (t.receive_qty || 0), 0),
          totalIssued: txns.reduce((s, t) => s + (t.issue_qty || 0), 0),
          totalBalance: txns.reduce((s, t) => s + (t.balance_qty || 0), 0),
          latestTime: txns.reduce((latest, t) => (!latest || (t.created_at && t.created_at > latest)) ? t.created_at : latest, null as string | null),
          style: txns[0].storage_bin_cards?.style || null,
        });
      } else {
        // Single item in group key — treat as single
        singles.push(txns[0]);
      }
    });

    // Add singles
    singles.forEach(txn => {
      rows.push({
        groupKey: txn.id,
        groupName: null,
        isGroup: false,
        transactions: [txn],
        totalReceived: txn.receive_qty,
        totalIssued: txn.issue_qty,
        totalBalance: txn.balance_qty,
        latestTime: txn.created_at,
        style: txn.storage_bin_cards?.style || null,
      });
    });

    // Sort by latest time desc
    rows.sort((a, b) => (b.latestTime || '').localeCompare(a.latestTime || ''));
    return rows;
  }, [filteredStorage]);

  const toggleStorageGroup = (groupKey: string) => {
    setExpandedStorageGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const mergedSewingData = useMemo(() => {
    const map = new Map<string, {
      key: string;
      line_id: string;
      line_name: string;
      work_order_id: string;
      po_number: string | null;
      buyer: string | null;
      style: string | null;
      target: SewingTargetRow | null;
      actual: SewingActualRow | null;
      submitted_at: string | null;
    }>();

    // Add targets
    filteredSewingTargets.forEach(target => {
      const key = `${target.line_id}-${target.work_order_id}`;
      map.set(key, {
        key,
        line_id: target.line_id,
        line_name: target.lines?.name || target.lines?.line_id || 'Unknown',
        work_order_id: target.work_order_id,
        po_number: target.work_orders?.po_number || null,
        buyer: target.work_orders?.buyer || null,
        style: target.work_orders?.style || null,
        target,
        actual: null,
        submitted_at: target.submitted_at,
      });
    });

    // Add/merge actuals
    filteredSewingActuals.forEach(actual => {
      const key = `${actual.line_id}-${actual.work_order_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.actual = actual;
        if (actual.submitted_at && (!existing.submitted_at || actual.submitted_at > existing.submitted_at)) {
          existing.submitted_at = actual.submitted_at;
        }
      } else {
        map.set(key, {
          key,
          line_id: actual.line_id,
          line_name: actual.lines?.name || actual.lines?.line_id || 'Unknown',
          work_order_id: actual.work_order_id,
          po_number: actual.work_orders?.po_number || null,
          buyer: actual.work_orders?.buyer || null,
          style: actual.work_orders?.style || null,
          target: null,
          actual,
          submitted_at: actual.submitted_at,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      (b.submitted_at || '').localeCompare(a.submitted_at || '')
    );
  }, [filteredSewingTargets, filteredSewingActuals]);

  // Merge cutting targets and actuals by line+work_order for unified display
  const mergedCuttingData = useMemo(() => {
    const map = new Map<string, {
      key: string;
      line_id: string;
      line_name: string;
      work_order_id: string;
      po_number: string | null;
      buyer: string | null;
      target: CuttingTargetFull | null;
      actual: CuttingActual | null;
      submitted_at: string | null;
    }>();

    // Add targets
    filteredCuttingTargets.forEach(target => {
      const key = `${target.line_id}-${target.work_order_id}`;
      map.set(key, {
        key,
        line_id: target.line_id,
        line_name: target.lines?.name || target.lines?.line_id || 'Unknown',
        work_order_id: target.work_order_id,
        po_number: target.work_orders?.po_number || target.po_no || null,
        buyer: target.work_orders?.buyer || target.buyer || null,
        target,
        actual: null,
        submitted_at: target.submitted_at,
      });
    });

    // Add/merge actuals
    filteredCutting.forEach(actual => {
      const key = `${actual.line_id}-${actual.work_order_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.actual = actual;
        if (!existing.buyer) existing.buyer = actual.work_orders?.buyer || null;
        // Use the later submission time
        if (actual.submitted_at && (!existing.submitted_at || actual.submitted_at > existing.submitted_at)) {
          existing.submitted_at = actual.submitted_at;
        }
      } else {
        map.set(key, {
          key,
          line_id: actual.line_id,
          line_name: actual.lines?.name || actual.lines?.line_id || 'Unknown',
          work_order_id: actual.work_order_id,
          po_number: actual.work_orders?.po_number || null,
          buyer: actual.work_orders?.buyer || null,
          target: null,
          actual,
          submitted_at: actual.submitted_at,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => 
      (b.submitted_at || '').localeCompare(a.submitted_at || '')
    );
  }, [filteredCuttingTargets, filteredCutting]);

  // Merge finishing TARGET and OUTPUT logs by PO for unified display
  const mergedFinishingData = useMemo(() => {
    const map = new Map<string, {
      key: string;
      po_number: string | null;
      target: FinishingDailyLog | null;
      output: FinishingDailyLog | null;
      submitted_at: string;
    }>();

    filteredFinishing.forEach(log => {
      const key = `${log.work_order_id || 'no-po'}`;
      const existing = map.get(key);

      if (existing) {
        if (log.log_type === 'TARGET') {
          existing.target = log;
        } else {
          existing.output = log;
        }
        // Use the later submission time
        if (log.submitted_at > existing.submitted_at) {
          existing.submitted_at = log.submitted_at;
        }
      } else {
        map.set(key, {
          key,
          po_number: log.work_orders?.po_number || null,
          target: log.log_type === 'TARGET' ? log : null,
          output: log.log_type === 'OUTPUT' ? log : null,
          submitted_at: log.submitted_at,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      b.submitted_at.localeCompare(a.submitted_at)
    );
  }, [filteredFinishing]);

  const totalOutput = sewingUpdates.reduce((sum, u) => sum + (u.output_qty || 0), 0)
    + sewingActuals.reduce((sum, a) => sum + (a.good_today || 0), 0);
  
  // Total Finishing Output = Total Poly (OT-adjusted)
  const totalFinishingOutput = finishingDailyLogs
    .filter(log => log.log_type === 'OUTPUT')
    .reduce((sum, log) => sum + effectivePoly(log.poly, log.actual_hours, log.ot_hours_actual), 0);

  const totalCutting = cuttingActuals.reduce((sum, c) => sum + (c.day_cutting || 0), 0);
  const totalStorageReceived = storageTransactions.reduce((sum, s) => sum + (s.receive_qty || 0), 0);

  // ── Financial calculations ──
  const financials = useMemo(() => {
    const rate = costConfigured && headcountCost.value ? headcountCost.value : 0;
    const costCurrency = headcountCost.currency;

    // Revenue: sewing output × (cm_per_dozen / 12)
    const revenueByPo: { po: string; buyer: string; style: string; output: number; cmDz: number; revenue: number }[] = [];
    let totalRevenue = 0;

    sewingActuals.forEach((s) => {
      const cm = s.work_orders?.cm_per_dozen;
      const output = s.good_today || 0;
      if (cm && output) {
        const rev = (cm / 12) * output;
        totalRevenue += rev;
        revenueByPo.push({
          po: s.work_orders?.po_number || 'Unknown',
          buyer: s.work_orders?.buyer || '',
          style: s.work_orders?.style || '',
          output,
          cmDz: cm,
          revenue: rev,
        });
      }
    });

    // Cost by department and by PO
    let sewingCost = 0;
    let cuttingCost = 0;
    let finishingCost = 0;
    const costByPoMap: Record<string, { po: string; buyer: string; style: string; sewingCost: number; cuttingCost: number; finishingCost: number }> = {};

    const addPoCost = (po: string, buyer: string, style: string, dept: 'sewingCost' | 'cuttingCost' | 'finishingCost', amount: number) => {
      if (!costByPoMap[po]) costByPoMap[po] = { po, buyer, style, sewingCost: 0, cuttingCost: 0, finishingCost: 0 };
      costByPoMap[po][dept] += amount;
    };

    if (rate > 0) {
      // Sewing (only POs with CM price)
      sewingActuals.forEach((s) => {
        if (!s.work_orders?.cm_per_dozen) return;
        let lineCost = 0;
        if (s.manpower_actual && s.hours_actual) lineCost += rate * s.manpower_actual * s.hours_actual;
        if (s.ot_manpower_actual && s.ot_hours_actual) lineCost += rate * s.ot_manpower_actual * s.ot_hours_actual;
        sewingCost += lineCost;
        if (lineCost > 0) addPoCost(s.work_orders?.po_number || 'Unknown', s.work_orders?.buyer || '', s.work_orders?.style || '', 'sewingCost', lineCost);
      });

      // Cutting (only POs with CM price)
      cuttingActuals.forEach((c) => {
        if (!c.work_orders?.cm_per_dozen) return;
        let lineCost = 0;
        if (c.man_power && c.hours_actual) lineCost += rate * c.man_power * c.hours_actual;
        if (c.ot_manpower_actual && c.ot_hours_actual) lineCost += rate * c.ot_manpower_actual * c.ot_hours_actual;
        cuttingCost += lineCost;
        if (lineCost > 0) addPoCost(c.work_orders?.po_number || 'Unknown', c.work_orders?.buyer || '', c.work_orders?.style || '', 'cuttingCost', lineCost);
      });

      // Finishing (only POs with CM price)
      finishingDailyLogs.filter(l => l.log_type === 'OUTPUT').forEach((log) => {
        if (!log.work_orders?.cm_per_dozen) return;
        let lineCost = 0;
        if (log.m_power_actual && log.actual_hours) lineCost += rate * log.m_power_actual * log.actual_hours;
        if (log.ot_manpower_actual && log.ot_hours_actual) lineCost += rate * log.ot_manpower_actual * log.ot_hours_actual;
        finishingCost += lineCost;
        if (lineCost > 0) addPoCost(log.work_orders?.po_number || 'Unknown', log.work_orders?.buyer || '', log.work_orders?.style || '', 'finishingCost', lineCost);
      });
    }

    const totalCostNative = sewingCost + cuttingCost + finishingCost;
    const costByPo = Object.values(costByPoMap).map(p => ({
      ...p,
      totalCost: p.sewingCost + p.cuttingCost + p.finishingCost,
    })).sort((a, b) => b.totalCost - a.totalCost);

    // Convert cost to USD
    let totalCostUsd = totalCostNative;
    let sewingCostUsd = sewingCost;
    let cuttingCostUsd = cuttingCost;
    let finishingCostUsd = finishingCost;
    if (costCurrency === 'BDT' && bdtToUsd) {
      totalCostUsd = totalCostNative * bdtToUsd;
      sewingCostUsd = sewingCost * bdtToUsd;
      cuttingCostUsd = cuttingCost * bdtToUsd;
      finishingCostUsd = finishingCost * bdtToUsd;
    }

    const profit = totalRevenue - totalCostUsd;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    // Convert costByPo to USD
    const costByPoUsd = costByPo.map(p => {
      const toUsd = (v: number) => costCurrency === 'BDT' && bdtToUsd ? Math.round(v * bdtToUsd * 100) / 100 : Math.round(v * 100) / 100;
      return { po: p.po, buyer: p.buyer, style: p.style, sewingCost: toUsd(p.sewingCost), cuttingCost: toUsd(p.cuttingCost), finishingCost: toUsd(p.finishingCost), totalCost: toUsd(p.totalCost) };
    });

    return {
      revenueByPo,
      costByPo: costByPoUsd,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCostNative: Math.round(totalCostNative * 100) / 100,
      totalCostUsd: Math.round(totalCostUsd * 100) / 100,
      sewingCostUsd: Math.round(sewingCostUsd * 100) / 100,
      cuttingCostUsd: Math.round(cuttingCostUsd * 100) / 100,
      finishingCostUsd: Math.round(finishingCostUsd * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin: Math.round(margin * 10) / 10,
      costCurrency,
      hasData: totalRevenue > 0 || totalCostNative > 0,
    };
  }, [finishingDailyLogs, sewingActuals, cuttingActuals, costConfigured, headcountCost.value, headcountCost.currency, bdtToUsd]);

  // ── Daily Production Report PDF data ──
  const dailyReportData = useMemo((): DailyReportData => {
    const sewingLines: DailyReportSewingLine[] = sewingActuals.map(a => {
      const target = sewingTargets.find(t => t.line_id === a.line_id && t.work_order_id === a.work_order_id);
      const targetQty = target?.target_total_planned ?? null;
      const eff = targetQty && targetQty > 0 ? Math.round((a.good_today / targetQty) * 100) : null;
      return {
        lineName: a.lines?.name || a.lines?.line_id || "Unknown",
        poNumber: a.work_orders?.po_number || null,
        buyer: a.work_orders?.buyer || null,
        style: a.work_orders?.style || null,
        targetQty,
        actualQty: a.good_today || 0,
        rejectQty: a.reject_today || 0,
        reworkQty: a.rework_today || 0,
        manpower: a.manpower_actual ?? null,
        hoursActual: a.hours_actual ?? null,
        otHours: a.ot_hours_actual ?? null,
        otManpower: a.ot_manpower_actual ?? null,
        efficiency: eff,
        hasBLocker: a.has_blocker || false,
        blockerDescription: a.blocker_description || null,
        stageName: a.stages?.name || null,
        stageProgress: a.actual_stage_progress ?? null,
        remarks: a.remarks || null,
        submittedAt: a.submitted_at || null,
      };
    });

    const cuttingLines: DailyReportCuttingLine[] = cuttingActuals.map(c => ({
      lineName: c.lines?.name || c.lines?.line_id || "Unknown",
      poNumber: c.work_orders?.po_number || null,
      buyer: c.work_orders?.buyer || null,
      colour: c.colour || null,
      dayCutting: c.day_cutting || 0,
      dayInput: c.day_input || 0,
      totalCutting: c.total_cutting ?? null,
      totalInput: c.total_input ?? null,
      balance: c.balance ?? null,
      orderQty: c.order_qty ?? null,
      manpower: c.man_power ?? null,
      hoursActual: c.hours_actual ?? null,
      otHours: c.ot_hours_actual ?? null,
      otManpower: c.ot_manpower_actual ?? null,
      leftoverRecorded: c.leftover_recorded || false,
      leftoverType: c.leftover_type || null,
      leftoverQuantity: c.leftover_quantity ?? null,
      leftoverNotes: c.leftover_notes || null,
      submittedAt: c.submitted_at || null,
    }));

    const finishingLines: DailyReportFinishingLine[] = finishingDailyLogs.map(log => ({
      poNumber: log.work_orders?.po_number || null,
      buyer: log.work_orders?.buyer || null,
      style: log.work_orders?.style || null,
      logType: log.log_type,
      threadCutting: log.thread_cutting ?? null,
      insideCheck: log.inside_check ?? null,
      topSideCheck: log.top_side_check ?? null,
      buttoning: log.buttoning ?? null,
      iron: log.iron ?? null,
      getUp: log.get_up ?? null,
      poly: log.poly ?? null,
      carton: log.carton ?? null,
      manpower: log.m_power_actual ?? null,
      hours: log.actual_hours ?? null,
      otHours: log.ot_hours_actual ?? null,
      otManpower: log.ot_manpower_actual ?? null,
      cmPerDozen: log.work_orders?.cm_per_dozen ?? null,
      remarks: log.remarks || null,
      submittedAt: log.submitted_at || null,
    }));

    return {
      factoryName: factory?.name || "Factory",
      reportDate: selectedDateStr,
      sewing: sewingLines,
      cutting: cuttingLines,
      finishing: finishingLines,
      headcountCostRate: headcountCost.value ?? null,
      headcountCostCurrency: headcountCost.currency,
      notes: productionNotes,
      financials: financials.hasData ? {
        totalRevenue: financials.totalRevenue,
        totalCostUsd: financials.totalCostUsd,
        totalCostNative: financials.totalCostNative,
        costCurrency: financials.costCurrency,
        profit: financials.profit,
        margin: financials.margin,
        sewingCostUsd: financials.sewingCostUsd,
        cuttingCostUsd: financials.cuttingCostUsd,
        finishingCostUsd: financials.finishingCostUsd,
        bdtToUsdRate: bdtToUsd,
        revenueByPo: financials.revenueByPo,
      } : null,
      generatedBy: profile?.full_name || null,
    };
  }, [sewingActuals, sewingTargets, cuttingActuals, finishingDailyLogs, factory?.name, selectedDateStr, financials, bdtToUsd, profile?.full_name, headcountCost.value, headcountCost.currency, productionNotes]);

  const handleSewingClick = (update: SewingUpdate) => {
    setSewingViewKey(null);
    setSelectedLegacySewing(update);
    setSewingViewOpen(true);
  };

  const handleFinishingClick = (log: FinishingDailyLog) => {
    setSelectedFinishingLog(log);
    setFinishingLogModalOpen(true);
  };

  const handleCuttingClick = (cutting: CuttingActual) => {
    // Find matching target for capacity planning data
    const target = cuttingTargets.find(
      t => t.line_id === cutting.line_id && t.work_order_id === cutting.work_order_id
    );
    
    setSelectedCutting({
      id: cutting.id,
      production_date: cutting.production_date,
      line_id: cutting.line_id,
      work_order_id: cutting.work_order_id,
      line_name: cutting.lines?.name || cutting.lines?.line_id || 'Unknown',
      buyer: (cutting.work_orders as any)?.buyer || null,
      style: (cutting.work_orders as any)?.style || null,
      po_number: (cutting.work_orders as any)?.po_number || null,
      colour: cutting.colour || (cutting.work_orders as any)?.color || null,
      order_qty: cutting.order_qty || (cutting.work_orders as any)?.order_qty || null,
      man_power: target?.man_power || null,
      marker_capacity: target?.marker_capacity || null,
      lay_capacity: target?.lay_capacity || null,
      cutting_capacity: target?.cutting_capacity || null,
      under_qty: target?.under_qty || null,
      day_cutting: cutting.day_cutting,
      total_cutting: cutting.total_cutting,
      day_input: cutting.day_input,
      total_input: cutting.total_input,
      balance: cutting.balance,
      submitted_at: cutting.submitted_at,
      leftover_recorded: cutting.leftover_recorded,
      leftover_type: cutting.leftover_type,
      leftover_unit: cutting.leftover_unit,
      leftover_quantity: cutting.leftover_quantity,
      leftover_notes: cutting.leftover_notes,
      leftover_location: cutting.leftover_location,
      hours_actual: cutting.hours_actual ?? null,
      actual_per_hour: cutting.actual_per_hour ?? null,
      ot_hours_actual: cutting.ot_hours_actual,
      ot_manpower_actual: cutting.ot_manpower_actual,
    });
    setCuttingModalOpen(true);
  };

  const handleCuttingTargetClick = (target: CuttingTargetFull) => {
    setSelectedCuttingTarget(target);
    setCuttingTargetModalOpen(true);
  };

  const handleStorageClick = async (txn: StorageTransaction) => {
    if (!txn.storage_bin_cards?.id) {
      navigate('/storage/history');
      return;
    }

    setStorageLoading(true);
    setStorageModalOpen(true);
    setSelectedGroupedCards(null);

    try {
      // Fetch full bin card details
      const { data: binCardData, error: binCardError } = await supabase
        .from('storage_bin_cards')
        .select('*, work_orders(po_number)')
        .eq('id', txn.storage_bin_cards.id)
        .single();

      if (binCardError) throw binCardError;

      // If this bin card is part of a group, load the full group
      const groupKey = binCardData.po_set_signature || binCardData.bin_group_id;
      if (groupKey) {
        // Query by whichever grouping field is present
        const groupQuery = binCardData.po_set_signature
          ? supabase.from('storage_bin_cards').select('*, work_orders(po_number)').eq('po_set_signature', binCardData.po_set_signature!).order('created_at', { ascending: true })
          : supabase.from('storage_bin_cards').select('*, work_orders(po_number)').eq('bin_group_id', binCardData.bin_group_id!).order('created_at', { ascending: true });

        const { data: groupCards, error: groupError } = await groupQuery;

        if (!groupError && groupCards && groupCards.length > 1) {
          const groupedCardsData = await Promise.all(
            groupCards.map(async (card: any) => {
              const { data: cardTxns } = await supabase
                .from('storage_bin_card_transactions')
                .select('*')
                .eq('bin_card_id', card.id)
                .order('transaction_date', { ascending: true })
                .order('created_at', { ascending: true });

              return {
                binCard: {
                  id: card.id,
                  buyer: card.buyer,
                  style: card.style,
                  po_number: card.work_orders?.po_number || null,
                  supplier_name: card.supplier_name,
                  description: card.description,
                  construction: card.construction,
                  color: card.color,
                  width: card.width,
                  package_qty: card.package_qty,
                  prepared_by: card.prepared_by,
                },
                transactions: cardTxns || [],
              };
            })
          );

          setSelectedGroupedCards({
            groupName: binCardData.group_name || `Bulk (${groupCards.length} POs)`,
            cards: groupedCardsData,
          });
          setSelectedBinCard(null);
          setBinCardTransactions([]);
          setStorageLoading(false);
          return;
        }
      }

      // Single card flow
      const { data: txnData, error: txnError } = await supabase
        .from('storage_bin_card_transactions')
        .select('*')
        .eq('bin_card_id', txn.storage_bin_cards.id)
        .order('transaction_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (txnError) throw txnError;

      setSelectedBinCard({
        id: binCardData.id,
        buyer: binCardData.buyer,
        style: binCardData.style,
        po_number: binCardData.work_orders?.po_number || null,
        supplier_name: binCardData.supplier_name,
        description: binCardData.description,
        construction: binCardData.construction,
        color: binCardData.color,
        width: binCardData.width,
        package_qty: binCardData.package_qty,
        prepared_by: binCardData.prepared_by,
      });
      setBinCardTransactions(txnData || []);
    } catch (error) {
      console.error('Error fetching bin card details:', error);
      setStorageModalOpen(false);
    } finally {
      setStorageLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="py-4 lg:py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            {isToday ? "Today's Updates" : "Updates"}
          </h1>
          <p className="text-muted-foreground">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" className="mt-2 !bg-blue-600 hover:!bg-blue-700 !text-white">
                <CalendarIcon className="h-4 w-4 mr-1.5" />
                {isToday ? "Today" : format(selectedDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                disabled={(date) => date > new Date() || date < subDays(new Date(), 30)}
                initialFocus
              />
              {!isToday && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setSelectedDate(new Date(todayStr + "T00:00:00"))}
                  >
                    Back to Today
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchTodayUpdates}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <ReportExportDialog defaultType="daily" date={selectedDateStr} dailyReportData={dailyReportData} />
        </div>
      </div>

      {/* Summary Cards - Grouped Layout */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Storage */}
        <Card className="relative overflow-hidden border-orange-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-orange-500/0" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Warehouse className="h-4.5 w-4.5 text-orange-600" />
              </div>
              <span className="text-xs font-medium text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded-full">
                {(storageTransactions || []).length} txns
              </span>
            </div>
            <p className="text-2xl font-bold font-mono tracking-tight">{totalStorageReceived.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Received</p>
          </CardContent>
        </Card>

        {/* Cutting */}
        <Card className="relative overflow-hidden border-emerald-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-500/0" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Scissors className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {cuttingTargets.length + cuttingActuals.length} updates
              </span>
            </div>
            <p className="text-2xl font-bold font-mono tracking-tight">{totalCutting.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Cutting Output</p>
          </CardContent>
        </Card>

        {/* Sewing */}
        <Card className="relative overflow-hidden border-primary/20">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/0" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <SewingMachine className="h-4.5 w-4.5 text-primary" />
              </div>
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {sewingUpdates.length + sewingTargets.length + sewingActuals.length} updates
              </span>
            </div>
            <p className="text-2xl font-bold font-mono tracking-tight">{totalOutput.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sewing Output</p>
          </CardContent>
        </Card>

        {/* Finishing */}
        <Card className="relative overflow-hidden border-violet-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-violet-500/0" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Package className="h-4.5 w-4.5 text-violet-600" />
              </div>
              <span className="text-xs font-medium text-violet-600 bg-violet-500/10 px-2 py-0.5 rounded-full">
                {finishingDailyLogs.length} updates
              </span>
            </div>
            <p className="text-2xl font-bold font-mono tracking-tight">{totalFinishingOutput.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Finishing Output</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary */}
      {financials.hasData && (
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-semibold">Daily Financials</span>
              <span className="text-[10px] text-muted-foreground">(USD)</span>
            </div>
            {financials.costCurrency === 'BDT' && bdtToUsd && (
              <span className="text-[10px] text-muted-foreground">
                Rate: {(1 / bdtToUsd).toFixed(1)} BDT/USD
              </span>
            )}
          </div>

          {/* Revenue / Cost / Profit cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="relative overflow-hidden border-emerald-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-500/0" />
              <CardContent className="p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Revenue</p>
                <p className="font-mono text-xl md:text-2xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight">
                  ${financials.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Finishing output</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-red-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-red-500/0" />
              <CardContent className="p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Cost</p>
                <p className="font-mono text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 tracking-tight">
                  ${financials.totalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {financials.costCurrency === 'BDT' && bdtToUsd
                    ? `৳${financials.totalCostNative.toLocaleString()}`
                    : 'All departments'}
                </p>
              </CardContent>
            </Card>

            <Card className={`relative overflow-hidden ${financials.profit >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${financials.profit >= 0 ? 'from-emerald-500/5 to-emerald-500/0' : 'from-red-500/5 to-red-500/0'}`} />
              <CardContent className="p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Profit</p>
                <p className={`font-mono text-xl md:text-2xl font-bold tracking-tight ${financials.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {financials.profit >= 0 ? '+' : '-'}${Math.abs(financials.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {financials.margin !== 0 ? `${financials.margin}% margin` : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Expandable details */}
          <button
            onClick={() => setFinancialsExpanded(!financialsExpanded)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-1.5 transition-colors"
          >
            <span>{financialsExpanded ? 'Hide details' : 'View breakdown'}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${financialsExpanded ? 'rotate-180' : ''}`} />
          </button>

          {financialsExpanded && (
            <Card className="border-blue-500/20">
              <CardContent className="p-4 space-y-4">
                {/* Cost breakdown by department */}
                {financials.totalCostUsd > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wider">Cost Breakdown</p>
                    <div className="space-y-2">
                      {[
                        { label: 'Sewing', value: financials.sewingCostUsd, color: 'bg-blue-500' },
                        { label: 'Cutting', value: financials.cuttingCostUsd, color: 'bg-emerald-500' },
                        { label: 'Finishing', value: financials.finishingCostUsd, color: 'bg-violet-500' },
                      ].filter(d => d.value > 0).map((dept) => (
                        <div key={dept.label} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-16">{dept.label}</span>
                          <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${dept.color}`}
                              style={{ width: `${Math.min((dept.value / financials.totalCostUsd) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-medium w-20 text-right">
                            ${dept.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cost by PO */}
                {financials.costByPo.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wider">Cost by PO</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-1.5 font-medium">PO</th>
                            <th className="text-left py-1.5 font-medium">Buyer</th>
                            <th className="text-right py-1.5 font-medium">Sewing</th>
                            <th className="text-right py-1.5 font-medium">Cutting</th>
                            <th className="text-right py-1.5 font-medium">Finishing</th>
                            <th className="text-right py-1.5 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financials.costByPo.map((row, i) => (
                            <tr key={i} className="border-b border-muted/50">
                              <td className="py-1.5 font-mono">{row.po}</td>
                              <td className="py-1.5">{row.buyer}</td>
                              <td className="py-1.5 text-right font-mono">{row.sewingCost > 0 ? `$${row.sewingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                              <td className="py-1.5 text-right font-mono">{row.cuttingCost > 0 ? `$${row.cuttingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                              <td className="py-1.5 text-right font-mono">{row.finishingCost > 0 ? `$${row.finishingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                              <td className="py-1.5 text-right font-mono font-medium text-red-600 dark:text-red-400">
                                ${row.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Revenue by PO */}
                {financials.revenueByPo.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wider">Revenue by PO</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-1.5 font-medium">PO</th>
                            <th className="text-left py-1.5 font-medium">Buyer</th>
                            <th className="text-right py-1.5 font-medium">Output</th>
                            <th className="text-right py-1.5 font-medium">CM/Dz</th>
                            <th className="text-right py-1.5 font-medium">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financials.revenueByPo.map((row, i) => (
                            <tr key={i} className="border-b border-muted/50">
                              <td className="py-1.5 font-mono">{row.po}</td>
                              <td className="py-1.5">{row.buyer}</td>
                              <td className="py-1.5 text-right font-mono">{row.output.toLocaleString()}</td>
                              <td className="py-1.5 text-right font-mono">${row.cmDz.toFixed(2)}</td>
                              <td className="py-1.5 text-right font-mono font-medium text-emerald-700 dark:text-emerald-400">
                                ${row.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by line or PO..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-max min-w-full md:w-auto">
            <TabsTrigger value="all">All ({sewingUpdates.length + sewingTargets.length + sewingActuals.length + finishingDailyLogs.length + cuttingTargets.length + cuttingActuals.length + (storageTransactions || []).length})</TabsTrigger>
            <TabsTrigger value="storage">Storage ({(storageTransactions || []).length})</TabsTrigger>
            <TabsTrigger value="cutting">Cutting ({cuttingTargets.length + cuttingActuals.length})</TabsTrigger>
            <TabsTrigger value="sewing">Sewing ({sewingUpdates.length + sewingTargets.length + sewingActuals.length})</TabsTrigger>
            <TabsTrigger value="finishing">Finishing ({finishingDailyLogs.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-4 space-y-4">
          {/* Sewing Table */}
          {filteredSewing.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <SewingMachine className="h-4 w-4 text-primary" />
                  Sewing Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Line</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSewing.map((update) => (
                        <TableRow 
                          key={update.id} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSewingClick(update)}
                        >
                          <TableCell className="font-mono text-sm">{update.submitted_at ? formatTime(update.submitted_at) : '-'}</TableCell>
                          <TableCell className="font-medium">{update.lines?.name || update.lines?.line_id}</TableCell>
                          <TableCell>
                            <div>{update.work_orders?.po_number || '-'}</div>
                            {update.work_orders?.buyer && <div className="text-xs text-muted-foreground">{update.work_orders.buyer}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{update.output_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{update.target_qty?.toLocaleString() || '-'}</TableCell>
                          <TableCell className="text-right">
                            {update.target_qty ? (
                              <span className={`font-medium ${(update.output_qty / update.target_qty) >= 1 ? 'text-success' : (update.output_qty / update.target_qty) >= 0.8 ? 'text-warning' : 'text-destructive'}`}>
                                {Math.round((update.output_qty / update.target_qty) * 100)}%
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {update.has_blocker ? (
                              <StatusBadge variant="danger" size="sm">Blocker</StatusBadge>
                            ) : (
                              <StatusBadge variant="success" size="sm">OK</StatusBadge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sewing Targets & Actuals Table - Merged Format */}
          {mergedSewingData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <SewingMachine className="h-4 w-4 text-primary" />
                  Sewing Targets & Actuals
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Line</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Target/hr</TableHead>
                        <TableHead className="text-right">Manpower</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">vs Target</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mergedSewingData.map((item) => {
                        const output = item.actual?.good_today;
                        const target = item.target?.per_hour_target;
                        const manpower = item.actual?.manpower_actual ?? item.target?.manpower_planned;
                        const hasBoth = item.actual && item.target;
                        const hasBlocker = item.actual?.has_blocker;
                        const targetTotal = item.target?.target_total_planned ?? (item.target ? Math.round((item.target.per_hour_target ?? 0) * (item.target.hours_planned ?? 8)) : null);
                        const sewingPct = (output != null && targetTotal != null && targetTotal > 0) ? (output / targetTotal) * 100 : null;
                        return (
                          <TableRow
                            key={item.key}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setSelectedLegacySewing(null);
                              setSewingViewKey(item.key);
                              setSewingViewOpen(true);
                            }}
                          >
                            <TableCell className="font-mono text-sm">{item.submitted_at ? formatTime(item.submitted_at) : '-'}</TableCell>
                            <TableCell className="font-medium">{item.line_name}</TableCell>
                            <TableCell>
                              <div>{item.po_number || '-'}</div>
                              {item.buyer && <div className="text-xs text-muted-foreground">{item.buyer}</div>}
                            </TableCell>
                            <TableCell className="text-right font-mono">{output?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{target?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-right font-mono">{manpower || '-'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {hasBlocker ? (
                                  <StatusBadge variant="danger" size="sm">Blocker</StatusBadge>
                                ) : hasBoth ? (
                                  <StatusBadge variant="success" size="sm">Complete</StatusBadge>
                                ) : item.actual ? (
                                  <StatusBadge variant="warning" size="sm">No Target</StatusBadge>
                                ) : (
                                  <StatusBadge variant="info" size="sm">Target Only</StatusBadge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{renderPct(sewingPct)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Finishing Table - Merged Format */}
          {mergedFinishingData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-info" />
                  Finishing Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Output (Poly)</TableHead>
                        <TableHead className="text-right">Target (Poly)</TableHead>
                        <TableHead className="text-right">Output (Carton)</TableHead>
                        <TableHead className="text-right">Target (Carton)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">vs Target</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mergedFinishingData.map((item, idx) => {
                        const outputPoly = item.output ? effectivePoly(item.output.poly, item.output.actual_hours, item.output.ot_hours_actual) : 0;
                        const outputCarton = item.output ? effectiveCarton(item.output.carton, item.output.actual_hours, item.output.ot_hours_actual) : 0;
                        const targetPoly = item.target?.poly || 0;
                        const targetCarton = item.target?.carton || 0;
                        const hasOutput = outputPoly > 0 || outputCarton > 0;
                        // target.poly/carton are per-hour rates; multiply by planned hours for total
                        const targetHours = (item.target?.planned_hours ?? 0) + (item.target?.ot_hours_planned ?? 0);
                        const targetPolyTotal = targetPoly * targetHours;
                        const targetCartonTotal = targetCarton * targetHours;
                        // Performance % uses poly as primary metric
                        const hasTarget = targetPolyTotal > 0;
                        const finishingPct = hasTarget ? (outputPoly / targetPolyTotal) * 100 : null;
                        return (
                          <TableRow
                            key={`finishing-merged-${idx}`}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => item.output && handleFinishingClick(item.output)}
                          >
                            <TableCell className="font-mono text-sm">{formatTime(item.submitted_at)}</TableCell>
                            <TableCell>
                              <div>{item.po_number || '-'}</div>
                              {(item.output?.work_orders?.buyer || item.target?.work_orders?.buyer) && (
                                <div className="text-xs text-muted-foreground">{item.output?.work_orders?.buyer || item.target?.work_orders?.buyer}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">{outputPoly.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{targetPoly.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{outputCarton.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{targetCarton.toLocaleString()}</TableCell>
                            <TableCell>
                              {hasOutput && hasTarget ? (
                                <StatusBadge variant="success" size="sm">Complete</StatusBadge>
                              ) : hasOutput ? (
                                <StatusBadge variant="warning" size="sm">No Target</StatusBadge>
                              ) : (
                                <StatusBadge variant="info" size="sm">Target Only</StatusBadge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{renderPct(finishingPct)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cutting Table - Merged Format */}
          {mergedCuttingData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-emerald-600" />
                  Cutting Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Line</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Manpower</TableHead>
                        <TableHead className="text-right">Day Input</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">vs Target</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mergedCuttingData.map((item, idx) => {
                        const dayCutting = item.actual?.day_cutting;
                        const cuttingCapacity = item.target?.cutting_capacity;
                        const manpower = item.target?.man_power;
                        const dayInput = item.actual?.day_input;
                        const hasActual = dayCutting !== null && dayCutting !== undefined;
                        const hasTarget = cuttingCapacity !== null && cuttingCapacity !== undefined && cuttingCapacity > 0;
                        const cuttingPct = hasActual && hasTarget ? (dayCutting! / cuttingCapacity!) * 100 : null;
                        return (
                          <TableRow
                            key={`cutting-merged-${idx}`}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => item.actual && handleCuttingClick(item.actual)}
                          >
                            <TableCell className="font-mono text-sm">{item.submitted_at ? formatTime(item.submitted_at) : '-'}</TableCell>
                            <TableCell className="font-medium">{item.line_name}</TableCell>
                            <TableCell>
                              <div>{item.po_number || '-'}</div>
                              {item.buyer && <div className="text-xs text-muted-foreground">{item.buyer}</div>}
                            </TableCell>
                            <TableCell className="text-right font-mono">{dayCutting?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{cuttingCapacity?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-right font-mono">{manpower || '-'}</TableCell>
                            <TableCell className="text-right font-mono">{dayInput?.toLocaleString() || '-'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {hasActual && hasTarget ? (
                                  <StatusBadge variant="success" size="sm">Complete</StatusBadge>
                                ) : hasActual ? (
                                  <StatusBadge variant="warning" size="sm">No Target</StatusBadge>
                                ) : (
                                  <StatusBadge variant="info" size="sm">Target Only</StatusBadge>
                                )}
                                {item.actual?.leftover_recorded && (
                                  <StatusBadge variant="warning" size="sm">Left Over</StatusBadge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{renderPct(cuttingPct)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Storage Table */}
          {filteredStorage.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-orange-600" />
                  Storage Transactions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>PO / Group</TableHead>
                        <TableHead>Style</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Issued</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedStorageRows.map((row) => (
                        <>
                          <TableRow
                            key={row.groupKey}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => row.isGroup ? handleStorageClick(row.transactions[0]) : handleStorageClick(row.transactions[0])}
                          >
                            <TableCell className="font-mono text-sm">{row.latestTime ? formatTime(row.latestTime) : '-'}</TableCell>
                            <TableCell>
                              {row.isGroup ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="p-0.5 rounded hover:bg-muted"
                                    onClick={(e) => { e.stopPropagation(); toggleStorageGroup(row.groupKey); }}
                                  >
                                    {expandedStorageGroups.has(row.groupKey) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                  </button>
                                  <span className="font-medium text-primary">{row.groupName}</span>
                                  <span className="text-xs text-muted-foreground ml-1">({row.transactions.length} POs)</span>
                                </span>
                              ) : (
                                <>
                                  {row.transactions[0].storage_bin_cards?.work_orders?.po_number || '-'}
                                  {row.transactions[0].batch_id && <span title="Bulk submission"><Layers className="h-3 w-3 inline ml-1 text-muted-foreground" /></span>}
                                </>
                              )}
                            </TableCell>
                            <TableCell>{row.style || '-'}</TableCell>
                            <TableCell className="text-right font-mono text-success">{row.totalReceived > 0 ? `+${row.totalReceived.toLocaleString()}` : '-'}</TableCell>
                            <TableCell className="text-right font-mono text-destructive">{row.totalIssued > 0 ? `-${row.totalIssued.toLocaleString()}` : '-'}</TableCell>
                            <TableCell className="text-right font-mono font-medium">{row.totalBalance.toLocaleString()}</TableCell>
                          </TableRow>
                          {row.isGroup && expandedStorageGroups.has(row.groupKey) && row.transactions.map(txn => (
                            <TableRow
                              key={txn.id}
                              className="cursor-pointer hover:bg-muted/50 bg-muted/20"
                              onClick={() => handleStorageClick(txn)}
                            >
                              <TableCell className="font-mono text-sm pl-8">{txn.created_at ? formatTime(txn.created_at) : '-'}</TableCell>
                              <TableCell className="pl-8 text-muted-foreground">{txn.storage_bin_cards?.work_orders?.po_number || '-'}</TableCell>
                              <TableCell>{txn.storage_bin_cards?.style || '-'}</TableCell>
                              <TableCell className="text-right font-mono text-success">{txn.receive_qty > 0 ? `+${txn.receive_qty.toLocaleString()}` : '-'}</TableCell>
                              <TableCell className="text-right font-mono text-destructive">{txn.issue_qty > 0 ? `-${txn.issue_qty.toLocaleString()}` : '-'}</TableCell>
                              <TableCell className="text-right font-mono font-medium">{txn.balance_qty.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {filteredSewing.length === 0 && mergedSewingData.length === 0 && filteredFinishing.length === 0 && filteredCutting.length === 0 && filteredStorage.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No updates found for today</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sewing" className="mt-4 space-y-4">
          {/* Old sewing updates */}
          {filteredSewing.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <SewingMachine className="h-4 w-4 text-primary" />
                  Sewing Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Line</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Manpower</TableHead>
                        <TableHead className="text-right">Progress</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">vs Target</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSewing.map((update) => {
                        const oldSewingPct = update.target_qty && update.target_qty > 0 ? (update.output_qty / update.target_qty) * 100 : null;
                        return (
                        <TableRow
                          key={update.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSewingClick(update)}
                        >
                          <TableCell className="font-mono text-sm">{update.submitted_at ? formatTime(update.submitted_at) : '-'}</TableCell>
                          <TableCell className="font-medium">{update.lines?.name || update.lines?.line_id}</TableCell>
                          <TableCell>
                            <div>{update.work_orders?.po_number || '-'}</div>
                            {update.work_orders?.buyer && <div className="text-xs text-muted-foreground">{update.work_orders.buyer}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">{update.output_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{update.target_qty?.toLocaleString() || '-'}</TableCell>
                          <TableCell className="text-right">{update.manpower || '-'}</TableCell>
                          <TableCell className="text-right">{update.stage_progress ? `${update.stage_progress}%` : '-'}</TableCell>
                          <TableCell>
                            {update.has_blocker ? (
                              <StatusBadge variant="danger" size="sm">Blocker</StatusBadge>
                            ) : (
                              <StatusBadge variant="success" size="sm">OK</StatusBadge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{renderPct(oldSewingPct)}</TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* New sewing targets & actuals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <SewingMachine className="h-4 w-4 text-primary" />
                Sewing Targets & Actuals
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Line</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead className="text-right">Output</TableHead>
                      <TableHead className="text-right">Target/hr</TableHead>
                      <TableHead className="text-right">Reject</TableHead>
                      <TableHead className="text-right">Manpower</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">vs Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mergedSewingData.map((item) => {
                      const output = item.actual?.good_today;
                      const target = item.target?.per_hour_target;
                      const reject = item.actual?.reject_today;
                      const manpower = item.actual?.manpower_actual ?? item.target?.manpower_planned;
                      const hasBoth = item.actual && item.target;
                      const hasBlocker = item.actual?.has_blocker;
                      const targetTotal = item.target?.target_total_planned ?? (item.target ? Math.round((item.target.per_hour_target ?? 0) * (item.target.hours_planned ?? 8)) : null);
                      const sewingTabPct = (output != null && targetTotal != null && targetTotal > 0) ? (output / targetTotal) * 100 : null;
                      return (
                        <TableRow
                          key={item.key}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedLegacySewing(null);
                            setSewingViewKey(item.key);
                            setSewingViewOpen(true);
                          }}
                        >
                          <TableCell className="font-mono text-sm">{item.submitted_at ? formatTime(item.submitted_at) : '-'}</TableCell>
                          <TableCell className="font-medium">{item.line_name}</TableCell>
                          <TableCell>
                            <div>{item.po_number || '-'}</div>
                            {item.buyer && <div className="text-xs text-muted-foreground">{item.buyer}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">{output?.toLocaleString() || '-'}</TableCell>
                          <TableCell className="text-right font-mono">{target?.toLocaleString() || '-'}</TableCell>
                          <TableCell className="text-right font-mono">{reject?.toLocaleString() || '-'}</TableCell>
                          <TableCell className="text-right">{manpower || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              {hasBlocker ? (
                                <StatusBadge variant="danger" size="sm">Blocker</StatusBadge>
                              ) : hasBoth ? (
                                <StatusBadge variant="success" size="sm">Complete</StatusBadge>
                              ) : item.actual ? (
                                <StatusBadge variant="warning" size="sm">No Target</StatusBadge>
                              ) : (
                                <StatusBadge variant="info" size="sm">Target Only</StatusBadge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{renderPct(sewingTabPct)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredSewing.length === 0 && mergedSewingData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No sewing updates today
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finishing" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-violet-600" />
                Finishing Targets & Outputs
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Output (Poly)</TableHead>
                        <TableHead className="text-right">Target (Poly)</TableHead>
                        <TableHead className="text-right">Output (Carton)</TableHead>
                        <TableHead className="text-right">Target (Carton)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">vs Target</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mergedFinishingData.map((row) => {
                        const outputPoly = row.output ? effectivePoly(row.output.poly, row.output.actual_hours, row.output.ot_hours_actual) : 0;
                        const targetPoly = row.target?.poly || 0;
                        const outputCarton = row.output ? effectiveCarton(row.output.carton, row.output.actual_hours, row.output.ot_hours_actual) : 0;
                        const targetCarton = row.target?.carton || 0;
                        // Performance % uses poly as primary metric
                        const finTabHours = (row.target?.planned_hours ?? 0) + (row.target?.ot_hours_planned ?? 0);
                        const finTabPolyTarget = targetPoly * finTabHours;
                        const finTabPct = finTabPolyTarget > 0 ? (outputPoly / finTabPolyTarget) * 100 : null;
                        return (
                          <TableRow
                            key={row.key}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => row.output ? handleFinishingClick(row.output) : row.target && handleFinishingClick(row.target)}
                          >
                            <TableCell className="font-mono text-sm">{formatTime(row.submitted_at)}</TableCell>
                            <TableCell>
                              <div>{row.po_number || '-'}</div>
                              {(row.output?.work_orders?.buyer || row.target?.work_orders?.buyer) && (
                                <div className="text-xs text-muted-foreground">{row.output?.work_orders?.buyer || row.target?.work_orders?.buyer}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">{outputPoly.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{targetPoly > 0 ? targetPoly.toLocaleString() : '-'}</TableCell>
                            <TableCell className="text-right font-mono font-bold">{outputCarton.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{targetCarton > 0 ? targetCarton.toLocaleString() : '-'}</TableCell>
                            <TableCell>
                              {row.output && row.target ? (
                                <StatusBadge variant="success" size="sm">Complete</StatusBadge>
                              ) : row.output ? (
                                <StatusBadge variant="warning" size="sm">No Target</StatusBadge>
                              ) : (
                                <StatusBadge variant="info" size="sm">Target Only</StatusBadge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{renderPct(finTabPct)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {mergedFinishingData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No finishing logs today
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cutting" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Scissors className="h-4 w-4 text-emerald-600" />
                Cutting Targets & Actuals
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Line</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead className="text-right">Output</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Manpower</TableHead>
                      <TableHead className="text-right">Day Input</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">vs Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mergedCuttingData.map((row) => {
                      const output = row.actual?.day_cutting || 0;
                      const target = row.target?.cutting_capacity || 0;
                      const manpower = row.target?.man_power || 0;
                      const dayInput = row.actual?.day_input || 0;
                      const cutTabPct = (output > 0 && target > 0) ? (output / target) * 100 : null;
                      return (
                        <TableRow
                          key={row.key}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => row.actual ? handleCuttingClick(row.actual) : row.target && handleCuttingTargetClick(row.target)}
                        >
                          <TableCell className="font-mono text-sm">{row.submitted_at ? formatTime(row.submitted_at) : '-'}</TableCell>
                          <TableCell className="font-medium">{row.line_name}</TableCell>
                          <TableCell>
                            <div>{row.po_number || '-'}</div>
                            {row.buyer && <div className="text-xs text-muted-foreground">{row.buyer}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">{output.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{target > 0 ? target.toLocaleString() : '-'}</TableCell>
                          <TableCell className="text-right">{manpower || '-'}</TableCell>
                          <TableCell className="text-right font-mono">{dayInput > 0 ? dayInput.toLocaleString() : '-'}</TableCell>
                          <TableCell>
                            {row.actual && row.target ? (
                              <StatusBadge variant="success" size="sm">Complete</StatusBadge>
                            ) : row.actual ? (
                              <StatusBadge variant="warning" size="sm">No Target</StatusBadge>
                            ) : (
                              <StatusBadge variant="info" size="sm">Target Only</StatusBadge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{renderPct(cutTabPct)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {mergedCuttingData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No cutting submissions today
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-orange-600" />
                Storage Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>PO / Group</TableHead>
                      <TableHead>Style</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Issued</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedStorageRows.map((row) => (
                      <>
                        <TableRow
                          key={row.groupKey}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => row.isGroup ? handleStorageClick(row.transactions[0]) : handleStorageClick(row.transactions[0])}
                        >
                          <TableCell className="font-mono text-sm">{row.latestTime ? formatTime(row.latestTime) : '-'}</TableCell>
                          <TableCell>
                            {row.isGroup ? (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  className="p-0.5 rounded hover:bg-muted"
                                  onClick={(e) => { e.stopPropagation(); toggleStorageGroup(row.groupKey); }}
                                >
                                  {expandedStorageGroups.has(row.groupKey) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                </button>
                                <span className="font-medium text-primary">{row.groupName}</span>
                                <span className="text-xs text-muted-foreground ml-1">({row.transactions.length} POs)</span>
                              </span>
                            ) : (
                              <>
                                {row.transactions[0].storage_bin_cards?.work_orders?.po_number || '-'}
                                {row.transactions[0].batch_id && <span title="Bulk submission"><Layers className="h-3 w-3 inline ml-1 text-muted-foreground" /></span>}
                              </>
                            )}
                          </TableCell>
                          <TableCell>{row.style || '-'}</TableCell>
                          <TableCell className="text-right font-mono text-success">{row.totalReceived > 0 ? `+${row.totalReceived.toLocaleString()}` : '-'}</TableCell>
                          <TableCell className="text-right font-mono text-destructive">{row.totalIssued > 0 ? `-${row.totalIssued.toLocaleString()}` : '-'}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{row.totalBalance.toLocaleString()}</TableCell>
                        </TableRow>
                        {row.isGroup && expandedStorageGroups.has(row.groupKey) && row.transactions.map(txn => (
                          <TableRow
                            key={txn.id}
                            className="cursor-pointer hover:bg-muted/50 bg-muted/20"
                            onClick={() => handleStorageClick(txn)}
                          >
                            <TableCell className="font-mono text-sm pl-8">{txn.created_at ? formatTime(txn.created_at) : '-'}</TableCell>
                            <TableCell className="pl-8 text-muted-foreground">{txn.storage_bin_cards?.work_orders?.po_number || '-'}</TableCell>
                            <TableCell>{txn.storage_bin_cards?.style || '-'}</TableCell>
                            <TableCell className="text-right font-mono text-success">{txn.receive_qty > 0 ? `+${txn.receive_qty.toLocaleString()}` : '-'}</TableCell>
                            <TableCell className="text-right font-mono text-destructive">{txn.issue_qty > 0 ? `-${txn.issue_qty.toLocaleString()}` : '-'}</TableCell>
                            <TableCell className="text-right font-mono font-medium">{txn.balance_qty.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))}
                    {groupedStorageRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No storage transactions today
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sewing Submission View */}
      {(() => {
        const item = sewingViewKey ? mergedSewingData.find(m => m.key === sewingViewKey) : null;
        let sewingTarget: SewingTargetData | null = null;
        let sewingActual: SewingActualData | null = null;

        if (item?.target) {
          const t = item.target;
          sewingTarget = {
            id: t.id,
            production_date: t.production_date,
            line_name: item.line_name,
            po_number: item.po_number,
            buyer: item.buyer,
            style: item.style,
            order_qty: null,
            submitted_at: t.submitted_at,
            per_hour_target: t.per_hour_target,
            manpower_planned: t.manpower_planned,
            ot_hours_planned: t.ot_hours_planned,
            hours_planned: t.hours_planned ?? null,
            target_total_planned: t.target_total_planned ?? null,
            stage_name: t.stages?.name || null,
            planned_stage_progress: t.planned_stage_progress,
            next_milestone: t.next_milestone,
            estimated_ex_factory: t.estimated_ex_factory,
            remarks: t.remarks,
          };
        }

        if (item?.actual) {
          const a = item.actual;
          sewingActual = {
            id: a.id,
            production_date: a.production_date,
            line_name: item.line_name,
            po_number: item.po_number,
            buyer: item.buyer,
            style: item.style,
            order_qty: null,
            submitted_at: a.submitted_at,
            good_today: a.good_today,
            reject_today: a.reject_today,
            rework_today: a.rework_today,
            cumulative_good_total: a.cumulative_good_total,
            manpower_actual: a.manpower_actual,
            ot_hours_actual: a.ot_hours_actual,
            ot_manpower_actual: a.ot_manpower_actual,
            hours_actual: a.hours_actual ?? null,
            actual_per_hour: a.actual_per_hour ?? null,
            stage_name: a.stages?.name || null,
            actual_stage_progress: a.actual_stage_progress,
            remarks: a.remarks,
            has_blocker: a.has_blocker,
            blocker_description: a.blocker_description,
            blocker_impact: a.blocker_impact,
            blocker_owner: a.blocker_owner,
            blocker_status: null,
            estimated_cost_value: (a as any).estimated_cost_value ?? null,
            estimated_cost_currency: (a as any).estimated_cost_currency ?? null,
          };
        }

        // Legacy sewing_updates fallback (old single-form data)
        if (!item && selectedLegacySewing) {
          const u = selectedLegacySewing;
          sewingActual = {
            id: u.id,
            production_date: u.production_date,
            line_name: u.lines?.name || u.lines?.line_id || "Unknown",
            po_number: u.work_orders?.po_number || null,
            buyer: u.work_orders?.buyer || null,
            style: u.work_orders?.style || null,
            order_qty: null,
            submitted_at: u.submitted_at,
            good_today: u.output_qty,
            reject_today: u.reject_qty || 0,
            rework_today: u.rework_qty || 0,
            cumulative_good_total: 0,
            manpower_actual: u.manpower || 0,
            ot_hours_actual: u.ot_hours || 0,
            ot_manpower_actual: u.ot_manpower || null,
            hours_actual: null,
            actual_per_hour: null,
            stage_name: null,
            actual_stage_progress: u.stage_progress,
            remarks: u.notes,
            has_blocker: u.has_blocker ?? false,
            blocker_description: u.blocker_description,
            blocker_impact: u.blocker_impact,
            blocker_owner: u.blocker_owner,
            blocker_status: u.blocker_status,
            estimated_cost_value: (u as any).estimated_cost_value ?? null,
            estimated_cost_currency: (u as any).estimated_cost_currency ?? null,
          };
        }

        return (
          <SewingSubmissionView
            target={sewingTarget}
            actual={sewingActual}
            open={sewingViewOpen}
            onOpenChange={setSewingViewOpen}
          />
        );
      })()}

      {/* Cutting Detail Modal */}
      {(() => {
        const matchingTarget = selectedCutting
          ? cuttingTargets.find(t =>
              t.line_id === selectedCutting.line_id &&
              t.work_order_id === selectedCutting.work_order_id
            )
          : null;
        return (
          <CuttingSubmissionView
            target={matchingTarget ? {
              id: matchingTarget.id,
              production_date: matchingTarget.production_date,
              line_name: matchingTarget.lines?.name || matchingTarget.lines?.line_id || 'Unknown',
              buyer: matchingTarget.work_orders?.buyer || matchingTarget.buyer || null,
              style: matchingTarget.work_orders?.style || matchingTarget.style || null,
              po_number: matchingTarget.work_orders?.po_number || matchingTarget.po_no || null,
              colour: matchingTarget.colour || null,
              order_qty: matchingTarget.order_qty || null,
              submitted_at: matchingTarget.submitted_at,
              man_power: matchingTarget.man_power,
              marker_capacity: matchingTarget.marker_capacity,
              lay_capacity: matchingTarget.lay_capacity,
              cutting_capacity: matchingTarget.cutting_capacity,
              under_qty: matchingTarget.under_qty,
              day_cutting: matchingTarget.day_cutting,
              day_input: matchingTarget.day_input,
              hours_planned: matchingTarget.hours_planned ?? null,
              target_per_hour: matchingTarget.target_per_hour ?? null,
              ot_hours_planned: matchingTarget.ot_hours_planned,
              ot_manpower_planned: matchingTarget.ot_manpower_planned,
            } : null}
            actual={selectedCutting ? {
              id: selectedCutting.id,
              production_date: selectedCutting.production_date,
              line_name: selectedCutting.line_name || 'Unknown',
              buyer: selectedCutting.buyer || null,
              style: selectedCutting.style || null,
              po_number: selectedCutting.po_number || null,
              colour: selectedCutting.colour || null,
              order_qty: selectedCutting.order_qty || null,
              submitted_at: selectedCutting.submitted_at,
              man_power: selectedCutting.man_power,
              marker_capacity: selectedCutting.marker_capacity,
              lay_capacity: selectedCutting.lay_capacity,
              cutting_capacity: selectedCutting.cutting_capacity,
              under_qty: selectedCutting.under_qty,
              day_cutting: selectedCutting.day_cutting,
              day_input: selectedCutting.day_input,
              total_cutting: selectedCutting.total_cutting,
              total_input: selectedCutting.total_input,
              balance: selectedCutting.balance,
              hours_actual: selectedCutting.hours_actual ?? null,
              actual_per_hour: selectedCutting.actual_per_hour ?? null,
              ot_hours_actual: selectedCutting.ot_hours_actual,
              ot_manpower_actual: selectedCutting.ot_manpower_actual,
              leftover_recorded: selectedCutting.leftover_recorded,
              leftover_type: selectedCutting.leftover_type,
              leftover_unit: selectedCutting.leftover_unit,
              leftover_quantity: selectedCutting.leftover_quantity,
              leftover_notes: selectedCutting.leftover_notes,
              leftover_location: selectedCutting.leftover_location,
              leftover_photo_urls: selectedCutting.leftover_photo_urls ?? null,
            } : null}
            open={cuttingModalOpen}
            onOpenChange={setCuttingModalOpen}
          />
        );
      })()}

      {/* Storage Bin Card Detail Modal */}
      <StorageBinCardDetailModal
        binCard={selectedBinCard}
        transactions={binCardTransactions}
        open={storageModalOpen}
        onOpenChange={(open) => {
          setStorageModalOpen(open);
          if (!open) setSelectedGroupedCards(null);
        }}
        groupedCards={selectedGroupedCards}
      />

      {/* Finishing Log Detail Modal */}
      {(() => {
        const counterpart = selectedFinishingLog
          ? finishingDailyLogs.find(l =>
              l.log_type !== selectedFinishingLog.log_type &&
              l.production_date === selectedFinishingLog.production_date &&
              l.work_order_id === selectedFinishingLog.work_order_id
            )
          : null;

        const targetLog = selectedFinishingLog?.log_type === 'TARGET' ? selectedFinishingLog
          : counterpart?.log_type === 'TARGET' ? counterpart
          : null;

        const actualLog = selectedFinishingLog?.log_type === 'OUTPUT' ? selectedFinishingLog
          : counterpart?.log_type === 'OUTPUT' ? counterpart
          : null;

        const target: FinishingTargetData | null = targetLog ? {
          id: targetLog.id,
          production_date: targetLog.production_date,
          submitted_at: targetLog.submitted_at,
          po_number: targetLog.work_orders?.po_number ?? null,
          buyer: targetLog.work_orders?.buyer ?? null,
          style: targetLog.work_orders?.style ?? null,
          thread_cutting: targetLog.thread_cutting || 0,
          inside_check: targetLog.inside_check || 0,
          top_side_check: targetLog.top_side_check || 0,
          buttoning: targetLog.buttoning || 0,
          iron: targetLog.iron || 0,
          get_up: targetLog.get_up || 0,
          poly: targetLog.poly || 0,
          carton: targetLog.carton || 0,
          m_power_planned: targetLog.m_power_planned ?? null,
          planned_hours: targetLog.planned_hours ?? null,
          ot_hours_planned: targetLog.ot_hours_planned ?? null,
          ot_manpower_planned: targetLog.ot_manpower_planned ?? null,
          remarks: targetLog.remarks ?? null,
        } : null;

        const actual: FinishingActualData | null = actualLog ? {
          id: actualLog.id,
          production_date: actualLog.production_date,
          submitted_at: actualLog.submitted_at,
          po_number: actualLog.work_orders?.po_number ?? null,
          buyer: actualLog.work_orders?.buyer ?? null,
          style: actualLog.work_orders?.style ?? null,
          thread_cutting: actualLog.thread_cutting || 0,
          inside_check: actualLog.inside_check || 0,
          top_side_check: actualLog.top_side_check || 0,
          buttoning: actualLog.buttoning || 0,
          iron: actualLog.iron || 0,
          get_up: actualLog.get_up || 0,
          poly: actualLog.poly || 0,
          carton: actualLog.carton || 0,
          m_power_actual: actualLog.m_power_actual ?? null,
          actual_hours: actualLog.actual_hours ?? null,
          ot_hours_actual: actualLog.ot_hours_actual ?? null,
          ot_manpower_actual: actualLog.ot_manpower_actual ?? null,
          remarks: actualLog.remarks ?? null,
        } : null;

        return (
          <FinishingSubmissionView
            target={target}
            actual={actual}
            open={finishingLogModalOpen}
            onOpenChange={setFinishingLogModalOpen}
          />
        );
      })()}

      {/* Cutting Target Detail Modal */}
      {(() => {
        const matchingActual = selectedCuttingTarget
          ? cuttingActuals.find(a =>
              a.line_id === selectedCuttingTarget.line_id &&
              a.work_order_id === selectedCuttingTarget.work_order_id
            )
          : null;
        return (
          <CuttingSubmissionView
            target={selectedCuttingTarget ? {
              id: selectedCuttingTarget.id,
              production_date: selectedCuttingTarget.production_date,
              line_name: selectedCuttingTarget.lines?.name || selectedCuttingTarget.lines?.line_id || 'Unknown',
              buyer: selectedCuttingTarget.work_orders?.buyer || selectedCuttingTarget.buyer || null,
              style: selectedCuttingTarget.work_orders?.style || selectedCuttingTarget.style || null,
              po_number: selectedCuttingTarget.work_orders?.po_number || selectedCuttingTarget.po_no || null,
              colour: selectedCuttingTarget.colour || null,
              order_qty: selectedCuttingTarget.order_qty || null,
              submitted_at: selectedCuttingTarget.submitted_at,
              man_power: selectedCuttingTarget.man_power,
              marker_capacity: selectedCuttingTarget.marker_capacity,
              lay_capacity: selectedCuttingTarget.lay_capacity,
              cutting_capacity: selectedCuttingTarget.cutting_capacity,
              under_qty: selectedCuttingTarget.under_qty,
              day_cutting: selectedCuttingTarget.day_cutting,
              day_input: selectedCuttingTarget.day_input,
              hours_planned: selectedCuttingTarget.hours_planned ?? null,
              target_per_hour: selectedCuttingTarget.target_per_hour ?? null,
              ot_hours_planned: selectedCuttingTarget.ot_hours_planned ?? null,
              ot_manpower_planned: selectedCuttingTarget.ot_manpower_planned ?? null,
            } : null}
            actual={matchingActual ? {
              id: matchingActual.id,
              production_date: matchingActual.production_date,
              line_name: matchingActual.lines?.name || matchingActual.lines?.line_id || 'Unknown',
              buyer: matchingActual.work_orders?.buyer || null,
              style: matchingActual.work_orders?.style || null,
              po_number: matchingActual.work_orders?.po_number || null,
              colour: matchingActual.colour || null,
              order_qty: matchingActual.order_qty || null,
              submitted_at: matchingActual.submitted_at,
              man_power: matchingActual.man_power,
              marker_capacity: matchingActual.marker_capacity,
              lay_capacity: matchingActual.lay_capacity,
              cutting_capacity: matchingActual.cutting_capacity,
              under_qty: matchingActual.under_qty,
              day_cutting: matchingActual.day_cutting,
              day_input: matchingActual.day_input,
              total_cutting: matchingActual.total_cutting,
              total_input: matchingActual.total_input,
              balance: matchingActual.balance,
              hours_actual: matchingActual.hours_actual ?? null,
              actual_per_hour: matchingActual.actual_per_hour ?? null,
              ot_hours_actual: matchingActual.ot_hours_actual,
              ot_manpower_actual: matchingActual.ot_manpower_actual,
              leftover_recorded: matchingActual.leftover_recorded,
              leftover_type: matchingActual.leftover_type,
              leftover_unit: matchingActual.leftover_unit,
              leftover_quantity: matchingActual.leftover_quantity,
              leftover_notes: matchingActual.leftover_notes,
              leftover_location: matchingActual.leftover_location,
              leftover_photo_urls: matchingActual.leftover_photo_urls ?? null,
            } : null}
            open={cuttingTargetModalOpen}
            onOpenChange={setCuttingTargetModalOpen}
          />
        );
      })()}

    </div>
  );
}
