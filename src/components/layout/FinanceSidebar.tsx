import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  CreditCard,
  Calculator,
  Wallet,
  Landmark,
  Users,
  BarChart3,
  ArrowLeft,
  LogOut,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Settings,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/capacitor";
import logoSvg from "@/assets/logo.svg";

interface FinanceNavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

const FINANCE_NAV: { group: string; items: FinanceNavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { path: "/finance/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    group: "Receivables",
    items: [
      { path: "/finance/invoices", label: "Invoicing", icon: Receipt },
      { path: "/finance/payments", label: "Payments", icon: Wallet },
      { path: "/finance/contracts", label: "Sales Contracts", icon: FileText },
    ],
  },
  {
    group: "Costs",
    items: [
      { path: "/finance/production-financials", label: "Production Financials", icon: BarChart3 },
      { path: "/finance/costing", label: "Order Costing", icon: Calculator },
      { path: "/finance/export-costs", label: "Export Costs", icon: BarChart3 },
    ],
  },
  {
    group: "Banking",
    items: [
      { path: "/finance/lc", label: "LC Management", icon: Landmark },
      { path: "/finance/buyers", label: "Buyer Summary", icon: Users },
    ],
  },
  {
    group: "Payroll",
    items: [
      { path: "/finance/workers", label: "Workers", icon: Users, comingSoon: true },
      { path: "/finance/payroll", label: "Payroll", icon: CreditCard, comingSoon: true },
      { path: "/finance/compliance", label: "Compliance Reports", icon: FileText, comingSoon: true },
    ],
  },
  {
    group: "Configuration",
    items: [
      { path: "/finance/settings", label: "Finance Settings", icon: Settings },
    ],
  },
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function FinanceSidebar() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar
      className={cn(
        "border-r border-white/[0.06] transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
      style={{
        "--sidebar-gradient":
          "linear-gradient(180deg,#2d1754 0%,#3b2068 35%,#4a2a7a 65%,#56328a 100%)",
      } as React.CSSProperties}
      collapsible="icon"
    >
      {/* Header */}
      <SidebarHeader className="border-b border-white/[0.08] p-4">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <img
              src={logoSvg}
              alt="Finance Portal"
              className="h-10 w-10 rounded-xl shadow-lg shadow-purple-500/20"
            />
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/10" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sidebar-foreground tracking-tight">Finance Portal</span>
              <span className="text-[11px] text-sidebar-foreground/40 truncate">ProductionPortal</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent className="custom-scrollbar">
        {FINANCE_NAV.map((group) => (
          <SidebarGroup key={group.group}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/35 px-3">
                {group.group}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild={!item.comingSoon}
                        isActive={active}
                        tooltip={collapsed ? item.label : undefined}
                      >
                        {item.comingSoon ? (
                          <div
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 cursor-not-allowed opacity-40",
                              "text-sidebar-foreground/60"
                            )}
                          >
                            <Icon className="h-5 w-5 shrink-0" />
                            {!collapsed && (
                              <span className="flex items-center gap-2 text-sm">
                                {item.label}
                                <span className="text-[9px] font-semibold uppercase tracking-wider bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full">
                                  Soon
                                </span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <Link
                            to={item.path}
                            className={cn(
                              "relative flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200",
                              active
                                ? "bg-sidebar-primary/15 text-sidebar-primary-foreground font-medium shadow-sm"
                                : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                            )}
                          >
                            {active && !collapsed && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-purple-400 shadow-[0_0_8px_rgb(192,132,252/0.5)]" />
                            )}
                            <Icon className={cn("h-5 w-5 shrink-0", active ? "text-purple-300" : "")} />
                            {!collapsed && <span>{item.label}</span>}
                          </Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className={cn("border-t border-white/[0.08]", collapsed ? "p-2" : "p-4")}>
        {/* Back to Production */}
        <div className={cn("mb-3 pb-3 border-b border-white/[0.08]", collapsed ? "flex justify-center" : "")}>
          {collapsed ? (
            <button
              onClick={() => navigate("/dashboard")}
              className="h-7 w-7 flex items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-all duration-200"
              title="Back to Production"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => navigate("/dashboard")}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-all duration-200"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              Back to Production
            </button>
          )}
        </div>

        {/* User */}
        <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "gap-3")}>
          <Avatar className={cn("shrink-0 ring-2 ring-purple-500/20", collapsed ? "h-7 w-7" : "h-9 w-9")}>
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className={cn("bg-purple-500/20 text-purple-300 font-semibold", collapsed ? "text-xs" : "text-sm")}>
              {profile ? getInitials(profile.full_name) : "?"}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">{profile?.full_name}</span>
              <span className="truncate text-[11px] text-sidebar-foreground/40">Finance Portal</span>
            </div>
          )}
          {!collapsed && (
            <>
              <button
                onClick={() => openExternalUrl("https://productionportal.co")}
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-all duration-200"
                title="Help"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className="shrink-0 h-7 w-7 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                title="Sign Out"
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
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4 mr-2" />Collapse</>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
