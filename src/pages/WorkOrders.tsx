import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { mutateWithRetry, networkErrorMessage } from "@/lib/network-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { 
  Loader2, 
  ClipboardList, 
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  Search,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/EmptyState";

interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  color: string | null;
  order_qty: number;
  smv: number | null;
  cm_per_dozen: number | null;
  planned_ex_factory: string | null;
  target_per_hour: number | null;
  target_per_day: number | null;
  status: string | null;
  is_active: boolean | null;
  line_id: string | null;
}

interface Line {
  id: string;
  line_id: string;
  name: string | null;
  is_active: boolean | null;
}

const WORK_ORDER_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
];

const workOrderSchema = z.object({
  po_number: z.string().min(1, "PO Number is required").max(100, "PO Number too long"),
  buyer: z.string().min(1, "Buyer is required").max(200, "Buyer name too long"),
  style: z.string().min(1, "Style is required").max(200, "Style too long"),
  item: z.string().max(200, "Item too long").optional().nullable(),
  color: z.string().max(100, "Color too long").optional().nullable(),
  order_qty: z.number().min(0, "Cannot be negative").max(100000000, "Too high"),
  smv: z.number().min(0, "Cannot be negative").max(1000, "Too high").optional().nullable(),
  cm_per_dozen: z.number().min(0, "Cannot be negative").max(100000, "Too high").optional().nullable(),
  planned_ex_factory: z.string().optional().nullable(),
  target_per_hour: z.number().min(0, "Cannot be negative").max(100000, "Too high").optional().nullable(),
  target_per_day: z.number().min(0, "Cannot be negative").max(1000000, "Too high").optional().nullable(),
  status: z.enum(["not_started", "in_progress", "completed", "on_hold"]),
  is_active: z.boolean(),
});

const getStatusColor = (status: string) => {
  switch (status) {
    case 'not_started': return 'bg-muted text-muted-foreground';
    case 'in_progress': return 'bg-info/10 text-info';
    case 'completed': return 'bg-success/10 text-success';
    case 'on_hold': return 'bg-warning/10 text-warning';
    default: return 'bg-muted text-muted-foreground';
  }
};

