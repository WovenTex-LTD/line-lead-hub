import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, Mail, AlertTriangle, TrendingDown, Info, Loader2, CheckCircle, FileText, Target, Calendar, Clock, Scissors, MessageSquare, Truck } from "lucide-react";
import { toast } from "sonner";

interface NotificationPreference {
  id: string;
  notification_type: string;
  in_app_enabled: boolean | null;
  email_enabled: boolean | null;
}

type UserRole = "worker" | "supervisor" | "admin" | "owner" | "superadmin" | "storage" | "cutting" | "buyer" | "gate_officer";

interface NotificationType {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[]; // Which roles can see this notification type
}

// All notification types with role restrictions
const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  {
    type: "low_efficiency",
    label: "Low Efficiency Alerts",
    description: "Get notified when line efficiency drops below target",
    icon: TrendingDown,
    roles: ["supervisor", "admin", "owner", "superadmin"], // Management only
  },
  {
    type: "critical_blocker",
    label: "Critical Blockers",
    description: "Get notified when critical blockers are reported",
    icon: AlertTriangle,
    roles: ["supervisor", "admin", "owner", "superadmin"], // Management only
  },
  {
    type: "blocker_resolved",
    label: "Blocker Resolved",
    description: "Get notified when blockers are marked as resolved",
    icon: CheckCircle,
    roles: ["supervisor", "admin", "owner", "superadmin"], // Management only
  },
  {
    type: "production_notes",
    label: "Production Notes",
    description: "Get notified when production notes or remarks are added",
    icon: MessageSquare,
    roles: ["supervisor", "admin", "owner", "superadmin"], // Management only
  },
  {
    type: "work_order_updates",
    label: "Work Order Updates",
    description: "Get notified about work order status changes",
    icon: FileText,
    roles: ["supervisor", "admin", "owner", "superadmin"], // Management only
  },
  {
    type: "blocker_on_my_line",
    label: "Blockers on My Line",
    description: "Get notified when any blocker is reported on your assigned line",
    icon: AlertTriangle,
    roles: ["worker", "supervisor", "admin", "owner", "superadmin", "storage", "cutting"], // Everyone
  },
  {
    type: "late_submission",
    label: "Late Submissions",
    description: "Get notified when lines haven't submitted by the cutoff time",
    icon: Clock,
    roles: ["supervisor", "admin", "owner", "superadmin"], // Management only
  },
  {
    type: "cutting_handoff",
    label: "Cutting Handoff",
    description: "Get notified when cutting submits material for your sewing line",
    icon: Scissors,
    roles: ["worker"], // Sewing line leads only
  },
  {
    type: "target_achieved",
    label: "Target Achieved",
    description: "Get notified when production targets are met",
    icon: Target,
    roles: ["worker", "supervisor", "admin", "owner", "superadmin", "storage", "cutting"], // Everyone
  },
  {
    type: "daily_summary",
    label: "Daily Summary",
    description: "Receive daily production summary reports",
    icon: Calendar,
    roles: ["supervisor", "admin", "owner", "superadmin"], // Management only
  },
  {
    type: "shift_reminder",
    label: "Shift Reminders",
    description: "Get reminders before shift starts",
    icon: Clock,
    roles: ["worker", "supervisor", "admin", "owner", "superadmin", "storage", "cutting"], // Everyone
  },
  {
    type: "general",
    label: "General Notifications",
    description: "System updates and general announcements",
    icon: Info,
    roles: ["worker", "supervisor", "admin", "owner", "superadmin", "storage", "cutting", "buyer"], // Everyone
  },
  // Gate Dispatch notifications
  {
    type: "dispatch_submitted",
    label: "Dispatch Submitted",
    description: "Get notified when the gate officer submits a dispatch request for approval",
    icon: Truck,
    roles: ["admin", "owner", "superadmin"],
  },
  {
    type: "dispatch_approved",
    label: "Dispatch Approved",
    description: "Get notified when your dispatch request is approved",
    icon: Truck,
    roles: ["gate_officer"],
  },
  {
    type: "dispatch_rejected",
    label: "Dispatch Rejected",
    description: "Get notified when your dispatch request is rejected",
    icon: Truck,
    roles: ["gate_officer"],
  },
  // Buyer-specific notifications
  {
    type: "po_production_update",
    label: "Production Updates",
    description: "Get notified when new production data is submitted for your POs",
    icon: FileText,
    roles: ["buyer"],
  },
  {
    type: "po_milestone",
    label: "PO Milestones",
    description: "Get notified when a PO reaches key progress milestones (25%, 50%, 75%, 100%)",
    icon: Target,
    roles: ["buyer"],
  },
  {
    type: "po_status_change",
    label: "PO Status Changes",
    description: "Get notified when a PO status changes (e.g. started, completed)",
    icon: CheckCircle,
    roles: ["buyer"],
  },
];

