import { lazy, Suspense, useContext, useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, AuthContext } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { BuyerLayout } from "@/components/layout/BuyerLayout";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AccountNotActive } from "@/components/AccountNotActive";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isNative } from "@/lib/capacitor";
import i18n from "@/i18n/config";
import { useVersionCheck } from "@/hooks/useVersionCheck";

// Eager-loaded: needed immediately on every page load
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";

// Lazy-loaded: split into separate chunks per route
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SewingUpdate = lazy(() => import("./pages/SewingUpdate"));
const FinishingUpdate = lazy(() => import("./pages/FinishingUpdate"));
const SewingMorningTargets = lazy(() => import("./pages/SewingMorningTargets"));
const SewingEndOfDay = lazy(() => import("./pages/SewingEndOfDay"));
const FinishingDailyTarget = lazy(() => import("./pages/FinishingDailyTarget"));
const FinishingDailyOutput = lazy(() => import("./pages/FinishingDailyOutput"));
const FinishingMySubmissions = lazy(() => import("./pages/FinishingMySubmissions"));
const SewingMySubmissions = lazy(() => import("./pages/SewingMySubmissions"));
const FinishingOverview = lazy(() => import("./pages/FinishingOverview"));
const FinishingDailySummary = lazy(() => import("./pages/FinishingDailySummary"));
const MorningTargets = lazy(() => import("./pages/MorningTargets"));
const EndOfDay = lazy(() => import("./pages/EndOfDay"));
const FactorySetup = lazy(() => import("./pages/FactorySetup"));
const SetupHome = lazy(() => import("./pages/SetupHome"));
const WorkOrders = lazy(() => import("./pages/WorkOrders"));
const DropdownSettings = lazy(() => import("./pages/DropdownSettings"));
const TodayUpdates = lazy(() => import("./pages/TodayUpdates"));
const Blockers = lazy(() => import("./pages/Blockers"));
const ThisWeek = lazy(() => import("./pages/ThisWeek"));
const Lines = lazy(() => import("./pages/Lines"));
const WorkOrdersView = lazy(() => import("./pages/WorkOrdersView"));
const Insights = lazy(() => import("./pages/Insights"));
const UsersPage = lazy(() => import("./pages/Users"));
const AllSubmissions = lazy(() => import("./pages/AllSubmissions"));
const LegacyMySubmissionsRedirect = lazy(() => import("./pages/LegacyMySubmissionsRedirect"));
const Preferences = lazy(() => import("./pages/Preferences"));
const Subscription = lazy(() => import("./pages/Subscription"));
const Billing = lazy(() => import("./pages/Billing"));
const BillingPlan = lazy(() => import("./pages/BillingPlan"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ReportBlocker = lazy(() => import("./pages/ReportBlocker"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const ChatAnalytics = lazy(() => import("./pages/ChatAnalytics"));
const StorageBinCard = lazy(() => import("./pages/StorageBinCard"));
const StorageHistory = lazy(() => import("./pages/StorageHistory"));
const StorageDashboard = lazy(() => import("./pages/StorageDashboard"));
const CuttingForm = lazy(() => import("./pages/CuttingForm"));
const CuttingMorningTargets = lazy(() => import("./pages/CuttingMorningTargets"));
const CuttingEndOfDay = lazy(() => import("./pages/CuttingEndOfDay"));
const CuttingSummary = lazy(() => import("./pages/CuttingSummary"));
const CuttingAllSubmissions = lazy(() => import("./pages/CuttingAllSubmissions"));
const CuttingHandoffs = lazy(() => import("./pages/CuttingHandoffs"));
const ErrorLogs = lazy(() => import("./pages/ErrorLogs"));
const Finances = lazy(() => import("./pages/Finances"));
const BuyerDashboard = lazy(() => import("./pages/buyer/BuyerDashboard"));
const BuyerTodayUpdates = lazy(() => import("./pages/buyer/BuyerTodayUpdates"));
const BuyerSubmissions = lazy(() => import("./pages/buyer/BuyerSubmissions"));
const BuyerPODetails = lazy(() => import("./pages/buyer/BuyerPODetails"));
const BuyerWorkspaceSelector = lazy(() => import("./pages/buyer/BuyerWorkspaceSelector"));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 30, // 30s — prevents hammering on rapid tab switches
    },
  },
});

