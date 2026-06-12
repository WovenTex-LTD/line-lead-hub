import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getSlot } from "@/lib/form-slots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Lock, ExternalLink, ChevronDown } from "lucide-react";

/** Read-only structural preview of a DEFAULT production form. Shows the fields a
 *  worker fills in, without being the live data-entry page. The default form itself
 *  cannot be edited — Lina can create a new version of it instead. */
export default function DefaultFormPreview() {
  const { slotKey } = useParams<{ slotKey: string }>();
  const navigate = useNavigate();
  const slot = getSlot(slotKey);

  const sections = useMemo(() => {
    if (!slot) return [];
    const out: { title: string; fields: typeof slot.previewFields }[] = [];
    for (const f of slot.previewFields) {
      const last = out[out.length - 1];
      if (!last || last.title !== f.section) out.push({ title: f.section, fields: [f] });
      else last.fields.push(f);
    }
    return out;
  }, [slot]);

  if (!slot) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <p className="text-muted-foreground">Unknown form.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate("/forms")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Forms
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <Button
        variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/forms"))}
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
      </Button>

      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-bold">{slot.label}</h1>
        <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> Default form</Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Read-only preview of this form's structure. The default form can't be edited — ask Lina to
        create a new version of it, then make that version active.
      </p>

      <div className="space-y-4">
        {sections.map((sec) => (
          <Card key={sec.title}>
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-0 pb-4">
              {sec.fields.map((f) => (
                <div key={f.label} className={f.type === "textarea" ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
                  <p className="text-xs font-medium">{f.label}{f.required && " *"}</p>
                  {f.type === "checkbox" ? (
                    <div className="flex items-center gap-2 h-10">
                      <div className="h-4 w-4 rounded border border-input bg-muted/40" />
                      <span className="text-xs text-muted-foreground">Yes / No</span>
                    </div>
                  ) : (
                    <div className={`flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground/70 ${f.type === "textarea" ? "h-16 items-start pt-2" : "h-10"}`}>
                      <span>{f.type === "dropdown" ? "Select…" : f.type === "number" ? "0" : f.type === "date" ? "DD/MM/YYYY" : "Text"}</span>
                      {f.type === "dropdown" && <ChevronDown className="h-4 w-4" />}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-5">
        <Button asChild size="sm" variant="outline">
          <Link to={`${slot.defaultPath}?default=1`}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open live entry page</Link>
        </Button>
      </div>
    </div>
  );
}
