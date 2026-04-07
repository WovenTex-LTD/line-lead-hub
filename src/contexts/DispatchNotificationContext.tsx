import { createContext, useContext, useState, useMemo, useCallback, useEffect, ReactNode } from "react";
import { useMyDispatches } from "@/hooks/useDispatchRequests";
import { useAuth } from "@/contexts/AuthContext";
import type { DispatchStatus } from "@/types/dispatch";

const NOTIFIABLE: DispatchStatus[] = ["approved", "rejected"];

function storageKey(userId: string) {
  return `dispatch_seen_${userId}`;
}

function readSeen(userId: string): Record<string, DispatchStatus> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) || "{}");
  } catch {
    return {};
  }
}

interface CtxValue {
  unseenIds: Set<string>;
  unseenCount: number;
  markAsSeen: (id: string, status: DispatchStatus) => void;
  markAllAsSeen: () => void;
}

const Ctx = createContext<CtxValue>({
  unseenIds: new Set(),
  unseenCount: 0,
  markAsSeen: () => {},
  markAllAsSeen: () => {},
});

export function DispatchNotificationProvider({ children }: { children: ReactNode }) {
  const { profile, hasRole } = useAuth();
  const isGateOfficer = hasRole("gate_officer");
  const userId = profile?.id ?? "";
  const { data: dispatches } = useMyDispatches();
  const [seen, setSeen] = useState<Record<string, DispatchStatus>>({});

  // Load from localStorage once the user id is known
  useEffect(() => {
    if (userId) setSeen(readSeen(userId));
  }, [userId]);

  const unseenIds = useMemo(() => {
    if (!dispatches || !userId || !isGateOfficer) return new Set<string>();
    return new Set(
      dispatches
        .filter((d) => NOTIFIABLE.includes(d.status) && seen[d.id] !== d.status)
        .map((d) => d.id)
    );
  }, [dispatches, userId, seen, isGateOfficer]);

  const markAsSeen = useCallback(
    (id: string, status: DispatchStatus) => {
      if (!userId) return;
      setSeen((prev) => {
        const next = { ...prev, [id]: status };
        localStorage.setItem(storageKey(userId), JSON.stringify(next));
        return next;
      });
    },
    [userId]
  );

  const markAllAsSeen = useCallback(() => {
    if (!dispatches || !userId) return;
    setSeen((prev) => {
      const next = { ...prev };
      dispatches.forEach((d) => {
        if (NOTIFIABLE.includes(d.status)) next[d.id] = d.status;
      });
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
      return next;
    });
  }, [dispatches, userId]);

  return (
    <Ctx.Provider value={{ unseenIds, unseenCount: unseenIds.size, markAsSeen, markAllAsSeen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDispatchNotifications() {
  return useContext(Ctx);
}