function AppRoutes() {
  const { loading } = useContext(AuthContext)!;
  const location = useLocation();

  // Auto-reload when a new deployment is detected
  useVersionCheck();

  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(location.search);

  const recoveryType = hashParams.get("type") ?? searchParams.get("type");
  const hasRecoverySignal = recoveryType === "recovery";

  const isForcedPasswordReset =
    typeof window !== "undefined" && sessionStorage.getItem("pp_force_password_reset") === "1";

  // Global i18n and font configuration
  useEffect(() => {
    // Sync HTML lang attribute with i18n language
    const updateLangAttribute = () => {
      const currentLang = i18n.language || 'en';
      document.documentElement.lang = currentLang;

      // Add language-specific font to body
      if (currentLang === 'bn') {
        document.body.style.fontFamily = "'Noto Sans Bengali', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif";
      } else if (currentLang === 'zh') {
        document.body.style.fontFamily = "'Noto Sans SC', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif";
      } else {
        document.body.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif";
      }
    };

    // Initial update
    updateLangAttribute();

    // Listen for language changes
    i18n.on('languageChanged', updateLangAttribute);

    return () => {
      i18n.off('languageChanged', updateLangAttribute);
    };
  }, []);

  useEffect(() => {
    if (hasRecoverySignal && typeof window !== "undefined") {
      sessionStorage.setItem("pp_force_password_reset", "1");
    }
  }, [hasRecoverySignal]);

  // Guard: during password recovery, always force /reset-password first.
  // Note: some flows don't include access_token in the hash; we still must route to reset UI.
  if (!loading && hasRecoverySignal && location.pathname !== "/reset-password") {
    return <Navigate to={`/reset-password${location.search}${location.hash}`} replace />;
  }

  // Guard: if we previously detected a recovery flow, block app navigation until it is completed.
  if (!loading && isForcedPasswordReset && location.pathname !== "/reset-password" && location.pathname !== "/auth") {
    return <Navigate to={`/reset-password${location.search}${location.hash}`} replace />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/subscription" element={isNative ? <AccountNotActive /> : <Subscription />} />

      {/* Protected routes with subscription gate */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<SubscriptionGate><ProtectedRoute adminOnly><Dashboard /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/update/sewing" element={<SubscriptionGate><ProtectedRoute adminOnly><SewingUpdate /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/update/finishing" element={<SubscriptionGate><ProtectedRoute adminOnly><FinishingUpdate /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/sewing/morning-targets" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing']}><SewingMorningTargets /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/sewing/end-of-day" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing']}><SewingEndOfDay /></ProtectedRoute></SubscriptionGate>} />

        <Route path="/finishing/daily-target" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'finishing']}><FinishingDailyTarget /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/finishing/daily-output" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'finishing']}><FinishingDailyOutput /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/finishing/my-submissions" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'finishing']}><FinishingMySubmissions /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/finishing/overview" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'finishing']}><FinishingOverview /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/finishing/daily-summary" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'finishing']}><FinishingDailySummary /></ProtectedRoute></SubscriptionGate>} />
        {/* Redirect old route to new daily target */}
        <Route path="/finishing/daily-sheet" element={<Navigate to="/finishing/daily-target" replace />} />
        <Route path="/morning-targets" element={<SubscriptionGate><ProtectedRoute adminOnly><MorningTargets /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/end-of-day" element={<SubscriptionGate><ProtectedRoute adminOnly><EndOfDay /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/report-blocker" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing', 'finishing', 'storage', 'cutting']}><ReportBlocker /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/today" element={<SubscriptionGate><ProtectedRoute adminOnly><TodayUpdates /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/blockers" element={<SubscriptionGate><ProtectedRoute adminOnly><Blockers /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/week" element={<SubscriptionGate><ProtectedRoute adminOnly><ThisWeek /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/lines" element={<SubscriptionGate><ProtectedRoute adminOnly><Lines /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/work-orders" element={<SubscriptionGate><ProtectedRoute adminOnly><WorkOrdersView /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/insights" element={<SubscriptionGate><ProtectedRoute adminOnly><Insights /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/finances" element={<SubscriptionGate><ProtectedRoute adminOnly><Finances /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/setup" element={<SubscriptionGate><ProtectedRoute adminOnly><SetupHome /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/setup/factory" element={<SubscriptionGate><ProtectedRoute adminOnly><FactorySetup /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/setup/work-orders" element={<SubscriptionGate><ProtectedRoute adminOnly><WorkOrders /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/setup/dropdowns" element={<SubscriptionGate><ProtectedRoute adminOnly><DropdownSettings /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/setup/knowledge-base" element={<SubscriptionGate><ProtectedRoute adminOnly><KnowledgeBase /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/setup/chat-analytics" element={<SubscriptionGate><ProtectedRoute adminOnly><ChatAnalytics /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/setup/error-logs" element={<SubscriptionGate><ProtectedRoute adminOnly><ErrorLogs /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/users" element={<SubscriptionGate><ProtectedRoute adminOnly><UsersPage /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/submissions" element={<SubscriptionGate><ProtectedRoute adminOnly><AllSubmissions /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/my-submissions" element={<SubscriptionGate><LegacyMySubmissionsRedirect /></SubscriptionGate>} />

        <Route path="/preferences" element={<SubscriptionGate><Preferences /></SubscriptionGate>} />
        <Route path="/billing" element={isNative ? <Navigate to="/dashboard" replace /> : <ProtectedRoute adminOnly><Billing /></ProtectedRoute>} />
        <Route path="/billing-plan" element={isNative ? <Navigate to="/dashboard" replace /> : <ProtectedRoute adminOnly><BillingPlan /></ProtectedRoute>} />
        {/* Storage module routes */}
        <Route path="/storage" element={<SubscriptionGate><ProtectedRoute allowedRoles={['storage']}><StorageBinCard /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/storage/history" element={<SubscriptionGate><ProtectedRoute allowedRoles={['storage']}><StorageHistory /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/storage/dashboard" element={<SubscriptionGate><ProtectedRoute allowedRoles={['storage']}><StorageDashboard /></ProtectedRoute></SubscriptionGate>} />
        {/* Cutting module routes */}
        <Route path="/cutting/morning-targets" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><CuttingMorningTargets /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/cutting/end-of-day" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><CuttingEndOfDay /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/cutting/form" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><CuttingForm /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/cutting/summary" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><CuttingSummary /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/cutting/submissions" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><CuttingAllSubmissions /></ProtectedRoute></SubscriptionGate>} />
        {/* Sewing module routes */}
        <Route path="/sewing/cutting-handoffs" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing']}><CuttingHandoffs /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/sewing/my-submissions" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing']}><SewingMySubmissions /></ProtectedRoute></SubscriptionGate>} />
      </Route>

      {/* Buyer portal routes */}
      <Route path="/buyer/select-workspace" element={<ProtectedRoute allowedRoles={['buyer']}><BuyerWorkspaceSelector /></ProtectedRoute>} />
      <Route element={<BuyerLayout />}>
        <Route path="/buyer/dashboard" element={<SubscriptionGate><ProtectedRoute allowedRoles={['buyer']}><BuyerDashboard /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/buyer/today" element={<SubscriptionGate><ProtectedRoute allowedRoles={['buyer']}><BuyerTodayUpdates /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/buyer/po/:poId" element={<SubscriptionGate><ProtectedRoute allowedRoles={['buyer']}><BuyerPODetails /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/buyer/submissions" element={<SubscriptionGate><ProtectedRoute allowedRoles={['buyer']}><BuyerSubmissions /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/buyer/preferences" element={<SubscriptionGate><Preferences /></SubscriptionGate>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        <ErrorBoundary>
          <AuthProvider>
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
