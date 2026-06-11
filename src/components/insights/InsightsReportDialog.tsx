import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FileDown, Loader2, CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { getTodayInTimezone } from "@/lib/date-utils";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { exportInsightsReport } from "@/lib/exports/insights-export";

export function InsightsReportDialog() {
  const { profile, factory } = useAuth();
  const { headcountCost, isConfigured: costConfigured } = useHeadcountCost();
  const tz = factory?.timezone || "Asia/Dhaka";
  const todayStr = getTodayInTimezone(tz);

  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<7 | 14 | 21 | 30>(7);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(todayStr + "T00:00:00"));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const endDateStr = format(selectedDate, "yyyy-MM-dd");
  const startDateObj = subDays(selectedDate, period);
  const startDateStr = format(startDateObj, "yyyy-MM-dd");

  async function handleExport() {
    if (!profile?.factory_id) return;
    setGenerating(true);
    try {
      await exportInsightsReport({
        factoryId: profile.factory_id,
        factoryName: factory?.name || "Factory",
        startDate: startDateStr,
        endDate: endDateStr,
        format: "pdf",
        headcountCostRate: costConfigured && headcountCost.value ? headcountCost.value : 0,
        headcountCostCurrency: headcountCost.currency,
        timezone: factory?.timezone || "Asia/Dhaka",
      });
      toast.success(`${period}-day insights PDF exported`);
      setOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export report");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileDown className="h-4 w-4 mr-2" />
          Insight Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Insights Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Period selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Period</label>
            <div className="grid grid-cols-4 gap-2">
              {([7, 14, 21, 30] as const).map(p => (
                <Button
                  key={p}
                  variant={period === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriod(p)}
                >
                  {p} days
                </Button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">End Date</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "MMM d, yyyy")}
                  <span className="ml-auto text-xs text-muted-foreground">
                    from {format(startDateObj, "MMM d")}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Export button */}
          <Button className="w-full" onClick={handleExport} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
