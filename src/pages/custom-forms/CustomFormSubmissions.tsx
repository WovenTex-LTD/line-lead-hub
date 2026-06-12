import { useParams, Link, useNavigate } from "react-router-dom";
import { useFormSubmissions } from "@/hooks/useCustomForms";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function CustomFormSubmissions() {
  const { templateId } = useParams();
  const { submissions, loading } = useFormSubmissions(templateId);
  const navigate = useNavigate();
  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <Button
        variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/forms"))}
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
      </Button>
      <h1 className="text-xl font-bold mb-4">Submissions</h1>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {!loading && submissions.length === 0 && <p className="text-muted-foreground">No submissions yet.</p>}
      <div className="space-y-3">
        {submissions.map((s) => (
          <Link key={s.id} to={`/forms/submissions/${s.id}`}>
            <Card className="transition hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium">{new Date(s.created_at).toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
