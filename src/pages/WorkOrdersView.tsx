import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Receipt, Search, Archive, Loader2, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePOControlRoom } from "@/components/po-control-room/usePOControlRoom";
import { POControlRoomKPIs } from "@/components/po-control-room/POControlRoomKPIs";
import { POWorkflowTabs } from "@/components/po-control-room/POWorkflowTabs";
import { POClusterSection } from "@/components/po-control-room/POClusterSection";
import { POTable } from "@/components/po-control-room/POTable";
import { POFilterDrawer } from "@/components/po-control-room/POFilterDrawer";
import { POFilterChips } from "@/components/po-control-room/POFilterChips";
import { ExtrasLedgerModal } from "@/components/ExtrasLedgerModal";
import { ExtrasOverviewModal } from "@/components/ExtrasOverviewModal";
import {
  EMPTY_FILTERS,
  countActiveFilters,
  filtersFromParams,
  filtersToParams,
  type POFilters,
} from "@/components/po-control-room/po-filters";
import type { POControlRoomData } from "@/components/po-control-room/types";

export default function WorkOrdersView() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Filter state (URL-persisted) ──────────────────────────────────────────
  const [filters, setFilters] = useState<POFilters>(() =>
    filtersFromParams(searchParams)
  );
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const handleFiltersChange = useCallback(
    (next: POFilters) => {
      setFilters(next);
      setSearchParams(
        (prev) => {
          // Preserve non-filter params (e.g., tab)
          const merged = new URLSearchParams(prev);
          // Clear existing filter keys
          ["buyer", "po", "style", "line", "unit", "floor", "health", "ex", "updated"].forEach(
            (k) => merged.delete(k)
          );
          // Set new filter params
          Object.entries(filtersToParams(next)).forEach(([k, v]) =>
            merged.set(k, v)
          );
          return merged;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const activeFilterCount = countActiveFilters(filters);

  // ── Hook ─────────────────────────────────────────────────────────────────
  const {
    loading,
    filteredOrders,
    kpis,
    tabCounts,
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    expandedId,
    detailData,
    detailLoading,
    toggleExpand,
    clusteredRunning,
    filterOptions,
    refetch,
  } = usePOControlRoom(filters);

  // Extras ledger modal state
  const [ledgerPO, setLedgerPO] = useState<POControlRoomData | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [showExtrasOverview, setShowExtrasOverview] = useState(false);

  const handleViewLedger = (po: POControlRoomData) => {
    setLedgerPO(po);
    setShowLedger(true);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold">Work Orders</h1>
              <span className="text-xs font-medium bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-full px-2 py-0.5">
                {kpis.activeOrders} active
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Track health, pipeline, and production progress</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowExtrasOverview(true)}
          className="gap-2"
        >
          <Archive className="h-4 w-4" />
          View All Leftovers
        </Button>
      </div>

      {/* KPI Cards */}
      <POControlRoomKPIs kpis={kpis} />

      {/* Search + Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by PO, buyer, or style..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters button */}
        <Button
          variant="outline"
          size="default"
          className="gap-2 shrink-0"
          onClick={() => setFilterDrawerOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-[20px] px-1.5 text-[11px] font-semibold"
            >
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <POFilterChips filters={filters} onChange={handleFiltersChange} />
      )}

      {/* Workflow Tabs */}
      <POWorkflowTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={tabCounts}
      />

      {/* Running tab: cluster sections */}
      {activeTab === "running" ? (
        <div className="space-y-4">
          {clusteredRunning.size === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No running work orders{activeFilterCount > 0 ? " matching the current filters" : ""}
            </div>
          ) : (
            Array.from(clusteredRunning.entries()).map(([cluster, pos]) => (
              <POClusterSection
                key={cluster}
                cluster={cluster}
                pos={pos}
                expandedId={expandedId}
                detailData={detailData}
                detailLoading={detailLoading}
                onToggleExpand={toggleExpand}
                onViewExtras={handleViewLedger}
              />
            ))
          )}
        </div>
      ) : (
        /* All other tabs: flat table */
        <POTable
          orders={filteredOrders}
          loading={false}
          expandedId={expandedId}
          detailData={detailData}
          detailLoading={detailLoading}
          onToggleExpand={toggleExpand}
          onViewExtras={handleViewLedger}
        />
      )}

      {/* Filter drawer */}
      <POFilterDrawer
        open={filterDrawerOpen}
        onOpenChange={setFilterDrawerOpen}
        filters={filters}
        onChange={handleFiltersChange}
        options={filterOptions}
      />

      {/* Extras Ledger Modal */}
      {ledgerPO && (
        <ExtrasLedgerModal
          open={showLedger}
          onOpenChange={setShowLedger}
          workOrderId={ledgerPO.id}
          poNumber={ledgerPO.po_number}
          extrasAvailable={
            Math.max(ledgerPO.finishedOutput - ledgerPO.order_qty, 0) -
            ledgerPO.extrasConsumed
          }
          onLedgerChange={refetch}
        />
      )}

      {/* Extras Overview Modal */}
      <ExtrasOverviewModal
        open={showExtrasOverview}
        onOpenChange={setShowExtrasOverview}
      />
    </div>
  );
}
