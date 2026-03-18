import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { POTableRow } from "./POTableRow";
import { POExpandedPanel } from "./POExpandedPanel";
import type { POControlRoomData, PODetailData } from "./types";

interface Props {
  orders: POControlRoomData[];
  loading: boolean;
  expandedId: string | null;
  detailData: PODetailData | null;
  detailLoading: boolean;
  onToggleExpand: (id: string) => void;
  onViewExtras?: (po: POControlRoomData) => void;
  showVelocity?: boolean;
}

export function POTable({
  orders,
  loading,
  expandedId,
  detailData,
  detailLoading,
  onToggleExpand,
  onViewExtras,
  showVelocity,
}: Props) {
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div>
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-7" />
                <TableHead className="whitespace-nowrap">PO Number</TableHead>
                <TableHead className="whitespace-nowrap">Buyer / Style</TableHead>
                <TableHead className="whitespace-nowrap">Line</TableHead>
                <TableHead className="text-right whitespace-nowrap">PO Qty</TableHead>
                <TableHead className="text-right whitespace-nowrap">Sewing</TableHead>
                <TableHead className="text-right whitespace-nowrap">Finishing</TableHead>
                <TableHead className="text-right whitespace-nowrap">Remaining</TableHead>
                <TableHead className="whitespace-nowrap">Ex-Factory</TableHead>
                {showVelocity && (
                  <>
                    <TableHead className="text-right whitespace-nowrap">Avg/day</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Need/day</TableHead>
                  </>
                )}
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((po) => (
                <>
                  <POTableRow
                    key={po.id}
                    po={po}
                    isExpanded={expandedId === po.id}
                    onToggle={() => onToggleExpand(po.id)}
                    onViewExtras={onViewExtras}
                    showVelocity={showVelocity}
                  />
                  {expandedId === po.id && (
                    <TableRow key={`${po.id}-detail`}>
                      <TableCell colSpan={showVelocity ? 12 : 10} className="p-0 border-b border-border/60 bg-card">
                        <POExpandedPanel
                          po={po}
                          detailData={detailData}
                          loading={detailLoading}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={showVelocity ? 12 : 10}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No work orders found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
