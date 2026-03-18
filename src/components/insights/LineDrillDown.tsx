import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, Target, Users, AlertTriangle, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

interface DailyLineData {
  date: string;
  displayDate: string;
  output: number;
  target: number;
  efficiency: number;
  manpower: number;
  blockers: number;
}

interface LineDrillDownProps {
  lineId: string | null;
  lineName: string | null;
  factoryId: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
}

export function LineDrillDown({ lineId, lineName, factoryId, startDate, endDate, onClose }: LineDrillDownProps) {
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<DailyLineData[]>([]);
  const [summary, setSummary] = useState({
    totalOutput: 0,
    totalTarget: 0,
    avgEfficiency: 0,
    totalBlockers: 0,
    avgManpower: 0,
    bestDay: '',
    worstDay: '',
  });

  useEffect(() => {
    if (lineId) {
      fetchLineData();
    }
  }, [lineId, startDate, endDate]);

  async function fetchLineData() {
    if (!lineId) return;
    setLoading(true);

    try {
      const [actualsRes, targetsRes] = await Promise.all([
        supabase
          .from('sewing_actuals')
          .select('production_date, good_today, manpower_actual, has_blocker')
          .eq('factory_id', factoryId)
          .eq('line_id', lineId)
          .gte('production_date', startDate)
          .lte('production_date', endDate)
          .order('production_date', { ascending: true }),
        supabase
          .from('sewing_targets')
          .select('production_date, per_hour_target')
          .eq('factory_id', factoryId)
          .eq('line_id', lineId)
          .gte('production_date', startDate)
          .lte('production_date', endDate),
      ]);

      const sewingActuals = actualsRes.data || [];
      const sewingTargets = targetsRes.data || [];

      const dailyMap = new Map<string, DailyLineData>();

      const getOrCreate = (date: string) => dailyMap.get(date) || {
        date,
        displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        output: 0,
        target: 0,
        efficiency: 0,
        manpower: 0,
        blockers: 0,
      };

      sewingActuals.forEach(u => {
        const existing = getOrCreate(u.production_date);
        existing.output += u.good_today || 0;
        existing.manpower += u.manpower_actual || 0;
        if (u.has_blocker) existing.blockers += 1;
        dailyMap.set(u.production_date, existing);
      });

      // Only include targets for dates that have matching actuals
      const actualDates = new Set(sewingActuals.map(u => u.production_date));
      sewingTargets.filter(t => actualDates.has(t.production_date)).forEach(t => {
        const existing = getOrCreate(t.production_date);
        existing.target += (t.per_hour_target || 0) * 8;
        dailyMap.set(t.production_date, existing);
      });

      const dailyDataArray = Array.from(dailyMap.values()).map(d => ({
        ...d,
        efficiency: d.target > 0 ? Math.round((d.output / d.target) * 100) : 0,
      })).sort((a, b) => a.date.localeCompare(b.date));

      setDailyData(dailyDataArray);

      // Calculate summary
      const totalOutput = dailyDataArray.reduce((sum, d) => sum + d.output, 0);
      const totalTarget = dailyDataArray.reduce((sum, d) => sum + d.target, 0);
      const totalBlockers = dailyDataArray.reduce((sum, d) => sum + d.blockers, 0);
      const avgManpower = dailyDataArray.length > 0 
        ? Math.round(dailyDataArray.reduce((sum, d) => sum + d.manpower, 0) / dailyDataArray.length)
        : 0;

      const sortedByEfficiency = [...dailyDataArray].sort((a, b) => b.efficiency - a.efficiency);
      
      setSummary({
        totalOutput,
        totalTarget,
        avgEfficiency: totalTarget > 0 ? Math.round((totalOutput / totalTarget) * 100) : 0,
        totalBlockers,
        avgManpower,
        bestDay: sortedByEfficiency[0]?.displayDate || '-',
        worstDay: sortedByEfficiency[sortedByEfficiency.length - 1]?.displayDate || '-',
      });

    } catch (error) {
      console.error('Error fetching line data:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={!!lineId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {lineName} - Daily Breakdown
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3 w-3" />
                    Total Output
                  </div>
                  <p className="text-2xl font-bold font-mono">{summary.totalOutput.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Target className="h-3 w-3" />
                    Avg Efficiency
                  </div>
                  <p className={`text-2xl font-bold ${summary.avgEfficiency >= 90 ? 'text-success' : summary.avgEfficiency >= 70 ? 'text-warning' : 'text-destructive'}`}>
                    {summary.avgEfficiency}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Users className="h-3 w-3" />
                    Avg Manpower
                  </div>
                  <p className="text-2xl font-bold font-mono">{summary.avgManpower}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <AlertTriangle className="h-3 w-3" />
                    Total Blockers
                  </div>
                  <p className="text-2xl font-bold">{summary.totalBlockers}</p>
                </CardContent>
              </Card>
            </div>

            {/* Best/Worst Days */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 text-success">
                <Calendar className="h-4 w-4" />
                <span className="text-sm">Best Day: <strong>{summary.bestDay}</strong></span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive">
                <Calendar className="h-4 w-4" />
                <span className="text-sm">Worst Day: <strong>{summary.worstDay}</strong></span>
              </div>
            </div>

            {/* Daily Output Chart */}
            {dailyData.length > 0 ? (
              <>
                <div>
                  <h4 className="text-sm font-medium mb-3">Daily Output vs Target</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }} 
                      />
                      <Legend />
                      <Bar dataKey="output" name="Output" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="target" name="Target" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.5} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-3">Daily Efficiency Trend</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis domain={[0, 150]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }} 
                      />
                      <Line type="monotone" dataKey="efficiency" name="Efficiency %" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Daily Table */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Daily Data</h4>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium">Date</th>
                          <th className="text-right py-2 px-3 font-medium">Output</th>
                          <th className="text-right py-2 px-3 font-medium">Target</th>
                          <th className="text-right py-2 px-3 font-medium">Efficiency</th>
                          <th className="text-right py-2 px-3 font-medium">Manpower</th>
                          <th className="text-right py-2 px-3 font-medium">Blockers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyData.map(day => (
                          <tr key={day.date} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 px-3 font-medium">{day.displayDate}</td>
                            <td className="py-2 px-3 text-right font-mono">{day.output.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">{day.target.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right">
                              <Badge variant={day.efficiency >= 90 ? 'default' : day.efficiency >= 70 ? 'secondary' : 'destructive'}>
                                {day.efficiency}%
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right">{day.manpower}</td>
                            <td className="py-2 px-3 text-right">
                              {day.blockers > 0 ? (
                                <Badge variant="destructive" className="text-xs">{day.blockers}</Badge>
                              ) : (
                                <span className="text-success">0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No data available for this line in the selected period
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
