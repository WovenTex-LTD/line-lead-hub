import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Package,
  Warehouse,
  FileText,
  LayoutDashboard,
  CalendarDays,
  AlertTriangle,
  Calendar,
  Rows3,
  ClipboardList,
  TrendingUp,
  Settings,
  Users,
  Building2,
  CreditCard,
  Receipt,
  Headphones,
  HelpCircle,
  PlayCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserCog,
  Crosshair,
  ClipboardCheck,
  Scissors,
  RefreshCw,
  Loader2,
  Bug,
  BookOpen,
  BarChart3,
  DollarSign,
  Truck,
  CheckSquare,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { NAV_ITEMS, DEV_FACTORY_ID_PREFIX } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { openExternalUrl, isTauri, isNative } from "@/lib/capacitor";
import { isRunningFromDMG } from "@/lib/dmg-detection";
import { DMGWarningModal } from "@/components/DMGWarningModal";
import { useOnboardingChecklist } from "@/hooks/useOnboardingChecklist";
import { useTourContext } from "@/contexts/TourContext";
import { usePendingApprovals } from "@/hooks/useDispatchRequests";
import logoSvg from "@/assets/logo.svg";

// Web fallback version (desktop uses the runtime version from the installed app)
const WEB_APP_VERSION = "2.0.2";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Package,
  Warehouse,
  FileText,
  LayoutDashboard,
  CalendarDays,
  AlertTriangle,
  Calendar,
  Rows3,
  ClipboardList,
  TrendingUp,
  Settings,
  Users,
  Building2,
  CreditCard,
  Receipt,
  HeadphonesIcon: Headphones,
  UserCog,
  Crosshair,
  ClipboardCheck,
  Scissors,
  Bug,
  BookOpen,
  BarChart3,
  DollarSign,
  Truck,
  CheckSquare,
  Archive,
};

const navLabelKeys: Record<string, string> = {
  'Dashboard': 'nav.dashboard',
  'Sewing Update': 'nav.sewingUpdate',
  'Finishing Update': 'nav.finishingUpdate',
  'Sewing Morning Targets': 'nav.sewingMorningTargets',
  'Sewing End of Day': 'nav.sewingEndOfDay',
  'Finishing Morning Targets': 'nav.finishingMorningTargets',
  'Finishing End of Day': 'nav.finishingEndOfDay',
  'Finishing Daily Sheet': 'nav.finishingDailySheet',
  'Cutting Morning Targets': 'nav.cuttingMorningTargets',
  'Cutting End of Day': 'nav.cuttingEndOfDay',
  'Cutting': 'nav.cutting',
  'My Submissions': 'nav.mySubmissions',
  'Sewing Submissions': 'nav.sewingSubmissions',
  'Finishing Submissions': 'nav.finishingSubmissions',
  'My Preferences': 'nav.myPreferences',
  'Today Updates': 'nav.todayUpdates',
  'Blockers': 'nav.blockers',
  'Report Blocker': 'nav.reportBlocker',
  'This Week': 'nav.thisWeek',
  'All Submissions': 'nav.allSubmissions',
  'Lines': 'nav.lines',
  'Work Orders': 'nav.workOrders',
  'Insights': 'nav.insights',
  'Factory Profile': 'nav.factoryProfile',
  'Factory Setup': 'nav.factorySetup',
  'Users': 'nav.users',
  'Subscription': 'nav.subscription',
  'Billing': 'nav.billing',
  'Billing & Plan': 'nav.billingPlan',
  'Tenants': 'nav.tenants',
  'Plans': 'nav.plans',
  'Support': 'nav.support',
  'Storage': 'nav.storage',
  'Bin Card Entry': 'nav.binCardEntry',
  'All Bin Cards': 'nav.allBinCards',
  'Daily Target': 'nav.finishingDailyTarget',
  'End of Day Output': 'nav.finishingDailyOutput',
  'Cutting Handoffs': 'nav.cuttingHandoffs',
  'Finances': 'nav.finances',
};

