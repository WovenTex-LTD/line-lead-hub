import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFillableForms, useSlotOverrides, setSlotActive } from "@/hooks/useCustomForms";
import { getSlot } from "@/lib/form-slots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, Lock, Loader2, ExternalLink } from "lucide-react";

/** Versions screen for a form slot (ref = slot key) or a standalone Lina form (ref = template uuid).
 *  Shows every version as a card; the active one carries an Active badge; admins switch versions. */
export default function FormSlotVersions() {
  const { ref } = useParams<{ ref: string }>();
  const navigate = useNavigate();
  const { profile, isAdminOrHigher } = useAuth();
  const admin = isAdminOrHigher();
  const { templates, loading: formsLoading, refresh } = useFillableForms();
  const { overrides, loading: ovLoading, refresh: refreshOverrides } = useSlotOverrides();
  const [confirmTemplate, setConfirmTemplate] = useState<string | null>(null); // template id pending activation
  const [saving, setSaving] = useState(false);

  const slot = getSlot(ref);
  const loading = formsLoading || ovLoading;

  // Variants of this slot (slot mode) or the single standalone template (uuid mode).
  const variants = useMemo(() => {
    if (slot) return templates.filter((t) => t.slot_key === slot.key);
    return templates.filter((t) => t.id === ref);
  }, [templates, slot, ref]);

  const activeTemplateId = slot ? (overrides[slot.key] ?? null) : (variants[0]?.id ?? null);
  const defaultIsActive = slot ? activeTemplateId === null || !variants.some((v) => v.id === activeTemplateId) : false;

  async function activate(templateId: string | null) {
    if (!slot || !profile?.factory_id) return;
    setSaving(true);
    const res = await setSlotActive(profile.factory_id, slot.key, templateId);
    setSaving(false);
    setConfirmTemplate(null);
    if (!res.ok) { toast.error("Couldn't change the active version", { description: res.error }); return; }
    toast.success(templateId ? "Version activated" : "Default form restored");
    refresh(); refreshOverrides();
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!slot && variants.length === 0) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <p className="text-muted-foreground">This form doesn't exist (it may have been archived).</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate("/forms")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Forms
        </Button>
      </div>
    );
  }

  const title = slot ? slot.label : variants[0]?.name ?? "Form";

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" onClick={() => navigate("/forms")}>
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Forms
      </Button>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground mb-5">
        {slot
          ? "Versions of this form. The active version is the one your team fills in."
          : "A form created with Lina. Ask Lina to update it by name to change its fields."}
      </p>

      <div className="space-y-3">
        {/* Default production form card (slot mode only) */}
        {slot && (
          <Card className={defaultIsActive ? "border-primary/50" : undefined}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {slot.label}
                    {defaultIsActive && <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Default form · feeds production dashboards · not editable</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3 flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to={`/forms/preview/${slot.key}`}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View form</Link>
              </Button>
              {admin && !defaultIsActive && (
                <Button size="sm" variant="secondary" disabled={saving} onClick={() => activate(null)}>
                  Restore as active
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Lina-created versions */}
        {variants.map((t) => {
          const isActive = slot ? activeTemplateId === t.id : true;
          return (
            <Card key={t.id} className={isActive ? "border-primary/50" : undefined}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ClipboardList className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {t.name}
                      {isActive && <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Created with Lina · v{t.version}
                      {t.description ? ` · ${t.description}` : ""}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3 flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/forms/${t.id}`}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open form</Link>
                </Button>
                {admin && slot && !isActive && (
                  <Button size="sm" disabled={saving} onClick={() => setConfirmTemplate(t.id)}>
                    Set active
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}

        {slot && variants.length === 0 && (
          <p className="text-xs text-muted-foreground px-1">
            No other versions yet. Ask Lina to create one, e.g. "create a new version of the {slot.label} form with …".
          </p>
        )}
      </div>

      {/* Warning when replacing the default form */}
      <AlertDialog open={confirmTemplate !== null} onOpenChange={(open) => { if (!open) setConfirmTemplate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make this version active?</AlertDialogTitle>
            <AlertDialogDescription>
              Your team will fill this version instead of the default form.
              {defaultIsActive && (
                <> Data entered in a Lina form is stored with its submissions and does <strong>not</strong> feed
                the production dashboards, targets, or reports the way the default form does. You can restore
                the default at any time.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => confirmTemplate && activate(confirmTemplate)}>
              {saving ? "Saving…" : "Set active"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
