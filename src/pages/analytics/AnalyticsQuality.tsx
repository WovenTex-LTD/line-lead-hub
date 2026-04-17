import { Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useInsightsData, type Period } from "@/hooks/useInsightsData";
import { MetricInfo } from "./MetricInfo";

export default function AnalyticsQuality() {
  const { loading, period, setPeriod, dailyData, summary } = useInsightsData("7");

  // Sewing vs Finishing comparison data
  const comparisonData = dailyData
    .filter(d => d.sewingOutput > 0 || d.finishingQcPass > 0)
    .map(d => ({
      date: d.displayDate,
      "Sewing Output": d.sewingOutput,
      "Finishing QC Pass": d.finishingQcPass,
    }));

  // Simple FPY approximation from efficiency data (output / target)
  const avgEfficiency = summary.avgEfficiency;
  const effColor = avgEfficiency >= 90 ? "text-green-600" : avgEfficiency >= 70 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quality</h1>
          <p className="text-sm text-muted-foreground">Are we producing good product?</p>
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
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">Avg Target Achievement <MetricInfo tip="Percentage of the planned production target that was actually produced. Higher is better — 90%+ is considered good." /></div>
                <div className={`text-2xl font-bold ${effColor}`}>{avgEfficiency}%</div>
                <div className="text-xs text-muted-foreground mt-1">output vs target over {period} days</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="text-sm text-muted-foreground mb-1">Sewing Output</div>
                <div className="text-2xl font-bold">{summary.totalSewingOutput.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">total good pieces</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">Finishing QC Pass <MetricInfo tip="Pieces that passed the final quality inspection in finishing — ready for packing and shipment." /></div>
                <div className="text-2xl font-bold">{summary.totalFinishingQcPass.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">total QC passed pieces</div>
              </CardContent>
            </Card>
          </div>

          {/* Sewing vs Finishing Comparison Chart */}
          {comparisonData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Sewing vs Finishing Daily Comparison</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Sewing Output" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Finishing QC Pass" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
