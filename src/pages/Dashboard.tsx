import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { formatTimeInTimezone, getTodayInTimezone } from "@/lib/date-utils";
import { useMidnightRefresh } from "@/hooks/useMidnightRefresh";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmissionDetailModal } from "@/components/SubmissionDetailModal";
import { TargetDetailModal } from "@/components/TargetDetailModal";
import { CuttingSubmissionView } from "@/components/CuttingSubmissionView";
import { SewingSubmissionView, SewingTargetData, SewingActualData } from "@/components/SewingSubmissionView";
import { StorageBinCardDetailModal } from "@/components/StorageBinCardDetailModal";
import { StageDashboardSection } from "@/components/dashboard/StageDashboardSection";
import { FinishingSubmissionView, FinishingTargetData, FinishingActualData } from "@/components/FinishingSubmissionView";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { useOnboarding } from "@/contexts/OnboardingContext";
import {
  Package,
  Warehouse,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  Plus,
  ClipboardCheck,
  Scissors,
  Target,
  Layers,
  LayoutDashboard,
  DollarSign,
} from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { NotesPanel } from "@/components/production-notes/NotesPanel";
import { NoteFormDialog } from "@/components/production-notes/NoteFormDialog";
import type { NoteDepartment } from "@/hooks/useProductionNotes";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { motion } from "framer-motion";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

interface DashboardStats {
  updatesToday: number;
  blockersToday: number;
  daySewingOutput: number;
  dayFinishingOutput: number;
  totalLines: number;
  activeWorkOrders: number;
  avgEfficiency: number;
}

interface TargetSubmission {
  id: string;
  type: 'sewing' | 'finishing';
  line_uuid: string;
  line_id: string;
  line_name: string;
  work_order_id: string;
  po_number: string | null;
  buyer: string | null;
  style: string | null;
  per_hour_target: number;
  manpower_planned?: number | null;
  m_power_planned?: number | null;
  ot_hours_planned?: number | null;
  hours_planned?: number | null;
  day_hour_planned?: number | null;
  day_over_time_planned?: number | null;
  stage_name?: string | null;
  planned_stage_progress?: number | null;
  next_milestone?: string | null;
  estimated_ex_factory?: string | null;
  order_qty?: number | null;
  remarks?: string | null;
  target_total_planned?: number | null;
  submitted_at: string | null;
  production_date: string;
}

interface EndOfDaySubmission {
  id: string;
  type: 'sewing' | 'finishing';
  line_uuid: string;
  line_id: string;
  line_name: string;
  output: number;
  submitted_at: string;
  production_date: string;
  has_blocker: boolean;
  blocker_description: string | null;
  blocker_impact: string | null;
  blocker_owner: string | null;
  blocker_status: string | null;
  po_number: string | null;
  buyer: string | null;
  style: string | null;
  // Sewing specific
  target_qty?: number | null;
  manpower?: number | null;
  reject_qty?: number | null;
  rework_qty?: number | null;
  stage_name?: string | null;
  stage_progress?: number | null;
  ot_hours?: number | null;
  ot_manpower?: number | null;
  hours_actual?: number | null;
  notes?: string | null;
  work_order_id?: string;
  cumulative_good_total?: number | null;
  actual_stage_progress?: number | null;
  actual_per_hour?: number | null;
  order_qty?: number | null;
  estimated_cost_value?: number | null;
  estimated_cost_currency?: string | null;
  cm_per_dozen?: number | null;
  // Finishing daily sheet specific
  hours_logged?: number;
  total_poly?: number;
  total_carton?: number;
}

interface LineInfo {
  id: string;
  line_id: string;
  name: string | null;
}

interface ActiveBlocker {
  id: string;
  type: 'sewing' | 'finishing';
  description: string;
  impact: string;
  line_name: string;
  created_at: string;
}

interface CuttingTarget {
  id: string;
  production_date: string;
  line_id: string;
  line_name: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  po_number: string | null;
  colour: string | null;
  order_qty: number | null;
  man_power: number;
  marker_capacity: number;
  lay_capacity: number;
  cutting_capacity: number;
  under_qty: number | null;
  day_cutting: number;
  day_input: number;
  submitted_at: string | null;
  ot_hours_planned: number | null;
  ot_manpower_planned: number | null;
  hours_planned: number | null;
  target_per_hour: number | null;
}

interface CuttingSubmission {
  id: string;
  production_date: string;
  line_id: string;
  line_name: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  po_number: string | null;
  colour: string | null;
  order_qty: number | null;
  man_power: number | null;
  marker_capacity: number | null;
  lay_capacity: number | null;
  cutting_capacity: number | null;
  under_qty: number | null;
  day_cutting: number;
  total_cutting: number | null;
  day_input: number;
  total_input: number | null;
  balance: number | null;
  submitted_at: string | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  hours_actual: number | null;
  leftover_recorded: boolean | null;
  leftover_type: string | null;
  leftover_unit: string | null;
  leftover_quantity: number | null;
  leftover_notes: string | null;
  leftover_location: string | null;
  leftover_photo_urls: string[] | null;
  actual_per_hour: number | null;
  cm_per_dozen: number | null;
}

interface StorageBinCard {
  id: string;
  buyer: string | null;
  style: string | null;
  po_number: string | null;
  supplier_name: string | null;
  description: string | null;
  construction: string | null;
  color: string | null;
  width: string | null;
  package_qty: string | null;
  prepared_by: string | null;
  transactions: StorageTransaction[];
  transaction_count: number;
  latest_balance: number;
  bin_group_id: string | null;
  group_name: string | null;
  po_set_signature: string | null;
}

