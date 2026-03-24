import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Warehouse, Search, FileText, AlertTriangle, Download, Calendar, CalendarIcon, X, XCircle, Layers, ChevronRight, ArrowDownToLine, ArrowUpFromLine, Scale } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { format, subDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface BinCardWithWorkOrder {
  id: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  supplier_name: string | null;
  description: string | null;
  color: string | null;
  width: string | null;
  package_qty: string | null;
  construction: string | null;
  prepared_by: string | null;
  created_at: string;
  updated_at: string;
  bin_group_id: string | null;
  group_name: string | null;
  po_set_signature: string | null;
  work_orders: {
    po_number: string;
    buyer: string;
    style: string;
    item: string | null;
  };
  latestBalance?: number;
}

function getGroupKey(card: BinCardWithWorkOrder): string | null {
  return card.po_set_signature || card.bin_group_id || null;
}

interface DisplayRow {
  type: "single" | "group";
  key: string;
  cards: BinCardWithWorkOrder[];
  poNumbers: string[];
  groupName: string | null;
  buyer: string;
  buyers: string[];
  style: string;
  styles: string[];
  description: string;
  updatedAt: string;
  totalBalance: number;
}

interface Transaction {
  id: string;
  transaction_date: string;
  receive_qty: number;
  issue_qty: number;
  ttl_receive: number;
  balance_qty: number;
  remarks: string | null;
  created_at: string | null;
  submitted_by?: string | null;
}

interface DashboardStats {
  totalCurrentBalance: number;
  monthlyReceived: number;
  monthlyIssued: number;
  lowBalanceCards: number;
}

export default function StorageDashboard() {
  const { profile, isAdminOrHigher, factory } = useAuth();
  const { t } = useTranslation();
  const lowStockThreshold = factory?.low_stock_threshold ?? 10;
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalCurrentBalance: 0,
    monthlyReceived: 0,
    monthlyIssued: 0,
    lowBalanceCards: 0,
  });
  const [binCards, setBinCards] = useState<BinCardWithWorkOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCard, setSelectedCard] = useState<BinCardWithWorkOrder | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTxn, setLoadingTxn] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  
  // List date filters
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  
  // Track dismissed low stock warnings (persisted in localStorage)
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(`dismissed_low_stock_${profile?.factory_id}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  const canAccess = isAdminOrHigher();

  useEffect(() => {
    if (profile?.factory_id && canAccess) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [profile?.factory_id, canAccess]);

  async function fetchData() {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfMonthStr = format(startOfMonth, "yyyy-MM-dd");
      
      // Fetch all bin cards
      const { data: cardsData, error: cardsError } = await supabase
        .from("storage_bin_cards")
        .select(`
          id,
          work_order_id,
          buyer,
          style,
          supplier_name,
          description,
          color,
          width,
          package_qty,
          construction,
          prepared_by,
          created_at,
          updated_at,
          bin_group_id,
          group_name,
          po_set_signature,
          work_orders!inner (
            po_number,
            buyer,
            style,
            item
          )
        `)
        .eq("factory_id", profile!.factory_id!)
        .order("updated_at", { ascending: false });
      
      if (cardsError) throw cardsError;
      
      const cardIds = (cardsData || []).map(c => c.id);
      let totalCurrentBalance = 0;
      let lowBalanceCount = 0;
      let monthlyReceived = 0;
      let monthlyIssued = 0;
      
      // Get latest balance for each card
      const latestByCard = new Map<string, number>();
      
      if (cardIds.length > 0) {
        // Get all transactions for stats
        const { data: allTxns } = await supabase
          .from("storage_bin_card_transactions")
          .select("bin_card_id, balance_qty, receive_qty, issue_qty, transaction_date, created_at")
          .eq("factory_id", profile!.factory_id!)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false });
        
        (allTxns || []).forEach(txn => {
          if (!latestByCard.has(txn.bin_card_id)) {
            latestByCard.set(txn.bin_card_id, txn.balance_qty);
          }
        });
        
        // Calculate totals
        totalCurrentBalance = Array.from(latestByCard.values()).reduce((sum, bal) => sum + bal, 0);
        lowBalanceCount = Array.from(latestByCard.values()).filter(bal => bal <= lowStockThreshold).length;
        
        // Calculate monthly received and issued
        (allTxns || []).forEach(txn => {
          if (txn.transaction_date >= startOfMonthStr) {
            monthlyReceived += txn.receive_qty || 0;
            monthlyIssued += txn.issue_qty || 0;
          }
        });
      }
      
      // Attach latest balance to each card
      const cardsWithBalance = (cardsData || []).map(card => ({
        ...card,
        latestBalance: latestByCard.get(card.id),
      })) as BinCardWithWorkOrder[];
      
      setBinCards(cardsWithBalance);
      
      setStats({
        totalCurrentBalance,
        monthlyReceived,
        monthlyIssued,
        lowBalanceCards: lowBalanceCount,
      });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  // Cross-group search map
  const groupSearchMap = useMemo(() => {
    const map = new Map<string, { poNumbers: string[]; buyers: string[]; styles: string[] }>();
    for (const card of binCards) {
      const key = getGroupKey(card);
      if (key) {
        const existing = map.get(key);
        if (existing) {
          if (!existing.poNumbers.includes(card.work_orders.po_number)) existing.poNumbers.push(card.work_orders.po_number);
          if (!existing.buyers.includes(card.work_orders.buyer)) existing.buyers.push(card.work_orders.buyer);
          if (!existing.styles.includes(card.work_orders.style)) existing.styles.push(card.work_orders.style);
        } else {
          map.set(key, {
            poNumbers: [card.work_orders.po_number],
            buyers: [card.work_orders.buyer],
            styles: [card.work_orders.style],
          });
        }
      }
    }
    return map;
  }, [binCards]);

  const filteredCards = useMemo(() => {
    // First pass: standard filtering
    const directMatches = binCards.filter(card => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        let matchesSearch = (
          card.work_orders.po_number.toLowerCase().includes(term) ||
          card.work_orders.buyer.toLowerCase().includes(term) ||
          card.work_orders.style.toLowerCase().includes(term) ||
          (card.work_orders.item?.toLowerCase().includes(term)) ||
          (card.description?.toLowerCase().includes(term)) ||
          (card.group_name?.toLowerCase().includes(term))
        );
        if (!matchesSearch) {
          const key = getGroupKey(card);
          if (key) {
            const groupData = groupSearchMap.get(key);
            if (groupData) {
              matchesSearch = (
                groupData.poNumbers.some(po => po.toLowerCase().includes(term)) ||
                groupData.buyers.some(b => b.toLowerCase().includes(term)) ||
                groupData.styles.some(s => s.toLowerCase().includes(term))
              );
            }
          }
        }
        if (!matchesSearch) return false;
      }

      if (dateFrom) {
        const cardDate = new Date(card.created_at);
        cardDate.setHours(0, 0, 0, 0);
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (cardDate < fromDate) return false;
      }

      if (dateTo) {
        const cardDate = new Date(card.created_at);
        cardDate.setHours(23, 59, 59, 999);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (cardDate > toDate) return false;
      }

      return true;
    });

    // Second pass: include all group members when any member matched
    const matchedGroupKeys = new Set(
      directMatches.map(c => getGroupKey(c)).filter(Boolean) as string[]
    );
    if (matchedGroupKeys.size === 0) return directMatches;

    const matchedIds = new Set(directMatches.map(c => c.id));
    const result = [...directMatches];
    for (const card of binCards) {
      const key = getGroupKey(card);
      if (!matchedIds.has(card.id) && key && matchedGroupKeys.has(key)) {
        result.push(card);
      }
    }
    return result;
  }, [binCards, searchTerm, dateFrom, dateTo, groupSearchMap]);

  // Group filtered cards for display
  const displayRows: DisplayRow[] = useMemo(() => {
    const rows: DisplayRow[] = [];
    const groupMap = new Map<string, BinCardWithWorkOrder[]>();
    const ungrouped: BinCardWithWorkOrder[] = [];

    for (const card of filteredCards) {
      const key = getGroupKey(card);
      if (key) {
        const existing = groupMap.get(key);
        if (existing) existing.push(card);
        else groupMap.set(key, [card]);
      } else {
        ungrouped.push(card);
      }
    }

    for (const [groupId, cards] of groupMap) {
      const first = cards[0];
      const uniqueBuyers = [...new Set(cards.map(c => c.work_orders.buyer))];
      const uniqueStyles = [...new Set(cards.map(c => c.work_orders.style))];
      rows.push({
        type: cards.length > 1 ? "group" : "single",
        key: groupId,
        cards,
        poNumbers: cards.map(c => c.work_orders.po_number),
        groupName: first.group_name || null,
        buyer: uniqueBuyers.length === 1 ? uniqueBuyers[0] : "Mixed",
        buyers: uniqueBuyers,
        style: uniqueStyles.length === 1 ? uniqueStyles[0] : "Mixed",
        styles: uniqueStyles,
        description: first.description || first.work_orders.item || "-",
        updatedAt: cards.reduce((latest, c) => c.updated_at > latest ? c.updated_at : latest, cards[0].updated_at),
        totalBalance: cards.reduce((sum, c) => sum + (c.latestBalance || 0), 0),
      });
    }

    for (const card of ungrouped) {
      rows.push({
        type: "single",
        key: card.id,
        cards: [card],
        poNumbers: [card.work_orders.po_number],
        groupName: null,
        buyer: card.work_orders.buyer,
        buyers: [card.work_orders.buyer],
        style: card.work_orders.style,
        styles: [card.work_orders.style],
        description: card.description || card.work_orders.item || "-",
        updatedAt: card.updated_at,
        totalBalance: card.latestBalance || 0,
      });
    }

    rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return rows;
  }, [filteredCards]);

  function clearFilters() {
    setDateFrom(undefined);
    setDateTo(undefined);
    setSearchTerm("");
  }

  function dismissLowStockWarning(cardId: string) {
    const updated = new Set(dismissedWarnings);
    updated.add(cardId);
    setDismissedWarnings(updated);
    localStorage.setItem(`dismissed_low_stock_${profile?.factory_id}`, JSON.stringify(Array.from(updated)));
  }

  function isLowStock(card: BinCardWithWorkOrder): boolean {
    if (card.latestBalance === undefined) return false;
    return card.latestBalance <= lowStockThreshold && !dismissedWarnings.has(card.id);
  }

  const hasActiveFilters = dateFrom || dateTo || searchTerm;

  // Group detail state
  const [selectedGroup, setSelectedGroup] = useState<DisplayRow | null>(null);
  const [groupTransactions, setGroupTransactions] = useState<Record<string, { po: string; txns: Transaction[] }>>({});
  const [expandedGroupPo, setExpandedGroupPo] = useState<string | null>(null);

  async function openGroupDetail(row: DisplayRow) {
    setSelectedGroup(row);
    setSelectedCard(null);
    setExpandedGroupPo(null);
    setLoadingTxn(true);
    try {
      const result: Record<string, { po: string; txns: Transaction[] }> = {};
      for (const card of row.cards) {
        let query = supabase
          .from("storage_bin_card_transactions")
          .select("*")
          .eq("bin_card_id", card.id)
          .order("transaction_date", { ascending: true })
          .order("created_at", { ascending: true });
        if (dateRange?.from) query = query.gte("transaction_date", format(dateRange.from, "yyyy-MM-dd"));
        if (dateRange?.to) query = query.lte("transaction_date", format(dateRange.to, "yyyy-MM-dd"));
        const { data, error } = await query;
        if (error) throw error;
        result[card.id] = { po: card.work_orders.po_number, txns: data || [] };
      }
      setGroupTransactions(result);
    } catch (error) {
      console.error("Error loading group transactions:", error);
    } finally {
      setLoadingTxn(false);
    }
  }

  async function openCardDetail(card: BinCardWithWorkOrder) {
    setSelectedCard(card);
    setLoadingTxn(true);
    
    try {
      let query = supabase
        .from("storage_bin_card_transactions")
        .select("*")
        .eq("bin_card_id", card.id)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true });
      
      if (dateRange?.from) {
        query = query.gte("transaction_date", format(dateRange.from, "yyyy-MM-dd"));
      }
      if (dateRange?.to) {
        query = query.lte("transaction_date", format(dateRange.to, "yyyy-MM-dd"));
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoadingTxn(false);
    }
  }

  async function exportToCSV() {
    if (!selectedCard || transactions.length === 0) return;
    
    const headers = ["Date", "Receive Qty", "TTL Receive", "Issue Qty", "Balance Qty", "Remarks"];
    const rows = transactions.map(txn => [
      format(new Date(txn.transaction_date), "yyyy-MM-dd"),
      txn.receive_qty,
      txn.ttl_receive,
      txn.issue_qty,
      txn.balance_qty,
      txn.remarks || "",
    ]);
    
    const csvContent = [
      `BIN CARD - ${selectedCard.work_orders.po_number}`,
      `Buyer: ${selectedCard.buyer || selectedCard.work_orders.buyer}`,
      `Style: ${selectedCard.style || selectedCard.work_orders.style}`,
      "",
      headers.join(","),
      ...rows.map(row => row.join(",")),
    ].join("\n");
    
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csvContent], { type: "text/csv" });
    await downloadFile(blob, `bin-card-${selectedCard.work_orders.po_number}-${format(new Date(), "yyyy-MM-dd")}.csv`);
  }

  async function exportBinCardsToCSV() {
    if (filteredCards.length === 0) return;
    
    const headers = ["PO Number", "Buyer", "Style", "Item", "Description", "Supplier", "Prepared By", "Created", "Last Updated"];
    const rows = filteredCards.map(card => [
      card.work_orders.po_number,
      card.work_orders.buyer,
      card.work_orders.style,
      card.work_orders.item || "",
      card.description || "",
      card.supplier_name || "",
      card.prepared_by || "",
      format(new Date(card.created_at), "yyyy-MM-dd"),
      format(new Date(card.updated_at), "yyyy-MM-dd"),
    ].map(val => `"${String(val).replace(/"/g, '""')}"`));
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(",")),
    ].join("\n");
    
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csvContent], { type: "text/csv" });
    await downloadFile(blob, `bin-cards-${format(new Date(), "yyyy-MM-dd")}.csv`);
  }

  if (!canAccess) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('storagePage.accessDenied')}
        description={t('storagePage.adminOnlyDashboard')}
        iconClassName="text-warning"
      />
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Warehouse className="h-8 w-8 text-orange-600" />
          <div>
            <h1 className="text-2xl font-bold">{t('storagePage.storageDashboard')}</h1>
            <p className="text-sm text-muted-foreground">{t('storagePage.overviewOfBinCards')}</p>
          </div>
        </div>
        <Button onClick={() => navigate("/storage")}>
          <Warehouse className="mr-2 h-4 w-4" />
          {t('storagePage.newEntry')}
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-primary">{stats.totalCurrentBalance.toLocaleString()}</div>
                <p className="text-sm text-muted-foreground">{t('storagePage.totalStockBalance')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{stats.monthlyReceived.toLocaleString()}</div>
                <p className="text-sm text-muted-foreground">{t('storagePage.receivedThisMonth')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">{stats.monthlyIssued.toLocaleString()}</div>
                <p className="text-sm text-muted-foreground">{t('storagePage.issuedThisMonth')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${stats.lowBalanceCards > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {stats.lowBalanceCards}
                </div>
                <p className="text-sm text-muted-foreground">Low Stock Items (≤{lowStockThreshold})</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-4">
                {/* Search row */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t('storagePage.searchByPOBuyer')}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                {/* Filter row */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Date From */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[150px] justify-start text-left font-normal",
                          !dateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "From date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Date To */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[150px] justify-start text-left font-normal",
                          !dateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, "dd/MM/yyyy") : "To date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Clear filters */}
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="mr-1 h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cards list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{t('storagePage.allBinCards')} ({displayRows.length})</CardTitle>
              {filteredCards.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportBinCardsToCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {displayRows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Warehouse className="mx-auto h-12 w-12 mb-2" />
                  <p>{t('storagePage.noRecordsFound')}</p>
                </div>
              ) : (
                <TooltipProvider>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('storagePage.statusCol')}</TableHead>
                        <TableHead>{t('storagePage.poNumberCol')}</TableHead>
                        <TableHead>{t('storagePage.groupCol')}</TableHead>
                        <TableHead>{t('storagePage.buyerCol')}</TableHead>
                        <TableHead>{t('storagePage.styleCol')}</TableHead>
                        <TableHead>{t('storagePage.balanceColumn')}</TableHead>
                        <TableHead>{t('storagePage.lastUpdated')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayRows.map(row => {
                        const hasLowStock = row.cards.some(c => isLowStock(c));
                        return (
                          <TableRow key={row.key} className={hasLowStock ? "bg-amber-500/10" : ""}>
                            {/* Status */}
                            <TableCell>
                              {hasLowStock ? (
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600">
                                    <AlertTriangle className="h-3 w-3" />
                                    Low
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>

                            {/* PO Number */}
                            <TableCell className="font-medium">
                              <div className="flex flex-wrap items-center gap-1">
                                {row.type === "group" && (
                                  <Layers className="h-3.5 w-3.5 text-primary shrink-0 mr-1" />
                                )}
                                {row.poNumbers.length === 1 ? (
                                  row.poNumbers[0]
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-default">
                                        <Badge variant="secondary" className="text-xs font-medium">
                                          {row.poNumbers[0]}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs font-medium ml-1">
                                          +{row.poNumbers.length - 1}
                                        </Badge>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs">
                                      <div className="space-y-1">
                                        {row.poNumbers.map(po => (
                                          <div key={po} className="text-xs">{po}</div>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>

                            {/* Group */}
                            <TableCell className="max-w-[150px]">
                              {row.groupName ? (
                                <Badge variant="outline" className="text-xs font-normal">
                                  {row.groupName}
                                </Badge>
                              ) : row.type === "group" ? (
                                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                  Bulk ({row.poNumbers.length} POs)
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>

                            {/* Buyer */}
                            <TableCell>
                              {row.buyers.length <= 1 ? (
                                row.buyer
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default text-muted-foreground italic">Mixed</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    <div className="space-y-1">
                                      {row.cards.map(c => (
                                        <div key={c.id} className="text-xs">
                                          <span className="font-medium">{c.work_orders.po_number}:</span> {c.work_orders.buyer}
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>

                            {/* Style */}
                            <TableCell>
                              {row.styles.length <= 1 ? (
                                row.style
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default text-muted-foreground italic">Mixed</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    <div className="space-y-1">
                                      {row.cards.map(c => (
                                        <div key={c.id} className="text-xs">
                                          <span className="font-medium">{c.work_orders.po_number}:</span> {c.work_orders.style}
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>

                            {/* Balance */}
                            <TableCell className={row.totalBalance <= lowStockThreshold ? "font-medium text-amber-600" : ""}>
                              {row.totalBalance.toLocaleString()}
                            </TableCell>

                            <TableCell>{format(new Date(row.updatedAt), "dd/MM/yyyy")}</TableCell>
                            <TableCell>
                              {row.type === "group" ? (
                                <Button variant="ghost" size="sm" onClick={() => openGroupDetail(row)}>
                                  {t('storagePage.viewDetails')}
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" onClick={() => openCardDetail(row.cards[0])}>
                                  {t('storagePage.viewDetails')}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                </TooltipProvider>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{t('storagePage.binCardLedger')} - {selectedCard?.work_orders.po_number}</span>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          {selectedCard && (
            <div className="space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border-b pb-4">
                <div>
                  <span className="text-muted-foreground">{t('storagePage.buyerLabel')}</span>
                  <p className="font-medium">{selectedCard.buyer || selectedCard.work_orders.buyer}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.styleLabel')}</span>
                  <p className="font-medium">{selectedCard.style || selectedCard.work_orders.style}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.supplierLabel')}</span>
                  <p className="font-medium">{selectedCard.supplier_name || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.descriptionLabel')}</span>
                  <p className="font-medium">{selectedCard.description || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.constructionLabel')}</span>
                  <p className="font-medium">{selectedCard.construction || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.colorLabel')}</span>
                  <p className="font-medium">{selectedCard.color || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.widthLabel')}</span>
                  <p className="font-medium">{selectedCard.width || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.packageQtyLabel')}</span>
                  <p className="font-medium">{selectedCard.package_qty || "-"}</p>
                </div>
              </div>
              
              {/* Date filter */}
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
                        ) : (
                          format(dateRange.from, "MMM d, yyyy")
                        )
                      ) : (
                        "Filter by date"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => {
                        setDateRange(range);
                        if (selectedCard) {
                          // Re-fetch with new date range
                          openCardDetail(selectedCard);
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Transactions */}
              {loadingTxn ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>DATE</TableHead>
                        <TableHead className="text-right">RECEIVE QTY</TableHead>
                        <TableHead className="text-right">TTL RECEIVE</TableHead>
                        <TableHead className="text-right">ISSUE QTY</TableHead>
                        <TableHead className="text-right">BALANCE QTY</TableHead>
                        <TableHead>REMARKS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            {t('storagePage.noTransactionHistory')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactions.map(txn => (
                          <TableRow key={txn.id}>
                            <TableCell>{format(new Date(txn.transaction_date), "dd/MM/yyyy")}</TableCell>
                            <TableCell className="text-right">{txn.receive_qty}</TableCell>
                            <TableCell className="text-right font-medium">{txn.ttl_receive}</TableCell>
                            <TableCell className="text-right">{txn.issue_qty}</TableCell>
                            <TableCell className={`text-right font-medium ${txn.balance_qty < 0 ? 'text-destructive' : txn.balance_qty <= 10 ? 'text-amber-500' : ''}`}>
                              {txn.balance_qty}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{txn.remarks || "-"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Group Detail Modal */}
      <Dialog open={!!selectedGroup} onOpenChange={() => { setSelectedGroup(null); setExpandedGroupPo(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8 break-words flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              {selectedGroup?.groupName
                ? selectedGroup.groupName
                : `Bulk Group (${selectedGroup?.poNumbers.length} POs)`}
            </DialogTitle>
          </DialogHeader>

          {selectedGroup && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('storagePage.supplierLabel')}</span>
                  <p className="font-medium">{selectedGroup.cards[0].supplier_name || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.preparedByLabel')}</span>
                  <p className="font-medium">{selectedGroup.cards[0].prepared_by || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.lastUpdatedLabel')}</span>
                  <p className="font-medium">{format(new Date(selectedGroup.updatedAt), "dd/MM/yyyy")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('storagePage.posInGroupLabel')}</span>
                  <p className="font-medium">{selectedGroup.poNumbers.length}</p>
                </div>
              </div>

              {/* PO summary table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Style</TableHead>
                      <TableHead>Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedGroup.cards.map(card => (
                      <TableRow key={card.id}>
                        <TableCell className="font-medium">{card.work_orders.po_number}</TableCell>
                        <TableCell>{card.work_orders.buyer}</TableCell>
                        <TableCell>{card.work_orders.style}</TableCell>
                        <TableCell>{card.latestBalance !== undefined ? card.latestBalance.toLocaleString() : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Group totals */}
              {!loadingTxn && Object.keys(groupTransactions).length > 0 && (() => {
                const allTxns = Object.values(groupTransactions).flatMap(g => g.txns);
                const totalReceived = allTxns.reduce((sum, t) => sum + t.receive_qty, 0);
                const totalIssued = allTxns.reduce((sum, t) => sum + t.issue_qty, 0);
                const totalBalance = Object.values(groupTransactions).reduce((sum, { txns }) => {
                  if (txns.length === 0) return sum;
                  return sum + txns[txns.length - 1].balance_qty;
                }, 0);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <ArrowDownToLine className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('storagePage.totalReceived')}</p>
                        <p className="text-lg font-bold text-green-600">{totalReceived.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <ArrowUpFromLine className="h-4 w-4 text-destructive" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('storagePage.totalIssued')}</p>
                        <p className="text-lg font-bold text-destructive">{totalIssued.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <Scale className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('storagePage.currentBalance')}</p>
                        <p className="text-lg font-bold text-primary">{totalBalance.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Per-PO ledger sections */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Per-PO Ledger</h4>
                {loadingTxn ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  selectedGroup.cards.map(card => {
                    const cardData = groupTransactions[card.id];
                    const txns = cardData?.txns || [];
                    const isExpanded = expandedGroupPo === card.id;
                    const latestBalance = txns.length > 0 ? txns[txns.length - 1].balance_qty : 0;
                    const totalRcv = txns.reduce((s, t) => s + t.receive_qty, 0);
                    const totalIss = txns.reduce((s, t) => s + t.issue_qty, 0);

                    return (
                      <div key={card.id} className="rounded-md border">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedGroupPo(isExpanded ? null : card.id)}
                        >
                          <div className="flex items-center gap-3">
                            <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
                            <Warehouse className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{card.work_orders.po_number}</span>
                            <span className="text-xs text-muted-foreground">
                              {card.work_orders.buyer} / {card.work_orders.style}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Rcv: <span className="font-medium text-foreground">{totalRcv}</span></span>
                            <span>Iss: <span className="font-medium text-foreground">{totalIss}</span></span>
                            <span>Bal: <span className={cn("font-medium", latestBalance < 0 ? "text-destructive" : "text-foreground")}>{latestBalance}</span></span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t">
                            {txns.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">No transactions recorded</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>DATE</TableHead>
                                    <TableHead className="text-right">RECEIVE QTY</TableHead>
                                    <TableHead className="text-right">TTL RECEIVE</TableHead>
                                    <TableHead className="text-right">ISSUE QTY</TableHead>
                                    <TableHead className="text-right">BALANCE QTY</TableHead>
                                    <TableHead>REMARKS</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {txns.map(txn => (
                                    <TableRow key={txn.id}>
                                      <TableCell>{format(new Date(txn.transaction_date), "dd/MM/yyyy")}</TableCell>
                                      <TableCell className="text-right">{txn.receive_qty}</TableCell>
                                      <TableCell className="text-right font-medium">{txn.ttl_receive}</TableCell>
                                      <TableCell className="text-right">{txn.issue_qty}</TableCell>
                                      <TableCell className={`text-right font-medium ${txn.balance_qty < 0 ? 'text-destructive' : ''}`}>
                                        {txn.balance_qty}
                                      </TableCell>
                                      <TableCell className="max-w-[200px] truncate">{txn.remarks || "-"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}