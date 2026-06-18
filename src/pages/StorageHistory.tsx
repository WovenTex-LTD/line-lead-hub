import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { VoiceNotes } from "@/components/voice/VoiceNotes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Warehouse, Search, FileText, AlertTriangle, CalendarIcon, X, Layers, ChevronRight, ArrowDownToLine, ArrowUpFromLine, Scale } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { format } from "date-fns";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { searchNorm } from "@/lib/normalize-name";

interface BinCardWithWorkOrder {
  id: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  supplier_name: string | null;
  description: string | null;
  prepared_by: string | null;
  prepared_by_user_id: string | null;
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
  preparedBy: string;
  createdAt: string;
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


export default function StorageHistory() {
  const { profile, isStorageUser, isAdminOrHigher } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [binCards, setBinCards] = useState<BinCardWithWorkOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCard, setSelectedCard] = useState<BinCardWithWorkOrder | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTxn, setLoadingTxn] = useState(false);
  
  // Filter states
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const canAccess = isStorageUser() || isAdminOrHigher();

  useEffect(() => {
    if (profile?.factory_id && canAccess) {
      fetchBinCards();
    } else {
      setLoading(false);
    }
  }, [profile?.factory_id, canAccess]);

  async function fetchBinCards() {
    try {
      const { data, error } = await supabase
        .from("storage_bin_cards")
        .select(`
          id,
          work_order_id,
          buyer,
          style,
          supplier_name,
          description,
          prepared_by,
          prepared_by_user_id,
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
      
      if (error) throw error;
      setBinCards((data || []) as BinCardWithWorkOrder[]);
    } catch (error) {
      console.error("Error fetching bin cards:", error);
    } finally {
      setLoading(false);
    }
  }

  // Compute grouping key: prefer po_set_signature, fallback to bin_group_id
  function getGroupKey(card: BinCardWithWorkOrder): string | null {
    return card.po_set_signature || card.bin_group_id || null;
  }

  // Build a map of group_key -> all searchable values in that group (for cross-PO search)
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
    // First pass: standard search + date filtering
    const directMatches = binCards.filter(card => {
      // Text search — also match any PO in the same group + group_name
      if (searchTerm) {
        const term = searchNorm(searchTerm);
        let matchesSearch = (
          searchNorm(card.work_orders.po_number).includes(term) ||
          searchNorm(card.work_orders.buyer).includes(term) ||
          searchNorm(card.work_orders.style).includes(term) ||
          (searchNorm(card.work_orders.item).includes(term)) ||
          (searchNorm(card.description).includes(term)) ||
          (searchNorm(card.group_name).includes(term))
        );
        // Also check sibling POs/buyers/styles in the same group
        if (!matchesSearch) {
          const key = getGroupKey(card);
          if (key) {
            const groupData = groupSearchMap.get(key);
            if (groupData) {
              matchesSearch = (
                groupData.poNumbers.some(po => searchNorm(po).includes(term)) ||
                groupData.buyers.some(b => searchNorm(b).includes(term)) ||
                groupData.styles.some(s => searchNorm(s).includes(term))
              );
            }
          }
        }
        if (!matchesSearch) return false;
      }

      // Date from filter
      if (dateFrom) {
        const cardDate = new Date(card.created_at);
        cardDate.setHours(0, 0, 0, 0);
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (cardDate < fromDate) return false;
      }

      // Date to filter
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

  function clearFilters() {
    setDateFrom(undefined);
    setDateTo(undefined);
    setSearchTerm("");
  }

  const hasActiveFilters = dateFrom || dateTo || searchTerm;

  // Group filtered cards by bin_group_id for display
  const displayRows: DisplayRow[] = useMemo(() => {
    const rows: DisplayRow[] = [];
    const groupMap = new Map<string, BinCardWithWorkOrder[]>();
    const ungrouped: BinCardWithWorkOrder[] = [];

    for (const card of filteredCards) {
      const key = getGroupKey(card);
      if (key) {
        const existing = groupMap.get(key);
        if (existing) {
          existing.push(card);
        } else {
          groupMap.set(key, [card]);
        }
      } else {
        ungrouped.push(card);
      }
    }

    // Add grouped rows
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
        preparedBy: first.prepared_by || "-",
        createdAt: first.created_at,
      });
    }

    // Add ungrouped rows
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
        preparedBy: card.prepared_by || "-",
        createdAt: card.created_at,
      });
    }

    // Sort by most recent created_at
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }, [filteredCards]);

  async function openCardDetail(card: BinCardWithWorkOrder) {
    setSelectedCard(card);
    setLoadingTxn(true);

    try {
      const { data, error } = await supabase
        .from("storage_bin_card_transactions")
        .select("*")
        .eq("bin_card_id", card.id)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoadingTxn(false);
    }
  }

  // Open detail for a group: load transactions for all cards in the group
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
        const { data, error } = await supabase
          .from("storage_bin_card_transactions")
          .select("*")
          .eq("bin_card_id", card.id)
          .order("transaction_date", { ascending: true })
          .order("created_at", { ascending: true });

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

  if (!canAccess) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Access Denied"
        description="You need the Storage role to access this page."
        iconClassName="text-warning"
      />
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Warehouse className="h-8 w-8 text-orange-600" />
        <div>
          <h1 className="text-2xl font-bold">All Bin Cards</h1>
          <p className="text-sm text-muted-foreground">View all bin card records</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4">
            {/* Search row */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by PO, buyer, style..."
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
                  <Calendar
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
                  <Calendar
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Cards list */}
      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bin Cards ({displayRows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {displayRows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Warehouse className="mx-auto h-12 w-12 mb-2" />
                <p>No bin cards found</p>
              </div>
            ) : (
              <TooltipProvider>
              <div className="w-full overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Style</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Prepared By</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.map(row => (
                      <TableRow key={row.key}>
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
                                <span className="cursor-default text-muted-foreground italic">
                                  Mixed
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <div className="space-y-1">
                                  {row.cards.map(c => (
                                    <div key={c.id} className="text-xs">
                                      <span className="font-medium">{c.work_orders.po_number}:</span>{" "}
                                      {c.work_orders.buyer}
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
                                <span className="cursor-default text-muted-foreground italic">
                                  Mixed
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <div className="space-y-1">
                                  {row.cards.map(c => (
                                    <div key={c.id} className="text-xs">
                                      <span className="font-medium">{c.work_orders.po_number}:</span>{" "}
                                      {c.work_orders.style}
                                    </div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>

                        <TableCell className="max-w-[150px] truncate">{row.description}</TableCell>
                        <TableCell>{row.preparedBy}</TableCell>
                        <TableCell>{format(new Date(row.createdAt), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          {row.type === "group" ? (
                            <Button variant="ghost" size="sm" onClick={() => openGroupDetail(row)}>
                              View Ledger
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => openCardDetail(row.cards[0])}>
                              View Ledger
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>
      )}

      {/* Single Card Detail Modal */}
      <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8 break-words">
              Bin Card Ledger - {selectedCard?.work_orders.po_number}
            </DialogTitle>
          </DialogHeader>

          {selectedCard && (
            <div className="space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Buyer:</span>
                  <p className="font-medium">{selectedCard.buyer || selectedCard.work_orders.buyer}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Style:</span>
                  <p className="font-medium">{selectedCard.style || selectedCard.work_orders.style}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Supplier:</span>
                  <p className="font-medium">{selectedCard.supplier_name || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Prepared By:</span>
                  <p className="font-medium">{selectedCard.prepared_by || "-"}</p>
                </div>
              </div>

              {/* Transactions */}
              {loadingTxn ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="w-full overflow-x-auto rounded-md border">
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
                            No transactions recorded
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactions.map(txn => (
                          <TableRow key={txn.id}>
                            <TableCell>{format(new Date(txn.transaction_date), "dd/MM/yyyy")}</TableCell>
                            <TableCell className="text-right">{txn.receive_qty}</TableCell>
                            <TableCell className="text-right font-medium">{txn.ttl_receive}</TableCell>
                            <TableCell className="text-right">{txn.issue_qty}</TableCell>
                            <TableCell className={`text-right font-medium ${txn.balance_qty < 0 ? 'text-destructive' : ''}`}>
                              {txn.balance_qty}
                            </TableCell>
                            <TableCell className="max-w-[260px]">
                              <div className="space-y-1.5">
                                <p className="truncate">{txn.remarks || "-"}</p>
                                <VoiceNotes showRecorder={false} recordType="storage_bin_card_transactions" recordId={txn.id} />
                              </div>
                            </TableCell>
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
              {/* Shared header info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Supplier:</span>
                  <p className="font-medium">{selectedGroup.cards[0].supplier_name || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Prepared By:</span>
                  <p className="font-medium">{selectedGroup.preparedBy}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p className="font-medium">{format(new Date(selectedGroup.createdAt), "dd/MM/yyyy")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">POs in Group:</span>
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
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedGroup.cards.map(card => (
                      <TableRow key={card.id}>
                        <TableCell className="font-medium">{card.work_orders.po_number}</TableCell>
                        <TableCell>{card.work_orders.buyer}</TableCell>
                        <TableCell>{card.work_orders.style}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{card.description || card.work_orders.item || "-"}</TableCell>
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
                // Sum latest balance per PO
                const totalBalance = Object.values(groupTransactions).reduce((sum, { txns }) => {
                  if (txns.length === 0) return sum;
                  return sum + txns[txns.length - 1].balance_qty;
                }, 0);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <ArrowDownToLine className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">Total Received</p>
                        <p className="text-lg font-bold text-green-600">{totalReceived.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <ArrowUpFromLine className="h-4 w-4 text-destructive" />
                      <div>
                        <p className="text-xs text-muted-foreground">Total Issued</p>
                        <p className="text-lg font-bold text-destructive">{totalIssued.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <Scale className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Total Balance</p>
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
                        {/* Collapsible PO header */}
                        <button
                          type="button"
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedGroupPo(isExpanded ? null : card.id)}
                        >
                          <div className="flex items-center gap-3">
                            <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
                            <Warehouse className="h-4 w-4 text-orange-600" />
                            <span className="font-medium text-sm">{card.work_orders.po_number}</span>
                            <span className="text-xs text-muted-foreground">
                              {card.work_orders.buyer} / {card.work_orders.style}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Rcv: <span className="font-medium text-foreground">{totalRcv}</span></span>
                            <span>Iss: <span className="font-medium text-foreground">{totalIss}</span></span>
                            <span>Bal: <span className={cn("font-medium", latestBalance < 0 ? "text-destructive" : "text-foreground")}>{latestBalance}</span></span>
                            <Badge variant="outline" className="text-xs">{txns.length} txns</Badge>
                          </div>
                        </button>

                        {/* Expanded transaction table */}
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
                                      <TableCell className="max-w-[260px]">
                              <div className="space-y-1.5">
                                <p className="truncate">{txn.remarks || "-"}</p>
                                <VoiceNotes showRecorder={false} recordType="storage_bin_card_transactions" recordId={txn.id} />
                              </div>
                            </TableCell>
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
