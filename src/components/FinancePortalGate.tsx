import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Lock, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mapLegacyTier } from "@/lib/plan-tiers";
import type { PlanTier } from "@/lib/plan-tiers";

const FINANCE_MIN_TIER: PlanTier = "starter";
const TIER_ORDER: PlanTier[] = ["starter", "growth", "scale", "enterprise"];

function tierMeetsMinimum(tier: PlanTier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(FINANCE_MIN_TIER);
}

export function FinancePortalGate({ children }: { children: React.ReactNode }) {
  const { factory, loading } = useAuth();
  const navigate = useNavigate();

  // Don't gate while auth is still loading — factory will be null
  if (loading || !factory) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tier = mapLegacyTier(factory.subscription_tier ?? null);

  if (!tierMeetsMinimum(tier)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="h-16 w-16 rounded-full bg-purple-500/10 flex items-center justify-center mb-5">
          <Lock className="h-8 w-8 text-purple-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">Finance Portal — Starter Plan Required</h2>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          The Finance Portal is available on the Starter plan and above. Upgrade your
          subscription to unlock invoicing, LC management, payroll, and compliance reporting.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Production
          </Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => navigate("/billing-plan")}
          >
            Upgrade Plan
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-6">
          Current plan: <span className="font-semibold capitalize">{tier}</span>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