export function NotificationPreferences() {
  const { user, profile, roles } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Get the user's primary role (highest role they have)
  const userRole = useMemo((): UserRole => {
    const roleHierarchy: UserRole[] = ["superadmin", "owner", "admin", "supervisor", "buyer", "storage", "cutting", "gate_officer", "worker"];
    for (const role of roleHierarchy) {
      if (roles.some(r => r.role === role)) {
        return role;
      }
    }
    return "worker";
  }, [roles]);

  // Filter notification types based on user role
  const availableNotificationTypes = useMemo(() => {
    return ALL_NOTIFICATION_TYPES.filter(nt => nt.roles.includes(userRole));
  }, [userRole]);

  useEffect(() => {
    if (user && profile?.factory_id) {
      fetchPreferences();
    }
  }, [user, profile?.factory_id]);

  async function fetchPreferences() {
    if (!user) return;

    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.error("Error fetching preferences:", error);
      // Initialize with defaults if no preferences exist
      initializeDefaults();
      return;
    }

    if (data && data.length > 0) {
      setPreferences(data);
    } else {
      initializeDefaults();
    }
    setLoading(false);
  }

  async function initializeDefaults() {
    if (!user || !profile?.factory_id) return;

    const defaultPrefs = availableNotificationTypes.map((nt) => ({
      user_id: user.id,
      factory_id: profile.factory_id!,
      notification_type: nt.type,
      in_app_enabled: true,
      email_enabled: false,
    }));

    const { data, error } = await supabase
      .from("notification_preferences")
      .upsert(defaultPrefs, { onConflict: "user_id,notification_type" })
      .select();

    if (!error && data) {
      setPreferences(data);
    }
    setLoading(false);
  }

  async function updatePreference(
    notificationType: string,
    field: "in_app_enabled" | "email_enabled",
    value: boolean
  ) {
    if (!user) return;

    // Optimistic update
    setPreferences((prev) =>
      prev.map((p) =>
        p.notification_type === notificationType ? { ...p, [field]: value } : p
      )
    );

    const { error } = await supabase
      .from("notification_preferences")
      .update({ [field]: value })
      .eq("user_id", user.id)
      .eq("notification_type", notificationType);

    if (error) {
      console.error("Error updating preference:", error);
      toast.error("Failed to update preference");
      // Revert on error
      fetchPreferences();
    }
  }

  async function saveAllPreferences() {
    setSaving(true);
    toast.success("Preferences saved successfully");
    setSaving(false);
  }

  function getPreference(type: string): NotificationPreference | undefined {
    return preferences.find((p) => p.notification_type === type);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Configure how you want to receive notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          {/* Header row */}
          <div className="grid grid-cols-[1fr,auto,auto] gap-2 sm:gap-4 items-center pb-2 border-b">
            <div className="text-sm font-medium text-muted-foreground">
              Notification Type
            </div>
            <div className="flex items-center justify-center gap-1 text-sm font-medium text-muted-foreground w-14 sm:w-20">
              <Bell className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">In-App</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-sm font-medium text-muted-foreground w-14 sm:w-20">
              <Mail className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Email</span>
            </div>
          </div>

          {/* Preference rows */}
          {availableNotificationTypes.map((nt) => {
            const pref = getPreference(nt.type);
            const Icon = nt.icon;

            return (
              <div
                key={nt.type}
                className="grid grid-cols-[1fr,auto,auto] gap-2 sm:gap-4 items-center py-2"
              >
                <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                  <Icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <Label className="font-medium">{nt.label}</Label>
                    <p className="text-sm text-muted-foreground">
                      {nt.description}
                    </p>
                  </div>
                </div>
                <div className="flex justify-center w-14 sm:w-20">
                  <Switch
                    checked={pref?.in_app_enabled ?? true}
                    onCheckedChange={(checked) =>
                      updatePreference(nt.type, "in_app_enabled", checked)
                    }
                  />
                </div>
                <div className="flex justify-center w-14 sm:w-20">
                  <Switch
                    checked={pref?.email_enabled ?? false}
                    onCheckedChange={(checked) =>
                      updatePreference(nt.type, "email_enabled", checked)
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={saveAllPreferences} disabled={saving}>
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              'Save Preferences'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
