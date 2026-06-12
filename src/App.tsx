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
import { SlotGuard } from "@/components/custom-forms/SlotGuard";
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
const GateDispatchForm = lazy(() => import("./pages/GateDispatchForm"));
const MyDispatchHistory = lazy(() => import("./pages/MyDispatchHistory"));
const PendingApprovals = lazy(() => import("./pages/PendingApprovals"));
const DispatchReview = lazy(() => import("./pages/DispatchReview"));
const AllDispatches = lazy(() => import("./pages/AllDispatches"));
const GatePassView = lazy(() => import("./pages/GatePassView"));
const Schedule = lazy(() => import("./pages/Schedule"));
const BuyerDashboard = lazy(() => import("./pages/buyer/BuyerDashboard"));
const BuyerTodayUpdates = lazy(() => import("./pages/buyer/BuyerTodayUpdates"));
const BuyerSubmissions = lazy(() => import("./pages/buyer/BuyerSubmissions"));
const BuyerPODetails = lazy(() => import("./pages/buyer/BuyerPODetails"));
const BuyerWorkspaceSelector = lazy(() => import("./pages/buyer/BuyerWorkspaceSelector"));
const QCDashboard = lazy(() => import("./pages/quality/QCDashboard"));
const QCOrderManagerList = lazy(() => import("./pages/quality/QCOrderManagerList"));
const QCOrderManagerDetail = lazy(() => import("./pages/quality/QCOrderManagerDetail"));
const QCDailySheetList = lazy(() => import("./pages/quality/QCDailySheetList"));
const QCDailySheetDetail = lazy(() => import("./pages/quality/QCDailySheetDetail"));
const QCMyRecords = lazy(() => import("./pages/quality/QCMyRecords"));
const QCAdminTrackers = lazy(() => import("./pages/quality/QCAdminTrackers"));
const QCAdminSheets = lazy(() => import("./pages/quality/QCAdminSheets"));
const CustomFormsList = lazy(() => import("./pages/custom-forms/CustomFormsList"));
const FormSlotVersions = lazy(() => import("./pages/custom-forms/FormSlotVersions"));
const DefaultFormPreview = lazy(() => import("./pages/custom-forms/DefaultFormPreview"));
const CustomFormFill = lazy(() => import("./pages/custom-forms/CustomFormFill"));
const CustomFormSubmissionView = lazy(() => import("./pages/custom-forms/CustomFormSubmissionView"));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Disabled — tab switches were causing full data refetches that reset form state
      staleTime: 1000 * 60 * 5, // 5 minutes — data stays fresh longer, reducing unnecessary refetches
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
        <Route path="/sewing/morning-targets" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing']}><SlotGuard slotKey="sewing_morning_targets"><SewingMorningTargets /></SlotGuard></ProtectedRoute></SubscriptionGate>} />
        <Route path="/sewing/end-of-day" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing']}><SlotGuard slotKey="sewing_end_of_day"><SewingEndOfDay /></SlotGuard></ProtectedRoute></SubscriptionGate>} />

        <Route path="/finishing/daily-target" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'finishing']}><SlotGuard slotKey="finishing_daily_target"><FinishingDailyTarget /></SlotGuard></ProtectedRoute></SubscriptionGate>} />
        <Route path="/finishing/daily-output" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'finishing']}><SlotGuard slotKey="finishing_daily_output"><FinishingDailyOutput /></SlotGuard></ProtectedRoute></SubscriptionGate>} />
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
        <Route path="/schedule" element={<SubscriptionGate><ProtectedRoute adminOnly><Schedule /></ProtectedRoute></SubscriptionGate>} />
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
        <Route path="/cutting/morning-targets" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><SlotGuard slotKey="cutting_morning_targets"><CuttingMorningTargets /></SlotGuard></ProtectedRoute></SubscriptionGate>} />
        <Route path="/cutting/end-of-day" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><SlotGuard slotKey="cutting_end_of_day"><CuttingEndOfDay /></SlotGuard></ProtectedRoute></SubscriptionGate>} />
        <Route path="/cutting/form" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><CuttingForm /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/cutting/summary" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><CuttingSummary /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/cutting/submissions" element={<SubscriptionGate><ProtectedRoute allowedRoles={['cutting']}><CuttingAllSubmissions /></ProtectedRoute></SubscriptionGate>} />
        {/* Sewing module routes */}
        <Route path="/sewing/cutting-handoffs" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing']}><CuttingHandoffs /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/sewing/my-submissions" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker', 'sewing']}><SewingMySubmissions /></ProtectedRoute></SubscriptionGate>} />
        {/* Gate Dispatch module routes */}
        <Route path="/dispatch/new" element={<SubscriptionGate><ProtectedRoute allowedRoles={['gate_officer']}><GateDispatchForm /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/dispatch/edit/:id" element={<SubscriptionGate><ProtectedRoute allowedRoles={['gate_officer']}><GateDispatchForm /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/dispatch/history" element={<SubscriptionGate><ProtectedRoute allowedRoles={['gate_officer']}><MyDispatchHistory /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/dispatch/approvals" element={<SubscriptionGate><ProtectedRoute adminOnly><PendingApprovals /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/dispatch/review/:id" element={<SubscriptionGate><ProtectedRoute adminOnly><DispatchReview /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/dispatch/all" element={<SubscriptionGate><ProtectedRoute adminOnly><AllDispatches /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/dispatch/pass/:id" element={<SubscriptionGate><ProtectedRoute allowedRoles={['gate_officer', 'admin', 'owner']}><GatePassView /></ProtectedRoute></SubscriptionGate>} />

        {/* Quality Control. Dashboard is admin-only (oversight). Lists + detail
            pages are shared (admin reviews, QC inspects); create-CTAs are
            QC-only and gated inside each page. My Records is QC-only. */}
        <Route path="/quality" element={<SubscriptionGate><ProtectedRoute adminOnly><QCDashboard /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/quality/order-manager" element={<SubscriptionGate><ProtectedRoute allowedRoles={['qc']}><QCOrderManagerList /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/quality/order-manager/:trackerId" element={<SubscriptionGate><ProtectedRoute allowedRoles={['qc']}><QCOrderManagerDetail /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/quality/daily-sheet" element={<SubscriptionGate><ProtectedRoute allowedRoles={['qc']}><QCDailySheetList /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/quality/daily-sheet/:sheetId" element={<SubscriptionGate><ProtectedRoute allowedRoles={['qc']}><QCDailySheetDetail /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/quality/records" element={<SubscriptionGate><ProtectedRoute allowedRoles={['qc']}><QCMyRecords /></ProtectedRoute></SubscriptionGate>} />
        {/* Admin review pages — admin-only, distinct from the QC inspector list pages. */}
        <Route path="/quality/admin/trackers" element={<SubscriptionGate><ProtectedRoute adminOnly><QCAdminTrackers /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/quality/admin/sheets" element={<SubscriptionGate><ProtectedRoute adminOnly><QCAdminSheets /></ProtectedRoute></SubscriptionGate>} />
        {/* Custom Forms module routes */}
        <Route path="/forms" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker','admin','owner','sewing','finishing','cutting','qc','storage']}><CustomFormsList /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/forms/preview/:slotKey" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker','admin','owner','sewing','finishing','cutting','qc','storage']}><DefaultFormPreview /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/forms/versions/:ref" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker','admin','owner','sewing','finishing','cutting','qc','storage']}><FormSlotVersions /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/forms/:templateId" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker','admin','owner','sewing','finishing','cutting','qc','storage']}><CustomFormFill /></ProtectedRoute></SubscriptionGate>} />
        <Route path="/forms/submissions/:submissionId" element={<SubscriptionGate><ProtectedRoute adminOnly><CustomFormSubmissionView /></ProtectedRoute></SubscriptionGate>} />
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
