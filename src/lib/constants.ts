// ProductionPortal Constants

export const APP_NAME = "ProductionPortal";
export const APP_DESCRIPTION = "Garment Factory Production Tracking System";

// Dev/test factory — Knowledge Base and Chat Analytics are only
// available for this factory until general release.
export const DEV_FACTORY_ID_PREFIX = "f7b308bb";

// Role definitions
export const ROLES = {
  WORKER: 'worker',
  ADMIN: 'admin',
  OWNER: 'owner',
  STORAGE: 'storage',
  CUTTING: 'cutting',
  SEWING: 'sewing',
  FINISHING: 'finishing',
  BUYER: 'buyer',
  SUPERADMIN: 'superadmin',
  GATE_OFFICER: 'gate_officer',
} as const;

export type AppRole = typeof ROLES[keyof typeof ROLES];

// Roles that are department-wide (all lines / all POs) — no line assignment needed
export const DEPARTMENT_WIDE_ROLES: AppRole[] = ['storage', 'cutting', 'finishing', 'buyer'];

// Role display names
export const ROLE_LABELS: Record<AppRole, string> = {
  worker: 'Manager',
  admin: 'Admin',
  owner: 'Owner',
  storage: 'Storage',
  cutting: 'Cutting',
  sewing: 'Sewing',
  finishing: 'Finishing',
  buyer: 'Buyer / Client',
  superadmin: 'Super Admin',
  gate_officer: 'Gate Officer',
};

// Blocker impact levels
export const BLOCKER_IMPACTS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type BlockerImpact = typeof BLOCKER_IMPACTS[keyof typeof BLOCKER_IMPACTS];

export const BLOCKER_IMPACT_LABELS: Record<BlockerImpact, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const BLOCKER_IMPACT_COLORS: Record<BlockerImpact, string> = {
  low: 'blocker-low',
  medium: 'blocker-medium',
  high: 'blocker-high',
  critical: 'blocker-critical',
};

// Blocker status
export const BLOCKER_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
} as const;

export type BlockerStatus = typeof BLOCKER_STATUS[keyof typeof BLOCKER_STATUS];

export const BLOCKER_STATUS_LABELS: Record<BlockerStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
  UNLIMITED: 'unlimited',
} as const;

export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[keyof typeof SUBSCRIPTION_TIERS];

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
  unlimited: 'Unlimited',
};

export const TIER_LIMITS: Record<SubscriptionTier, number> = {
  starter: 10,
  professional: 30,
  enterprise: 80,
  unlimited: 999,
};

// Shifts
export const SHIFTS = [
  { value: 'day', label: 'Day Shift' },
  { value: 'night', label: 'Night Shift' },
  { value: 'overtime', label: 'Overtime' },
] as const;

// Stage Progress Options (fixed percentage values)
export const STAGE_PROGRESS_OPTIONS = [
  { value: 0, label: '0%' },
  { value: 5, label: '5%' },
  { value: 15, label: '15%' },
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 60, label: '60%' },
  { value: 75, label: '75%' },
  { value: 80, label: '80%' },
  { value: 90, label: '90%' },
  { value: 100, label: '100%' },
] as const;

// Default stages (AppSheet specification)
export const DEFAULT_STAGES = [
  { code: 'PRE_PROD', name: 'Pre Production', sequence: 1 },
  { code: 'MAT_INHOUSE', name: 'Materials In-House', sequence: 2 },
  { code: 'CUT', name: 'Cutting', sequence: 3 },
  { code: 'SEW', name: 'Sewing', sequence: 4 },
  { code: 'PROCESS', name: 'Process (Wash/Print/Embroidery)', sequence: 5 },
  { code: 'FINISH', name: 'Finishing', sequence: 6 },
  { code: 'PACK', name: 'Packing', sequence: 7 },
  { code: 'FINAL_QC', name: 'Final QC', sequence: 8 },
  { code: 'READY_SHIP', name: 'Ready for Shipment', sequence: 9 },
  { code: 'SHIPPED', name: 'Shipped', sequence: 10 },
  { code: 'ON_HOLD', name: 'On Hold', sequence: 11 },
];

// Default blocker types
export const DEFAULT_BLOCKER_TYPES = [
  { code: 'MATERIAL', name: 'Material Shortage', default_owner: 'Procurement', default_impact: 'high' as BlockerImpact },
  { code: 'MACHINE', name: 'Machine Breakdown', default_owner: 'Maintenance', default_impact: 'high' as BlockerImpact },
  { code: 'MANPOWER', name: 'Manpower Issue', default_owner: 'HR', default_impact: 'medium' as BlockerImpact },
  { code: 'QUALITY', name: 'Quality Issue', default_owner: 'QC', default_impact: 'high' as BlockerImpact },
  { code: 'PLANNING', name: 'Planning Issue', default_owner: 'Planning', default_impact: 'medium' as BlockerImpact },
  { code: 'POWER', name: 'Power Outage', default_owner: 'Maintenance', default_impact: 'critical' as BlockerImpact },
  { code: 'OTHER', name: 'Other', default_owner: 'Production', default_impact: 'low' as BlockerImpact },
];

