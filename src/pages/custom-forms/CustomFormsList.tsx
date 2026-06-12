import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useFillableForms } from "@/hooks/useCustomForms";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Lock } from "lucide-react";

// Read-only default production forms per role (links to the existing pages).
const DEFAULT_FORMS: Record<string, { label: string; path: string }[]> = {
  sewing: [
    { label: "Sewing Morning Targets", path: "/sewing/morning-targets" },
    { label: "Sewing End of Day", path: "/sewing/end-of-day" },
  ],
  cutting: [
    { label: "Cutting Morning Targets", path: "/cutting/morning-targets" },
    { label: "Cutting End of Day", path: "/cutting/end-of-day" },
  ],
  finishing: [
    { label: "Finishing Daily Target", path: "/finishing/daily-target" },
    { label: "Finishing Daily Output", path: "/finishing/daily-output" },
  ],
};

const ROLE_LABEL: Record<string, string> = {
  sewing: "Sewing", cutting: "Cutting", finishing: "Finishing",
  qc: "Quality", storage: "Storage", worker: "General",
};
const ROLE_ORDER = ["sewing", "cutting", "finishing", "qc", "storage", "worker"];

export default function CustomFormsList() {
  const { templates, loading } = useFillableForms();
  const { roles, isAdminOrHigher } = useAuth();
  const admin = isAdminOrHigher();

  const myRoleSet = useMemo(() => new Set(roles.map((r) => r.role as string)), [roles]);

  // Which role sections to show: admins see every role that has a default or any custom form;
  // others see only their own role(s).
  const customByRole = useMemo(() => {
    const m: Record<string, typeof templates> = {};
    for (const t of templates) {
      const key = t.target_role ?? "worker";
      (m[key] ||= []).push(t);
    }
    return m;
  }, [templates]);

  const visibleRoles = useMemo(() => {
    const all = new Set<string>([...Object.keys(DEFAULT_FORMS), ...Object.keys(customByRole)]);
    const filtered = admin ? all : new Set([...all].filter((r) => myRoleSet.has(r)));
    return ROLE_ORDER.filter((r) => filtered.has(r));
  }, [admin, customByRole, myRoleSet]);

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <h1 className="text-xl font-bold mb-4">Forms</h1>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {!loading && visibleRoles.length === 0 && (
        <p className="text-muted-foreground">No forms available for your role yet.</p>
      )}
      <div className="space-y-6">
        {visibleRoles.map((role) => {
          const defaults = DEFAULT_FORMS[role] ?? [];
          const customs = customByRole[role] ?? [];
          return (
            <section key={role} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{ROLE_LABEL[role] ?? role}</h2>
              {defaults.map((d) => (
                <Link key={d.path} to={d.path}>
                  <Card className="transition hover:bg-accent/40">
                    <CardHeader className="flex flex-row items-center gap-3 py-3">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-sm">{d.label}</CardTitle>
                        <p className="text-xs text-muted-foreground">Default form</p>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
              {customs.map((t) => (
                <Link key={t.id} to={`/forms/${t.id}`}>
                  <Card className="transition hover:bg-accent/40 border-primary/30">
                    <CardHeader className="flex flex-row items-center gap-3 py-3">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      <div>
                        <CardTitle className="text-sm">{t.name}</CardTitle>
                        {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
