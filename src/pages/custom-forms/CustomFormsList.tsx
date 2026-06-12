import { Link } from "react-router-dom";
import { useFillableForms } from "@/hooks/useCustomForms";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export default function CustomFormsList() {
  const { templates, loading } = useFillableForms();
  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <h1 className="text-xl font-bold mb-4">Forms</h1>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {!loading && templates.length === 0 && (
        <p className="text-muted-foreground">No forms available yet. An admin can create one with Lina by uploading a paper form.</p>
      )}
      <div className="space-y-3">
        {templates.map((t) => (
          <Link key={t.id} to={`/forms/${t.id}`}>
            <Card className="transition hover:bg-accent/40">
              <CardHeader className="flex flex-row items-center gap-3">
                <ClipboardList className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
