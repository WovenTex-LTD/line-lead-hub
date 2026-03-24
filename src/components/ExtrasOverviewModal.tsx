import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Package, Archive, PackageCheck, Plus, ExternalLink } from "lucide-react";
import { ExtrasLedgerModal } from "./ExtrasLedgerModal";

interface ExtrasOverviewData {
  work_order_id: string;
  po_number: string;
  buyer: string;
  style: string;
  order_qty: number;
  total_carton: number;
  extras_total: number;
  stocked: number;
  consumed: number;
  available: number;
}

type FilterType = 'all' | 'available' | 'stocked' | 'consumed';

interface ExtrasOverviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExtrasOverviewModal({ open, onOpenChange }: ExtrasOverviewModalProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ExtrasOverviewData[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedPO, setSelectedPO] = useState<ExtrasOverviewData | null>(null);
  const [showLedger, setShowLedger] = useState(false);

  useEffect(() => {
    if (open && profile?.factory_id) {
      fetchExtrasOverview();
    }
  }, [open, profile?.factory_id]);

  async function fetchExtrasOverview() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      // Fetch all active work orders
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select('id, po_number, buyer, style, order_qty')
        .eq('factory_id', profile.factory_id)
        .eq('is_active', true);

      if (!workOrders?.length) {
        setData([]);
        setLoading(false);
        return;
      }

      const workOrderIds = workOrders.map(wo => wo.id);

      // Fetch finishing poly output and ledger entries in parallel
      const [polyRes, ledgerRes] = await Promise.all([
        supabase
          .from('finishing_daily_logs')
          .select('work_order_id, poly')
          .eq('factory_id', profile.factory_id)
          .eq('log_type', 'OUTPUT')
          .in('work_order_id', workOrderIds),
        supabase
          .from('extras_ledger')
          .select('work_order_id, quantity, transaction_type')
          .eq('factory_id', profile.factory_id)
          .in('work_order_id', workOrderIds),
      ]);

      // Aggregate poly by work order (poly is primary finishing metric)
      const polyByWo = new Map<string, number>();
      polyRes.data?.forEach((log: any) => {
        const current = polyByWo.get(log.work_order_id) || 0;
        polyByWo.set(log.work_order_id, current + (log.poly || 0));
      });

      // Aggregate ledger by work order: stocked vs consumed
      const stockedByWo = new Map<string, number>();
      const consumedByWo = new Map<string, number>();
      ledgerRes.data?.forEach((entry: any) => {
        if (entry.transaction_type === 'transferred_to_stock') {
          const current = stockedByWo.get(entry.work_order_id) || 0;
          stockedByWo.set(entry.work_order_id, current + (entry.quantity || 0));
        } else {
          const current = consumedByWo.get(entry.work_order_id) || 0;
          consumedByWo.set(entry.work_order_id, current + (entry.quantity || 0));
        }
      });

      // Build overview data - only include work orders with extras
      const overviewData: ExtrasOverviewData[] = workOrders
        .map(wo => {
          const totalCarton = polyByWo.get(wo.id) || 0;
          const extrasTotal = Math.max(totalCarton - wo.order_qty, 0);
          const stocked = stockedByWo.get(wo.id) || 0;
          const consumed = consumedByWo.get(wo.id) || 0;
          const available = extrasTotal - stocked - consumed;

          return {
            work_order_id: wo.id,
            po_number: wo.po_number,
            buyer: wo.buyer,
            style: wo.style,
            order_qty: wo.order_qty,
            total_carton: totalCarton,
            extras_total: extrasTotal,
            stocked,
            consumed,
            available,
          };
        })
        .filter(item => item.extras_total > 0 || item.stocked > 0 || item.consumed > 0)
        .sort((a, b) => b.available - a.available);

      setData(overviewData);
    } catch (error) {
      console.error('Error fetching extras overview:', error);
    } finally {
      setLoading(false);
    }
  }

  const totals = data.reduce(
    (acc, item) => ({
      extras: acc.extras + item.extras_total,
      available: acc.available + item.available,
      stocked: acc.stocked + item.stocked,
      consumed: acc.consumed + item.consumed,
    }),
    { extras: 0, available: 0, stocked: 0, consumed: 0 }
  );

  // Filter data based on selected filter
  const filteredData = data.filter(item => {
    switch (filter) {
      case 'available':
        return item.available > 0;
      case 'stocked':
        return item.stocked > 0;
      case 'consumed':
        return item.consumed > 0;
      default:
        return true;
    }
  });

  const handleOpenLedger = (item: ExtrasOverviewData) => {
    setSelectedPO(item);
    setShowLedger(true);
  };

  const handleLedgerChange = () => {
    fetchExtrasOverview();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {t('modals.extrasOverview')}
            </DialogTitle>
          </DialogHeader>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono">{totals.extras.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t('modals.totalExtras')}</p>
            </div>
            <div className="bg-warning/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono text-warning">{totals.available.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t('modals.available')}</p>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono text-primary">{totals.stocked.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t('modals.stocked')}</p>
            </div>
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono text-muted-foreground">{totals.consumed.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t('modals.consumed')}</p>
            </div>
          </div>

          {/* Filter Tabs */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <TabsList className="w-full grid grid-cols-4 h-auto">
              <TabsTrigger value="all" className="text-xs px-2 py-1.5">
                {t('common.all')}
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {data.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="available" className="text-xs px-2 py-1.5">
                {t('modals.available')}
                <Badge variant="warning" className="ml-1 h-4 px-1 text-[10px]">
                  {data.filter(d => d.available > 0).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="stocked" className="text-xs px-2 py-1.5">
                {t('modals.stocked')}
                <Badge variant="default" className="ml-1 h-4 px-1 text-[10px]">
                  {data.filter(d => d.stocked > 0).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="consumed" className="text-xs px-2 py-1.5">
                {t('modals.consumed')}
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {data.filter(d => d.consumed > 0).length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {filter === 'all' ? t('modals.noPOsWithExtras') : t('modals.noPOsWithFilterExtras', { filter })}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('modals.poNumber')}</TableHead>
                    <TableHead>{t('modals.buyerStyle')}</TableHead>
                    <TableHead className="text-right">{t('modals.extras')}</TableHead>
                    <TableHead className="text-right">{t('modals.available')}</TableHead>
                    <TableHead className="text-right">{t('modals.stocked')}</TableHead>
                    <TableHead className="text-right">{t('modals.consumed')}</TableHead>
                    <TableHead className="text-right">{t('modals.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => (
                    <TableRow key={item.work_order_id}>
                      <TableCell className="font-mono font-medium">{item.po_number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{item.buyer}</p>
                          <p className="text-xs text-muted-foreground">{item.style}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="font-mono">
                          +{item.extras_total.toLocaleString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.available > 0 ? (
                          <Badge variant="warning" className="font-mono">
                            {item.available.toLocaleString()}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground font-mono">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.stocked > 0 ? (
                          <span className="font-mono text-primary font-medium">{item.stocked.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground font-mono">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.consumed > 0 ? (
                          <span className="font-mono text-muted-foreground">{item.consumed.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground font-mono">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.available === 0 && item.extras_total > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenLedger(item)}
                            className="gap-1 text-destructive hover:text-destructive"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t('modals.delete')}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenLedger(item)}
                            className="gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            {t('modals.manage')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ledger Modal for selected PO */}
      {selectedPO && (
        <ExtrasLedgerModal
          open={showLedger}
          onOpenChange={setShowLedger}
          workOrderId={selectedPO.work_order_id}
          poNumber={selectedPO.po_number}
          extrasAvailable={selectedPO.available}
          onLedgerChange={handleLedgerChange}
        />
      )}
    </>
  );
}
