import { Link } from "react-router-dom";
import { useCustomSubmissions } from "@/hooks/useCustomForms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ChevronRight } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  sewing: "Sewing", cutting: "Cutting", finishing: "Finishing",
  qc: "Quality", storage: "Storage", worker: "General",
};

/** Lists custom-form submissions (today / this week / all) as first-class entries
 *  in the records pages. Hidden entirely when there are none, so it never clutters
 *  factories that don't use custom forms. Read-only; links to the submission view. */
export function CustomSubmissionsSection({ scope, withTime = true }: { scope: "today" | "week" | "all"; withTime?: boolean }) {
  const { entries, loading } = useCustomSubmissions(scope);
  if (loading || entries.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Custom form submissions
          <Badge variant="secondary" className="ml-1">{entries.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        {entries.map((e) => (
          <Link
            key={e.id}
            to={`/forms/submissions/${e.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 transition hover:bg-accent/40"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{e.formName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {e.targetRole ? `${ROLE_LABEL[e.targetRole] ?? e.targetRole} · ` : ""}
                {e.submitterName ?? "—"}
                {withTime ? ` · ${new Date(e.createdAt).toLocaleString()}` : ""}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
