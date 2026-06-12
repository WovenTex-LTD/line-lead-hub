import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useFillableForms, useSlotOverrides } from "@/hooks/useCustomForms";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Lock, Layers } from "lucide-react";
import { FORM_SLOTS } from "@/lib/form-slots";

const ROLE_LABEL: Record<string, string> = {
  sewing: "Sewing", cutting: "Cutting", finishing: "Finishing",
  qc: "Quality", storage: "Storage", worker: "General",
};
const ROLE_ORDER = ["sewing", "cutting", "finishing", "qc", "storage", "worker"];

export default function CustomFormsList() {
  const { templates, loading } = useFillableForms();
  const { overrides, loading: ovLoading } = useSlotOverrides();
  const { roles, isAdminOrHigher } = useAuth();
  const admin = isAdminOrHigher();

  const myRoleSet = useMemo(() => new Set(roles.map((r) => r.role as string)), [roles]);

  // Standalone Lina forms (not versions of a default slot), grouped by role.
  const standaloneByRole = useMemo(() => {
    const m: Record<string, typeof templates> = {};
    for (const t of templates) {
      if (t.slot_key) continue; // slot variants appear inside their slot's versions screen
      const key = t.target_role ?? "worker";
      (m[key] ||= []).push(t);
    }
    return m;
  }, [templates]);

  const slotsByRole = useMemo(() => {
    const m: Record<string, typeof FORM_SLOTS> = {};
    for (const s of FORM_SLOTS) (m[s.role] ||= []).push(s);
    return m;
  }, []);

  const visibleRoles = useMemo(() => {
    const all = new Set<string>([...Object.keys(slotsByRole), ...Object.keys(standaloneByRole)]);
    const filtered = admin ? all : new Set([...all].filter((r) => myRoleSet.has(r)));
    return ROLE_ORDER.filter((r) => filtered.has(r));
  }, [admin, slotsByRole, standaloneByRole, myRoleSet]);

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <h1 className="text-xl font-bold mb-4">Forms</h1>
      {(loading || ovLoading) && <p className="text-muted-foreground">Loading…</p>}
      {!loading && !ovLoading && visibleRoles.length === 0 && (
        <p className="text-muted-foreground">No forms available for your role yet.</p>
      )}
      {!loading && !ovLoading && (
        <div className="space-y-6">
          {visibleRoles.map((role) => {
            const slots = slotsByRole[role] ?? [];
            const standalone = standaloneByRole[role] ?? [];
            return (
              <section key={role} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{ROLE_LABEL[role] ?? role}</h2>
                {slots.map((slot) => {
                  const activeId = overrides[slot.key];
                  const activeVariant = activeId ? templates.find((t) => t.id === activeId) : undefined;
                  const versionCount = 1 + templates.filter((t) => t.slot_key === slot.key).length;
                  // Admins manage versions; workers go straight to the active version.
                  const target = admin
                    ? `/forms/versions/${slot.key}`
                    : activeVariant ? `/forms/${activeVariant.id}` : slot.defaultPath;
                  return (
                    <Link key={slot.key} to={target}>
                      <Card className="transition hover:bg-accent/40">
                        <CardHeader className="flex flex-row items-center gap-3 py-3">
                          {activeVariant ? <Layers className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm flex items-center gap-2">
                              {slot.label}
                              {activeVariant && <Badge variant="outline" className="border-primary/40 text-primary">Custom active</Badge>}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                              {activeVariant
                                ? `Active version: ${activeVariant.name}`
                                : "Default form"}
                              {admin && ` · ${versionCount} version${versionCount === 1 ? "" : "s"}`}
                            </p>
                          </div>
                        </CardHeader>
                      </Card>
                    </Link>
                  );
                })}
                {standalone.map((t) => (
                  <Link key={t.id} to={admin ? `/forms/versions/${t.id}` : `/forms/${t.id}`}>
                    <Card className="transition hover:bg-accent/40 border-primary/30">
                      <CardHeader className="flex flex-row items-center gap-3 py-3">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        <div>
                          <CardTitle className="text-sm">{t.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{t.description || "Created with Lina"}</p>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
