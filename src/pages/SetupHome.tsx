import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Settings,
  Rows3,
  Receipt,
  ListOrdered,
  Clock,
  ChevronRight,
  AlertTriangle,
  Factory,
  Bug,
  DollarSign,
  Copy
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { DEV_FACTORY_ID_PREFIX } from "@/lib/constants";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { useOnboardingChecklist } from "@/hooks/useOnboardingChecklist";

interface FactoryStats {
  linesCount: number;
  activeLinesCount: number;
  workOrdersCount: number;
  activeWorkOrdersCount: number;
  unitsCount: number;
  floorsCount: number;
}

export default function SetupHome() {
  const { profile, factory, isAdminOrHigher, refreshFactory } = useAuth();
  const navigate = useNavigate();
  const onboarding = useOnboardingChecklist(profile?.factory_id ? profile as any : null);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FactoryStats>({
    linesCount: 0, activeLinesCount: 0,
    workOrdersCount: 0, activeWorkOrdersCount: 0,
    unitsCount: 0, floorsCount: 0,
  });
  const [cutoffTime, setCutoffTime] = useState("16:00");
  const [morningTargetCutoff, setMorningTargetCutoff] = useState("10:00");
  const [eveningActualCutoff, setEveningActualCutoff] = useState("18:00");
  const [timezone, setTimezone] = useState("Asia/Dhaka");
  const [isSavingCutoff, setIsSavingCutoff] = useState(false);
  const [headcountCostValue, setHeadcountCostValue] = useState("");
  const [headcountCostCurrency, setHeadcountCostCurrency] = useState("BDT");
  const [isSavingCost, setIsSavingCost] = useState(false);

  const timezones = [
    { value: "Asia/Dhaka", label: "Bangladesh (GMT+6)" },
    { value: "Asia/Kolkata", label: "India (GMT+5:30)" },
    { value: "Asia/Ho_Chi_Minh", label: "Vietnam (GMT+7)" },
    { value: "Asia/Shanghai", label: "China (GMT+8)" },
    { value: "Asia/Jakarta", label: "Indonesia (GMT+7)" },
    { value: "Asia/Karachi", label: "Pakistan (GMT+5)" },
    { value: "Asia/Manila", label: "Philippines (GMT+8)" },
    { value: "Asia/Bangkok", label: "Thailand (GMT+7)" },
    { value: "Asia/Colombo", label: "Sri Lanka (GMT+5:30)" },
    { value: "Europe/London", label: "UK (GMT+0)" },
    { value: "Europe/Paris", label: "Central Europe (GMT+1)" },
    { value: "America/New_York", label: "US Eastern (GMT-5)" },
    { value: "America/Los_Angeles", label: "US Pacific (GMT-8)" },
  ];

  useEffect(() => {
    if (profile?.factory_id) fetchStats();
    else if (profile !== undefined) setLoading(false);
  }, [profile?.factory_id, profile]);

  useEffect(() => {
    if (factory?.cutoff_time) setCutoffTime(factory.cutoff_time.slice(0, 5));
    if (factory?.morning_target_cutoff) setMorningTargetCutoff(factory.morning_target_cutoff.slice(0, 5));
    if (factory?.evening_actual_cutoff) setEveningActualCutoff(factory.evening_actual_cutoff.slice(0, 5));
    if (factory?.timezone) setTimezone(factory.timezone);
    if (factory?.headcount_cost_value != null) setHeadcountCostValue(String(factory.headcount_cost_value));
    if (factory?.headcount_cost_currency) setHeadcountCostCurrency(factory.headcount_cost_currency);
  }, [factory]);

  async function fetchStats() {
    if (!profile?.factory_id) return;
    try {
      const [linesRes, workOrdersRes, unitsRes, floorsRes] = await Promise.all([
        supabase.from('lines').select('id, is_active').eq('factory_id', profile.factory_id),
        supabase.from('work_orders').select('id, is_active').eq('factory_id', profile.factory_id),
        supabase.from('units').select('id').eq('factory_id', profile.factory_id),
        supabase.from('floors').select('id').eq('factory_id', profile.factory_id),
      ]);
      setStats({
        linesCount: (linesRes.data || []).length,
        activeLinesCount: (linesRes.data || []).filter(l => l.is_active).length,
        workOrdersCount: (workOrdersRes.data || []).length,
        activeWorkOrdersCount: (workOrdersRes.data || []).filter(w => w.is_active).length,
        unitsCount: unitsRes.data?.length || 0,
        floorsCount: floorsRes.data?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    if (!profile?.factory_id) return;
    setIsSavingCutoff(true);
    try {
      const { error } = await supabase
        .from('factory_accounts')
        .update({
          cutoff_time: cutoffTime + ':00',
          morning_target_cutoff: morningTargetCutoff + ':00',
          evening_actual_cutoff: eveningActualCutoff + ':00',
          timezone,
        })
        .eq('id', profile.factory_id);
      if (error) throw error;
      toast.success("Settings updated");
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    } finally {
      setIsSavingCutoff(false);
    }
  }

  async function handleSaveCostSettings() {
    if (!profile?.factory_id) return;
    const costValue = parseFloat(headcountCostValue);
    if (!headcountCostValue || isNaN(costValue) || costValue <= 0) {
      toast.error("Headcount cost must be greater than 0");
      return;
    }
    if (costValue > 1000000) {
      toast.error("Headcount cost seems too high. Maximum is 1,000,000.");
      return;
    }
    setIsSavingCost(true);
    try {
      const { error } = await supabase
        .from('factory_accounts')
        .update({ headcount_cost_value: costValue, headcount_cost_currency: headcountCostCurrency })
        .eq('id', profile.factory_id);
      if (error) throw error;
      await refreshFactory();
      toast.success("Cost settings updated");
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    } finally {
      setIsSavingCost(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile?.factory_id) {
    return (
      <EmptyState
        icon={Factory}
        title="No Factory Assigned"
        description="Create your factory to get started."
        action={{ label: "Create Factory", onClick: () => navigate('/setup/factory') }}
      />
    );
  }

  if (!isAdminOrHigher()) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Access Denied"
        description="You need admin permissions to access factory setup."
        iconClassName="text-warning"
        action={{ label: "Go to Dashboard", onClick: () => navigate('/dashboard') }}
      />
    );
  }

  const isDevFactory = profile?.factory_id?.startsWith(DEV_FACTORY_ID_PREFIX);

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-500/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Factory Setup</h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{factory?.name || 'Configure your factory'}</p>
            {profile?.factory_id && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(profile.factory_id!);
                  toast.success("Factory ID copied");
                }}
                className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground bg-muted/50 hover:bg-muted px-1.5 py-0.5 rounded transition-colors"
                title="Click to copy Factory ID"
              >
                Factory ID: {profile.factory_id.slice(0, 8)}...
                <Copy className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Onboarding */}
      {onboarding.visible && (
        <OnboardingChecklist
          steps={onboarding.steps}
          completedCount={onboarding.completedCount}
          totalCount={onboarding.totalCount}
          onDismiss={onboarding.dismiss}
        />
      )}

      {/* ═══ Quick Actions ═══ */}
      <div className="space-y-4">
        <Link to="/setup/factory">
          <div className="group flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-border/50 hover:border-border bg-card hover:bg-muted/20 transition-all duration-200 cursor-pointer">
            <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0 group-hover:shadow-lg transition-shadow">
              <Rows3 className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Add Lines, Units & Floors</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Set up your production lines and organize by unit and floor</p>
              <p className="text-xs font-mono font-semibold text-muted-foreground mt-1.5">{stats.activeLinesCount} lines &middot; {stats.unitsCount} units &middot; {stats.floorsCount} floors</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
          </div>
        </Link>

        <Link to="/setup/work-orders">
          <div className="group flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-border/50 hover:border-border bg-card hover:bg-muted/20 transition-all duration-200 cursor-pointer">
            <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/20 flex items-center justify-center shrink-0 group-hover:shadow-lg transition-shadow">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Add Work Orders</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Create and manage purchase orders, assign to lines, import from CSV</p>
              <p className="text-xs font-mono font-semibold text-muted-foreground mt-1.5">{stats.activeWorkOrdersCount} active of {stats.workOrdersCount}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
          </div>
        </Link>

        <Link to="/setup/dropdowns">
          <div className="group flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-border/50 hover:border-border bg-card hover:bg-muted/20 transition-all duration-200 cursor-pointer">
            <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-md shadow-amber-500/20 flex items-center justify-center shrink-0 group-hover:shadow-lg transition-shadow">
              <ListOrdered className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Edit Dropdown Settings</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Configure stages, progress options, blocker types, and milestones</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
          </div>
        </Link>

        {isDevFactory && (
          <Link to="/setup/error-logs">
            <div className="group flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-border/50 hover:border-border bg-card hover:bg-muted/20 transition-all duration-200 cursor-pointer">
              <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 shadow-md shadow-red-500/20 flex items-center justify-center shrink-0 group-hover:shadow-lg transition-shadow">
                <Bug className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold">Error Logs</h3>
                <p className="text-xs text-muted-foreground mt-0.5">View and monitor application errors</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            </div>
          </Link>
        )}
      </div>

      {/* ═══ Divider ═══ */}
      <div className="border-t border-border/60" />

      {/* ═══ Settings ═══ */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Settings</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Time & Timezone */}
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 text-white" />
                </div>
                Time & Timezone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Factory Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Morning Cutoff</Label>
                  <Input type="time" value={morningTargetCutoff} onChange={(e) => setMorningTargetCutoff(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Evening Cutoff</Label>
                  <Input type="time" value={eveningActualCutoff} onChange={(e) => setEveningActualCutoff(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Daily Cutoff</Label>
                  <Input type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <Button size="sm" onClick={handleSaveSettings} disabled={isSavingCutoff}>
                {isSavingCutoff ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...</> : 'Save'}
              </Button>
            </CardContent>
          </Card>

          {/* Cost Settings */}
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-md shadow-emerald-500/20 flex items-center justify-center">
                  <DollarSign className="h-3.5 w-3.5 text-white" />
                </div>
                Cost Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Cost per Man-Hour</Label>
                  <Input
                    type="number" step="0.01" min="0" max="1000000"
                    value={headcountCostValue}
                    onChange={(e) => setHeadcountCostValue(e.target.value)}
                    placeholder="0.00" className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Currency</Label>
                  <Select value={headcountCostCurrency} onValueChange={setHeadcountCostCurrency}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BDT">৳ BDT</SelectItem>
                      <SelectItem value="USD">$ USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">All-in cost per worker per hour, used for production cost estimates.</p>
              <Button size="sm" onClick={handleSaveCostSettings} disabled={isSavingCost}>
                {isSavingCost ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...</> : 'Save'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}
