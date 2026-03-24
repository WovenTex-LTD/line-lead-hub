import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { Search, Warehouse, Download, X, ChevronRight, ChevronDown, Layers, Package, TrendingUp, AlertTriangle } from "lucide-react";
import { TableSkeleton, StatsCardsSkeleton } from "@/components/ui/table-skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StorageBinCardDetailModal } from "@/components/StorageBinCardDetailModal";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePagination } from "@/hooks/usePagination";

interface BinCard {
  id: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  supplier_name: string | null;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  group_name: string | null;
  po_set_signature: string | null;
  work_orders: {
    po_number: string;
    buyer: string;
    style: string;
    item: string | null;
  };
  latestBalance?: number;
  totalReceived?: number;
  totalIssued?: number;
}

interface DisplayRow {
  type: "single" | "group";
  id: string; // card id or group signature
  groupName?: string;
  cards: BinCard[];
  totalReceived: number;
  totalIssued: number;
  totalBalance: number;
  created_at: string;
}

interface StorageSubmissionsTableProps {
  factoryId: string;
  dateRange: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  lowStockThreshold?: number;
}

export function StorageSubmissionsTable({
  factoryId,
  dateRange,
  searchTerm,
  onSearchChange,
  lowStockThreshold = 10,
}: StorageSubmissionsTableProps) {
  const { isAdminOrHigher } = useAuth();
  const isAdmin = isAdminOrHigher();
  const [loading, setLoading] = useState(true);
  const [binCards, setBinCards] = useState<BinCard[]>([]);
  const [selectedBinCard, setSelectedBinCard] = useState<any>(null);
  const [binCardTransactions, setBinCardTransactions] = useState<any[]>([]);
  const [groupedModalData, setGroupedModalData] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetchData();
  }, [factoryId, dateRange]);

  async function fetchData() {
    setLoading(true);
    const endDate = new Date();
    const startDate = subDays(endDate, parseInt(dateRange));

    try {
      const { data: cardsData, error } = await supabase
        .from("storage_bin_cards")
        .select(`
          id,
          work_order_id,
          buyer,
          style,
          supplier_name,
          description,
          color,
          created_at,
          updated_at,
          group_name,
          po_set_signature,
          work_orders!inner (
            po_number,
            buyer,
            style,
            item
          )
        `)
        .eq("factory_id", factoryId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Backfill missing group members: if any card in a group passes the date
      // filter, also fetch sibling cards that were created outside the date range
      const fetchedIds = new Set((cardsData || []).map(c => c.id));
      const groupSignatures = [...new Set(
        (cardsData || []).map(c => c.po_set_signature).filter(Boolean)
      )] as string[];

      let allCards = [...(cardsData || [])];

      if (groupSignatures.length > 0) {
        const { data: siblingCards } = await supabase
          .from("storage_bin_cards")
          .select(`
            id, work_order_id, buyer, style, supplier_name, description, color,
            created_at, updated_at, group_name, po_set_signature,
            work_orders!inner ( po_number, buyer, style, item )
          `)
          .eq("factory_id", factoryId)
          .in("po_set_signature", groupSignatures);

        if (siblingCards) {
          for (const card of siblingCards) {
            if (!fetchedIds.has(card.id)) {
              allCards.push(card);
              fetchedIds.add(card.id);
            }
          }
        }
      }

      const cardIds = allCards.map(c => c.id);
      const latestByCard = new Map<string, { balance: number; received: number; issued: number }>();

      if (cardIds.length > 0) {
        const { data: allTxns } = await supabase
          .from("storage_bin_card_transactions")
          .select("bin_card_id, balance_qty, receive_qty, issue_qty, transaction_date, created_at")
          .eq("factory_id", factoryId)
          .in("bin_card_id", cardIds)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false });

        const txnTotals = new Map<string, { received: number; issued: number }>();

        (allTxns || []).forEach(txn => {
          if (!latestByCard.has(txn.bin_card_id)) {
            latestByCard.set(txn.bin_card_id, { balance: txn.balance_qty, received: 0, issued: 0 });
          }

          const current = txnTotals.get(txn.bin_card_id) || { received: 0, issued: 0 };
          current.received += txn.receive_qty || 0;
          current.issued += txn.issue_qty || 0;
          txnTotals.set(txn.bin_card_id, current);
        });

        txnTotals.forEach((totals, cardId) => {
          const entry = latestByCard.get(cardId);
          if (entry) {
            entry.received = totals.received;
            entry.issued = totals.issued;
          }
        });
      }

      const cardsWithBalance = allCards.map(card => ({
        ...card,
        latestBalance: latestByCard.get(card.id)?.balance,
        totalReceived: latestByCard.get(card.id)?.received || 0,
        totalIssued: latestByCard.get(card.id)?.issued || 0,
      })) as BinCard[];

      setBinCards(cardsWithBalance);
    } catch (error) {
      console.error("Error fetching storage data:", error);
      toast.error("Failed to load storage data");
    } finally {
      setLoading(false);
    }
  }

  const filteredCards = useMemo(() => {
    if (!searchTerm) return binCards;
    const term = searchTerm.toLowerCase();
    return binCards.filter(card =>
      card.work_orders.po_number.toLowerCase().includes(term) ||
      card.work_orders.buyer.toLowerCase().includes(term) ||
      card.work_orders.style.toLowerCase().includes(term) ||
      (card.description?.toLowerCase().includes(term)) ||
      (card.group_name?.toLowerCase().includes(term))
    );
  }, [binCards, searchTerm]);

  // Group cards by po_set_signature
  const displayRows = useMemo((): DisplayRow[] => {
    const grouped = new Map<string, BinCard[]>();
    const ungrouped: BinCard[] = [];

    filteredCards.forEach(card => {
      if (card.po_set_signature) {
        const existing = grouped.get(card.po_set_signature) || [];
        existing.push(card);
        grouped.set(card.po_set_signature, existing);
      } else {
        ungrouped.push(card);
      }
    });

    const rows: DisplayRow[] = [];

    grouped.forEach((cards, sig) => {
      rows.push({
        type: "group",
        id: sig,
        groupName: cards[0].group_name || "Grouped Submission",
        cards,
        totalReceived: cards.reduce((s, c) => s + (c.totalReceived || 0), 0),
        totalIssued: cards.reduce((s, c) => s + (c.totalIssued || 0), 0),
        totalBalance: cards.reduce((s, c) => s + (c.latestBalance || 0), 0),
        created_at: cards[0].created_at,
      });
    });

    ungrouped.forEach(card => {
      rows.push({
        type: "single",
        id: card.id,
        cards: [card],
        totalReceived: card.totalReceived || 0,
        totalIssued: card.totalIssued || 0,
        totalBalance: card.latestBalance || 0,
        created_at: card.created_at,
      });
    });

    // Sort by created_at descending
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return rows;
  }, [filteredCards]);

  const {
    currentPage,
    totalPages,
    paginatedData: paginatedRows,
    setCurrentPage,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
    canGoNext,
    canGoPrevious,
    startIndex,
    endIndex,
  } = usePagination(displayRows, { pageSize });

  function toggleGroup(sig: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(sig)) next.delete(sig);
      else next.add(sig);
      return next;
    });
  }

  const stats = useMemo(() => {
    const totalBalance = binCards.reduce((sum, c) => sum + (c.latestBalance || 0), 0);
    const lowStock = binCards.filter(c => c.latestBalance !== undefined && c.latestBalance <= lowStockThreshold).length;
    const totalReceived = binCards.reduce((sum, c) => sum + (c.totalReceived || 0), 0);
    const totalIssued = binCards.reduce((sum, c) => sum + (c.totalIssued || 0), 0);
    return { total: binCards.length, totalBalance, lowStock, totalReceived, totalIssued };
  }, [binCards, lowStockThreshold]);

  const handleCardClick = async (card: BinCard) => {
    setGroupedModalData(null);
    setModalLoading(true);
    setModalOpen(true);

    try {
      const { data: binCardData, error: binCardError } = await supabase
        .from('storage_bin_cards')
        .select('*, work_orders(po_number)')
        .eq('id', card.id)
        .single();

      if (binCardError) throw binCardError;

      const { data: txnData, error: txnError } = await supabase
        .from('storage_bin_card_transactions')
        .select('*')
        .eq('bin_card_id', card.id)
        .order('transaction_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (txnError) throw txnError;

      setSelectedBinCard({
        id: binCardData.id,
        buyer: binCardData.buyer,
        style: binCardData.style,
        po_number: binCardData.work_orders?.po_number || null,
        supplier_name: binCardData.supplier_name,
        description: binCardData.description,
        construction: binCardData.construction,
        color: binCardData.color,
        width: binCardData.width,
        package_qty: binCardData.package_qty,
        prepared_by: binCardData.prepared_by,
      });
      setBinCardTransactions(txnData || []);
    } catch (error) {
      console.error('Error fetching bin card details:', error);
      setModalOpen(false);
      toast.error("Failed to load bin card details");
    } finally {
      setModalLoading(false);
    }
  };

  const handleGroupClick = async (row: DisplayRow) => {
    setSelectedBinCard(null);
    setGroupedModalData(null);
    setModalLoading(true);
    setModalOpen(true);

    try {
      const cardIds = row.cards.map(c => c.id);

      const [cardsResult, txnsResult] = await Promise.all([
        supabase
          .from('storage_bin_cards')
          .select('*, work_orders(po_number)')
          .in('id', cardIds),
        supabase
          .from('storage_bin_card_transactions')
          .select('*')
          .in('bin_card_id', cardIds)
          .order('transaction_date', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);

      if (cardsResult.error) throw cardsResult.error;
      if (txnsResult.error) throw txnsResult.error;

      const txnsByCard = new Map<string, any[]>();
      (txnsResult.data || []).forEach(txn => {
        const list = txnsByCard.get(txn.bin_card_id) || [];
        list.push(txn);
        txnsByCard.set(txn.bin_card_id, list);
      });

      setGroupedModalData({
        groupName: row.groupName || "Grouped Submission",
        cards: (cardsResult.data || []).map(card => ({
          binCard: {
            id: card.id,
            buyer: card.buyer,
            style: card.style,
            po_number: card.work_orders?.po_number || null,
            supplier_name: card.supplier_name,
            description: card.description,
            construction: card.construction,
            color: card.color,
            width: card.width,
            package_qty: card.package_qty,
            prepared_by: card.prepared_by,
          },
          transactions: txnsByCard.get(card.id) || [],
        })),
      });
    } catch (error) {
      console.error('Error fetching group details:', error);
      setModalOpen(false);
      toast.error("Failed to load group details");
    } finally {
      setModalLoading(false);
    }
  };

  const allCardIds = paginatedRows.flatMap(r => r.cards.map(c => c.id));
  const allPageSelected = allCardIds.length > 0 && allCardIds.every(id => selectedIds.has(id));
  const somePageSelected = allCardIds.some(id => selectedIds.has(id));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        allCardIds.forEach(id => next.delete(id));
      } else {
        allCardIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  function toggleSelectRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportSelectedCsv() {
    const rows = filteredCards.filter(c => selectedIds.has(c.id));
    const headers = ["Created", "PO Number", "Buyer", "Style", "Description", "Received", "Issued", "Balance"];
    const csvRows = [headers.join(",")];
    rows.forEach(c => {
      csvRows.push([
        format(new Date(c.created_at), "yyyy-MM-dd"),
        `"${c.work_orders.po_number}"`,
        `"${c.work_orders.buyer}"`,
        `"${c.work_orders.style}"`,
        `"${c.description || ""}"`,
        c.totalReceived ?? 0,
        c.totalIssued ?? 0,
        c.latestBalance ?? "",
      ].join(","));
    });
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    await downloadFile(blob, `storage-bin-cards-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success(`Exported ${rows.length} rows`);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <StatsCardsSkeleton count={4} />
        <TableSkeleton columns={7} rows={6} headers={["Created", "PO Number", "Buyer", "Style", "Received", "Issued", "Balance"]} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-orange-50 via-white to-orange-50/50 dark:from-orange-950/40 dark:via-card dark:to-orange-950/20 border-orange-200/60 dark:border-orange-800/40 hover:shadow-lg transition-all duration-300">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 shadow-md shadow-orange-500/20 flex items-center justify-center">
                <Warehouse className="h-3.5 w-3.5 text-white" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium">Bin Cards</p>
            </div>
            <div className="text-xl font-bold text-orange-700 dark:text-orange-300">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40 hover:shadow-lg transition-all duration-300">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-md shadow-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-white" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium">Total Balance</p>
            </div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono tabular-nums">{stats.totalBalance.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 via-white to-blue-50/50 dark:from-blue-950/40 dark:via-card dark:to-blue-950/20 border-blue-200/60 dark:border-blue-800/40 hover:shadow-lg transition-all duration-300">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-white" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium">Total Received</p>
            </div>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-300 font-mono tabular-nums">{stats.totalReceived.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br ${stats.lowStock > 0 ? 'from-red-50 via-white to-red-50/50 dark:from-red-950/40 dark:via-card dark:to-red-950/20 border-red-200/60 dark:border-red-800/40' : 'from-gray-50 via-white to-gray-50/50 dark:from-gray-950/40 dark:via-card dark:to-gray-950/20 border-border/50'} hover:shadow-lg transition-all duration-300`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-7 w-7 rounded-lg shadow-md flex items-center justify-center ${stats.lowStock > 0 ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/20' : 'bg-gradient-to-br from-gray-400 to-gray-500 shadow-gray-500/20'}`}>
                <AlertTriangle className="h-3.5 w-3.5 text-white" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium">Low Stock</p>
            </div>
            <div className={`text-xl font-bold ${stats.lowStock > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{stats.lowStock}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by PO, buyer, style..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-orange-600" />
            Bin Cards
            <Badge variant="secondary" className="ml-2">{filteredCards.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={exportSelectedCsv}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Export CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      {...(somePageSelected && !allPageSelected ? { "data-state": "indeterminate" } : {})}
                    />
                  </TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Issued</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No bin cards found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row) => {
                    if (row.type === "group") {
                      const isExpanded = expandedGroups.has(row.id);
                      return (
                        <Fragment key={row.id}>
                          <TableRow
                            key={row.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleGroupClick(row)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={row.cards.every(c => selectedIds.has(c.id))}
                                onCheckedChange={() => {
                                  setSelectedIds(prev => {
                                    const next = new Set(prev);
                                    const allSelected = row.cards.every(c => next.has(c.id));
                                    row.cards.forEach(c => allSelected ? next.delete(c.id) : next.add(c.id));
                                    return next;
                                  });
                                }}
                                aria-label="Select group"
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {format(new Date(row.created_at), "MMM d")}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  className="p-0.5 rounded hover:bg-muted"
                                  onClick={(e) => { e.stopPropagation(); toggleGroup(row.id); }}
                                >
                                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                </button>
                                <span className="text-muted-foreground">{row.cards.length} POs</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                <Layers className="h-4 w-4 text-primary" />
                                <span>{row.groupName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {[...new Set(row.cards.map(c => c.work_orders.style))].join(", ")}
                            </TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">
                              {row.totalReceived.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium text-blue-600">
                              {row.totalIssued.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{row.totalBalance.toLocaleString()}</Badge>
                            </TableCell>
                          </TableRow>
                          {isExpanded && row.cards.map(card => (
                            <TableRow
                              key={card.id}
                              className="cursor-pointer hover:bg-muted/50 bg-muted/20"
                              onClick={() => handleCardClick(card)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(card.id)}
                                  onCheckedChange={() => toggleSelectRow(card.id)}
                                  aria-label="Select row"
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm pl-8">
                                {format(new Date(card.created_at), "MMM d")}
                              </TableCell>
                              <TableCell className="font-medium pl-8">{card.work_orders.po_number}</TableCell>
                              <TableCell>{card.work_orders.buyer}</TableCell>
                              <TableCell>{card.work_orders.style}</TableCell>
                              <TableCell className="text-right text-emerald-600 font-medium">
                                {card.totalReceived?.toLocaleString() || 0}
                              </TableCell>
                              <TableCell className="text-right text-blue-600 font-medium">
                                {card.totalIssued?.toLocaleString() || 0}
                              </TableCell>
                              <TableCell className="text-right">
                                {card.latestBalance !== undefined ? (
                                  <Badge variant={card.latestBalance <= lowStockThreshold ? "destructive" : "secondary"}>
                                    {card.latestBalance.toLocaleString()}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    }

                    // Single card row
                    const card = row.cards[0];
                    return (
                      <TableRow
                        key={card.id}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(card.id) ? "bg-primary/5" : ""}`}
                        onClick={() => handleCardClick(card)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(card.id)}
                            onCheckedChange={() => toggleSelectRow(card.id)}
                            aria-label="Select row"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(card.created_at), "MMM d")}
                        </TableCell>
                        <TableCell className="font-medium">{card.work_orders.po_number}</TableCell>
                        <TableCell>{card.work_orders.buyer}</TableCell>
                        <TableCell>{card.work_orders.style}</TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">
                          {card.totalReceived?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="text-right text-blue-600 font-medium">
                          {card.totalIssued?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          {card.latestBalance !== undefined ? (
                            <Badge variant={card.latestBalance <= lowStockThreshold ? "destructive" : "secondary"}>
                              {card.latestBalance.toLocaleString()}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            totalItems={displayRows.length}
            onPageChange={setCurrentPage}
            onFirstPage={goToFirstPage}
            onLastPage={goToLastPage}
            onNextPage={goToNextPage}
            onPreviousPage={goToPreviousPage}
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>

      {/* Storage Bin Card Detail Modal */}
      <StorageBinCardDetailModal
        binCard={selectedBinCard}
        transactions={binCardTransactions}
        groupedCards={groupedModalData}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onDelete={isAdmin ? () => fetchData() : undefined}
      />
    </div>
  );
}
