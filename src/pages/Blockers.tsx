import { useState, useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatTimeInTimezone, formatDateTimeInTimezone, getCurrentTimeInTimezone } from "@/lib/date-utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle, Search, Filter, Clock, CheckCircle, Package, Trash2, X } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { BLOCKER_IMPACT_LABELS } from "@/lib/constants";
import { toast } from "sonner";

interface Blocker {
  id: string;
  type: 'sewing' | 'finishing';
  line_name: string;
  po_number: string | null;
  blocker_type_name: string | null;
  description: string | null;
  impact: string | null;
  owner: string | null;
  status: string;
  submitted_at: string | null;
  production_date: string;
  // Additional fields for detail view
  buyer?: string | null;
  style?: string | null;
  output_qty?: number;
  target_qty?: number | null;
  manpower?: number | null;
  notes?: string | null;
  // Finishing specific
  buyer_name?: string | null;
  style_no?: string | null;
  item_name?: string | null;
  day_qc_pass?: number | null;
  total_qc_pass?: number | null;
}

export default function Blockers() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, factory, isAdminOrHigher } = useAuth();
  const [loading, setLoading] = useState(true);
  const [blockers, setBlockers] = useState<Blocker[]>([]);

  // Normal page search (what the user types).
  const [searchTerm, setSearchTerm] = useState("");

  // One-time deep-link value (kept for compatibility, but blocker notifications now just go to /blockers).
  const [deepLinkSearch, setDeepLinkSearch] = useState(searchParams.get("search") || "");

  // If we are already on /blockers and a navigation updates ?search=..., keep deepLinkSearch in sync.
  useEffect(() => {
    const urlSearch = searchParams.get("search");
    if (urlSearch && urlSearch !== deepLinkSearch) {
      setDeepLinkSearch(urlSearch);
    }
  }, [searchParams, deepLinkSearch]);

  const [filterImpact, setFilterImpact] = useState("all");
  const [activeTab, setActiveTab] = useState("open");
  const [selectedBlocker, setSelectedBlocker] = useState<Blocker | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [bulkDismissing, setBulkDismissing] = useState(false);

  // If we jumped here from a notification, reset filters so the full list remains visible.
  useEffect(() => {
    const state = (location.state || {}) as any;
    if (state?.resetBlockersFilters) {
      setSearchTerm("");
      setFilterImpact("all");
      setActiveTab("open");
      setSelectedBlocker(null);
      setDetailModalOpen(false);
      setDeepLinkSearch("");
      setSearchParams({}, { replace: true });
    }
  }, [location.key]);

  // Auto-open first matching blocker when navigating from a notification.
  // Important: we do NOT populate the search input, so the full blocker list stays visible.
  useEffect(() => {
    if (!loading && blockers.length > 0 && deepLinkSearch) {
      const q = deepLinkSearch.toLowerCase();
      const matchingBlocker = blockers.find((b) =>
        b.line_name.toLowerCase().includes(q) || (b.description || "").toLowerCase().includes(q)
      );

      if (matchingBlocker && !detailModalOpen) {
        setSelectedBlocker(matchingBlocker);
        setDetailModalOpen(true);
      }

      // Consume deep-link param (whether we matched or not)
      setDeepLinkSearch("");
      setSearchParams({}, { replace: true });
    }
  }, [loading, blockers, deepLinkSearch, detailModalOpen, setSearchParams]);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchBlockers();
    }
  }, [profile?.factory_id]);

  async function fetchBlockers() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      const [sewingRes, finishingRes] = await Promise.all([
        supabase
          .from('production_updates_sewing')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style), blocker_types(name)')
          .eq('factory_id', profile.factory_id)
          .eq('has_blocker', true)
          .order('submitted_at', { ascending: false })
          .limit(100),
        supabase
          .from('production_updates_finishing')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style), blocker_types(name)')
          .eq('factory_id', profile.factory_id)
          .eq('has_blocker', true)
          .order('submitted_at', { ascending: false })
          .limit(100),
      ]);

      const sewingBlockers: Blocker[] = (sewingRes.data || []).map(b => ({
        id: b.id,
        type: 'sewing',
        line_name: b.lines?.name || b.lines?.line_id || 'Unknown',
        po_number: b.work_orders?.po_number || null,
        blocker_type_name: (b.blocker_types as any)?.name || null,
        description: b.blocker_description,
        impact: b.blocker_impact,
        owner: b.blocker_owner,
        status: b.blocker_status || 'open',
        submitted_at: b.submitted_at,
        production_date: b.production_date,
        buyer: b.work_orders?.buyer,
        style: b.work_orders?.style,
        output_qty: b.output_qty,
        target_qty: b.target_qty,
        manpower: b.manpower,
        notes: b.notes,
      }));

      const finishingBlockers: Blocker[] = (finishingRes.data || []).map(b => ({
        id: b.id,
        type: 'finishing',
        line_name: b.lines?.name || b.lines?.line_id || 'Unknown',
        po_number: b.work_orders?.po_number || null,
        blocker_type_name: (b.blocker_types as any)?.name || null,
        description: b.blocker_description,
        impact: b.blocker_impact,
        owner: b.blocker_owner,
        status: b.blocker_status || 'open',
        submitted_at: b.submitted_at,
        production_date: b.production_date,
        buyer_name: b.buyer_name,
        style_no: b.style_no,
        item_name: b.item_name,
        day_qc_pass: b.day_qc_pass,
        total_qc_pass: b.total_qc_pass,
      }));

      setBlockers([...sewingBlockers, ...finishingBlockers].sort(
        (a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()
      ));
    } catch (error) {
      console.error('Error fetching blockers:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(blocker: Blocker) {
    if (!isAdminOrHigher()) {
      toast.error("Only admins can resolve blockers");
      return;
    }

    setResolving(true);
    try {
      const table = blocker.type === 'sewing' ? 'production_updates_sewing' : 'production_updates_finishing';
      const { error } = await supabase
        .from(table)
        .update({ blocker_status: 'resolved' })
        .eq('id', blocker.id);

      if (error) throw error;

      toast.success("Blocker marked as resolved");
      setDetailModalOpen(false);
      setSelectedBlocker(null);
      fetchBlockers();
    } catch (error) {
      console.error('Error resolving blocker:', error);
      toast.error("Failed to resolve blocker");
    } finally {
      setResolving(false);
    }
  }

  async function handleDismiss(blocker: Blocker) {
    if (!isAdminOrHigher()) {
      toast.error("Only admins can dismiss blockers");
      return;
    }

    setDismissing(true);
    try {
      const table = blocker.type === 'sewing' ? 'production_updates_sewing' : 'production_updates_finishing';
      const { error } = await supabase
        .from(table)
        .update({ has_blocker: false })
        .eq('id', blocker.id);

      if (error) throw error;

      toast.success("Blocker dismissed");
      setDetailModalOpen(false);
      setSelectedBlocker(null);
      // Remove from local state immediately
      setBlockers(prev => prev.filter(b => b.id !== blocker.id));
    } catch (error) {
      console.error('Error dismissing blocker:', error);
      toast.error("Failed to dismiss blocker");
    } finally {
      setDismissing(false);
    }
  }

  async function handleBulkDismiss() {
    if (!isAdminOrHigher()) {
      toast.error("Only admins can dismiss blockers");
      return;
    }

    const resolvedBlockersList = blockers.filter(b => b.status === 'resolved');
    if (resolvedBlockersList.length === 0) {
      toast.info("No resolved blockers to dismiss");
      return;
    }

    setBulkDismissing(true);
    try {
      const sewingIds = resolvedBlockersList.filter(b => b.type === 'sewing').map(b => b.id);
      const finishingIds = resolvedBlockersList.filter(b => b.type === 'finishing').map(b => b.id);

      const promises = [];
      if (sewingIds.length > 0) {
        promises.push(
          supabase
            .from('production_updates_sewing')
            .update({ has_blocker: false })
            .in('id', sewingIds)
        );
      }
      if (finishingIds.length > 0) {
        promises.push(
          supabase
            .from('production_updates_finishing')
            .update({ has_blocker: false })
            .in('id', finishingIds)
        );
      }

      const results = await Promise.all(promises);
      const hasError = results.some(r => r.error);

      if (hasError) throw new Error("Some blockers failed to dismiss");

      toast.success(`${resolvedBlockersList.length} resolved blockers dismissed`);
      // Remove all resolved blockers from local state
      setBlockers(prev => prev.filter(b => b.status !== 'resolved'));
    } catch (error) {
      console.error('Error bulk dismissing blockers:', error);
      toast.error("Failed to dismiss some blockers");
    } finally {
      setBulkDismissing(false);
    }
  }

  const filteredBlockers = blockers.filter(b => {
    const matchesSearch = b.line_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.po_number || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesImpact = filterImpact === 'all' || b.impact === filterImpact;
    const matchesTab = activeTab === 'all' || b.status === activeTab;
    return matchesSearch && matchesImpact && matchesTab;
  });

  const openBlockers = blockers.filter(b => b.status === 'open');
  const resolvedBlockers = blockers.filter(b => b.status === 'resolved');

  const getImpactColor = (impact: string | null) => {
    switch (impact) {
      case 'critical': return 'bg-destructive/10 border-destructive/30 text-destructive';
      case 'high': return 'bg-orange-500/10 border-orange-500/30 text-orange-600';
      case 'medium': return 'bg-warning/10 border-warning/30 text-warning';
      case 'low': return 'bg-success/10 border-success/30 text-success';
      default: return 'bg-muted border-border';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    // Use factory timezone for display
    const timezone = factory?.timezone || "Asia/Dhaka";
    const now = getCurrentTimeInTimezone(timezone);
    const today = now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    // Parse the date in the factory timezone context
    const date = new Date(dateString);
    const dateStr = date.toDateString();
    const timeStr = formatTimeInTimezone(dateString, timezone);

    if (dateStr === today) {
      return `Today, ${timeStr}`;
    } else if (dateStr === yesterdayStr) {
      return `Yesterday, ${timeStr}`;
    }
    return formatDateTimeInTimezone(dateString, timezone);
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Blockers</h1>
            <p className="text-sm text-muted-foreground">Track and resolve production blockers</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-amber-50 via-white to-amber-50/50 border-amber-200/60 dark:border-amber-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="p-4 text-center">
            <div className="flex justify-center mb-2">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25 group-hover:shadow-amber-500/40 transition-shadow flex items-center justify-center">
                <span className="text-white font-bold text-lg">{openBlockers.length}</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-destructive">{openBlockers.length}</p>
            <p className="text-sm text-muted-foreground">Open</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 border-emerald-200/60 dark:border-emerald-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="p-4 text-center">
            <div className="flex justify-center mb-2">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-shadow flex items-center justify-center">
                <span className="text-white font-bold text-lg">{resolvedBlockers.length}</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-success">{resolvedBlockers.length}</p>
            <p className="text-sm text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search blockers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterImpact} onValueChange={setFilterImpact}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by impact" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Impacts</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="open">Open ({openBlockers.length})</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({resolvedBlockers.length})</TabsTrigger>
            <TabsTrigger value="all">All ({blockers.length})</TabsTrigger>
          </TabsList>
          
          {/* Bulk dismiss button - only show on resolved tab with resolved blockers */}
          {activeTab === 'resolved' && resolvedBlockers.length > 0 && isAdminOrHigher() && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Resolved
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all resolved blockers?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will dismiss {resolvedBlockers.length} resolved blocker{resolvedBlockers.length !== 1 ? 's' : ''} from your view. The production records will remain but blockers won't show here anymore.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBulkDismiss}
                    disabled={bulkDismissing}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {bulkDismissing ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1" />
                    )}
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {filteredBlockers.length > 0 ? (
            <div className="space-y-3">
              {filteredBlockers.map((blocker) => (
                <Card 
                  key={blocker.id} 
                  className={`border ${getImpactColor(blocker.impact)} cursor-pointer hover:shadow-md transition-shadow`}
                  onClick={() => {
                    setSelectedBlocker(blocker);
                    setDetailModalOpen(true);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                            blocker.type === 'sewing' ? 'bg-primary/10' : 'bg-info/10'
                          }`}>
                            {blocker.type === 'sewing' ? (
                              <SewingMachine className="h-4 w-4 text-primary" />
                            ) : (
                              <Package className="h-4 w-4 text-info" />
                            )}
                          </div>
                          <span className="font-semibold">{blocker.line_name}</span>
                          <StatusBadge variant={blocker.type} size="sm">{blocker.type}</StatusBadge>
                          {blocker.impact && (
                            <StatusBadge variant={blocker.impact as any} size="sm">
                              {BLOCKER_IMPACT_LABELS[blocker.impact as keyof typeof BLOCKER_IMPACT_LABELS] || blocker.impact}
                            </StatusBadge>
                          )}
                          {blocker.status === 'resolved' && (
                            <StatusBadge variant="success" size="sm">Resolved</StatusBadge>
                          )}
                        </div>
                        <p className="text-base font-medium text-foreground mb-2">
                          {blocker.blocker_type_name || 'Unknown Blocker'}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          {blocker.po_number && (
                            <span>PO: <span className="font-mono">{blocker.po_number}</span></span>
                          )}
                          {blocker.owner && (
                            <span>Owner: <span className="font-medium text-foreground">{blocker.owner}</span></span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(blocker.submitted_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {blocker.status !== 'resolved' && isAdminOrHigher() && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-success border-success/30 hover:bg-success/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResolve(blocker);
                            }}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Resolve
                          </Button>
                        )}
                        {blocker.status === 'resolved' && isAdminOrHigher() && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDismiss(blocker);
                            }}
                            title="Dismiss blocker"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No blockers found</p>
                {activeTab === 'open' && <p className="text-sm">Production is running smoothly!</p>}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Blocker Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Blocker Details
            </DialogTitle>
          </DialogHeader>

          {selectedBlocker && (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                  selectedBlocker.type === 'sewing' ? 'bg-primary/10' : 'bg-info/10'
                }`}>
                  {selectedBlocker.type === 'sewing' ? (
                    <SewingMachine className="h-4 w-4 text-primary" />
                  ) : (
                    <Package className="h-4 w-4 text-info" />
                  )}
                </div>
                <span className="font-semibold text-lg">{selectedBlocker.line_name}</span>
                <StatusBadge variant={selectedBlocker.type} size="sm">{selectedBlocker.type}</StatusBadge>
                {selectedBlocker.impact && (
                  <StatusBadge variant={selectedBlocker.impact as any} size="sm">
                    {BLOCKER_IMPACT_LABELS[selectedBlocker.impact as keyof typeof BLOCKER_IMPACT_LABELS] || selectedBlocker.impact}
                  </StatusBadge>
                )}
                <StatusBadge variant={selectedBlocker.status === 'resolved' ? 'success' : 'default'} size="sm">
                  {selectedBlocker.status}
                </StatusBadge>
              </div>

              {/* Blocker Type */}
              {selectedBlocker.blocker_type_name && (
                <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                  <p className="text-sm font-medium text-warning mb-1">Issue Type</p>
                  <p className="text-base font-semibold">{selectedBlocker.blocker_type_name}</p>
                </div>
              )}

              {/* Description */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-1">Description</p>
                <p className="text-sm">{selectedBlocker.description || 'No description provided'}</p>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {selectedBlocker.po_number && (
                  <div>
                    <span className="text-muted-foreground">PO Number: </span>
                    <span className="font-mono">{selectedBlocker.po_number}</span>
                  </div>
                )}
                {selectedBlocker.owner && (
                  <div>
                    <span className="text-muted-foreground">Owner: </span>
                    <span className="font-medium">{selectedBlocker.owner}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Date: </span>
                  <span>{new Date(selectedBlocker.production_date).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Submitted: </span>
                  <span>{formatDate(selectedBlocker.submitted_at)}</span>
                </div>
                {selectedBlocker.type === 'sewing' && selectedBlocker.buyer && (
                  <div>
                    <span className="text-muted-foreground">Buyer: </span>
                    <span>{selectedBlocker.buyer}</span>
                  </div>
                )}
                {selectedBlocker.type === 'finishing' && selectedBlocker.buyer_name && (
                  <div>
                    <span className="text-muted-foreground">Buyer: </span>
                    <span>{selectedBlocker.buyer_name}</span>
                  </div>
                )}
                {selectedBlocker.type === 'sewing' && selectedBlocker.style && (
                  <div>
                    <span className="text-muted-foreground">Style: </span>
                    <span>{selectedBlocker.style}</span>
                  </div>
                )}
                {selectedBlocker.type === 'finishing' && selectedBlocker.style_no && (
                  <div>
                    <span className="text-muted-foreground">Style: </span>
                    <span>{selectedBlocker.style_no}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
              Close
            </Button>
            {selectedBlocker && selectedBlocker.status === 'resolved' && isAdminOrHigher() && (
              <Button
                variant="destructive"
                onClick={() => selectedBlocker && handleDismiss(selectedBlocker)}
                disabled={dismissing}
              >
                {dismissing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                Dismiss
              </Button>
            )}
            {selectedBlocker && selectedBlocker.status !== 'resolved' && isAdminOrHigher() && (
              <Button
                onClick={() => selectedBlocker && handleResolve(selectedBlocker)}
                disabled={resolving}
                className="bg-success hover:bg-success/90"
              >
                {resolving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                Mark as Resolved
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
