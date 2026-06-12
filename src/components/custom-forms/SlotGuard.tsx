import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSlotOverrides } from "@/hooks/useCustomForms";
import { Loader2 } from "lucide-react";

/** Route wrapper for a default production form. When an admin has made a Lina-created
 *  version the active one for this slot, EVERYONE who opens the form (admins included)
 *  is sent to that active version — that's the whole point of "active".
 *  Escape hatch: `?default=1` forces the real default form (used by the versions
 *  screen's "Open live entry page" so admins can still reach it). With no override,
 *  the default form renders exactly as before. */
export function SlotGuard({ slotKey, children }: { slotKey: string; children: ReactNode }) {
  const { overrides, loading } = useSlotOverrides();
  const location = useLocation();
  const forceDefault = new URLSearchParams(location.search).get("default") === "1";

  if (forceDefault) return <>{children}</>;
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  const activeTemplateId = overrides[slotKey];
  if (activeTemplateId) return <Navigate to={`/forms/${activeTemplateId}`} replace />;
  return <>{children}</>;
}