interface StorageTransaction {
  id: string;
  transaction_date: string;
  receive_qty: number;
  issue_qty: number;
  ttl_receive: number;
  balance_qty: number;
  remarks: string | null;
  created_at: string | null;
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { profile, factory, isAdminOrHigher, hasRole, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    updatesToday: 0,
    blockersToday: 0,
    daySewingOutput: 0,
    dayFinishingOutput: 0,
    totalLines: 0,
    activeWorkOrders: 0,
    avgEfficiency: 0,
  });
  const [departmentTab, setDepartmentTab] = useState<'sewing' | 'finishing' | 'cutting' | 'storage'>('sewing');
  const [sewingTargets, setSewingTargets] = useState<TargetSubmission[]>([]);
  const [finishingTargets, setFinishingTargets] = useState<TargetSubmission[]>([]);
  const [sewingEndOfDay, setSewingEndOfDay] = useState<EndOfDaySubmission[]>([]);
  const [finishingEndOfDay, setFinishingEndOfDay] = useState<EndOfDaySubmission[]>([]);
  const [cuttingTargets, setCuttingTargets] = useState<CuttingTarget[]>([]);
  const [cuttingSubmissions, setCuttingSubmissions] = useState<CuttingSubmission[]>([]);
  const [storageBinCards, setStorageBinCards] = useState<StorageBinCard[]>([]);
  const [allLines, setAllLines] = useState<LineInfo[]>([]);
  const [activeBlockers, setActiveBlockers] = useState<ActiveBlocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [selectedTarget, setSelectedTarget] = useState<TargetSubmission | null>(null);
  const [selectedCutting, setSelectedCutting] = useState<CuttingSubmission | null>(null);
  const [selectedCuttingTarget, setSelectedCuttingTarget] = useState<CuttingTarget | null>(null);
  const [selectedBinCard, setSelectedBinCard] = useState<StorageBinCard | null>(null);
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [sewingViewOpen, setSewingViewOpen] = useState(false);
  const [sewingViewSource, setSewingViewSource] = useState<{ type: 'actual' | 'target'; id: string } | null>(null);
  const [cuttingModalOpen, setCuttingModalOpen] = useState(false);
  const [cuttingTargetModalOpen, setCuttingTargetModalOpen] = useState(false);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [finishingDailyLogs, setFinishingDailyLogs] = useState<any[]>([]);
  const [finishingViewOpen, setFinishingViewOpen] = useState(false);
  const [finishingViewId, setFinishingViewId] = useState<string | null>(null);
  const [selectedGroupedCards, setSelectedGroupedCards] = useState<{
    groupName: string;
    cards: {
      binCard: { id: string; buyer: string | null; style: string | null; po_number: string | null; supplier_name: string | null; description: string | null; construction: string | null; color: string | null; width: string | null; package_qty: string | null; prepared_by: string | null };
      transactions: StorageTransaction[];
    }[];
  } | null>(null);

  const [kpiNoteOpen, setKpiNoteOpen] = useState(false);
  const [kpiNoteDept, setKpiNoteDept] = useState<NoteDepartment | null>(null);

  const canViewDashboard = isAdminOrHigher();
  const onboarding = useOnboarding();
  const { headcountCost, isConfigured: costConfigured, getCurrencySymbol } = useHeadcountCost();

  // BDT→USD exchange rate
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const json = await res.json();
        if (!cancelled && json?.rates?.BDT) {
          setBdtToUsd(1 / json.rates.BDT); // BDT→USD = 1 / (USD→BDT)
        }
      } catch {
        // Fallback rate if API fails
        if (!cancelled) setBdtToUsd(1 / 121);
      }
    }
    fetchRate();
    return () => { cancelled = true; };
  }, []);

  // Sewing-only daily cost (native currency)
  const totalDayCost = useMemo(() => {
    if (!costConfigured || !headcountCost.value) return null;
    const rate = headcountCost.value;
    let total = 0;
    sewingEndOfDay.forEach((s) => {
      if (s.manpower && s.hours_actual) total += rate * s.manpower * s.hours_actual;
      if (s.ot_manpower && s.ot_hours) total += rate * s.ot_manpower * s.ot_hours;
    });
    return Math.round(total * 100) / 100;
  }, [costConfigured, headcountCost.value, sewingEndOfDay]);

  // Sewing value (USD): output × (cm_per_dozen × 0.70) / 12
  const dayRevenue = useMemo(() => {
    let total = 0;
    let hasCm = false;
    sewingEndOfDay.forEach((s) => {
      if (s.cm_per_dozen && s.output) {
        total += (s.cm_per_dozen * 0.70 / 12) * s.output;
        hasCm = true;
      }
    });
    return hasCm ? Math.round(total * 100) / 100 : null;
  }, [sewingEndOfDay]);

  // Sewing profit = sewing value (USD) − sewing cost (USD)
  const dayProfit = useMemo(() => {
    if (dayRevenue == null || totalDayCost == null) return null;
    const costCurrency = headcountCost.currency;
    let costInUsd = totalDayCost;
    if (costCurrency === 'BDT' && bdtToUsd) {
      costInUsd = totalDayCost * bdtToUsd;
    }
    return Math.round((dayRevenue - costInUsd) * 100) / 100;
  }, [dayRevenue, totalDayCost, headcountCost.currency, bdtToUsd]);

  useEffect(() => {
    if (authLoading) return;
    if (!profile?.factory_id || canViewDashboard) return;

    // Users without dashboard access should go to their module home.
    if (hasRole("cutting")) {
      navigate("/cutting/submissions", { replace: true });
      return;
    }

    if (hasRole("storage")) {
      navigate("/storage", { replace: true });
      return;
    }

    navigate("/sewing/morning-targets", { replace: true });
  }, [authLoading, profile?.factory_id, canViewDashboard, navigate, hasRole]);

  useEffect(() => {
    if (profile?.factory_id && canViewDashboard) {
      fetchDashboardData();
    }
  }, [profile?.factory_id, canViewDashboard]);

  // Auto-refresh at midnight (factory timezone) and on tab refocus
  useMidnightRefresh(useCallback(() => {
    if (profile?.factory_id && canViewDashboard) {
      fetchDashboardData();
    }
  }, [profile?.factory_id, canViewDashboard]));

  if (authLoading || (!canViewDashboard && profile?.factory_id)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // DEMO MODE: add ?demo=true to URL to show fake submissions
  const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';

  async function fetchDashboardData() {
    if (!profile?.factory_id) return;

    setLoading(true);
    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

    try {
      // Fetch all dashboard data in parallel for maximum performance
      const [
        linesResult,
        sewingTargetsResult,
        finishingTargetsResult,
        sewingActualsResult,
        finishingDailyLogsResult,
        cuttingTargetsResult,
        cuttingActualsResult,
        binCardsResult,
        storageTransactionsResult,
        sewingBlockersCountResult,
        finishingBlockersCountResult,
        linesCountResult,
        workOrdersCountResult,
      ] = await Promise.all([
        // Fetch all active lines
        supabase
          .from('lines')
          .select('id, line_id, name')
          .eq('factory_id', profile.factory_id)
          .eq('is_active', true)
          .order('line_id'),

        // Fetch sewing targets
        supabase
          .from('sewing_targets')
          .select('*, stages:planned_stage_id(name), lines(id, line_id, name), work_orders(po_number, buyer, style)', { count: 'exact' })
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),

        // Fetch finishing targets
        supabase
          .from('finishing_targets')
          .select('*, lines(id, line_id, name), work_orders(po_number, buyer, style)', { count: 'exact' })
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),

        // Fetch sewing end of day (actuals)
        supabase
          .from('sewing_actuals')
          .select('*, stages:actual_stage_id(name), lines(id, line_id, name), work_orders(po_number, buyer, style, order_qty, cm_per_dozen)', { count: 'exact' })
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),

        // Fetch finishing daily logs
        supabase
          .from('finishing_daily_logs')
          .select('*, lines(id, line_id, name), work_orders(po_number, buyer, style, cm_per_dozen)', { count: 'exact' })
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),

        // Fetch cutting targets
        supabase
          .from('cutting_targets')
          .select('*, lines(id, line_id, name), work_orders(po_number, buyer, style, color)', { count: 'exact' })
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),

        // Fetch cutting actuals
        supabase
          .from('cutting_actuals')
          .select('*, lines!cutting_actuals_line_id_fkey(id, line_id, name), work_orders(po_number, buyer, style, color, cm_per_dozen)', { count: 'exact' })
          .eq('factory_id', profile.factory_id)
          .eq('production_date', today)
          .order('submitted_at', { ascending: false }),

        // Fetch storage bin cards
        supabase
          .from('storage_bin_cards')
          .select('*, work_orders(po_number, buyer, style), storage_bin_card_transactions(*)')
          .eq('factory_id', profile.factory_id)
          .order('updated_at', { ascending: false })
          .limit(20),

        // Count storage transactions from today
        supabase
          .from('storage_bin_card_transactions')
          .select('*', { count: 'exact', head: true })
          .gte('transaction_date', today)
          .lte('transaction_date', today),

        // Blocker counts
        supabase
          .from('production_updates_sewing')
          .select('*', { count: 'exact', head: true })
          .eq('factory_id', profile.factory_id)
          .eq('has_blocker', true)
          .neq('blocker_status', 'resolved'),

        supabase
          .from('production_updates_finishing')
          .select('*', { count: 'exact', head: true })
          .eq('factory_id', profile.factory_id)
          .eq('has_blocker', true)
          .neq('blocker_status', 'resolved'),

        // Active lines count
        supabase
          .from('lines')
          .select('*', { count: 'exact', head: true })
          .eq('factory_id', profile.factory_id)
          .eq('is_active', true),

        // Work orders count
        supabase
          .from('work_orders')
          .select('*', { count: 'exact', head: true })
          .eq('factory_id', profile.factory_id)
          .eq('is_active', true),
      ]);

      const { data: linesData } = linesResult;
      const { data: sewingTargetsData, count: sewingTargetsCount } = sewingTargetsResult;
      const { data: finishingTargetsData, count: finishingTargetsCount } = finishingTargetsResult;
      const { data: sewingActualsData, count: sewingCount } = sewingActualsResult;
      const { data: finishingDailyLogsData, count: finishingCount } = finishingDailyLogsResult;
      const { data: cuttingTargetsData, count: cuttingTargetsCount } = cuttingTargetsResult;
      const { data: cuttingActualsData, count: cuttingActualsCount } = cuttingActualsResult;
      const { data: binCardsData } = binCardsResult;
      const { count: storageTransactionsCount } = storageTransactionsResult;
      const { count: sewingBlockersCount } = sewingBlockersCountResult;
      const { count: finishingBlockersCount } = finishingBlockersCountResult;
      const { count: linesCount } = linesCountResult;
      const { count: workOrdersCount } = workOrdersCountResult;

      // Format sewing targets
      const formattedSewingTargets: TargetSubmission[] = (sewingTargetsData || []).map(t => ({
        id: t.id,
        type: 'sewing' as const,
        line_uuid: t.line_id,
        line_id: t.lines?.line_id || 'Unknown',
        line_name: t.lines?.name || t.lines?.line_id || 'Unknown',
        work_order_id: t.work_order_id,
        po_number: t.work_orders?.po_number || null,
        buyer: t.work_orders?.buyer || null,
        style: t.work_orders?.style || null,
        per_hour_target: t.per_hour_target,
        manpower_planned: t.manpower_planned,
        ot_hours_planned: t.ot_hours_planned,
        hours_planned: t.hours_planned ?? null,
        target_total_planned: t.target_total_planned ?? null,
        stage_name: t.stages?.name || null,
        planned_stage_progress: t.planned_stage_progress,
        next_milestone: t.next_milestone,
        estimated_ex_factory: t.estimated_ex_factory,
        order_qty: t.order_qty,
        remarks: t.remarks,
        submitted_at: t.submitted_at,
        production_date: t.production_date,
      }));

      // Format finishing targets
      const formattedFinishingTargets: TargetSubmission[] = (finishingTargetsData || []).map(t => ({
        id: t.id,
        type: 'finishing' as const,
        line_uuid: t.line_id,
        line_id: t.lines?.line_id || 'Unknown',
        line_name: t.lines?.name || t.lines?.line_id || 'Unknown',
        work_order_id: t.work_order_id,
        po_number: t.work_orders?.po_number || null,
        buyer: t.work_orders?.buyer || null,
        style: t.work_orders?.style || null,
        per_hour_target: t.per_hour_target,
        m_power_planned: t.m_power_planned,
        day_hour_planned: t.day_hour_planned,
        day_over_time_planned: t.day_over_time_planned,
        order_qty: t.order_qty,
        remarks: t.remarks,
        submitted_at: t.submitted_at,
        production_date: t.production_date,
      }));

      // Format sewing end of day
      // Filter out blocker-only submissions (good_today = 0 with has_blocker = true)
      // These are standalone blocker reports and should only appear in the Blockers section
      const formattedSewingEOD: EndOfDaySubmission[] = (sewingActualsData || [])
        .filter(u => {
          // Exclude blocker-only submissions (no actual production data)
          const isBlockerOnly = u.good_today === 0 && u.has_blocker === true;
          return !isBlockerOnly;
        })
        .map(u => ({
          id: u.id,
          type: 'sewing' as const,
          line_uuid: u.line_id,
          line_id: u.lines?.line_id || 'Unknown',
          line_name: u.lines?.name || u.lines?.line_id || 'Unknown',
          output: u.good_today,
          submitted_at: u.submitted_at || '',
          production_date: u.production_date,
          has_blocker: u.has_blocker || false,
          blocker_description: u.blocker_description,
          blocker_impact: u.blocker_impact,
          blocker_owner: u.blocker_owner,
          blocker_status: null, // sewing_actuals doesn't have blocker_status
          po_number: u.work_orders?.po_number || null,
          buyer: u.work_orders?.buyer || null,
          style: u.work_orders?.style || null,
          target_qty: null, // Not in sewing_actuals
          manpower: u.manpower_actual,
          reject_qty: u.reject_today,
          rework_qty: u.rework_today,
          stage_name: u.stages?.name || null,
          stage_progress: u.actual_stage_progress,
          ot_hours: u.ot_hours_actual,
          ot_manpower: u.ot_manpower_actual ?? null,
          hours_actual: u.hours_actual ?? null,
          notes: u.remarks,
          work_order_id: u.work_order_id,
          cumulative_good_total: u.cumulative_good_total,
          actual_stage_progress: u.actual_stage_progress,
          actual_per_hour: u.actual_per_hour ?? null,
          order_qty: u.work_orders?.order_qty ?? null,
          estimated_cost_value: u.estimated_cost_value ?? null,
          estimated_cost_currency: u.estimated_cost_currency ?? null,
          cm_per_dozen: u.work_orders?.cm_per_dozen ?? null,
        }));

      // Format finishing daily logs (OUTPUT type only for end of day)
      const finishingOutputLogs = (finishingDailyLogsData || []).filter((log: any) => log.log_type === 'OUTPUT');
      const formattedFinishingEOD: EndOfDaySubmission[] = finishingOutputLogs.map((log: any) => {
        return {
          id: log.id,
          type: 'finishing' as const,
          line_uuid: log.line_id,
          line_id: log.lines?.line_id || 'Unknown',
          line_name: log.lines?.name || log.lines?.line_id || 'Unknown',
          output: log.poly || 0,
          submitted_at: log.submitted_at,
          production_date: log.production_date,
          has_blocker: false,
          blocker_description: null,
          blocker_impact: null,
          blocker_owner: null,
          blocker_status: null,
          po_number: log.work_orders?.po_number || null,
          buyer: log.work_orders?.buyer || null,
          style: log.work_orders?.style || null,
          hours_logged: 0,
          total_poly: log.poly || 0,
          total_carton: log.carton || 0,
          cm_per_dozen: log.work_orders?.cm_per_dozen ?? null,
        };
      });

      // Format cutting targets
      const formattedCuttingTargets: CuttingTarget[] = (cuttingTargetsData || []).map((c: any) => ({
        id: c.id,
        production_date: c.production_date,
        line_id: c.line_id,
        line_name: c.lines?.name || c.lines?.line_id || 'Unknown',
        work_order_id: c.work_order_id,
        buyer: c.work_orders?.buyer || c.buyer || null,
        style: c.work_orders?.style || c.style || null,
        po_number: c.work_orders?.po_number || c.po_no || null,
        colour: c.work_orders?.color || c.colour || null,
        order_qty: c.order_qty,
        man_power: c.man_power || 0,
        marker_capacity: c.marker_capacity || 0,
        lay_capacity: c.lay_capacity || 0,
        cutting_capacity: c.cutting_capacity || 0,
        under_qty: c.under_qty || null,
        day_cutting: c.day_cutting || 0,
        day_input: c.day_input || 0,
        submitted_at: c.submitted_at,
        ot_hours_planned: c.ot_hours_planned ?? null,
        ot_manpower_planned: c.ot_manpower_planned ?? null,
        hours_planned: c.hours_planned ?? null,
        target_per_hour: c.target_per_hour ?? null,
      }));

      // Format cutting submissions (actuals)
      const formattedCutting: CuttingSubmission[] = (cuttingActualsData || []).map((c: any) => ({
        id: c.id,
        production_date: c.production_date,
        line_id: c.line_id,
        line_name: c.lines?.name || c.lines?.line_id || 'Unknown',
        work_order_id: c.work_order_id,
        buyer: c.work_orders?.buyer || c.buyer || null,
        style: c.work_orders?.style || c.style || null,
        po_number: c.work_orders?.po_number || c.po_no || null,
        colour: c.work_orders?.color || c.colour || null,
        order_qty: c.order_qty,
        man_power: c.man_power || null,
        marker_capacity: c.marker_capacity || null,
        lay_capacity: c.lay_capacity || null,
        cutting_capacity: c.cutting_capacity || null,
        under_qty: c.under_qty || null,
        day_cutting: c.day_cutting,
        total_cutting: c.total_cutting,
        day_input: c.day_input,
        total_input: c.total_input,
        balance: c.balance,
        submitted_at: c.submitted_at,
        ot_hours_actual: c.ot_hours_actual ?? null,
        ot_manpower_actual: c.ot_manpower_actual ?? null,
        hours_actual: c.hours_actual ?? null,
        leftover_recorded: c.leftover_recorded || null,
        leftover_type: c.leftover_type || null,
        leftover_unit: c.leftover_unit || null,
        leftover_quantity: c.leftover_quantity || null,
        leftover_notes: c.leftover_notes || null,
        leftover_location: c.leftover_location || null,
        leftover_photo_urls: c.leftover_photo_urls ?? null,
        actual_per_hour: c.actual_per_hour ?? null,
        cm_per_dozen: c.work_orders?.cm_per_dozen ?? null,
      }));

      // Format storage bin cards
      const allFormattedBinCards: (StorageBinCard & { hasTodayTransactions: boolean })[] = (binCardsData || [])
        .map((b: any) => {
          const allTransactions = (b.storage_bin_card_transactions || []).sort(
            (a: any, b: any) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
          );
          const todayTransactions = allTransactions.filter(
            (t: any) => t.transaction_date === today
          );
          const latestBalance = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1].balance_qty : 0;

          return {
            id: b.id,
            buyer: b.work_orders?.buyer || b.buyer || null,
            style: b.work_orders?.style || b.style || null,
            po_number: b.work_orders?.po_number || null,
            supplier_name: b.supplier_name,
            description: b.description,
            construction: b.construction,
            color: b.color,
            width: b.width,
            package_qty: b.package_qty,
            prepared_by: b.prepared_by,
            bin_group_id: b.bin_group_id || null,
            group_name: b.group_name || null,
            po_set_signature: b.po_set_signature || null,
            transactions: allTransactions.map((t: any) => ({
              id: t.id,
              transaction_date: t.transaction_date,
              receive_qty: t.receive_qty,
              issue_qty: t.issue_qty,
              ttl_receive: t.ttl_receive,
              balance_qty: t.balance_qty,
              remarks: t.remarks,
              created_at: t.created_at,
              batch_id: t.batch_id || null,
            })),
            transaction_count: todayTransactions.length,
            latest_balance: latestBalance,
            hasTodayTransactions: todayTransactions.length > 0,
          };
        });

      // Include cards with today's transactions + all group members where any member has today's transactions
      const todayGroupKeys = new Set(
        allFormattedBinCards
          .filter(b => b.hasTodayTransactions && (b.po_set_signature || b.bin_group_id))
          .map(b => (b.po_set_signature || b.bin_group_id)!)
      );
      const formattedBinCards: StorageBinCard[] = allFormattedBinCards.filter(
        b => b.hasTodayTransactions || ((b.po_set_signature || b.bin_group_id) && todayGroupKeys.has((b.po_set_signature || b.bin_group_id)!))
      );

      // Fetch active blockers from production_updates tables (same source as Blockers page)
      const [sewingBlockersData, finishingBlockersData] = await Promise.all([
        supabase
          .from('production_updates_sewing')
          .select('id, blocker_description, blocker_impact, submitted_at, blocker_status, lines(line_id, name)')
          .eq('factory_id', profile.factory_id)
          .eq('has_blocker', true)
          .neq('blocker_status', 'resolved')
          .order('submitted_at', { ascending: false })
          .limit(5),
        supabase
          .from('production_updates_finishing')
          .select('id, blocker_description, blocker_impact, submitted_at, blocker_status, lines(line_id, name)')
          .eq('factory_id', profile.factory_id)
          .eq('has_blocker', true)
          .neq('blocker_status', 'resolved')
          .order('submitted_at', { ascending: false })
          .limit(5),
      ]);

      const blockers: ActiveBlocker[] = [];
      sewingBlockersData.data?.forEach(u => {
        blockers.push({
          id: u.id,
          type: 'sewing',
          description: u.blocker_description || 'No description',
          impact: u.blocker_impact || 'medium',
          line_name: u.lines?.name || u.lines?.line_id || 'Unknown',
          created_at: u.submitted_at || '',
        });
      });
      finishingBlockersData.data?.forEach(u => {
        blockers.push({
          id: u.id,
          type: 'finishing',
          description: u.blocker_description || 'No description',
          impact: u.blocker_impact || 'medium',
          line_name: u.lines?.name || u.lines?.line_id || 'Unknown',
          created_at: u.submitted_at || '',
        });
      });
      // Sort by date and limit to 5
      blockers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      blockers.splice(5);

      // Calculate daily sewing output (using good_today from sewing_actuals)
      const daySewingOutput = (sewingActualsData || []).reduce((sum: number, u: any) => sum + (u.good_today || 0), 0);

      // Calculate daily finishing output (poly per hour × total hours)
      // Calculate daily finishing output (poly is the primary finishing metric)
      const dayFinishingOutput = (finishingDailyLogsData || [])
        .filter((log: any) => log.log_type === 'OUTPUT')
        .reduce((sum: number, log: any) => sum + (log.poly || 0), 0);

      setStats({
        updatesToday: (sewingTargetsCount || 0) + (sewingCount || 0) + (finishingTargetsCount || 0) + (finishingCount || 0) + (cuttingTargetsCount || 0) + (cuttingActualsCount || 0) + (storageTransactionsCount || 0),
        blockersToday: (sewingBlockersCount || 0) + (finishingBlockersCount || 0),
        daySewingOutput,
        dayFinishingOutput,
        totalLines: linesCount || 0,
        activeWorkOrders: workOrdersCount || 0,
        avgEfficiency: 0,
      });

      
      setSewingTargets(formattedSewingTargets);
      setFinishingTargets(formattedFinishingTargets);
      setSewingEndOfDay(formattedSewingEOD);
      setFinishingEndOfDay(formattedFinishingEOD);
      setCuttingTargets(formattedCuttingTargets);
      setCuttingSubmissions(formattedCutting);
      setStorageBinCards(formattedBinCards);
      setAllLines(linesData || []);
      setFinishingDailyLogs(finishingDailyLogsData || []);
      setActiveBlockers(blockers.slice(0, 5));

      // ── DEMO DATA INJECTION (remove later) ──
      if (isDemoMode && (formattedSewingEOD.length === 0 || formattedSewingTargets.length === 0)) {
        const now = new Date().toISOString();
        const demoLines = (linesData || []).slice(0, 6);
        const lineNames = demoLines.length > 0
          ? demoLines.map(l => ({ id: l.id, line_id: l.line_id, name: l.name || l.line_id }))
          : [
              { id: 'demo-1', line_id: 'L-01', name: 'Line 1' },
              { id: 'demo-2', line_id: 'L-02', name: 'Line 2' },
              { id: 'demo-3', line_id: 'L-03', name: 'Line 3' },
              { id: 'demo-4', line_id: 'L-04', name: 'Line 4' },
              { id: 'demo-5', line_id: 'L-05', name: 'Line 5' },
              { id: 'demo-6', line_id: 'L-06', name: 'Line 6' },
            ];

        const demoBuyers = ['Buyer 1', 'Buyer 2', 'Buyer 3', 'Buyer 4', 'Buyer 5', 'Buyer 6'];
        const demoStyles = ['ST-2241', 'ST-3387', 'ST-1190', 'ST-4456', 'ST-5521', 'ST-7718'];
        const demoPOs = ['PO-90021', 'PO-90034', 'PO-90047', 'PO-90053', 'PO-90068', 'PO-90071'];

        // Sewing targets
        const demoSewingTargets: TargetSubmission[] = lineNames.map((ln, i) => ({
          id: `demo-st-${i}`,
          type: 'sewing' as const,
          line_uuid: ln.id,
          line_id: ln.line_id,
          line_name: ln.name,
          work_order_id: `demo-wo-${i}`,
          po_number: demoPOs[i % demoPOs.length],
          buyer: demoBuyers[i % demoBuyers.length],
          style: demoStyles[i % demoStyles.length],
          per_hour_target: [55, 62, 48, 70, 58, 65][i % 6],
          manpower_planned: [32, 28, 35, 30, 26, 33][i % 6],
          ot_hours_planned: i % 3 === 0 ? 2 : 0,
          hours_planned: 8,
          target_total_planned: [440, 496, 384, 560, 464, 520][i % 6],
          stage_name: null,
          planned_stage_progress: null,
          next_milestone: null,
          estimated_ex_factory: null,
          order_qty: [12000, 8500, 15000, 6000, 9200, 11000][i % 6],
          remarks: null,
          submitted_at: now,
          production_date: today,
        }));

        // Sewing actuals
        const demoSewingEOD: EndOfDaySubmission[] = lineNames.map((ln, i) => {
          const output = [423, 510, 367, 548, 445, 492][i % 6];
          return {
            id: `demo-sa-${i}`,
            type: 'sewing' as const,
            line_uuid: ln.id,
            line_id: ln.line_id,
            line_name: ln.name,
            output,
            submitted_at: now,
            production_date: today,
            has_blocker: i === 2,
            blocker_description: i === 2 ? 'Machine breakdown on station 7 - needle bar issue' : null,
            blocker_impact: i === 2 ? 'medium' : null,
            blocker_owner: i === 2 ? 'Maintenance' : null,
            blocker_status: null,
            po_number: demoPOs[i % demoPOs.length],
            buyer: demoBuyers[i % demoBuyers.length],
            style: demoStyles[i % demoStyles.length],
            target_qty: null,
            manpower: [30, 27, 34, 29, 25, 31][i % 6],
            reject_qty: [3, 5, 8, 2, 4, 6][i % 6],
            rework_qty: [7, 4, 12, 3, 9, 5][i % 6],
            stage_name: null,
            stage_progress: null,
            ot_hours: i % 3 === 0 ? 2 : 0,
            ot_manpower: i % 3 === 0 ? 28 : 0,
            hours_actual: 8,
            notes: i === 0 ? 'Production running smoothly' : null,
            work_order_id: `demo-wo-${i}`,
            cumulative_good_total: output + [3200, 4100, 2800, 5600, 1900, 3800][i % 6],
            actual_stage_progress: null,
            actual_per_hour: Math.round(output / 8),
          };
        });

        // Finishing targets (use first 4 lines)
        const finLines = lineNames.slice(0, 4);
        const demoFinTargets: TargetSubmission[] = finLines.map((ln, i) => ({
          id: `demo-ft-${i}`,
          type: 'finishing' as const,
          line_uuid: ln.id,
          line_id: ln.line_id,
          line_name: ln.name,
          work_order_id: `demo-wo-${i}`,
          po_number: demoPOs[i],
          buyer: demoBuyers[i],
          style: demoStyles[i],
          per_hour_target: [75, 82, 68, 90][i],
          m_power_planned: [22, 18, 25, 20][i],
          day_hour_planned: 8,
          day_over_time_planned: i === 0 ? 2 : 0,
          order_qty: [12000, 8500, 15000, 6000][i],
          remarks: null,
          submitted_at: now,
          production_date: today,
        }));

        // Finishing EOD (daily logs OUTPUT)
        const demoFinEOD: EndOfDaySubmission[] = finLines.map((ln, i) => {
          const poly = [580, 640, 520, 710][i];
          return {
            id: `demo-fa-${i}`,
            type: 'finishing' as const,
            line_uuid: ln.id,
            line_id: ln.line_id,
            line_name: ln.name,
            output: poly,
            submitted_at: now,
            production_date: today,
            has_blocker: false,
            blocker_description: null,
            blocker_impact: null,
            blocker_owner: null,
            blocker_status: null,
            po_number: demoPOs[i],
            buyer: demoBuyers[i],
            style: demoStyles[i],
            hours_logged: 8,
            total_poly: poly,
            total_carton: Math.floor(poly / 12),
          };
        });

        const totalSewOutput = demoSewingEOD.reduce((s, e) => s + e.output, 0);
        const totalFinOutput = demoFinEOD.reduce((s, e) => s + e.output, 0);

        setSewingTargets(demoSewingTargets);
        setFinishingTargets(demoFinTargets);
        setSewingEndOfDay(demoSewingEOD);
        setFinishingEndOfDay(demoFinEOD);
        if (linesData) setAllLines(linesData);
        setActiveBlockers([{
          id: 'demo-b-1',
          type: 'sewing',
          description: 'Machine breakdown on station 7 - needle bar issue',
          impact: 'medium',
          line_name: lineNames[2].name,
          created_at: now,
        }]);
        setStats(prev => ({
          ...prev,
          updatesToday: demoSewingTargets.length + demoSewingEOD.length + demoFinTargets.length + demoFinEOD.length,
          blockersToday: 1,
          daySewingOutput: totalSewOutput,
          dayFinishingOutput: totalFinOutput,
        }));
      }
      // ── END DEMO DATA ──
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatTime = (dateString: string) => {
    // Use factory timezone for display
    const timezone = factory?.timezone || "Asia/Dhaka";
    return formatTimeInTimezone(dateString, timezone);
  };

  if (!canViewDashboard) {
    return null;
  }

  // Derive finishing daily targets from finishing_daily_logs TARGET entries
  // These map to the same shape as TargetSubmission so StageDashboardSection can display them
  const finishingDailyTargets = useMemo(() => {
    return finishingDailyLogs
      .filter((log: any) => log.log_type === 'TARGET')
      .map((log: any) => ({
        id: log.id,
        type: 'finishing' as const,
        line_uuid: log.line_id,
        line_id: log.lines?.line_id || 'Unknown',
        line_name: log.lines?.name || log.lines?.line_id || 'Unknown',
        work_order_id: log.work_order_id,
        po_number: log.work_orders?.po_number || null,
        buyer: log.work_orders?.buyer || null,
        style: log.work_orders?.style || null,
        per_hour_target: log.poly || 0, // poly is the primary finishing metric
        submitted_at: log.submitted_at,
        production_date: log.production_date,
        // Extra fields for rendering
        _poly: log.poly || 0,
        _carton: log.carton || 0,
        _planned_hours: log.planned_hours || 0,
        _ot_hours_planned: log.ot_hours_planned || 0,
      }));
  }, [finishingDailyLogs]);

  // Group storage bin cards by po_set_signature or bin_group_id for display
  const storageDisplayItems = useMemo(() => {
    const groupMap = new Map<string, StorageBinCard[]>();
    const ungrouped: StorageBinCard[] = [];

    for (const card of storageBinCards) {
      const key = card.po_set_signature || card.bin_group_id || null;
      if (key) {
        const existing = groupMap.get(key);
        if (existing) {
          existing.push(card);
        } else {
          groupMap.set(key, [card]);
        }
      } else {
        ungrouped.push(card);
      }
    }

    const items: { type: 'single' | 'group'; key: string; cards: StorageBinCard[]; poNumbers: string[]; groupName: string | null; buyer: string; style: string; totalBalance: number; transactionCount: number }[] = [];

    for (const [groupId, cards] of groupMap) {
      const uniqueBuyers = [...new Set(cards.map(c => c.buyer).filter(Boolean))];
      const uniqueStyles = [...new Set(cards.map(c => c.style).filter(Boolean))];
      items.push({
        type: cards.length > 1 ? 'group' : 'single',
        key: groupId,
        cards,
        poNumbers: cards.map(c => c.po_number).filter(Boolean) as string[],
        groupName: cards[0].group_name,
        buyer: cards[0].group_name || (uniqueBuyers.length === 1 ? uniqueBuyers[0]! : uniqueBuyers.length > 1 ? 'Mixed' : 'No buyer'),
        style: uniqueStyles.length === 1 ? uniqueStyles[0]! : uniqueStyles.length > 1 ? 'Mixed' : 'No style',
        totalBalance: cards.reduce((sum, c) => sum + c.latest_balance, 0),
        transactionCount: cards.reduce((sum, c) => sum + c.transaction_count, 0),
      });
    }

    for (const card of ungrouped) {
      items.push({
        type: 'single',
        key: card.id,
        cards: [card],
        poNumbers: [card.po_number].filter(Boolean) as string[],
        groupName: null,
        buyer: card.buyer || 'No buyer',
        style: card.style || 'No style',
        totalBalance: card.latest_balance,
        transactionCount: card.transaction_count,
      });
    }

    return items;
  }, [storageBinCards]);

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6 overflow-x-hidden">
      {/* Onboarding Checklist */}
      {onboarding.visible && (
        <OnboardingChecklist
          steps={onboarding.steps}
          completedCount={onboarding.completedCount}
          totalCount={onboarding.totalCount}
          onDismiss={onboarding.dismiss}
        />
      )}

      {/* KPI Cards */}
      <motion.div
        className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
        data-tour="dashboard-kpis"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {/* Updates Today + Financials sub-card */}
        <motion.div variants={fadeUp}>
          {(() => {
            const showFinancials = (dayRevenue != null) || (costConfigured && totalDayCost != null);
            return (
              <>
                <Link to="/today" className="block">
                  <div className={`relative overflow-hidden ${showFinancials ? 'rounded-t-xl' : 'rounded-xl'} border bg-emerald-50 dark:bg-emerald-950/30 p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5`}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('dashboard.updatesToday')}</p>
                        <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight">
                          <AnimatedNumber value={stats.updatesToday} />
                        </p>
                        <p className="text-[10px] md:text-xs text-muted-foreground">{stats.totalLines} {t('dashboard.linesTracked')}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-500/10 p-2.5">
                        <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>
                  </div>
                </Link>
                {showFinancials && (
                  <div className="rounded-b-xl border border-t-0 bg-blue-50/80 dark:bg-blue-950/20 px-3 py-2 space-y-1">
                    {dayRevenue != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] md:text-xs text-muted-foreground">Sewing Value</span>
                        <span className="font-mono text-xs md:text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                          ${dayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {costConfigured && totalDayCost != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] md:text-xs text-muted-foreground">Sewing Cost</span>
                        <span className="font-mono text-xs md:text-sm font-semibold text-red-600 dark:text-red-400">
                          {headcountCost.currency === 'BDT' && bdtToUsd
                            ? `$${(totalDayCost * bdtToUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : `$${totalDayCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          }
                        </span>
                      </div>
                    )}
                    {dayProfit != null && (
                      <>
                        <div className="border-t border-blue-200 dark:border-blue-800 my-0.5" />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] md:text-xs font-semibold text-foreground">Sewing Profit</span>
                          <span className={`font-mono text-xs md:text-sm font-bold ${dayProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {dayProfit >= 0 ? '+' : '-'}${Math.abs(dayProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </motion.div>

        {/* Day Sewing Output */}
        <motion.div variants={fadeUp}>
          <div className="relative overflow-hidden rounded-xl border bg-blue-50 dark:bg-blue-950/30 p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 group">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('dashboard.daySewingOutput')}</p>
                <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight">
                  <AnimatedNumber value={stats.daySewingOutput} />
                </p>
                <p className="text-[10px] md:text-xs text-muted-foreground">{t('dashboard.pcsProduced')}</p>
              </div>
              <div className="rounded-xl bg-blue-500/10 p-2.5">
                <SewingMachine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <button
              onClick={() => { setKpiNoteDept('sewing'); setKpiNoteOpen(true); }}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-sm border rounded px-1.5 py-0.5"
            >
              + Note
            </button>
          </div>
        </motion.div>

        {/* Day Finishing Output */}
        <motion.div variants={fadeUp}>
          <div className="relative overflow-hidden rounded-xl border bg-violet-50 dark:bg-violet-950/30 p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 group">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('dashboard.dayFinishingOutput')}</p>
                <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight">
                  <AnimatedNumber value={stats.dayFinishingOutput} />
                </p>
                <p className="text-[10px] md:text-xs text-muted-foreground">{t('dashboard.pcsFinished')}</p>
              </div>
              <div className="rounded-xl bg-violet-500/10 p-2.5">
                <Package className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
            <button
              onClick={() => { setKpiNoteDept('finishing'); setKpiNoteOpen(true); }}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-sm border rounded px-1.5 py-0.5"
            >
              + Note
            </button>
          </div>
        </motion.div>

        {/* Blockers Today */}
        <motion.div variants={fadeUp}>
          <Link to="/blockers" className="block">
            <div className="relative overflow-hidden rounded-xl border bg-red-50 dark:bg-red-950/30 p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-rose-600" />
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('dashboard.blockersToday')}</p>
                  <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight">
                    <AnimatedNumber value={stats.blockersToday} />
                  </p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">{stats.blockersToday > 0 ? t('dashboard.requiresAttention') : t('dashboard.allClear')}</p>
                </div>
                <div className="rounded-xl bg-red-500/10 p-2.5">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </motion.div>

      {/* Production Notes Panel */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <NotesPanel />
      </motion.div>

      {/* Department Tabs */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
      <h2 className="text-lg font-semibold mb-4">Departments</h2>
      <Tabs value={departmentTab} onValueChange={(v) => setDepartmentTab(v as 'sewing' | 'finishing' | 'cutting' | 'storage')} className="space-y-4">
        <TabsList className="w-full grid grid-cols-4 h-auto p-1 rounded-xl bg-muted/60 border border-border/50">
          <TabsTrigger value="storage" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2.5 rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-950/40 dark:data-[state=active]:text-orange-300">
            <Warehouse className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden xs:inline">Storage</span>
          </TabsTrigger>
          <TabsTrigger value="cutting" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2.5 rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-950/40 dark:data-[state=active]:text-emerald-300">
            <Scissors className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden xs:inline">Cutting</span>
          </TabsTrigger>
          <TabsTrigger value="sewing" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2.5 rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300">
            <SewingMachine className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden xs:inline">Sewing</span>
          </TabsTrigger>
          <TabsTrigger value="finishing" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2.5 rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-950/40 dark:data-[state=active]:text-violet-300">
            <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden xs:inline">Finishing</span>
          </TabsTrigger>
        </TabsList>

        {/* Sewing Tab Content */}
        <TabsContent value="sewing" className="space-y-4 md:space-y-6">
          <StageDashboardSection
            stage="sewing"
            targets={sewingTargets}
            endOfDay={sewingEndOfDay}
            allLines={allLines}
            loading={loading}
            onTargetClick={(target) => {
              setSewingViewSource({ type: 'target', id: target.id });
              setSewingViewOpen(true);
            }}
            onEodClick={(eod) => {
              setSewingViewSource({ type: 'actual', id: eod.id });
              setSewingViewOpen(true);
            }}
            formatTime={formatTime}
            renderTargetMetric={(target) => {
              const t = target as TargetSubmission;
              const totalPlanned = t.target_total_planned
                ?? (t.hours_planned && t.per_hour_target
                  ? Math.round(t.per_hour_target * t.hours_planned)
                  : null);
              return (
                <>
                  <p className="font-mono font-bold text-lg">
                    {totalPlanned != null ? totalPlanned.toLocaleString() : t.per_hour_target.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {totalPlanned != null ? "target output" : "per hour"}
                  </p>
                </>
              );
            }}
          />
        </TabsContent>

        {/* Finishing Tab Content — same layout as Sewing */}
        <TabsContent value="finishing" className="space-y-4 md:space-y-6">
          <StageDashboardSection
            stage="finishing"
            targets={finishingDailyTargets}
            endOfDay={finishingEndOfDay}
            allLines={allLines}
            loading={loading}
            onTargetClick={(target) => {
              // Find the daily log entry and open FinishingSubmissionView
              setFinishingViewId(target.id);
              setFinishingViewOpen(true);
            }}
            onEodClick={(eod) => {
              setFinishingViewId(eod.id);
              setFinishingViewOpen(true);
            }}
            formatTime={formatTime}
            renderTargetMetric={(target) => {
              const t = target as any;
              const totalHours = (t._planned_hours || 0) + (t._ot_hours_planned || 0);
              const totalPoly = totalHours > 0 ? Math.round((t._poly || 0) * totalHours) : (t._poly || 0);
              const totalCarton = totalHours > 0 ? Math.round((t._carton || 0) * totalHours) : (t._carton || 0);
              return (
                <div className="flex gap-3">
                  <div>
                    <p className="font-mono font-bold text-lg">{totalPoly.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">poly</p>
                  </div>
                  {totalCarton > 0 && (
                    <div>
                      <p className="font-mono font-semibold text-base text-muted-foreground">{totalCarton.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">cartons</p>
                    </div>
                  )}
                </div>
              );
            }}
          />
        </TabsContent>

        {/* Cutting Tab Content */}
        <TabsContent value="cutting" className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Cutting Morning Targets Card */}
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-500" />
              <CardHeader className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
                  Morning Targets
                </CardTitle>
                <div className="flex gap-1 sm:gap-2">
                  <Link to="/today?tab=cutting">
                    <Button variant="ghost" size="sm" className="h-8 px-2 sm:px-3 text-xs sm:text-sm">
                      View All
                      <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-0.5 sm:ml-1" />
                    </Button>
                  </Link>
                  <Link to="/cutting/morning-targets">
                    <Button variant="ghost" size="sm" className="h-8 px-2 sm:px-3 text-xs sm:text-sm">
                      <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                      Add
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : cuttingTargets.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {cuttingTargets.map((target) => (
                      <div
                        key={target.id}
                        onClick={() => {
                          setSelectedCuttingTarget(target);
                          setCuttingTargetModalOpen(true);
                        }}
                        className="flex items-center justify-between p-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer border border-primary/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10">
                            <Target className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{target.line_name}</span>
                              <StatusBadge variant="info" size="sm">Target</StatusBadge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {target.po_number || 'No PO'} • {target.style || 'No style'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-lg text-primary">{target.cutting_capacity?.toLocaleString() || 0}</p>
                          <p className="text-xs text-muted-foreground">capacity</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No targets submitted today</p>
                    <Link to="/cutting/morning-targets">
                      <Button variant="link" size="sm" className="mt-2">
                        Add morning targets
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cutting End of Day Card */}
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-500" />
              <CardHeader className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
                  End of Day
                </CardTitle>
                <div className="flex gap-1 sm:gap-2">
                  <Link to="/today?tab=cutting">
                    <Button variant="ghost" size="sm" className="h-8 px-2 sm:px-3 text-xs sm:text-sm">
                      View All
                      <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-0.5 sm:ml-1" />
                    </Button>
                  </Link>
                  <Link to="/cutting/end-of-day">
                    <Button variant="ghost" size="sm" className="h-8 px-2 sm:px-3 text-xs sm:text-sm">
                      <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                      Add
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : cuttingSubmissions.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {cuttingSubmissions.map((cutting) => (
                      <div
                        key={cutting.id}
                        onClick={() => {
                          setSelectedCutting(cutting);
                          setCuttingModalOpen(true);
                        }}
                        className="flex items-center justify-between p-3 rounded-lg bg-success/5 hover:bg-success/10 transition-colors cursor-pointer border border-success/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10">
                            <ClipboardCheck className="h-5 w-5 text-success" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{cutting.line_name}</span>
                              <StatusBadge variant="success" size="sm">Actual</StatusBadge>
                              {cutting.leftover_recorded && (
                                <StatusBadge variant="warning" size="sm">
                                  Left Over: {cutting.leftover_quantity} {cutting.leftover_unit}
                                </StatusBadge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {cutting.po_number || 'No PO'} • {cutting.style || 'No style'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-lg text-success">{cutting.day_cutting.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">cut today</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No end of day submissions</p>
                    <Link to="/cutting/end-of-day">
                      <Button variant="link" size="sm" className="mt-2">
                        Add end of day report
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="storage" className="space-y-4 md:space-y-6">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
            <CardHeader className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Warehouse className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
                Bin Cards
              </CardTitle>
              <Link to="/today?tab=storage">
                <Button variant="ghost" size="sm" className="h-8 px-2 sm:px-3 text-xs sm:text-sm">
                  View All
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-0.5 sm:ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : storageDisplayItems.length > 0 ? (
                <TooltipProvider>
                <div className="w-full overflow-x-auto">
                  <div className="space-y-3 max-h-[500px] overflow-y-auto min-w-[320px]">
                    {storageDisplayItems.map((item) => (
                      <div
                        key={item.key}
                        onClick={() => {
                          if (item.type === 'group' && item.cards.length > 1) {
                            const groupedCards = {
                              groupName: item.groupName || `Bulk (${item.poNumbers.length} POs)`,
                              cards: item.cards.map(card => ({
                                binCard: {
                                  id: card.id,
                                  buyer: card.buyer,
                                  style: card.style,
                                  po_number: card.po_number,
                                  supplier_name: card.supplier_name,
                                  description: card.description,
                                  construction: card.construction,
                                  color: card.color,
                                  width: card.width,
                                  package_qty: card.package_qty,
                                  prepared_by: card.prepared_by,
                                },
                                transactions: card.transactions,
                              })),
                            };
                            setSelectedGroupedCards(groupedCards);
                            setSelectedBinCard(null);
                            setStorageModalOpen(true);
                          } else {
                            setSelectedBinCard(item.cards[0]);
                            setSelectedGroupedCards(null);
                            setStorageModalOpen(true);
                          }
                        }}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 shrink-0">
                            {item.type === 'group' && item.cards.length > 1 ? (
                              <Layers className="h-5 w-5 text-primary" />
                            ) : (
                              <Warehouse className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-nowrap">
                              {item.type === 'group' && item.groupName ? (
                                <span className="font-medium whitespace-nowrap">{item.groupName}</span>
                              ) : item.poNumbers.length <= 1 ? (
                                <span className="font-medium whitespace-nowrap">{item.poNumbers[0] || 'No PO'}</span>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default flex items-center gap-1">
                                      <span className="font-medium whitespace-nowrap">{item.poNumbers[0]}</span>
                                      <Badge variant="outline" className="text-xs shrink-0">+{item.poNumbers.length - 1}</Badge>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    <div className="space-y-1">
                                      {item.poNumbers.map(po => (
                                        <div key={po} className="text-xs">{po}</div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {item.transactionCount > 0 && (
                                <StatusBadge variant="info" size="sm">
                                  {item.transactionCount} txns
                                </StatusBadge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-nowrap">
                              {item.type === 'group' && item.groupName
                                ? item.poNumbers.join(', ')
                                : `${item.buyer} • ${item.style}`
                              }
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-mono font-bold text-lg">{item.totalBalance.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">balance</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                </TooltipProvider>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No bin cards found</p>
                  <Link to="/storage">
                    <Button variant="link" size="sm" className="mt-2">
                      Create bin card
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </motion.div>

      {/* Active Blockers */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold">Active Blockers</h2>
        {activeBlockers.length > 0 && (
          <span className="text-xs font-medium bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-full px-2.5 py-0.5">{activeBlockers.length}</span>
        )}
      </div>
      <Card className="border-border/50 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="rounded-lg bg-orange-500/10 p-1.5">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            Blockers
          </CardTitle>
          <Link to="/blockers">
            <Button variant="ghost" size="sm" className="text-xs">
              View All
              <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : activeBlockers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeBlockers.map((blocker) => (
                <div
                  key={blocker.id}
                  className={`p-3 rounded-lg border ${
                    blocker.impact === 'critical' ? 'border-destructive/30 bg-destructive/5' :
                    blocker.impact === 'high' ? 'border-orange-500/30 bg-orange-500/5' :
                    blocker.impact === 'medium' ? 'border-warning/30 bg-warning/5' :
                    'border-success/30 bg-success/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-medium text-sm">{blocker.line_name}</span>
                    <StatusBadge variant={blocker.impact as any} size="sm">
                      {blocker.impact}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {blocker.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <StatusBadge variant={blocker.type} size="sm">
                      {blocker.type}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-success/10 flex items-center justify-center">
                <svg className="h-6 w-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p>No active blockers</p>
              <p className="text-sm">Production running smoothly</p>
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      <SubmissionDetailModal
        submission={selectedSubmission}
        open={submissionModalOpen}
        onOpenChange={setSubmissionModalOpen}
      />

      <TargetDetailModal
        target={selectedTarget ? { ...selectedTarget, submitted_at: selectedTarget.submitted_at || '' } : null}
        open={targetModalOpen}
        onOpenChange={setTargetModalOpen}
      />

      {(() => {
        if (!sewingViewSource) return null;
        let sewingTarget: SewingTargetData | null = null;
        let sewingActual: SewingActualData | null = null;

        if (sewingViewSource.type === 'actual') {
          const eod = sewingEndOfDay.find(e => e.id === sewingViewSource.id);
          if (eod) {
            sewingActual = {
              id: eod.id,
              production_date: eod.production_date,
              line_name: eod.line_name,
              po_number: eod.po_number,
              buyer: eod.buyer,
              style: eod.style,
              order_qty: eod.order_qty ?? null,
              submitted_at: eod.submitted_at,
              good_today: eod.output,
              reject_today: eod.reject_qty ?? 0,
              rework_today: eod.rework_qty ?? 0,
              cumulative_good_total: eod.cumulative_good_total ?? 0,
              manpower_actual: eod.manpower ?? 0,
              ot_hours_actual: eod.ot_hours ?? 0,
              ot_manpower_actual: eod.ot_manpower ?? null,
              hours_actual: eod.hours_actual ?? null,
              actual_per_hour: eod.actual_per_hour ?? null,
              stage_name: eod.stage_name || null,
              actual_stage_progress: eod.actual_stage_progress ?? eod.stage_progress ?? null,
              remarks: eod.notes || null,
              has_blocker: eod.has_blocker,
              blocker_description: eod.blocker_description,
              blocker_impact: eod.blocker_impact,
              blocker_owner: eod.blocker_owner,
              blocker_status: eod.blocker_status,
              estimated_cost_value: eod.estimated_cost_value ?? null,
              estimated_cost_currency: eod.estimated_cost_currency ?? null,
            };
            const mt = sewingTargets.find(t =>
              t.line_uuid === eod.line_uuid &&
              t.work_order_id === eod.work_order_id &&
              t.production_date === eod.production_date
            );
            if (mt) {
              sewingTarget = {
                id: mt.id,
                production_date: mt.production_date,
                line_name: mt.line_name,
                po_number: mt.po_number,
                buyer: mt.buyer,
                style: mt.style,
                order_qty: mt.order_qty ?? null,
                submitted_at: mt.submitted_at,
                per_hour_target: mt.per_hour_target,
                manpower_planned: mt.manpower_planned ?? null,
                ot_hours_planned: mt.ot_hours_planned ?? null,
                hours_planned: mt.hours_planned ?? null,
                target_total_planned: mt.target_total_planned ?? null,
                stage_name: mt.stage_name ?? null,
                planned_stage_progress: mt.planned_stage_progress ?? null,
                next_milestone: mt.next_milestone ?? null,
                estimated_ex_factory: mt.estimated_ex_factory ?? null,
                remarks: mt.remarks ?? null,
              };
            }
          }
        } else {
          const tgt = sewingTargets.find(t => t.id === sewingViewSource.id);
          if (tgt) {
            sewingTarget = {
              id: tgt.id,
              production_date: tgt.production_date,
              line_name: tgt.line_name,
              po_number: tgt.po_number,
              buyer: tgt.buyer,
              style: tgt.style,
              order_qty: tgt.order_qty ?? null,
              submitted_at: tgt.submitted_at,
              per_hour_target: tgt.per_hour_target,
              manpower_planned: tgt.manpower_planned ?? null,
              ot_hours_planned: tgt.ot_hours_planned ?? null,
              hours_planned: tgt.hours_planned ?? null,
              target_total_planned: tgt.target_total_planned ?? null,
              stage_name: tgt.stage_name ?? null,
              planned_stage_progress: tgt.planned_stage_progress ?? null,
              next_milestone: tgt.next_milestone ?? null,
              estimated_ex_factory: tgt.estimated_ex_factory ?? null,
              remarks: tgt.remarks ?? null,
            };
            const ma = sewingEndOfDay.find(e =>
              e.line_uuid === tgt.line_uuid &&
              e.work_order_id === tgt.work_order_id &&
              e.production_date === tgt.production_date
            );
            if (ma) {
              sewingActual = {
                id: ma.id,
                production_date: ma.production_date,
                line_name: ma.line_name,
                po_number: ma.po_number,
                buyer: ma.buyer,
                style: ma.style,
                order_qty: ma.order_qty ?? null,
                submitted_at: ma.submitted_at,
                good_today: ma.output,
                reject_today: ma.reject_qty ?? 0,
                rework_today: ma.rework_qty ?? 0,
                cumulative_good_total: ma.cumulative_good_total ?? 0,
                manpower_actual: ma.manpower ?? 0,
                ot_hours_actual: ma.ot_hours ?? 0,
                ot_manpower_actual: ma.ot_manpower ?? null,
                hours_actual: ma.hours_actual ?? null,
                actual_per_hour: ma.actual_per_hour ?? null,
                stage_name: ma.stage_name || null,
                actual_stage_progress: ma.actual_stage_progress ?? ma.stage_progress ?? null,
                remarks: ma.notes || null,
                has_blocker: ma.has_blocker,
                blocker_description: ma.blocker_description,
                blocker_impact: ma.blocker_impact,
                blocker_owner: ma.blocker_owner,
                blocker_status: ma.blocker_status,
                estimated_cost_value: ma.estimated_cost_value ?? null,
                estimated_cost_currency: ma.estimated_cost_currency ?? null,
              };
            }
          }
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

      {/* Finishing Daily Log Detail Modal */}
      {(() => {
        if (!finishingViewId) return null;

        const log = finishingDailyLogs.find((l: any) => l.id === finishingViewId);
        if (!log) return null;

        // Find counterpart (TARGET <-> OUTPUT) for the same work order + date
        // Finishing doesn't use lines (line_id is null), so match on work_order_id only
        const counterpart = finishingDailyLogs.find((l: any) =>
          l.log_type !== log.log_type &&
          l.production_date === log.production_date &&
          l.work_order_id === log.work_order_id
        );

        const targetLog = log.log_type === 'TARGET' ? log : counterpart;
        const actualLog = log.log_type === 'OUTPUT' ? log : counterpart;

        const finTarget: FinishingTargetData | null = targetLog ? {
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

        const finActual: FinishingActualData | null = actualLog ? {
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
            target={finTarget}
            actual={finActual}
            open={finishingViewOpen}
            onOpenChange={setFinishingViewOpen}
          />
        );
      })()}

      {(() => {
        const matchingTarget = selectedCutting
          ? cuttingTargets.find(t =>
              t.production_date === selectedCutting.production_date &&
              t.line_id === selectedCutting.line_id &&
              t.work_order_id === selectedCutting.work_order_id
            )
          : null;
        return (
          <CuttingSubmissionView
            target={matchingTarget ? {
              id: matchingTarget.id,
              production_date: matchingTarget.production_date,
              line_name: matchingTarget.line_name,
              buyer: matchingTarget.buyer,
              style: matchingTarget.style,
              po_number: matchingTarget.po_number,
              colour: matchingTarget.colour,
              order_qty: matchingTarget.order_qty,
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
              line_name: selectedCutting.line_name,
              buyer: selectedCutting.buyer,
              style: selectedCutting.style,
              po_number: selectedCutting.po_number,
              colour: selectedCutting.colour,
              order_qty: selectedCutting.order_qty,
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

      {(() => {
        const matchingActual = selectedCuttingTarget
          ? cuttingSubmissions.find(a =>
              a.production_date === selectedCuttingTarget.production_date &&
              a.line_id === selectedCuttingTarget.line_id &&
              a.work_order_id === selectedCuttingTarget.work_order_id
            )
          : null;
        return (
          <CuttingSubmissionView
            target={selectedCuttingTarget ? {
              id: selectedCuttingTarget.id,
              production_date: selectedCuttingTarget.production_date,
              line_name: selectedCuttingTarget.line_name,
              buyer: selectedCuttingTarget.buyer,
              style: selectedCuttingTarget.style,
              po_number: selectedCuttingTarget.po_number,
              colour: selectedCuttingTarget.colour,
              order_qty: selectedCuttingTarget.order_qty,
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
              line_name: matchingActual.line_name,
              buyer: matchingActual.buyer,
              style: matchingActual.style,
              po_number: matchingActual.po_number,
              colour: matchingActual.colour,
              order_qty: matchingActual.order_qty,
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

      <StorageBinCardDetailModal
        binCard={selectedBinCard}
        transactions={selectedBinCard?.transactions || []}
        open={storageModalOpen}
        onOpenChange={(open) => {
          setStorageModalOpen(open);
          if (!open) setSelectedGroupedCards(null);
        }}
        groupedCards={selectedGroupedCards}
      />

      {/* KPI-triggered note form */}
      <NoteFormDialog
        open={kpiNoteOpen}
        onOpenChange={(open) => { setKpiNoteOpen(open); if (!open) setKpiNoteDept(null); }}
        defaultDepartment={kpiNoteDept}
      />
    </div>
  );
}
