import { Loader2, ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useInsightsData, type Period } from "@/hooks/useInsightsData";
import { MetricInfo } from "./MetricInfo";

export default function AnalyticsPipeline() {
  const { loading, period, setPeriod, dailyData } = useInsightsData("14");

  const pipelineData = dailyData
    .filter(d => d.sewingOutput > 0 || d.finishingQcPass > 0)
    .map(d => ({
      date: d.displayDate,
      "Sewing Output": d.sewingOutput,
      "Finishing QC Pass": d.finishingQcPass,
      "Sewing Target": d.sewingTarget,
    }));

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Is work flowing smoothly between departments?</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[["7","7 days"],["14","14 days"],["30","30 days"],["90","90 days"]].map(([v,l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Sewing Output vs Target Area Chart */}
          {pipelineData.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Sewing Output vs Target</CardTitle>
                  <MetricInfo tip="Blue area is actual output, dashed line is the target set each morning. The purple line shows finishing QC pass for comparison." />
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={pipelineData}>
                    <defs>
                      <linearGradient id="sewingGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="Sewing Output" stroke="hsl(var(--primary))" fill="url(#sewingGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Sewing Target" stroke="hsl(var(--primary))" fill="none" strokeDasharray="4 4" strokeWidth={1.5} strokeOpacity={0.5} />
                    <Area type="monotone" dataKey="Finishing QC Pass" stroke="#8b5cf6" fill="none" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Daily flow table */}
          {pipelineData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Daily Department Flow</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Sewing Target</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Sewing Output</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Finishing QC</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Efficiency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyData.filter(d => d.sewingOutput > 0 || d.sewingTarget > 0).map(d => {
                        const effColor = d.efficiency >= 100 ? "text-green-600" : d.efficiency >= 80 ? "text-yellow-600" : "text-red-600";
                        return (
                          <tr key={d.date} className="border-b last:border-0">
                            <td className="p-3">{d.displayDate}</td>
                            <td className="p-3 text-right">{d.sewingTarget.toLocaleString()}</td>
                            <td className="p-3 text-right font-medium">{d.sewingOutput.toLocaleString()}</td>
                            <td className="p-3 text-right">{d.finishingQcPass.toLocaleString()}</td>
                            <td className={`p-3 text-right font-medium ${effColor}`}>{d.efficiency}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
