import { Loader2, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ProgressRing } from "@/components/ui/progress-ring";
import { useInsightsData, type Period } from "@/hooks/useInsightsData";
import { MetricInfo } from "./MetricInfo";

export default function AnalyticsOrders() {
  const { loading, period, setPeriod, workOrderProgress } = useInsightsData("30");

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">Are we delivering what was promised?</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[["7","7 days"],["14","14 days"],["30","30 days"],["90","90 days"],["180","6 months"],["365","1 year"]].map(([v,l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Work Order Progress (Top 10)</CardTitle>
              <MetricInfo tip="How much of each purchase order has been completed. Shows good pieces produced out of the total order quantity." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {workOrderProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active work orders with output in this period.</p>
            ) : (
              workOrderProgress.map((wo) => {
                const ringColor = wo.progress >= 90 ? "#16a34a" : wo.progress >= 50 ? "#ca8a04" : "#3b82f6";
                return (
                  <div key={wo.poNumber} className="flex items-center gap-4 p-3 rounded-lg border">
                    <ProgressRing value={Math.min(wo.progress, 100)} size={48} strokeWidth={3.5} color={ringColor} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{wo.poNumber}</span>
                        <span className="text-xs text-muted-foreground">{wo.buyer}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{wo.style}{wo.lineName ? ` · ${wo.lineName}` : ""}</div>
                      <Progress value={Math.min(wo.progress, 100)} className="h-1.5 mt-1.5" />
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold">{wo.progress}%</div>
                      <div className="text-xs text-muted-foreground">
                        {wo.totalOutput.toLocaleString()} / {wo.orderQty.toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
