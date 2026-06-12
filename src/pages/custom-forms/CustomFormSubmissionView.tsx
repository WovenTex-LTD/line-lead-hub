import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSubmission } from "@/hooks/useCustomForms";
import type { CustomFormSubmission } from "@/types/custom-form";
import { Card, CardContent } from "@/components/ui/card";

export default function CustomFormSubmissionView() {
  const { submissionId } = useParams();
  const [sub, setSub] = useState<CustomFormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { if (submissionId) setSub(await getSubmission(submissionId)); setLoading(false); })(); }, [submissionId]);

  if (loading) return <div className="container max-w-2xl py-4 px-4"><p className="text-muted-foreground">Loading…</p></div>;
  if (!sub) return <div className="container max-w-2xl py-4 px-4"><p>Submission not found.</p></div>;

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <h1 className="text-xl font-bold mb-1">Submission</h1>
      <p className="text-sm text-muted-foreground mb-4">{new Date(sub.created_at).toLocaleString()}</p>
      <Card><CardContent className="space-y-3 pt-4">
        {sub.fields_snapshot.map((f) => {
          const v = sub.values[f.key];
          const display = f.field_type === "checkbox" ? (v ? "Yes" : "No") : (v === undefined || v === null || v === "" ? "—" : String(v));
          return (
            <div key={f.key} className="flex flex-col">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <span className="text-sm">{display}</span>
            </div>
          );
        })}
      </CardContent></Card>
    </div>
  );
}
