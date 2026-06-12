import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSlotOverrides } from "@/hooks/useCustomForms";
import { Loader2 } from "lucide-react";

/** Route wrapper for a default production form. When an admin has made a Lina-created
 *  version the active one for this slot, workers are sent to that version instead.
 *  Admins always reach the default form. If the overrides lookup fails or is empty,
 *  the default form renders exactly as before. */
export function SlotGuard({ slotKey, children }: { slotKey: string; children: ReactNode }) {
  const { isAdminOrHigher } = useAuth();
  const { overrides, loading } = useSlotOverrides();

  if (isAdminOrHigher()) return <>{children}</>;
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
