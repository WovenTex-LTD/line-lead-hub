import { Loader2, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useInsightsData, type Period } from "@/hooks/useInsightsData";
import { MetricInfo } from "./MetricInfo";

export default function AnalyticsCost() {
  const { loading, period, setPeriod, financialData, summary } = useInsightsData("30");
  const fd = financialData;

  const marginColor = fd.profit >= 0 ? "text-green-600" : "text-red-600";
  const marginTrend = fd.margin > fd.prevMargin ? "up" : fd.margin < fd.prevMargin ? "down" : "stable";

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cost</h1>
          <p className="text-sm text-muted-foreground">Where is the money going? · Sewing dept · USD</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[["7","7 days"],["14","14 days"],["30","30 days"],["90","90 days"],["180","6 months"]].map(([v,l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !fd.hasData ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No financial data available. Ensure work orders have CM/dozen values and headcount cost is configured.</CardContent></Card>
      ) : (
        <>
          {/* Financial KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">Output Value <MetricInfo tip="The dollar value of pieces produced, calculated from each order's CM (cost of making) per dozen." /></div>
                <div className="text-2xl font-bold text-emerald-600">${fd.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div className="text-xs text-muted-foreground mt-1">${fd.revenuePerPiece.toFixed(2)}/pc · {summary.totalSewingOutput.toLocaleString()} pcs</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">Operating Cost <MetricInfo tip="Total sewing labor cost — workers × hours × hourly rate, including overtime. Does not include fabric or overhead." /></div>
                <div className="text-2xl font-bold">${fd.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div className="text-xs text-muted-foreground mt-1">${fd.costPerPiece.toFixed(2)}/pc · sewing labor</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">Operating Margin <MetricInfo tip="Output value minus labor cost. Positive means the production earned more than it cost in labor." /></div>
                <div className={`text-2xl font-bold ${marginColor}`}>${fd.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {marginTrend === "up" && <TrendingUp className="h-3 w-3 inline text-green-500 mr-1" />}
                  {marginTrend === "down" && <TrendingDown className="h-3 w-3 inline text-red-500 mr-1" />}
                  vs ${fd.prevProfit.toFixed(2)} prev period
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">Margin % <MetricInfo tip="What percentage of revenue is kept as profit after labor costs. Higher is better." /></div>
                <div className={`text-2xl font-bold ${marginColor}`}>{fd.margin}%</div>
                <div className="text-xs text-muted-foreground mt-1">vs {fd.prevMargin}% prev period</div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue vs Cost Chart */}
          {fd.dailyFinancials.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Output Value vs Operating Cost</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={fd.dailyFinancials}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="displayDate" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, ""]} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" name="Output Value" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="cost" name="Op. Cost" stroke="#f97316" fill="url(#costGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="profit" name="Margin" stroke="#6366f1" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Margin by PO Table */}
          {fd.profitByPo.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Margin by Work Order</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground">PO</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Buyer</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Output Value</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Op. Cost</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Margin</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fd.profitByPo.map(po => (
                        <tr key={po.po} className="border-b last:border-0">
                          <td className="p-3 font-medium">{po.po}</td>
                          <td className="p-3 text-muted-foreground">{po.buyer}</td>
                          <td className="p-3 text-right text-emerald-600">${po.revenue.toFixed(2)}</td>
                          <td className="p-3 text-right">${po.cost.toFixed(2)}</td>
                          <td className={`p-3 text-right font-medium ${po.profit >= 0 ? "text-green-600" : "text-red-600"}`}>${po.profit.toFixed(2)}</td>
                          <td className={`p-3 text-right ${po.margin >= 0 ? "text-green-600" : "text-red-600"}`}>{po.margin}%</td>
                        </tr>
                      ))}
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
