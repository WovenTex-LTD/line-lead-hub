import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, X, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { isNative } from "@/lib/capacitor";

export function TrialExpirationBanner() {
  const navigate = useNavigate();
  const { status, isTrial } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when trial status changes
  useEffect(() => {
    setDismissed(false);
  }, [status?.trialEndDate]);

  // Only show if on trial and 3 or fewer days remaining
  if (!isTrial || !status?.daysRemaining || status.daysRemaining > 3 || dismissed) {
    return null;
  }

  const isUrgent = status.daysRemaining <= 1;
  const message = status.daysRemaining === 0 
    ? "Your trial expires today!" 
    : status.daysRemaining === 1 
      ? "Your trial expires tomorrow!" 
      : `Your trial expires in ${status.daysRemaining} days`;

  return (
    <div 
      className={`w-full px-4 py-3 flex items-center justify-between gap-4 ${
        isUrgent 
          ? "bg-destructive text-destructive-foreground" 
          : "bg-amber-500 text-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <span className="text-sm font-medium">
          {message}{' '}
          {isNative
            ? 'Contact productionportal.co to continue using the app.'
            : 'Subscribe now to continue using ProductionPortal.'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {!isNative && (
          <Button
            size="sm"
            variant={isUrgent ? "secondary" : "default"}
            className={isUrgent ? "" : "bg-white text-amber-700 hover:bg-white/90"}
            onClick={() => navigate('/subscription')}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Subscribe
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 hover:bg-white/20"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