// Default stage progress options (for dropdown settings)
export const DEFAULT_STAGE_PROGRESS_OPTIONS = [
  { label: '0%', sort_order: 1 },
  { label: '25%', sort_order: 2 },
  { label: '50%', sort_order: 3 },
  { label: '75%', sort_order: 4 },
  { label: '100%', sort_order: 5 },
];

// Default next milestone options (for dropdown settings)
export const DEFAULT_NEXT_MILESTONE_OPTIONS = [
  { label: 'Continue current stage', sort_order: 1 },
  { label: 'Move to next stage', sort_order: 2 },
  { label: 'Start Cutting', sort_order: 3 },
  { label: 'Start Sewing', sort_order: 4 },
  { label: 'Start Process (Wash/Print/Embroidery)', sort_order: 5 },
  { label: 'Start Finishing', sort_order: 6 },
  { label: 'Start Packing', sort_order: 7 },
  { label: 'Start Final QC', sort_order: 8 },
  { label: 'Ready for Shipment', sort_order: 9 },
];

// Default blocker owner options (for dropdown settings)
export const DEFAULT_BLOCKER_OWNER_OPTIONS = [
  { label: 'Factory', sort_order: 1 },
  { label: 'Brand / Buyer', sort_order: 2 },
  { label: 'Supplier', sort_order: 3 },
  { label: 'Logistics / Forwarder', sort_order: 4 },
];

// Default blocker impact options (for dropdown settings)
export const DEFAULT_BLOCKER_IMPACT_OPTIONS = [
  { label: 'No Impact', sort_order: 1 },
  { label: 'Risk (may delay)', sort_order: 2 },
  { label: 'Delay 1–2 days', sort_order: 3 },
  { label: 'Delay 3–7 days', sort_order: 4 },
  { label: 'Delay 8+ days', sort_order: 5 },
  { label: 'Unknown', sort_order: 6 },
];

