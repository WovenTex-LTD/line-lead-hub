import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, AlertTriangle, Info, CheckCircle2, Clock, Trash2, Settings, Scissors, FileText, Target, Truck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  is_read: boolean | null;
  created_at: string | null;
  data: unknown;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  // Get navigation path based on notification type and data
  const getNavigationPath = (notification: Notification): string | null => {
    const data = notification.data as Record<string, unknown> | null;

    switch (notification.type) {
      // Blocker notifications → Blockers page
      case "blocker":
      case "blocker_reported":
      case "critical_blocker":
      case "blocker_on_my_line":
      case "blocker_resolved":
        return "/blockers";

      // Efficiency alerts → Lines page (to see the specific line)
      case "low_efficiency":
      case "efficiency_alert":
      case "warning":
        return "/lines";

      // Target achieved → Lines page
      case "target_achieved":
        return "/lines";

      // Production notes → Today page (where submissions/notes live)
      case "production_notes":
        return "/today";

      // Late submission → Today page (to see what's missing)
      case "late_submission":
        return "/today";

      // Daily summary → Insights page (overview analytics)
      case "daily_summary":
        return "/insights";

      // Cutting handoff → Cutting handoffs page
      case "cutting_handoff":
        return "/sewing/cutting-handoffs";

      // Work order updates → Work orders page
      case "work_order_updates":
        return "/work-orders";

      // Dispatch notifications
      case "dispatch_submitted": {
        const dispatchId = data?.dispatch_request_id as string | undefined;
        if (dispatchId) return `/dispatch/review/${dispatchId}`;
        return "/dispatch/approvals";
      }
      case "dispatch_approved":
      case "dispatch_rejected": {
        const dispatchId = data?.dispatch_request_id as string | undefined;
        if (dispatchId) return `/dispatch/pass/${dispatchId}`;
        return "/dispatch/history";
      }

      // Shift reminders → Dashboard (home/overview)
      case "shift_reminder":
        return "/dashboard";

      // Target/submission reminders → respective form pages
      case "target_reminder":
        return "/morning-targets";
      case "submission_reminder":
        return "/end-of-day";

      // Buyer-specific notifications
      case "po_production_update":
      case "po_milestone":
      case "po_status_change": {
        const poId = data?.po_id as string | undefined;
        if (poId) return `/buyer/po/${poId}`;
        return "/buyer/dashboard";
      }

      // General / fallback
      case "general":
        return "/dashboard";
      default:
        return null;
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const cleanup = subscribeToNotifications();
      return cleanup;
    }
  }, [user]);

  async function fetchNotifications() {
    if (!user) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching notifications:", error);
      return;
    }

    setNotifications(data as Notification[] || []);
    setUnreadCount(data?.filter((n) => !n.is_read).length || 0);
  }

  function subscribeToNotifications() {
    if (!user) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("New notification received:", payload);
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev].slice(0, 20));
          setUnreadCount((prev) => prev + 1);
          
          // Show toast for new notification
          toast(newNotification.title, {
            description: newNotification.message || undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function markAsRead(notificationId: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }

  async function markAllAsRead() {
    if (!user) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "blocker":
      case "critical_blocker":
      case "blocker_on_my_line":
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case "success":
      case "blocker_resolved":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "production_notes":
        return <Info className="h-4 w-4 text-primary" />;
      case "reminder":
      case "shift_reminder":
        return <Clock className="h-4 w-4 text-info" />;
      case "late_submission":
        return <Clock className="h-4 w-4 text-destructive" />;
      case "low_efficiency":
        return <Info className="h-4 w-4 text-warning" />;
      case "daily_summary":
        return <Info className="h-4 w-4 text-primary" />;
      case "cutting_handoff":
        return <Scissors className="h-4 w-4 text-primary" />;
      case "work_order_updates":
        return <FileText className="h-4 w-4 text-primary" />;
      case "target_achieved":
        return <Target className="h-4 w-4 text-success" />;
      case "po_production_update":
      case "po_milestone":
      case "po_status_change":
        return <FileText className="h-4 w-4 text-primary" />;
      case "dispatch_submitted":
        return <Truck className="h-4 w-4 text-amber-500" />;
      case "dispatch_approved":
        return <Truck className="h-4 w-4 text-emerald-500" />;
      case "dispatch_rejected":
        return <Truck className="h-4 w-4 text-destructive" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto py-1 px-2 text-xs"
                onClick={markAllAsRead}
              >
                <Check className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setOpen(false);
                setTimeout(() => navigate("/preferences#notifications"), 0);
              }}
              title="Notification settings"
            >
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${
                  !notification.is_read ? "bg-muted/50" : ""
                }`}
                onSelect={(e) => {
                  e.preventDefault();

                  const isBlocker =
                    notification.type === "blocker" || notification.type === "blocker_reported";

                  if (!notification.is_read) {
                    markAsRead(notification.id);
                  }

                  if (isBlocker) {
                    setOpen(false);
                    // Reset filters when jumping from a notification
                    setTimeout(
                      () =>
                        navigate("/blockers", {
                          state: { resetBlockersFilters: true, ts: Date.now() },
                        }),
                      0
                    );
                    return;
                  }

                  const path = getNavigationPath(notification);
                  if (path) {
                    setOpen(false);
                    // Allow Radix menu to close cleanly before route change
                    setTimeout(() => navigate(path), 0);
                  }
                }}
              >
                <div className="flex items-start gap-2 w-full">
                  {getNotificationIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{notification.title}</p>
                      {!notification.is_read && (
                        <Badge variant="default" className="h-1.5 w-1.5 p-0 rounded-full" />
                      )}
                    </div>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {notification.created_at ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true }) : ""}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
