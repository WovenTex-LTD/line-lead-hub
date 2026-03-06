import { useEffect } from "react";
import { Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BuyerSidebar } from "./BuyerSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useBuyerMemberships } from "@/hooks/useBuyerMemberships";
import { useSwitchWorkspace } from "@/hooks/useSwitchWorkspace";
import { Loader2, RefreshCw, AlertTriangle, Home, Building2, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NetworkStatusIndicator } from "@/components/NetworkStatusIndicator";
import { NotificationBell } from "@/components/NotificationBell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function PageErrorFallback() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        This page crashed unexpectedly. You can reload or go back to the dashboard.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate("/buyer/dashboard")}>
          <Home className="h-4 w-4 mr-2" />
          Dashboard
        </Button>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reload Page
        </Button>
      </div>
    </div>
  );
}

export function BuyerLayout() {
  const { user, loading, factory, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { memberships, loading: membershipsLoading, membershipCount } = useBuyerMemberships();
  const { switchWorkspace, switching } = useSwitchWorkspace();

  // Switch status bar to light color for the authenticated app
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', '#f1f3f5');
    return () => { meta?.setAttribute('content', '#0f172a'); };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SidebarProvider
      defaultOpen={true}
      className="w-full min-h-[100dvh] overflow-x-hidden bg-background"
    >
      <div
        className="flex w-full flex-col overflow-x-hidden bg-background"
        style={{ minHeight: "100dvh" }}
      >
        {/* Safe-area background filler (top) */}
        <div
          className="w-full bg-background"
          style={{ height: "env(safe-area-inset-top, 0px)" }}
          aria-hidden="true"
        />

        <div className="flex flex-1 min-w-0 overflow-x-hidden">
          <BuyerSidebar />
          <div className="flex flex-1 min-w-0 flex-col overflow-x-hidden">
            {/* Header */}
            <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
              <SidebarTrigger />

              <div className="flex-1" />

              <NetworkStatusIndicator />
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.location.reload()}
                title="Refresh page"
              >
                <RefreshCw className="h-5 w-5" />
              </Button>

              {factory && membershipCount <= 1 && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{factory.name}</span>
                </div>
              )}

              {factory && membershipCount > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="hidden md:flex items-center gap-2" disabled={switching}>
                      <Building2 className="h-4 w-4" />
                      <span className="max-w-[160px] truncate">{factory.name}</span>
                      {switching ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {memberships.map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        onClick={() => {
                          if (!switching && m.factory_id !== profile?.factory_id) {
                            switchWorkspace(m.factory_id);
                          }
                        }}
                        className="flex items-center justify-between"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{m.factory_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {m.po_count} PO{m.po_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {m.factory_id === profile?.factory_id && (
                          <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate("/buyer/select-workspace")}>
                      All Workspaces
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </header>

            {/* Main content */}
            <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-gradient-to-br from-slate-50 via-background to-blue-50/30 dark:from-background dark:via-background dark:to-background">
              <div className="w-full px-4 md:px-6 pb-6">
                <ErrorBoundary
                  key={location.pathname}
                  fallback={<PageErrorFallback />}
                >
                  <Outlet />
                </ErrorBoundary>
              </div>
            </main>
          </div>
        </div>

        {/* Safe-area background filler (bottom) */}
        <div
          className="w-full bg-background"
          style={{ height: "env(safe-area-inset-bottom, 0px)" }}
          aria-hidden="true"
        />
      </div>
    </SidebarProvider>
  );
}
