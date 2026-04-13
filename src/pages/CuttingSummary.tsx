import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { getTodayInTimezone } from "@/lib/date-utils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Download, RefreshCw, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CuttingSubmission {
  id: string;
  production_date: string;
  submitted_at: string | null;
  line_id: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  po_no: string | null;
  colour: string | null;
  order_qty: number | null;
  man_power: number;
  marker_capacity: number;
  lay_capacity: number;
  cutting_capacity: number;
  under_qty: number | null;
  day_cutting: number;
  total_cutting: number | null;
  day_input: number;
  total_input: number | null;
  balance: number | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  lines?: { line_id: string; name: string | null };
  work_orders?: { po_number: string; buyer: string; style: string; planned_ex_factory: string | null };
}

interface Line {
  id: string;
  line_id: string;
  name: string | null;
}

export default function CuttingSummary() {
  const navigate = useNavigate();
  const { profile, factory, isAdminOrHigher } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<CuttingSubmission[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<CuttingSubmission | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedLine, setSelectedLine] = useState("all");
  const [selectedPO, setSelectedPO] = useState("all");

  useEffect(() => {
    if (profile?.factory_id) {
      fetchData();
    }
  }, [profile?.factory_id, dateFrom, dateTo]);

  async function fetchData() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      const [actualsRes, linesRes] = await Promise.all([
        supabase
          .from("cutting_actuals")
          .select("*, lines!cutting_actuals_line_id_fkey(line_id, name), work_orders(po_number, buyer, style, planned_ex_factory)")
          .eq("factory_id", profile.factory_id)
          .gte("production_date", dateFrom)
          .lte("production_date", dateTo)
          .order("production_date", { ascending: false }),
        supabase
          .from("lines")
          .select("id, line_id, name")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true),
      ]);

      const { data: targetsData } = await supabase
        .from("cutting_targets")
        .select("*, lines(line_id, name), work_orders(po_number, buyer, style, planned_ex_factory)")
        .eq("factory_id", profile.factory_id)
        .gte("production_date", dateFrom)
        .lte("production_date", dateTo);

      const targetsMap = new Map<string, any>();
      (targetsData || []).forEach(t => {
        const key = `${t.production_date}-${t.line_id}-${t.work_order_id}`;
        targetsMap.set(key, t);
      });

      const mergedSubmissions: CuttingSubmission[] = (actualsRes.data || []).map(actual => {
        const key = `${actual.production_date}-${actual.line_id}-${actual.work_order_id}`;
        const target = targetsMap.get(key);
        return {
          id: actual.id,
          production_date: actual.production_date,
          submitted_at: actual.submitted_at,
          line_id: actual.line_id,
          work_order_id: actual.work_order_id,
          buyer: actual.buyer,
          style: actual.style,
          po_no: actual.po_no,
          colour: actual.colour,
          order_qty: actual.order_qty,
          man_power: target?.man_power || 0,
          marker_capacity: target?.marker_capacity || 0,
          lay_capacity: target?.lay_capacity || 0,
          cutting_capacity: target?.cutting_capacity || 0,
          under_qty: target?.under_qty || null,
          day_cutting: actual.day_cutting,
          total_cutting: actual.total_cutting,
          day_input: actual.day_input,
          total_input: actual.total_input,
          balance: actual.balance,
          ot_hours_actual: actual.ot_hours_actual,
          ot_manpower_actual: actual.ot_manpower_actual,
          lines: actual.lines,
          work_orders: actual.work_orders,
        };
      });

      setSubmissions(mergedSubmissions);
      setLines(linesRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error(t('cutting.failedToLoadSubmission'));
    } finally {
      setLoading(false);
    }
  }

  // Get unique PO numbers for filter
  const uniquePOs = useMemo(() => {
    const pos = new Set<string>();
    submissions.forEach(s => {
      const po = s.work_orders?.po_number || s.po_no;
      if (po) pos.add(po);
    });
    return Array.from(pos).sort();
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      if (selectedLine !== "all" && s.line_id !== selectedLine) return false;
      if (selectedPO !== "all") {
        const po = s.work_orders?.po_number || s.po_no;
        if (po !== selectedPO) return false;
      }
      return true;
    });
  }, [submissions, selectedLine, selectedPO]);

  const stats = useMemo(() => {
    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
    const todaySubmissions = submissions.filter(s => s.production_date === today);
    return {
      submissionsToday: todaySubmissions.length,
      cuttingToday: todaySubmissions.reduce((sum, s) => sum + (s.day_cutting || 0), 0),
      inputToday: todaySubmissions.reduce((sum, s) => sum + (s.day_input || 0), 0),
      underQtyToday: todaySubmissions.reduce((sum, s) => sum + (s.under_qty || 0), 0),
    };
  }, [submissions]);

  function exportToCSV() {
    const headers = [
      "DATE", "LINE", "BUYER", "STYLE", "PO-NO", "COLOUR", "ORDER QTY",
      "MAN POWER", "MARKER CAP", "LAY CAP", "CUTTING CAP", "UNDER QTY",
      "DAY CUTTING", "TOTAL CUTTING", "DAY INPUT", "TOTAL INPUT", "BALANCE"
    ];
    const rows = filteredSubmissions.map(s => [
      s.production_date,
      s.lines?.name || s.lines?.line_id || "",
      s.work_orders?.buyer || s.buyer || "",
      s.work_orders?.style || s.style || "",
      s.work_orders?.po_number || s.po_no || "",
      s.colour || "",
      s.order_qty || 0,
      s.man_power,
      s.marker_capacity,
      s.lay_capacity,
      s.cutting_capacity,
      s.under_qty || 0,
      s.day_cutting,
      s.total_cutting || 0,
      s.day_input,
      s.total_input || 0,
      s.balance || 0,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(csv, `cutting-summary-${dateFrom}-to-${dateTo}.csv`);
  }

  async function downloadCSV(csv: string, filename: string) {
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csv], { type: "text/csv" });
    await downloadFile(blob, filename);
  }

  if (!isAdminOrHigher()) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <p className="text-muted-foreground">{t('cutting.accessDenied')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-4 px-4 pb-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Scissors className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t('cutting.cuttingSummary')}</h1>
            <p className="text-sm text-muted-foreground">{t('cutting.viewAllCuttingReports')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('cutting.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            {t('cutting.export')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>{t('cutting.from')}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('cutting.to')}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('cutting.line')}</Label>
              <Select value={selectedLine} onValueChange={setSelectedLine}>
                <SelectTrigger>
                  <SelectValue placeholder={t('cutting.allLines')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('cutting.allLines')}</SelectItem>
                  {lines.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name || l.line_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('cutting.po')}</Label>
              <Select value={selectedPO} onValueChange={setSelectedPO}>
                <SelectTrigger>
                  <SelectValue placeholder={t('cutting.allPOs')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('cutting.allPOs')}</SelectItem>
                  {uniquePOs.map(po => (
                    <SelectItem key={po} value={po}>{po}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 border-emerald-200/60 dark:border-emerald-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Submissions Today</p>
            <p className="text-2xl font-bold">{stats.submissionsToday}</p>
            <p className="text-xs text-muted-foreground">Today's entries</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 via-white to-green-50/50 border-green-200/60 dark:border-green-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Cutting Today</p>
            <p className="text-2xl font-bold">{stats.cuttingToday.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total pieces</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-teal-50 via-white to-teal-50/50 border-teal-200/60 dark:border-teal-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Input Today</p>
            <p className="text-2xl font-bold">{stats.inputToday.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total pieces</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 via-white to-amber-50/50 border-amber-200/60 dark:border-amber-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Under QTY Today</p>
            <p className="text-2xl font-bold">{stats.underQtyToday.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total pieces</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Cutting Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATE</TableHead>
                  <TableHead>LINE</TableHead>
                  <TableHead>PO-NO</TableHead>
                  <TableHead className="text-right">ORDER QTY</TableHead>
                  <TableHead className="text-right">CUTTING CAP</TableHead>
                  <TableHead className="text-right">TOTAL CUTTING</TableHead>
                  <TableHead className="text-right">TOTAL INPUT</TableHead>
                  <TableHead className="text-right">BALANCE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No submissions found for selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubmissions.map((s) => (
                    <TableRow 
                      key={s.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedSubmission(s)}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        {format(new Date(s.production_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.lines?.name || s.lines?.line_id || "—"}</Badge>
                      </TableCell>
                      <TableCell>{s.work_orders?.po_number || s.po_no || "—"}</TableCell>
                      <TableCell className="text-right">{s.order_qty?.toLocaleString() || "—"}</TableCell>
                      <TableCell className="text-right font-medium text-primary">{s.cutting_capacity}</TableCell>
                      <TableCell className="text-right font-medium">{s.total_cutting?.toLocaleString() || "—"}</TableCell>
                      <TableCell className="text-right font-medium text-success">{s.total_input?.toLocaleString() || "—"}</TableCell>
                      <TableCell className={`text-right font-medium ${s.balance && s.balance < 0 ? "text-destructive" : ""}`}>
                        {s.balance?.toLocaleString() || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Submission Details
            </DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Date</p>
                  <p className="font-medium">{format(new Date(selectedSubmission.production_date), "MMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Line</p>
                  <p className="font-medium">{selectedSubmission.lines?.name || selectedSubmission.lines?.line_id || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Buyer</p>
                  <p className="font-medium">{selectedSubmission.work_orders?.buyer || selectedSubmission.buyer || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Style</p>
                  <p className="font-medium">{selectedSubmission.work_orders?.style || selectedSubmission.style || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">PO Number</p>
                  <p className="font-medium">{selectedSubmission.work_orders?.po_number || selectedSubmission.po_no || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Colour</p>
                  <p className="font-medium">{selectedSubmission.colour || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Order Qty</p>
                  <p className="font-medium">{selectedSubmission.order_qty?.toLocaleString() || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Man Power</p>
                  <p className="font-medium">{selectedSubmission.man_power}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Capacity Planning</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Marker Capacity</p>
                    <p className="font-medium">{selectedSubmission.marker_capacity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Lay Capacity</p>
                    <p className="font-medium">{selectedSubmission.lay_capacity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Cutting Capacity</p>
                    <p className="font-medium text-primary">{selectedSubmission.cutting_capacity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Under Qty</p>
                    <p className="font-medium">{selectedSubmission.under_qty || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Actuals</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Day Cutting</p>
                    <p className="font-medium">{selectedSubmission.day_cutting?.toLocaleString() || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Total Cutting</p>
                    <p className="font-medium">{selectedSubmission.total_cutting?.toLocaleString() || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Day Input</p>
                    <p className="font-medium text-success">{selectedSubmission.day_input?.toLocaleString() || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Total Input</p>
                    <p className="font-medium">{selectedSubmission.total_input?.toLocaleString() || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase">Balance</p>
                    <p className={`font-medium ${selectedSubmission.balance && selectedSubmission.balance < 0 ? "text-destructive" : ""}`}>
                      {selectedSubmission.balance?.toLocaleString() || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">OT Hours Actual</p>
                    <p className="font-medium">{selectedSubmission.ot_hours_actual ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">OT Manpower Actual</p>
                    <p className="font-medium">{selectedSubmission.ot_manpower_actual ?? "—"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
