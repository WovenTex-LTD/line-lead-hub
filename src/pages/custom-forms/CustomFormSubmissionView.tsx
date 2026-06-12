import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSubmission } from "@/hooks/useCustomForms";
import type { CustomFormSubmission, PoDetail } from "@/types/custom-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PoDetailsPanel } from "@/components/custom-forms/PoDetailsPanel";

export default function CustomFormSubmissionView() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const [sub, setSub] = useState<CustomFormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!submissionId) { setLoading(false); return; }
      const result = await getSubmission(submissionId);
      if (!cancelled) { setSub(result); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  if (loading) return <div className="container max-w-2xl py-4 px-4"><p className="text-muted-foreground">Loading…</p></div>;
  if (!sub) return <div className="container max-w-2xl py-4 px-4"><p>Submission not found.</p></div>;

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <Button
        variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/forms"))}
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
      </Button>
      <h1 className="text-xl font-bold mb-1">Submission</h1>
      <p className="text-sm text-muted-foreground mb-4">Submitted {new Date(sub.created_at).toLocaleString()}</p>
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
      {/* PO detail snapshots captured at submission time (one per po_select field). */}
      {Object.entries(sub.values)
        .filter(([k, v]) => k.startsWith("__po:") && v && typeof v === "object")
        .map(([k, v]) => (
          <div key={k} className="mt-3">
            <PoDetailsPanel detail={v as PoDetail} />
          </div>
        ))}
    </div>
  );
}