// Navigation items per role
// Worker navigation is determined dynamically based on department
export const NAV_ITEMS = {
  worker_sewing: [
    { path: '/sewing/morning-targets', label: 'Sewing Morning Targets', icon: 'Crosshair' },
    { path: '/sewing/end-of-day', label: 'Sewing End of Day', icon: 'ClipboardCheck' },
    { path: '/sewing/my-submissions', label: 'My Submissions', icon: 'FileText' },
    { path: '/sewing/cutting-handoffs', label: 'Cutting Handoffs', icon: 'Scissors' },
    { path: '/report-blocker', label: 'Report Blocker', icon: 'AlertTriangle' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog' },
  ],
  worker_finishing: [
    { path: '/finishing/daily-target', label: 'Daily Target', icon: 'Crosshair' },
    { path: '/finishing/daily-output', label: 'End of Day Output', icon: 'ClipboardCheck' },
    { path: '/finishing/my-submissions', label: 'My Submissions', icon: 'FileText' },
    { path: '/report-blocker', label: 'Report Blocker', icon: 'AlertTriangle' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog' },
  ],
  worker: [
    { path: '/sewing/morning-targets', label: 'Sewing Morning Targets', icon: 'Crosshair' },
    { path: '/sewing/end-of-day', label: 'Sewing End of Day', icon: 'ClipboardCheck' },
    { path: '/sewing/cutting-handoffs', label: 'Cutting Handoffs', icon: 'Scissors' },
    { path: '/finishing/daily-target', label: 'Finishing Daily Target', icon: 'Crosshair' },
    { path: '/finishing/daily-output', label: 'Finishing End of Day', icon: 'ClipboardCheck' },
    { path: '/sewing/my-submissions', label: 'Sewing Submissions', icon: 'FileText' },
    { path: '/finishing/my-submissions', label: 'Finishing Submissions', icon: 'FileText' },
    { path: '/report-blocker', label: 'Report Blocker', icon: 'AlertTriangle' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog' },
  ],
  admin: [
    { path: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { path: '/today', label: 'Today Updates', icon: 'CalendarDays' },
    { path: '/lines', label: 'Lines', icon: 'Rows3' },
    { path: '/week', label: 'This Week', icon: 'Calendar' },
    { path: '/submissions', label: 'All Submissions', icon: 'FileText' },
    { path: '/work-orders', label: 'Work Orders', icon: 'Receipt' },
    { path: '/blockers', label: 'Blockers', icon: 'AlertTriangle' },
    { path: '/insights', label: 'Insights', icon: 'TrendingUp' },
    { path: '/finances', label: 'Finances', icon: 'DollarSign' },
    { path: '/dispatch/approvals', label: 'Dispatch Approvals', icon: 'CheckSquare' },
    { path: '/dispatch/all', label: 'All Dispatches', icon: 'Archive' },
    { path: '/setup/knowledge-base', label: 'Knowledge Base', icon: 'BookOpen' },
    { path: '/setup/chat-analytics', label: 'Chat Analytics', icon: 'BarChart3' },
    { path: '/setup/error-logs', label: 'Error Logs', icon: 'Bug' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog', bottom: true },
    { path: '/billing-plan', label: 'Billing & Plan', icon: 'CreditCard', bottom: true },
    { path: '/setup', label: 'Factory Setup', icon: 'Settings', bottom: true },
    { path: '/users', label: 'Users', icon: 'Users', bottom: true },
  ],
  owner: [
    { path: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { path: '/today', label: 'Today Updates', icon: 'CalendarDays' },
    { path: '/lines', label: 'Lines', icon: 'Rows3' },
    { path: '/week', label: 'This Week', icon: 'Calendar' },
    { path: '/submissions', label: 'All Submissions', icon: 'FileText' },
    { path: '/work-orders', label: 'Work Orders', icon: 'Receipt' },
    { path: '/blockers', label: 'Blockers', icon: 'AlertTriangle' },
    { path: '/insights', label: 'Insights', icon: 'TrendingUp' },
    { path: '/finances', label: 'Finances', icon: 'DollarSign' },
    { path: '/dispatch/approvals', label: 'Dispatch Approvals', icon: 'CheckSquare' },
    { path: '/dispatch/all', label: 'All Dispatches', icon: 'Archive' },
    { path: '/setup/knowledge-base', label: 'Knowledge Base', icon: 'BookOpen' },
    { path: '/setup/chat-analytics', label: 'Chat Analytics', icon: 'BarChart3' },
    { path: '/setup/error-logs', label: 'Error Logs', icon: 'Bug' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog', bottom: true },
    { path: '/billing-plan', label: 'Billing & Plan', icon: 'CreditCard', bottom: true },
    { path: '/setup', label: 'Factory Setup', icon: 'Settings', bottom: true },
    { path: '/users', label: 'Users', icon: 'Users', bottom: true },
  ],
  storage: [
    { path: '/storage', label: 'Bin Card Entry', icon: 'Warehouse' },
    { path: '/storage/history', label: 'All Bin Cards', icon: 'Warehouse' },
    { path: '/report-blocker', label: 'Report Blocker', icon: 'AlertTriangle' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog' },
  ],
  cutting: [
    { path: '/cutting/morning-targets', label: 'Cutting Morning Targets', icon: 'Crosshair' },
    { path: '/cutting/end-of-day', label: 'Cutting End of Day', icon: 'ClipboardCheck' },
    { path: '/cutting/submissions', label: 'All Submissions', icon: 'FileText' },
    { path: '/report-blocker', label: 'Report Blocker', icon: 'AlertTriangle' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog' },
  ],
  sewing: [
    { path: '/sewing/morning-targets', label: 'Sewing Morning Targets', icon: 'Crosshair' },
    { path: '/sewing/end-of-day', label: 'Sewing End of Day', icon: 'ClipboardCheck' },
    { path: '/sewing/my-submissions', label: 'My Submissions', icon: 'FileText' },
    { path: '/sewing/cutting-handoffs', label: 'Cutting Handoffs', icon: 'Scissors' },
    { path: '/report-blocker', label: 'Report Blocker', icon: 'AlertTriangle' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog' },
  ],
  finishing: [
    { path: '/finishing/daily-target', label: 'Daily Target', icon: 'Crosshair' },
    { path: '/finishing/daily-output', label: 'End of Day Output', icon: 'ClipboardCheck' },
    { path: '/finishing/my-submissions', label: 'My Submissions', icon: 'FileText' },
    { path: '/report-blocker', label: 'Report Blocker', icon: 'AlertTriangle' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog' },
  ],
  buyer: [
    { path: '/buyer/dashboard', label: 'PO Overview', icon: 'LayoutDashboard' },
    { path: '/buyer/today', label: 'Today Updates', icon: 'CalendarDays' },
    { path: '/buyer/submissions', label: 'All Submissions', icon: 'FileText' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog' },
  ],
  gate_officer: [
    { path: '/dispatch/new', label: 'New Dispatch', icon: 'Truck' },
    { path: '/dispatch/history', label: 'My Dispatches', icon: 'ClipboardList' },
    { path: '/preferences', label: 'My Preferences', icon: 'UserCog', bottom: true },
  ],
};