export default function WorkOrders() {
  const { profile, isAdminOrHigher } = useAuth();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [workOrderLineAssignments, setWorkOrderLineAssignments] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<WorkOrder | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // CSV Preview state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    detectedColumns: { original: string; mappedTo: string | null }[];
    previewRows: any[];
    totalRows: number;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    po_number: '',
    buyer: '',
    style: '',
    item: '',
    color: '',
    order_qty: '',
    smv: '',
    cm_per_dozen: '',
    planned_ex_factory: '',
    target_per_hour: '',
    target_per_day: '',
    status: 'not_started',
    is_active: true,
  });
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchWorkOrders();
      fetchLines();
      fetchLineAssignments();
    } else if (profile !== undefined) {
      setLoading(false);
    }
  }, [profile?.factory_id, profile]);

  async function fetchLineAssignments() {
    if (!profile?.factory_id) return;
    
    try {
      const { data, error } = await supabase
        .from('work_order_line_assignments')
        .select('work_order_id, line_id')
        .eq('factory_id', profile.factory_id);
      
      if (error) throw error;
      
      // Group by work_order_id
      const assignments: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        if (!assignments[row.work_order_id]) {
          assignments[row.work_order_id] = [];
        }
        assignments[row.work_order_id].push(row.line_id);
      });
      setWorkOrderLineAssignments(assignments);
    } catch (error) {
      console.error('Error fetching line assignments:', error);
    }
  }

  async function fetchLines() {
    if (!profile?.factory_id) return;
    
    try {
      const { data, error } = await supabase
        .from('lines')
        .select('id, line_id, name, is_active')
        .eq('factory_id', profile.factory_id)
        .eq('is_active', true)
        .order('line_id', { ascending: true });
      
      if (error) throw error;
      
      // Sort lines numerically by extracting numbers from line_id
      const sortedLines = (data || []).sort((a, b) => {
        const numA = parseInt(a.line_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.line_id.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      setLines(sortedLines);
    } catch (error) {
      console.error('Error fetching lines:', error);
    }
  }

  async function fetchWorkOrders() {
    if (!profile?.factory_id) return;
    
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select('*')
        .eq('factory_id', profile.factory_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setWorkOrders(data || []);
    } catch (error) {
      console.error('Error fetching work orders:', error);
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setDialogMode('create');
    setEditingItem(null);
    setFormData({
      po_number: '',
      buyer: '',
      style: '',
      item: '',
      color: '',
      order_qty: '',
      smv: '',
      cm_per_dozen: '',
      planned_ex_factory: '',
      target_per_hour: '',
      target_per_day: '',
      status: 'not_started',
      is_active: true,
    });
    setSelectedLineIds([]);
    setIsDialogOpen(true);
  }

  function openEditDialog(wo: WorkOrder) {
    setDialogMode('edit');
    setEditingItem(wo);
    setFormData({
      po_number: wo.po_number,
      buyer: wo.buyer,
      style: wo.style,
      item: wo.item || '',
      color: wo.color || '',
      order_qty: wo.order_qty.toString(),
      smv: wo.smv?.toString() || '',
      cm_per_dozen: wo.cm_per_dozen?.toString() || '',
      planned_ex_factory: wo.planned_ex_factory || '',
      target_per_hour: wo.target_per_hour?.toString() || '',
      target_per_day: wo.target_per_day?.toString() || '',
      status: wo.status || 'not_started',
      is_active: wo.is_active ?? true,
    });
    setSelectedLineIds(workOrderLineAssignments[wo.id] || []);
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!profile?.factory_id) return;

    const dataToValidate = {
      po_number: formData.po_number.trim(),
      buyer: formData.buyer.trim(),
      style: formData.style.trim(),
      item: formData.item.trim() || null,
      color: formData.color.trim() || null,
      order_qty: parseInt(formData.order_qty) || 0,
      smv: formData.smv ? parseFloat(formData.smv) : null,
      cm_per_dozen: formData.cm_per_dozen ? parseFloat(formData.cm_per_dozen) : null,
      planned_ex_factory: formData.planned_ex_factory || null,
      target_per_hour: formData.target_per_hour ? parseInt(formData.target_per_hour) : null,
      target_per_day: formData.target_per_day ? parseInt(formData.target_per_day) : null,
      status: formData.status as "not_started" | "in_progress" | "completed" | "on_hold",
      is_active: formData.is_active,
    };

    const result = workOrderSchema.safeParse(dataToValidate);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setFormErrors(fieldErrors);
      return;
    }
    setFormErrors({});

    setIsSaving(true);

    try {
      // Ensure required fields are present for DB insert
      const insertData = {
        factory_id: profile.factory_id,
        po_number: result.data.po_number,
        buyer: result.data.buyer,
        style: result.data.style,
        item: result.data.item ?? null,
        color: result.data.color ?? null,
        order_qty: result.data.order_qty,
        smv: result.data.smv ?? null,
        cm_per_dozen: result.data.cm_per_dozen ?? null,
        planned_ex_factory: result.data.planned_ex_factory ?? null,
        target_per_hour: result.data.target_per_hour ?? null,
        target_per_day: result.data.target_per_day ?? null,
        status: result.data.status,
        is_active: result.data.is_active,
        line_id: selectedLineIds.length === 1 ? selectedLineIds[0] : null,
      };
      
      let workOrderId: string;
      
      if (dialogMode === 'create') {
        const { data: insertedData, error } = await mutateWithRetry(() =>
          supabase.from('work_orders').insert([insertData]).select('id').single()
        );
        if (error) throw error;
        workOrderId = insertedData!.id;
        toast.success("Work order created");
      } else if (editingItem) {
        const { error } = await mutateWithRetry(() =>
          supabase.from('work_orders').update(insertData).eq('id', editingItem.id)
        );
        if (error) throw error;
        workOrderId = editingItem.id;
        toast.success("Work order updated");
      } else {
        throw new Error("No work order to update");
      }

      // Update line assignments
      // First, delete existing assignments
      await mutateWithRetry(() =>
        supabase.from('work_order_line_assignments').delete().eq('work_order_id', workOrderId)
      );

      // Then insert new assignments
      if (selectedLineIds.length > 0) {
        const assignments = selectedLineIds.map(lineId => ({
          work_order_id: workOrderId,
          line_id: lineId,
          factory_id: profile.factory_id!,
        }));

        const { error: assignError } = await mutateWithRetry(() =>
          supabase.from('work_order_line_assignments').insert(assignments)
        );

        if (assignError) throw assignError;
      }

      setIsDialogOpen(false);
      fetchWorkOrders();
      fetchLineAssignments();
    } catch (error: any) {
      toast.error("Error", { description: networkErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function toggleLineSelection(lineId: string) {
    setSelectedLineIds(prev => 
      prev.includes(lineId) 
        ? prev.filter(id => id !== lineId)
        : [...prev, lineId]
    );
  }

  function openDeleteDialog(id: string) {
    setItemToDelete(id);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!itemToDelete) return;
    const id = itemToDelete;
    setDeleteDialogOpen(false);
    setItemToDelete(null);

    try {
      // Delete child records first (foreign key constraints)
      // storage_bin_card_transactions must be deleted before storage_bin_cards
      const { data: binCards } = await supabase
        .from('storage_bin_cards')
        .select('id')
        .eq('work_order_id', id);
      if (binCards && binCards.length > 0) {
        const binCardIds = binCards.map((b) => b.id);
        await supabase.from('storage_bin_card_transactions').delete().in('bin_card_id', binCardIds);
      }

      const childTables = [
        'sewing_targets',
        'sewing_actuals',
        'cutting_actuals',
        'cutting_targets',
        'finishing_daily_logs',
        'finishing_daily_sheets',
        'finishing_actuals',
        'finishing_targets',
        'production_updates_sewing',
        'production_updates_finishing',
        'extras_ledger',
        'storage_bin_cards',
        'work_order_line_assignments',
        'buyer_po_access',
      ] as const;

      for (const table of childTables) {
        const { error } = await supabase.from(table).delete().eq('work_order_id', id);
        if (error) console.warn(`Failed to clean ${table}:`, error.message);
      }

      const { error } = await supabase.from('work_orders').delete().eq('id', id);
      if (error) throw error;
      toast.success("Work order deleted");
      fetchWorkOrders();
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    }
  }

  async function toggleActive(id: string, currentValue: boolean) {
    try {
      const { error } = await supabase.from('work_orders').update({ is_active: !currentValue }).eq('id', id);
      if (error) throw error;
      fetchWorkOrders();
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    }
  }

  function downloadTemplate() {
    const headers = ['po_number', 'buyer', 'style', 'item', 'color', 'order_qty', 'smv', 'cm_per_dozen', 'planned_ex_factory', 'target_per_hour', 'target_per_day', 'status'];
    const sampleRow = ['PO-001', 'ABC Buyer', 'STYLE-001', 'T-Shirt', 'Blue', '5000', '12.5', '45.00', '2026-03-15', '100', '800', 'not_started'];
    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'work_orders_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Column mapping for flexible CSV import
  const COLUMN_MAPPINGS: Record<string, string> = {
    // Standard format
    'po_number': 'po_number',
    'buyer': 'buyer',
    'style': 'style',
    'item': 'item',
    'color': 'color',
    'order_qty': 'order_qty',
    'smv': 'smv',
    'cm_per_dozen': 'cm_per_dozen',
    'planned_ex_factory': 'planned_ex_factory',
    'target_per_hour': 'target_per_hour',
    'target_per_day': 'target_per_day',
    'status': 'status',
    // Alternative column names (from user's CSV)
    'orderlineid': 'po_number',
    'brand name': 'buyer',
    'buyer name': 'style', // Maps to style as it's a required field
    'product type': 'item',
    'quantity': 'order_qty',
    'c&m': 'cm_per_dozen',
    'cm': 'cm_per_dozen',
    'c&m/dozen': 'cm_per_dozen',
    'cm/dozen': 'cm_per_dozen',
    'cost and make': 'cm_per_dozen',
    'current status': 'status',
    'delivery deadline': 'planned_ex_factory',
    'comments': 'color', // Use comments as color/notes
  };

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  function mapStatus(status: string): string {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('complet') || statusLower === 'shipped') return 'completed';
    if (statusLower.includes('progress') || statusLower.includes('production') || statusLower.includes('started')) return 'in_progress';
    if (statusLower.includes('hold') || statusLower.includes('wait') || statusLower.includes('await')) return 'on_hold';
    return 'not_started';
  }

  function parseCSVToRows(text: string): any[] {
    const csvLines = text.split('\n').filter(l => l.trim());
    if (csvLines.length < 2) return [];
    
    const headers = parseCSVLine(csvLines[0]).map(h => h.trim().toLowerCase());
    const rows: any[] = [];
    
    for (let i = 1; i < csvLines.length; i++) {
      const values = parseCSVLine(csvLines[i]);
      const row: any = { factory_id: profile?.factory_id };
      
      headers.forEach((header, idx) => {
        const mappedField = COLUMN_MAPPINGS[header];
        if (!mappedField) return;
        
        let value = values[idx]?.replace(/^["']|["']$/g, '').trim() || '';
        if (mappedField === 'order_qty') {
          value = value.replace(/[$,]/g, '');
          row[mappedField] = parseInt(value) || 0;
        } else if (mappedField === 'target_per_hour' || mappedField === 'target_per_day') {
          row[mappedField] = parseInt(value) || null;
        } else if (mappedField === 'smv' || mappedField === 'cm_per_dozen') {
          row[mappedField] = parseFloat(value) || null;
        } else if (mappedField === 'status') {
          row[mappedField] = mapStatus(value);
        } else if (mappedField === 'planned_ex_factory' && value) {
          const parsed = new Date(value);
          row[mappedField] = isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
        } else {
          row[mappedField] = value || null;
        }
      });
      
      if (row.po_number && row.buyer) {
        if (!row.style) row.style = row.item || 'Default Style';
        rows.push(row);
      }
    }
    return rows;
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile?.factory_id) return;
    
    const text = await file.text();
    const csvLines = text.split('\n').filter(l => l.trim());
    if (csvLines.length < 2) {
      toast.error("Invalid CSV", { description: "File must have headers and at least one data row." });
      return;
    }
    
    const originalHeaders = parseCSVLine(csvLines[0]).map(h => h.trim());
    const detectedColumns = originalHeaders.map(h => ({
      original: h,
      mappedTo: COLUMN_MAPPINGS[h.toLowerCase()] || null
    }));
    
    const parsedRows = parseCSVToRows(text);
    
    if (parsedRows.length === 0) {
      toast.error("No valid rows found", { description: "Make sure your CSV has columns like OrderLineID/po_number, Brand Name/buyer, etc." });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    setPreviewData({
      detectedColumns,
      previewRows: parsedRows.slice(0, 5),
      totalRows: parsedRows.length
    });
    setIsPreviewOpen(true);
  }

  async function confirmImport() {
    if (!previewData || !profile?.factory_id) return;
    
    setIsImporting(true);
    try {
      // Re-parse to get all rows (previewRows only has 5)
      const fileInput = fileInputRef.current;
      if (!fileInput?.files?.[0]) throw new Error("File not found");
      
      const text = await fileInput.files[0].text();
      const allRows = parseCSVToRows(text);
      
      const { error } = await supabase.from('work_orders').insert(allRows);
      if (error) throw error;
      
      toast.success(`Imported ${allRows.length} work orders`);
      setIsPreviewOpen(false);
      setPreviewData(null);
      fetchWorkOrders();
    } catch (error: any) {
      toast.error("Import failed", { description: error?.message ?? "An error occurred" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function cancelImport() {
    setIsPreviewOpen(false);
    setPreviewData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const filteredWorkOrders = workOrders.filter(wo => 
    wo.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wo.buyer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wo.style.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (wo.item && wo.item.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile?.factory_id) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No Factory Assigned"
        description="You need to be assigned to a factory first."
        action={{ label: "Go to Setup", onClick: () => navigate('/setup') }}
      />
    );
  }

  if (!isAdminOrHigher()) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Access Denied"
        description="You need admin permissions to manage work orders."
        iconClassName="text-warning"
        action={{ label: "Go to Dashboard", onClick: () => navigate('/dashboard') }}
      />
    );
  }

  return (
    <div className="py-4 lg:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/setup')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Work Orders / PO Master</h1>
            <p className="text-sm text-muted-foreground">
              {workOrders.length} work orders • {workOrders.filter(w => w.is_active).length} active
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCSVUpload}
          />
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Work Order
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO, buyer, style, or item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Order Qty</TableHead>
                  <TableHead className="text-right">CM/Dz</TableHead>
                  <TableHead>Ex-Factory</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground">
                      No work orders found. Add your first work order.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWorkOrders.map((wo) => (
                    <TableRow key={wo.id}>
                      <TableCell className="font-mono font-medium">{wo.po_number}</TableCell>
                      <TableCell>{wo.buyer}</TableCell>
                      <TableCell>{wo.style}</TableCell>
                      <TableCell>{wo.item || '-'}</TableCell>
                      <TableCell>{wo.color || '-'}</TableCell>
                      <TableCell className="text-right font-mono">{wo.order_qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{wo.cm_per_dozen != null ? `$${wo.cm_per_dozen.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</TableCell>
                      <TableCell>{wo.planned_ex_factory || '-'}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(wo.status || 'not_started')}>
                          {WORK_ORDER_STATUSES.find(s => s.value === wo.status)?.label || 'Not Started'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={wo.is_active ?? true}
                          onCheckedChange={() => toggleActive(wo.id, wo.is_active ?? true)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(wo)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(wo.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Add New Work Order' : 'Edit Work Order'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PO Number *</Label>
                <Input
                  value={formData.po_number}
                  onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                  placeholder="PO-001"
                />
                {formErrors.po_number && <p className="text-sm text-destructive">{formErrors.po_number}</p>}
              </div>
              <div className="space-y-2">
                <Label>Buyer *</Label>
                <Input
                  value={formData.buyer}
                  onChange={(e) => setFormData({ ...formData, buyer: e.target.value })}
                  placeholder="ABC Fashions"
                />
                {formErrors.buyer && <p className="text-sm text-destructive">{formErrors.buyer}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Style *</Label>
                <Input
                  value={formData.style}
                  onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                  placeholder="STYLE-001"
                />
                {formErrors.style && <p className="text-sm text-destructive">{formErrors.style}</p>}
              </div>
              <div className="space-y-2">
                <Label>Item</Label>
                <Input
                  value={formData.item}
                  onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                  placeholder="T-Shirt"
                />
                {formErrors.item && <p className="text-sm text-destructive">{formErrors.item}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="Blue"
                />
                {formErrors.color && <p className="text-sm text-destructive">{formErrors.color}</p>}
              </div>
              <div className="space-y-2">
                <Label>Order Quantity</Label>
                <Input
                  type="number"
                  value={formData.order_qty}
                  onChange={(e) => setFormData({ ...formData, order_qty: e.target.value })}
                  placeholder="5000"
                />
                {formErrors.order_qty && <p className="text-sm text-destructive">{formErrors.order_qty}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>SMV</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.smv}
                  onChange={(e) => setFormData({ ...formData, smv: e.target.value })}
                  placeholder="12.5"
                />
                {formErrors.smv && <p className="text-sm text-destructive">{formErrors.smv}</p>}
              </div>
              <div className="space-y-2">
                <Label>CM / Dozen (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cm_per_dozen}
                  onChange={(e) => setFormData({ ...formData, cm_per_dozen: e.target.value })}
                  placeholder="$45.00"
                />
                {formErrors.cm_per_dozen && <p className="text-sm text-destructive">{formErrors.cm_per_dozen}</p>}
              </div>
              <div className="space-y-2">
                <Label>Planned Ex-Factory</Label>
                <Input
                  type="date"
                  value={formData.planned_ex_factory}
                  onChange={(e) => setFormData({ ...formData, planned_ex_factory: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target/Hour</Label>
                <Input
                  type="number"
                  value={formData.target_per_hour}
                  onChange={(e) => setFormData({ ...formData, target_per_hour: e.target.value })}
                  placeholder="100"
                />
                {formErrors.target_per_hour && <p className="text-sm text-destructive">{formErrors.target_per_hour}</p>}
              </div>
              <div className="space-y-2">
                <Label>Target/Day</Label>
                <Input
                  type="number"
                  value={formData.target_per_day}
                  onChange={(e) => setFormData({ ...formData, target_per_day: e.target.value })}
                  placeholder="800"
                />
                {formErrors.target_per_day && <p className="text-sm text-destructive">{formErrors.target_per_day}</p>}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Assigned Lines</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active lines available</p>
                ) : (
                  lines.map(line => (
                    <div key={line.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`line-${line.id}`}
                        checked={selectedLineIds.includes(line.id)}
                        onCheckedChange={() => toggleLineSelection(line.id)}
                      />
                      <label
                        htmlFor={`line-${line.id}`}
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        {line.name || line.line_id}
                      </label>
                    </div>
                  ))
                )}
              </div>
              {selectedLineIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedLineIds.length} line{selectedLineIds.length > 1 ? 's' : ''} selected
                </p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_ORDER_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Active</Label>
                <div className="pt-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                dialogMode === 'create' ? 'Create' : 'Save'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={(open) => !open && cancelImport()}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Preview
            </DialogTitle>
          </DialogHeader>
          
          {previewData && (
            <div className="space-y-6">
              {/* Column Mapping Section */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Detected Column Mappings</h3>
                <ScrollArea className="h-[180px] rounded-md border">
                  <div className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {previewData.detectedColumns.map((col, idx) => (
                        <div 
                          key={idx} 
                          className={`flex items-center justify-between p-2 rounded-md text-sm ${
                            col.mappedTo 
                              ? 'bg-success/10 border border-success/20' 
                              : 'bg-muted border border-border'
                          }`}
                        >
                          <span className="font-medium truncate">{col.original}</span>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            {col.mappedTo ? (
                              <span className="flex items-center gap-1 text-success">
                                <Check className="h-3 w-3" />
                                {col.mappedTo}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <X className="h-3 w-3" />
                                Ignored
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </div>

              {/* Data Preview Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Data Preview</h3>
                  <Badge variant="secondary">
                    {previewData.totalRows} row{previewData.totalRows !== 1 ? 's' : ''} to import
                  </Badge>
                </div>
                <ScrollArea className="h-[200px] rounded-md border">
                  <div className="p-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">PO Number</TableHead>
                          <TableHead className="whitespace-nowrap">Buyer</TableHead>
                          <TableHead className="whitespace-nowrap">Style</TableHead>
                          <TableHead className="whitespace-nowrap">Item</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.previewRows.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{row.po_number}</TableCell>
                            <TableCell className="text-sm">{row.buyer}</TableCell>
                            <TableCell className="text-sm">{row.style}</TableCell>
                            <TableCell className="text-sm">{row.item || '-'}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.order_qty?.toLocaleString() || 0}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${getStatusColor(row.status || 'not_started')}`}>
                                {WORK_ORDER_STATUSES.find(s => s.value === row.status)?.label || 'Not Started'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
                {previewData.totalRows > 5 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing first 5 of {previewData.totalRows} rows
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={cancelImport}>
                  Cancel
                </Button>
                <Button onClick={confirmImport} disabled={isImporting}>
                  {isImporting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
                  ) : (
                    `Import ${previewData.totalRows} Work Order${previewData.totalRows !== 1 ? 's' : ''}`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Work Order"
        description="Are you sure you want to delete this work order? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
