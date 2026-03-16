import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Settings,
  Rows3,
  ClipboardList,
  ListOrdered,
  Building2,
  Clock,
  Globe,
  ChevronRight,
  AlertTriangle,
  Factory,
  Mail,
  Bug,
  DollarSign
} from "lucide-react";
import { EmailScheduleSettings } from "@/components/insights/EmailScheduleSettings";
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
    linesCount: 0,
    activeLinesCount: 0,
    workOrdersCount: 0,
    activeWorkOrdersCount: 0,
    unitsCount: 0,
    floorsCount: 0,
  });
  const [cutoffTime, setCutoffTime] = useState("16:00");
  const [morningTargetCutoff, setMorningTargetCutoff] = useState("10:00");
  const [eveningActualCutoff, setEveningActualCutoff] = useState("18:00");
  const [timezone, setTimezone] = useState("Asia/Dhaka");
  const [isSavingCutoff, setIsSavingCutoff] = useState(false);
  const [headcountCostValue, setHeadcountCostValue] = useState("");
  const [headcountCostCurrency, setHeadcountCostCurrency] = useState("BDT");
  const [isSavingCost, setIsSavingCost] = useState(false);

  // Common manufacturing region timezones
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
    if (profile?.factory_id) {
      fetchStats();
    } else if (profile !== undefined) {
      setLoading(false);
    }
  }, [profile?.factory_id, profile]);

  useEffect(() => {
    if (factory?.cutoff_time) {
      setCutoffTime(factory.cutoff_time.slice(0, 5)); // HH:MM format
    }
    if (factory?.morning_target_cutoff) {
      setMorningTargetCutoff(factory.morning_target_cutoff.slice(0, 5));
    }
    if (factory?.evening_actual_cutoff) {
      setEveningActualCutoff(factory.evening_actual_cutoff.slice(0, 5));
    }
    if (factory?.timezone) {
      setTimezone(factory.timezone);
    }
    if (factory?.headcount_cost_value != null) {
      setHeadcountCostValue(String(factory.headcount_cost_value));
    }
    if (factory?.headcount_cost_currency) {
      setHeadcountCostCurrency(factory.headcount_cost_currency);
    }
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
      
      const lines = linesRes.data || [];
      const workOrders = workOrdersRes.data || [];
      
      setStats({
        linesCount: lines.length,
        activeLinesCount: lines.filter(l => l.is_active).length,
        workOrdersCount: workOrders.length,
        activeWorkOrdersCount: workOrders.filter(w => w.is_active).length,
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
          timezone: timezone
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
        .update({
          headcount_cost_value: costValue,
          headcount_cost_currency: headcountCostCurrency,
        })
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

  const setupLinks = [
    {
      title: 'Lines, Units, Floors & Storage',
      description: 'Manage production lines and factory structure',
      icon: Rows3,
      href: '/setup/factory',
      stats: `${stats.activeLinesCount} active lines, ${stats.unitsCount} units, ${stats.floorsCount} floors`,
    },
    {
      title: 'Work Orders / PO Master',
      description: 'Manage purchase orders and work orders',
      icon: ClipboardList,
      href: '/setup/work-orders',
      stats: `${stats.activeWorkOrdersCount} active of ${stats.workOrdersCount} total`,
    },
    {
      title: 'Dropdown Settings',
      description: 'Stages, progress options, blockers, milestones',
      icon: ListOrdered,
      href: '/setup/dropdowns',
      stats: 'Configure form dropdowns',
    },
    ...(isDevFactory ? [{
      title: 'Error Logs',
      description: 'View and manage application error logs',
      icon: Bug,
      href: '/setup/error-logs',
      stats: 'Monitor app errors',
    }] : []),
  ];

  return (
    <div className="py-4 lg:py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Factory Setup</h1>
          <p className="text-sm text-muted-foreground">
            {factory?.name || 'Configure your factory settings'}
          </p>
        </div>
      </div>

      {/* Onboarding Checklist */}
      {onboarding.visible && (
        <div className="mb-6">
          <OnboardingChecklist
            steps={onboarding.steps}
            completedCount={onboarding.completedCount}
            totalCount={onboarding.totalCount}
            onDismiss={onboarding.dismiss}
          />
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                <Rows3 className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeLinesCount}</p>
                <p className="text-xs text-muted-foreground">Active Lines</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeWorkOrdersCount}</p>
                <p className="text-xs text-muted-foreground">Active POs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.unitsCount}</p>
                <p className="text-xs text-muted-foreground">Units</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{cutoffTime}</p>
                <p className="text-xs text-muted-foreground">Cutoff Time</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cutoff Time Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time & Timezone Settings
          </CardTitle>
          <CardDescription>
            Configure timezone and cutoff times for submissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Timezone */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Factory Timezone</Label>
            </div>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              All cutoff times will be based on this timezone
            </p>
          </div>

          {/* Cutoff Times */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Morning Target Cutoff</Label>
              <Input
                type="time"
                value={morningTargetCutoff}
                onChange={(e) => setMorningTargetCutoff(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Deadline for submitting morning targets
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Evening Actual Cutoff</Label>
              <Input
                type="time"
                value={eveningActualCutoff}
                onChange={(e) => setEveningActualCutoff(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Deadline for submitting end-of-day actuals
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Daily Cutoff</Label>
              <Input
                type="time"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                General daily cutoff time
              </p>
            </div>
          </div>
          <Button onClick={handleSaveSettings} disabled={isSavingCutoff}>
            {isSavingCutoff ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              'Save Settings'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Cost Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cost Settings
          </CardTitle>
          <CardDescription>
            Configure headcount cost for production cost estimates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Headcount Cost (per man-hour)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1000000"
                value={headcountCostValue}
                onChange={(e) => setHeadcountCostValue(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                All-in cost per worker per hour (used to estimate production cost).
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Currency</Label>
              <Select value={headcountCostCurrency} onValueChange={setHeadcountCostCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">৳ BDT (Bangladeshi Taka)</SelectItem>
                  <SelectItem value="USD">$ USD (US Dollar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSaveCostSettings} disabled={isSavingCost}>
            {isSavingCost ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              'Save Settings'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Setup Links */}
      <div className="space-y-3">
        {setupLinks.map((link) => (
          <Link key={link.href} to={link.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <link.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{link.title}</h3>
                      <p className="text-sm text-muted-foreground">{link.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{link.stats}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Email Report Settings */}
      <div className="mt-6">
        <EmailScheduleSettings />
      </div>

    </div>
  );
}
