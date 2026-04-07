import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  UserCog,
  LogOut,
  HelpCircle,
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

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  CalendarDays,
  FileText,
  UserCog,
};

const BUYER_NAV = [
  { path: "/buyer/dashboard", label: "PO Overview", icon: "LayoutDashboard" },
  { path: "/buyer/today", label: "Today Updates", icon: "CalendarDays" },
  { path: "/buyer/submissions", label: "All Submissions", icon: "FileText" },
  { path: "/buyer/preferences", label: "My Preferences", icon: "UserCog" },
];

export function BuyerSidebar() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const { state, toggleSidebar, isMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";

  const isActive = (path: string) => location.pathname === path;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar
      className={cn(
        "border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
      collapsible="icon"
    >
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <img
            src={logoSvg}
            alt="ProductionPortal"
            className="h-10 w-10 shrink-0 rounded-lg"
          />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sidebar-foreground">
                ProductionPortal
              </span>
              <span className="text-xs text-sidebar-foreground/60">
                Powered by WovenTex
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-foreground/50">
              Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {BUYER_NAV.map((item) => {
                const Icon = iconMap[item.icon];
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.path)}
                      tooltip={collapsed ? item.label : undefined}
                    >
                      <Link
                        to={item.path}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                          isActive(item.path)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        {Icon && <Icon className="h-5 w-5 shrink-0" />}
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter
        className={cn(
          "border-t border-sidebar-border",
          collapsed ? "p-2" : "p-4"
        )}
      >
        <div
          className={cn(
            "flex items-center",
            collapsed ? "flex-col gap-2" : "gap-3"
          )}
        >
          <Avatar className={cn("shrink-0", collapsed ? "h-7 w-7" : "h-9 w-9")}>
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback
              className={cn(
                "bg-sidebar-primary text-sidebar-primary-foreground",
                collapsed ? "text-xs" : "text-sm"
              )}
            >
              {profile ? getInitials(profile.full_name) : "?"}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-sidebar-foreground">
                {profile?.full_name}
              </span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                Buyer
              </span>
            </div>
          )}
          {!collapsed && (
            <>
              <button
                onClick={() => openExternalUrl("https://productionportal.co")}
                className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                title="Help"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
