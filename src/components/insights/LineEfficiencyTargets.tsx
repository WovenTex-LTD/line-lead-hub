import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Target, Save, Edit2, X, Check } from "lucide-react";
import { toast } from "sonner";

interface LineWithTarget {
  id: string;
  line_id: string;
  name: string | null;
  target_efficiency: number;
  currentEfficiency?: number;
}

interface LineEfficiencyTargetsProps {
  linePerformance?: Array<{
    lineId: string;
    lineName: string;
    efficiency: number;
  }>;
}

export function LineEfficiencyTargets({ linePerformance = [] }: LineEfficiencyTargetsProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<LineWithTarget[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(85);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchLines();
    }
  }, [profile?.factory_id]);

  useEffect(() => {
    // Merge current efficiency from linePerformance
    if (linePerformance.length > 0 && lines.length > 0) {
      setLines((prev) =>
        prev.map((line) => {
          const perf = linePerformance.find((p) => p.lineId === line.id);
          return {
            ...line,
            currentEfficiency: perf?.efficiency,
          };
        })
      );
    }
  }, [linePerformance]);

  async function fetchLines() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("lines")
        .select("id, line_id, name, target_efficiency")
        .eq("factory_id", profile.factory_id)
        .eq("is_active", true)
        .order("line_id");

      if (error) throw error;

      // Merge with current performance data
      const linesWithPerf = (data || []).map((line) => {
        const perf = linePerformance.find((p) => p.lineId === line.id);
        return {
          ...line,
          target_efficiency: line.target_efficiency || 85,
          currentEfficiency: perf?.efficiency,
        };
      });

      const { sortByLineName } = await import("@/lib/sort-lines");
      setLines(sortByLineName(linesWithPerf, l => l.name || l.line_id));
    } catch (error) {
      console.error("Error fetching lines:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveTarget(lineId: string, target: number) {
    setSaving(true);

    try {
      const { error } = await supabase
        .from("lines")
        .update({ target_efficiency: target })
        .eq("id", lineId);

      if (error) throw error;

      setLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? { ...line, target_efficiency: target } : line
        )
      );

      setEditingId(null);
      toast.success("Target saved");
    } catch (error) {
      console.error("Error saving target:", error);
      toast.error("Failed to save target");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(line: LineWithTarget) {
    setEditingId(line.id);
    setEditValue(line.target_efficiency);
  }

  function cancelEditing() {
    setEditingId(null);
  }

  const getStatusColor = (current: number | undefined, target: number) => {
    if (current === undefined) return "text-muted-foreground";
    if (current >= target) return "text-success";
    if (current >= target * 0.9) return "text-warning";
    return "text-destructive";
  };

  const getStatusBadge = (current: number | undefined, target: number) => {
    if (current === undefined) return null;
    if (current >= target) {
      return <Badge className="bg-success/20 text-success border-success/30 flex items-center justify-center">On Target</Badge>;
    }
    if (current >= target * 0.9) {
      return <Badge className="bg-warning/20 text-warning border-warning/30 flex items-center justify-center">Near Target</Badge>;
    }
    return <Badge className="bg-destructive/20 text-destructive border-destructive/30 flex items-center justify-center">Below Target</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Line Efficiency Targets
        </CardTitle>
        <CardDescription>
          Set target efficiency for each production line
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[480px]">
        {lines.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No active lines found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {lines.map((line) => (
              <div
                key={line.id}
                className="p-4 rounded-lg border bg-muted/20 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{line.name || line.line_id}</span>
                    {getStatusBadge(line.currentEfficiency, line.target_efficiency)}
                  </div>
                  
                  {editingId === line.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={200}
                        value={editValue}
                        onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                        className="w-20 h-8"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => saveTarget(line.id, editValue)}
                        disabled={saving}
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 text-success" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={cancelEditing}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Target:</span>
                      <span className="font-bold">{line.target_efficiency}%</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEditing(line)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Progress bar comparing current to target */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Current: {line.currentEfficiency !== undefined ? `${line.currentEfficiency}%` : "No data"}</span>
                    <span>Target: {line.target_efficiency}%</span>
                  </div>
                  <div className="relative">
                    <Progress
                      value={line.currentEfficiency !== undefined ? Math.min((line.currentEfficiency / line.target_efficiency) * 100, 100) : 0}
                      className="h-2"
                    />
                    {/* Target marker */}
                    <div
                      className="absolute top-0 h-2 w-0.5 bg-foreground/50"
                      style={{ left: "100%" }}
                    />
                  </div>
                  {line.currentEfficiency !== undefined && (
                    <p className={`text-xs ${getStatusColor(line.currentEfficiency, line.target_efficiency)}`}>
                      {line.currentEfficiency >= line.target_efficiency
                        ? `${line.currentEfficiency - line.target_efficiency}% above target`
                        : `${line.target_efficiency - line.currentEfficiency}% below target`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
}
