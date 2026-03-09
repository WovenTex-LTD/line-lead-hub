import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { Info } from "lucide-react";

interface EstimatedCostDisplayProps {
  manpower: string;
  hours: string;
}

export function EstimatedCostDisplay({ manpower, hours }: EstimatedCostDisplayProps) {
  const { isConfigured, calculateEstimatedCost, headcountCost, getCurrencySymbol } = useHeadcountCost();

  if (!isConfigured) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Headcount cost not set. Add it in Factory Setup to enable cost estimates.</span>
      </div>
    );
  }

  const mp = parseFloat(manpower) || 0;
  const hrs = parseFloat(hours) || 0;
  const estimated = calculateEstimatedCost(mp, hrs);
  const symbol = getCurrencySymbol();

  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
      <p className="text-xs text-muted-foreground">
        Cost per man-hour: {symbol}{headcountCost.value?.toLocaleString()} {headcountCost.currency}
      </p>
      <p className="text-sm font-medium">
        Estimated Cost: {estimated.formatted} {estimated.value != null ? headcountCost.currency : ""}
      </p>
    </div>
  );
}
