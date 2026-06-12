import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCustomFormConfig, submitCustomForm } from "@/hooks/useCustomForms";
import { CustomFormRenderer } from "@/components/custom-forms/CustomFormRenderer";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function CustomFormFill() {
  const { templateId } = useParams();
  const { config, loading } = useCustomFormConfig(templateId);
  const { user, isAdminOrHigher } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="container max-w-2xl py-4 px-4"><p className="text-muted-foreground">Loading…</p></div>;
  if (!config) return <div className="container max-w-2xl py-4 px-4"><p>Form not found.</p></div>;

  const onSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    const res = await submitCustomForm(config, values, user?.id);
    setSubmitting(false);
    if (res.ok) { toast.success("Submitted"); navigate("/forms"); }
    else toast.error(res.error || "Submission failed");
  };

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{config.template.name}</h1>
        {isAdminOrHigher() && (
          <Link to={`/forms/${config.template.id}/submissions`} className="text-sm text-primary underline">Submissions</Link>
        )}
      </div>
      {config.template.description && <p className="text-sm text-muted-foreground mb-4">{config.template.description}</p>}
      <CustomFormRenderer key={config.template.id} config={config} submitting={submitting} onSubmit={onSubmit} />
    </div>
  );
}