interface NavItem {
  path: string;
  label: string;
  icon: string;
  children?: NavItem[];
  bottom?: boolean;
  group?: string;
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { profile, roles, factory, signOut } = useAuth();
  const location = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const isFinanceTheme = location.pathname === '/finances';
  const [expandedMenus, setExpandedMenus] = React.useState<string[]>(['/setup']);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<string>(WEB_APP_VERSION);
  const [showDMGWarning, setShowDMGWarning] = useState(false);

  const { startTour, resetTour } = useTourContext();

  // Setup progress badge for admin/owner sidebar
  const isAdminOrOwner = roles.some(ur => ['admin', 'owner'].includes(ur.role));
  const onboardingProfile = React.useMemo(() => {
    if (!isAdminOrOwner || !profile?.id || !profile?.factory_id) return null;
    return {
      id: profile.id,
      factory_id: profile.factory_id,
      onboarding_setup_dismissed_at: (profile as any).onboarding_setup_dismissed_at ?? null,
      onboarding_banner_dismissed_at: (profile as any).onboarding_banner_dismissed_at ?? null,
    };
  }, [isAdminOrOwner, profile?.id, profile?.factory_id, (profile as any)?.onboarding_setup_dismissed_at, (profile as any)?.onboarding_banner_dismissed_at]);
  const onboarding = useOnboardingChecklist(onboardingProfile);
  const setupRemaining = onboarding.totalCount - onboarding.completedCount;
  const showSetupBadge = isAdminOrOwner && !onboarding.loading && !onboarding.dismissed && !onboarding.allComplete && onboarding.totalCount > 0;

  const { data: pendingApprovals } = usePendingApprovals();
  const pendingDispatchCount = isAdminOrOwner ? (pendingApprovals?.length ?? 0) : 0;

  useEffect(() => {
    let cancelled = false;

    const loadVersion = async () => {
      if (!isTauri()) {
        setAppVersion(WEB_APP_VERSION);
        return;
      }

      const appModule = await import("@tauri-apps/api/app").catch(() => null);
      if (!appModule?.getVersion) {
        setAppVersion(WEB_APP_VERSION);
        return;
      }

      try {
        const v = await appModule.getVersion();
        if (!cancelled) setAppVersion(v);
      } catch {
        if (!cancelled) setAppVersion(WEB_APP_VERSION);
      }
    };

    loadVersion();
    return () => {
      cancelled = true;
    };
  }, []);


