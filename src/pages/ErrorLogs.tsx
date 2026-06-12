import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { TablePagination } from "@/components/ui/table-pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertTriangle,
  Trash2,
  CheckCircle,
  Bug,
  Search,
  RefreshCw,
  AlertCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { DEV_FACTORY_ID_PREFIX } from "@/lib/constants";
import { EmptyState } from "@/components/EmptyState";

interface ErrorLog {
  id: string;
  message: string;
  stack: string | null;
  source: string | null;
  severity: "error" | "warning" | "info";
  user_id: string | null;
  factory_id: string | null;
  url: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  created_at: string;
}

const PAGE_SIZE = 25;

export default function ErrorLogs() {
  const { profile, isAdminOrHigher } = useAuth();
  const navigate = useNavigate();

  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7d");
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);

  useEffect(() => {
    if (profile?.factory_id && isAdminOrHigher()) {
      fetchLogs();
    }
  }, [profile?.factory_id, severityFilter, dateRange, currentPage]);

  async function fetchLogs() {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from("app_error_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (severityFilter !== "all") {
        query = query.eq("severity", severityFilter);
      }

      if (dateRange !== "all") {
        const days = dateRange === "1d" ? 1 : dateRange === "7d" ? 7 : 30;
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte("created_at", since.toISOString());
      }

      const from = (currentPage - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      setLogs(data ?? []);
      setTotalCount(count ?? 0);
    } catch (err: any) {
      console.error("Failed to fetch error logs:", err);
      toast.error("Failed to load error logs");
    } finally {
      setLoading(false);
    }
  }

  async function handleAcknowledge(id: string) {
    try {
      const { error } = await (supabase as any)
        .from("app_error_logs")
        .update({ acknowledged: true })
        .eq("id", id);

      if (error) throw error;

      setLogs((prev) =>
        prev.map((l) => (l.id === id ? { ...l, acknowledged: true } : l))
      );
      toast.success("Error acknowledged");
    } catch (err: any) {
      console.error("Failed to acknowledge error:", err);
      toast.error("Failed to acknowledge error");
    }
  }

  async function handleClearAcknowledged() {
    try {
      const { error } = await (supabase as any)
        .from("app_error_logs")
        .delete()
        .eq("acknowledged", true);

      if (error) throw error;

      toast.success("Cleared acknowledged errors");
      setCurrentPage(1);
      fetchLogs();
    } catch (err: any) {
      console.error("Failed to clear errors:", err);
      toast.error("Failed to clear errors");
    }
  }

  // Client-side search filtering on the current page
  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const q = searchTerm.trim().toLowerCase();
    return logs.filter(
      (l) =>
        l.message.toLowerCase().includes(q) ||
        l.source?.toLowerCase().includes(q)
    );
  }, [logs, searchTerm]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Stats from current page
  const stats = useMemo(() => {
    return {
      total: totalCount,
      errors: logs.filter((l) => l.severity === "error").length,
      warnings: logs.filter((l) => l.severity === "warning").length,
      unacknowledged: logs.filter((l) => !l.acknowledged).length,
    };
  }, [logs, totalCount]);

  // Check if dev factory
  const isDevFactory = profile?.factory_id?.startsWith(DEV_FACTORY_ID_PREFIX);

  if (!isDevFactory) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Access Denied"
        description="Error logs are only available for development factories."
        iconClassName="text-warning"
        action={{ label: "Go to Dashboard", onClick: () => navigate("/dashboard") }}
      />
    );
  }

  if (!isAdminOrHigher()) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Access Denied"
        description="You need admin permissions to view error logs."
        iconClassName="text-warning"
        action={{ label: "Go to Dashboard", onClick: () => navigate("/dashboard") }}
      />
    );
  }

  function getSeverityIcon(severity: string) {
    switch (severity) {
      case "error":
        return <AlertCircle className="h-3.5 w-3.5" />;
      case "warning":
        return <AlertTriangle className="h-3.5 w-3.5" />;
      default:
        return <Info className="h-3.5 w-3.5" />;
    }
  }

  function getSeverityVariant(
    severity: string
  ): "destructive" | "secondary" | "outline" {
    switch (severity) {
      case "error":
        return "destructive";
      case "warning":
        return "secondary";
      default:
        return "outline";
    }
  }

  function getPathname(url: string | null): string {
    if (!url) return "-";
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  return (
    <div className="py-4 lg:py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6" />
            Error Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor application errors and warnings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchLogs()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Acknowledged
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Acknowledged Errors</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all acknowledged error logs. This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAcknowledged}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total (page)</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Errors</p>
            <p className="text-2xl font-bold text-destructive">
              {stats.errors}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Warnings</p>
            <p className="text-2xl font-bold text-amber-500">
              {stats.warnings}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Unacknowledged</p>
            <p className="text-2xl font-bold text-primary">
              {stats.unacknowledged}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={severityFilter}
          onValueChange={(v) => {
            setSeverityFilter(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="warning">Warnings</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={dateRange}
          onValueChange={(v) => {
            setDateRange(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages or source..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bug className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No error logs found</p>
              <p className="text-sm mt-1">
                {searchTerm || severityFilter !== "all" || dateRange !== "all"
                  ? "Try adjusting your filters"
                  : "No errors have been recorded yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Time</TableHead>
                    <TableHead className="w-[90px]">Severity</TableHead>
                    <TableHead className="w-[150px]">Source</TableHead>
                    <TableHead className="min-w-[250px]">Message</TableHead>
                    <TableHead className="w-[150px]">URL</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow
                      key={log.id}
                      className={`cursor-pointer hover:bg-muted/50 ${log.acknowledged ? "opacity-50" : ""}`}
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="whitespace-nowrap text-sm font-mono">
                        {format(new Date(log.created_at), "MMM dd, HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getSeverityVariant(log.severity)}
                          className="gap-1"
                        >
                          {getSeverityIcon(log.severity)}
                          {log.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-mono truncate max-w-[150px]">
                        {log.source ?? "-"}
                      </TableCell>
                      <TableCell>
                        <p
                          className="text-sm truncate max-w-[400px]"
                          title={log.message}
                        >
                          {log.message}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm truncate max-w-[150px]">
                        {getPathname(log.url)}
                      </TableCell>
                      <TableCell>
                        {!log.acknowledged && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAcknowledge(log.id);
                            }}
                            title="Acknowledge"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && totalCount > 0 && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              startIndex={
                totalCount > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0
              }
              endIndex={Math.min(currentPage * PAGE_SIZE, totalCount)}
              totalItems={totalCount}
              onPageChange={setCurrentPage}
              onFirstPage={() => setCurrentPage(1)}
              onLastPage={() => setCurrentPage(totalPages)}
              onNextPage={() =>
                setCurrentPage((p) => Math.min(p + 1, totalPages))
              }
              onPreviousPage={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              canGoNext={currentPage < totalPages}
              canGoPrevious={currentPage > 1}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog
        open={!!selectedLog}
        onOpenChange={() => setSelectedLog(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Error Details
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Time</p>
                  <p className="font-medium">
                    {format(
                      new Date(selectedLog.created_at),
                      "MMM dd, yyyy HH:mm:ss"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Severity</p>
                  <Badge
                    variant={getSeverityVariant(selectedLog.severity)}
                    className="gap-1"
                  >
                    {getSeverityIcon(selectedLog.severity)}
                    {selectedLog.severity}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-mono text-sm">
                    {selectedLog.source ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">URL</p>
                  <p className="font-mono text-sm truncate">
                    {getPathname(selectedLog.url)}
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <p className="text-sm text-muted-foreground mb-1">Message</p>
                <p className="text-sm font-medium break-words">
                  {selectedLog.message}
                </p>
              </div>

              {selectedLog.stack && (
                <div className="border rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">
                    Stack Trace
                  </p>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto bg-muted p-2 rounded">
                    {selectedLog.stack}
                  </pre>
                </div>
              )}

              {selectedLog.metadata &&
                Object.keys(selectedLog.metadata).length > 0 && (
                  <div className="border rounded-lg p-3">
                    <p className="text-sm text-muted-foreground mb-1">
                      Metadata
                    </p>
                    <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-[150px] overflow-y-auto bg-muted p-2 rounded">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}

              <div className="text-xs text-muted-foreground">
                User Agent: {selectedLog.user_agent ?? "Unknown"}
              </div>

              {!selectedLog.acknowledged && (
                <Button
                  className="w-full"
                  onClick={() => {
                    handleAcknowledge(selectedLog.id);
                    setSelectedLog({
                      ...selectedLog,
                      acknowledged: true,
                    });
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Acknowledge
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
