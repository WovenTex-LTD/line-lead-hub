import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DispatchWorkOrder {
  id: string;
  po_number: string;
  style: string | null;
  buyer: string | null;
  order_qty: number | null;
  // Computed
  total_dispatched: number;
  remaining_qty: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useDispatchPOData
// Loads all active work orders for the factory plus the total approved-dispatch
// quantity per PO, so the form can show a soft warning when the gate officer
// enters a quantity that exceeds what remains.
// ─────────────────────────────────────────────────────────────────────────────
export function useDispatchPOData() {
  const { profile } = useAuth();
  const factoryId = profile?.factory_id;

  const query = useQuery({
    queryKey: ['dispatch-po-data', factoryId],
    queryFn: async () => {
      if (!factoryId) return [];

      // Load active work orders
      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('id, po_number, style, buyer, order_qty')
        .eq('factory_id', factoryId)
        .order('po_number', { ascending: true });

      if (woError) throw woError;

      if (!workOrders || workOrders.length === 0) return [];

      // Load total approved dispatches per work order
      const workOrderIds = workOrders.map((wo) => wo.id);
      const { data: dispatched, error: dispError } = await supabase
        .from('dispatch_requests')
        .select('work_order_id, dispatch_quantity')
        .eq('factory_id', factoryId)
        .eq('status', 'approved')
        .in('work_order_id', workOrderIds);

      if (dispError) throw dispError;

      // Sum dispatched quantities per work order
      const dispatchedMap = new Map<string, number>();
      for (const row of dispatched || []) {
        if (!row.work_order_id) continue;
        dispatchedMap.set(
          row.work_order_id,
          (dispatchedMap.get(row.work_order_id) ?? 0) + (row.dispatch_quantity ?? 0)
        );
      }

      return workOrders.map((wo): DispatchWorkOrder => {
        const totalDispatched = dispatchedMap.get(wo.id) ?? 0;
        const remaining = wo.order_qty != null ? wo.order_qty - totalDispatched : null;
        return {
          id: wo.id,
          po_number: wo.po_number,
          style: wo.style ?? null,
          buyer: wo.buyer ?? null,
          order_qty: wo.order_qty ?? null,
          total_dispatched: totalDispatched,
          remaining_qty: remaining,
        };
      });
    },
    enabled: !!factoryId,
    staleTime: 60_000,
  });

  /**
   * Returns the remaining dispatchable quantity for a given work order id,
   * or null if the work order has no order_qty set.
   */
  const getDispatchableQty = (workOrderId: string): number | null => {
    const wo = (query.data || []).find((w) => w.id === workOrderId);
    return wo?.remaining_qty ?? null;
  };

  return {
    workOrders: query.data || [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    getDispatchableQty,
  };
}