  const handleCheckUpdate = async () => {
    if (!isTauri()) {
      toast.info("Updates are only available in the desktop app");
      return;
    }

    // Check if running from DMG before allowing update
    try {
      const isDMG = await isRunningFromDMG();
      if (isDMG) {
        setShowDMGWarning(true);
        return;
      }
    } catch (e) {
      console.warn("DMG check failed:", e);
    }

    setIsCheckingUpdate(true);
    try {
      // Safe dynamic imports for web environments
      const updaterModule = await import("@tauri-apps/plugin-updater").catch(() => null);
      const processModule = await import("@tauri-apps/plugin-process").catch(() => null);

      if (!updaterModule?.check || !processModule?.relaunch) {
        toast.info("Update feature not available in this environment");
        return;
      }

      const update = await updaterModule.check({ timeout: 30_000 });
      const isAvailable =
        !!update && ("available" in update ? Boolean((update as any).available) : true);

      if (isAvailable) {
        const nextVersion = (update as any).version ?? "unknown";

        toast.info(`Update available: v${nextVersion}`, {
          description: "Downloading update...",
          duration: 5000,
        });

        await (update as any).downloadAndInstall();

        toast.success("Update installed!", {
          description: "Restarting application...",
          duration: 3000,
        });

        await processModule.relaunch();
      } else {
        toast.success("No updates required", {
          description: `You're already on the latest version (v${appVersion}).`,
        });
      }
    } catch (error: any) {
      const message = error?.message ?? String(error);
      console.error("Update check failed:", error);
      toast.error("Update check failed", {
        description: message,
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    // Navigation will happen automatically via AuthContext state change
  };

  // Get highest role for navigation
  // Department-specific roles are checked first, then the hierarchy
  const isStorageRole = roles.some(ur => ur.role === 'storage');
  const isCuttingRole = roles.some(ur => ur.role === 'cutting');
  const isSewingRole = roles.some(ur => ur.role === 'sewing');
  const isFinishingRole = roles.some(ur => ur.role === 'finishing');
  const isBuyerRole = roles.some(ur => ur.role === 'buyer');
  const isGateOfficerRole = roles.some(ur => ur.role === 'gate_officer');
  const roleHierarchy = ['owner', 'admin', 'worker'];
  const highestRole = roleHierarchy.find(r =>
    roles.some(ur => ur.role === r)
  ) || (isStorageRole ? 'storage' : isCuttingRole ? 'cutting' : isSewingRole ? 'sewing' : isFinishingRole ? 'finishing' : isBuyerRole ? 'buyer' : isGateOfficerRole ? 'gate_officer' : 'worker');

  // Get nav items based on role and department
  let navItems = NAV_ITEMS[highestRole as keyof typeof NAV_ITEMS] || NAV_ITEMS.worker;

  // For storage-only users, use storage navigation
  if (isStorageRole && highestRole === 'storage') {
    navItems = NAV_ITEMS.storage;
  }

  // For cutting-only users, use cutting navigation
  if (isCuttingRole && highestRole === 'cutting') {
    navItems = NAV_ITEMS.cutting;
  }

  // For standalone sewing role
  if (isSewingRole && highestRole === 'sewing') {
    navItems = NAV_ITEMS.sewing;
  }

  // For standalone finishing role
  if (isFinishingRole && highestRole === 'finishing') {
    navItems = NAV_ITEMS.finishing;
  }

  // For buyer role
  if (isBuyerRole && highestRole === 'buyer') {
    navItems = NAV_ITEMS.buyer;
  }

  // For gate officer role
  if (isGateOfficerRole && highestRole === 'gate_officer') {
    navItems = NAV_ITEMS.gate_officer;
  }

  // Legacy: for workers, filter navigation based on department (only when in a factory)
  if (highestRole === 'worker' && profile?.factory_id && profile?.department) {
    if (profile.department === 'sewing') {
      navItems = NAV_ITEMS.worker_sewing;
    } else if (profile.department === 'finishing') {
      navItems = NAV_ITEMS.worker_finishing;
    }
    // If department is 'both' or undefined, show all worker items
  }

  // Hide dev-only pages (Knowledge Base, Chat Analytics, Error Logs) for all factories
  {
    const devOnlyPaths = ['/setup/knowledge-base', '/setup/chat-analytics', '/setup/error-logs'];
    navItems = navItems.filter(item => !devOnlyPaths.includes(item.path));
  }

  // Apple compliance: hide billing/subscription nav items on native mobile
  if (isNative) {
    const billingPaths = ['/billing', '/billing-plan', '/subscription'];
    navItems = navItems.filter(item => !billingPaths.includes(item.path));
  }

  const isActive = (path: string) => location.pathname === path;
  const isParentActive = (item: NavItem) => {
    if (item.children) {
      return item.children.some(child => location.pathname === child.path);
    }
    return false;
  };

  const toggleMenu = (path: string) => {
    setExpandedMenus(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getNavLabel = (label: string) => {
    const key = navLabelKeys[label];
    return key ? t(key) : label;
  };

  return (
    <>
      {/* DMG Warning Modal for update button */}
      {showDMGWarning && (
        <DMGWarningModal 
          triggeredByUpdate={true} 
          onClose={() => setShowDMGWarning(false)}
        />
      )}
      
      <Sidebar
        className={cn(
        "border-r border-white/[0.06] transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
      style={{
        "--sidebar-gradient": isFinanceTheme
          ? "linear-gradient(180deg,#2d1754 0%,#3b2068 35%,#4a2a7a 65%,#56328a 100%)"
          : "linear-gradient(180deg,#080e1f 0%,#0c1633 35%,#111e4a 65%,#152457 100%)",
      } as React.CSSProperties}
      collapsible="icon"
    >
      <SidebarHeader className="border-b border-white/[0.08] p-4">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <img
              src={logoSvg}
              alt="ProductionPortal"
              className="h-10 w-10 rounded-xl shadow-lg shadow-sidebar-primary/20"
            />
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/10" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-sidebar-foreground tracking-tight">
                {t('app.name')}
              </span>
              <span className="text-[11px] text-sidebar-foreground/40 truncate max-w-[140px]">
                Powered by WovenTex
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar">
        {(() => {
          const mainItems = (navItems as NavItem[]).filter(item => !item.bottom);
          
          // Group items by their group property, preserving order
          const groups: { label: string | null; items: NavItem[] }[] = [];
          let currentGroup: { label: string | null; items: NavItem[] } | null = null;
          
          for (const item of mainItems) {
            const groupLabel = item.group || null;
            if (!currentGroup || currentGroup.label !== groupLabel) {
              currentGroup = { label: groupLabel, items: [item] };
              groups.push(currentGroup);
            } else {
              currentGroup.items.push(item);
            }
          }

          return groups.map((group, groupIdx) => (
            <SidebarGroup key={group.label || `ungrouped-${groupIdx}`}>
              {!collapsed && (
                <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/35 px-3">
                  {group.label || t('common.menu')}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = iconMap[item.icon];
                    const hasChildren = item.children && item.children.length > 0;
                    const isExpanded = expandedMenus.includes(item.path);
                    const isItemOrChildActive = isActive(item.path) || isParentActive(item);

                    if (hasChildren && !collapsed) {
                      return (
                        <Collapsible
                          key={item.path}
                          open={isExpanded}
                          onOpenChange={() => toggleMenu(item.path)}
                        >
                          <SidebarMenuItem>
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 w-full justify-between",
                                  isItemOrChildActive
                                    ? "bg-sidebar-primary/10 text-sidebar-foreground font-medium"
                                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  {Icon && <Icon className="h-5 w-5 shrink-0" />}
                                  <span>{getNavLabel(item.label)}</span>
                                </div>
                                <ChevronDown className={cn(
                                  "h-4 w-4 shrink-0 transition-transform",
                                  isExpanded && "rotate-180"
                                )} />
                              </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pl-4">
                              <SidebarMenu>
                                <SidebarMenuItem>
                                  <SidebarMenuButton
                                    asChild
                                    isActive={isActive(item.path)}
                                  >
                                    <Link
                                      to={item.path}
                                      className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200",
                                        isActive(item.path)
                                          ? "bg-sidebar-primary/15 text-sidebar-foreground font-medium"
                                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                                      )}
                                    >
                                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                                      <span>{getNavLabel(item.label)}</span>
                                    </Link>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                                {item.children!.map((child) => {
                                  const ChildIcon = iconMap[child.icon];
                                  return (
                                    <SidebarMenuItem key={child.path}>
                                      <SidebarMenuButton
                                        asChild
                                        isActive={isActive(child.path)}
                                      >
                                        <Link
                                          to={child.path}
                                          className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200",
                                            isActive(child.path)
                                              ? "bg-sidebar-primary/15 text-sidebar-foreground font-medium"
                                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                                          )}
                                        >
                                          {ChildIcon && <ChildIcon className="h-4 w-4 shrink-0" />}
                                          <span>{getNavLabel(child.label)}</span>
                                        </Link>
                                      </SidebarMenuButton>
                                    </SidebarMenuItem>
                                  );
                                })}
                              </SidebarMenu>
                            </CollapsibleContent>
                          </SidebarMenuItem>
                        </Collapsible>
                      );
                    }

                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(item.path)}
                          tooltip={collapsed ? getNavLabel(item.label) : undefined}
                        >
                          <Link
                            to={item.path}
                            data-tour={
                              item.path === '/today' ? 'nav-today' :
                              item.path === '/lines' ? 'nav-lines' :
                              item.path === '/work-orders' ? 'nav-work-orders' :
                              item.path === '/blockers' ? 'nav-blockers' :
                              undefined
                            }
                            className={cn(
                              "relative flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200",
                              isActive(item.path)
                                ? "bg-sidebar-primary/15 text-sidebar-primary-foreground font-medium shadow-sm"
                                : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                            )}
                          >
                            {isActive(item.path) && !collapsed && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary shadow-[0_0_8px_hsl(var(--sidebar-primary)/0.5)]" />
                            )}
                            {Icon && (
                              <div className={cn(
                                "relative shrink-0 transition-colors duration-200",
                                isActive(item.path) ? "text-sidebar-primary" : ""
                              )}>
                                <Icon className="h-5 w-5" />
                                {collapsed && item.path === '/setup' && showSetupBadge && (
                                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-sidebar" />
                                )}
                                {collapsed && item.path === '/dispatch/approvals' && pendingDispatchCount > 0 && (
                                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-sidebar" />
                                )}
                              </div>
                            )}
                            {!collapsed && (
                              <span className="flex items-center gap-2">
                                {getNavLabel(item.label)}
                                {item.path === '/setup' && showSetupBadge && (
                                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
                                    {setupRemaining}
                                  </span>
                                )}
                                {item.path === '/dispatch/approvals' && pendingDispatchCount > 0 && (
                                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white px-1">
                                    {pendingDispatchCount}
                                  </span>
                                )}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ));
        })()}

        {/* Bottom navigation items (settings section) */}
        {(navItems as NavItem[]).some(item => item.bottom) && (
          <SidebarGroup className="mt-auto">
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/35 px-3">
                Settings
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {(navItems as NavItem[]).filter(item => item.bottom).map((item) => {
                  const Icon = iconMap[item.icon];
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.path)}
                        tooltip={collapsed ? getNavLabel(item.label) : undefined}
                      >
                        <Link
                          to={item.path}
                          className={cn(
                            "relative flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200",
                            isActive(item.path)
                              ? "bg-sidebar-primary/15 text-sidebar-primary-foreground font-medium shadow-sm"
                              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                          )}
                        >
                          {isActive(item.path) && !collapsed && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary shadow-[0_0_8px_hsl(var(--sidebar-primary)/0.5)]" />
                          )}
                          {Icon && (
                            <div className={cn(
                              "relative shrink-0 transition-colors duration-200",
                              isActive(item.path) ? "text-sidebar-primary" : ""
                            )}>
                              <Icon className="h-5 w-5" />
                              {collapsed && item.path === '/setup' && showSetupBadge && (
                                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-sidebar" />
                              )}
                            </div>
                          )}
                          {!collapsed && (
                            <span className="flex items-center gap-2">
                              {getNavLabel(item.label)}
                              {item.path === '/setup' && showSetupBadge && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
                                  {setupRemaining}
                                </span>
                              )}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className={cn("border-t border-white/[0.08]", collapsed ? "p-2" : "p-4")}>
        {/* Version and Update */}
        {!collapsed && (
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/[0.08]">
            <span className="text-[11px] font-mono text-sidebar-foreground/35">
              v{appVersion}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className="h-6 px-2 text-[11px] text-sidebar-foreground/45 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 rounded-md"
              title="Check for updates"
            >
              {isCheckingUpdate ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              {isCheckingUpdate ? "Checking..." : "Update"}
            </Button>
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-1 mb-2 pb-2 border-b border-white/[0.08]">
            <span className="text-[9px] font-mono text-sidebar-foreground/35">
              v{appVersion}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className="h-6 w-6 text-sidebar-foreground/45 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
              title="Check for updates"
            >
              {isCheckingUpdate ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
        )}

        {/* User profile */}
        <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "gap-3")}>
          <Avatar className={cn("shrink-0 ring-2 ring-sidebar-primary/20", collapsed ? "h-7 w-7" : "h-9 w-9")}>
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className={cn("bg-sidebar-primary/20 text-sidebar-primary font-semibold", collapsed ? "text-xs" : "text-sm")}>
              {profile ? getInitials(profile.full_name) : '?'}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">
                {profile?.full_name}
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/40">
                {t(`roles.${highestRole}`)}
              </span>
            </div>
          )}
          {!collapsed && (
            <>
              <button
                onClick={async () => { await resetTour(); startTour(); }}
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-all duration-200"
                title="Restart tour"
              >
                <PlayCircle className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => openExternalUrl('https://productionportal.co')}
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-all duration-200"
                title={t('common.help') || 'Help'}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="shrink-0 h-7 w-7 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                title={t('common.signOut') || 'Sign Out'}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="mt-2 w-full justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 text-xs"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              {t('common.collapse')}
            </>
          )}
        </Button>
      </SidebarFooter>
      </Sidebar>
    </>
  );
}
