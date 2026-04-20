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
  Receipt,
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
  planned_ex_factory: z.string().min(1, "Ex-factory date is required"),
  target_per_hour: z.number().min(0, "Cannot be negative").max(100000, "Too high").optional().nullable(),
  target_per_day: z.number().min(0, "Cannot be negative").max(1000000, "Too high").optional().nullable(),
  status: z.enum(["not_started", "in_progress", "completed", "on_hold"]),
  is_active: z.boolean(),
});

const getStatusColor = (status: string) => {
  switch (status) {
    case 'not_started': return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/40';
    case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700/40';
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700/40';
    case 'on_hold': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700/40';
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/40';
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
        .neq('status', 'deleted')
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
      // Soft delete: mark as inactive and set status to 'deleted'
      // Production history (sewing_actuals, cutting_actuals, finishing_daily_logs, etc.)
      // is preserved for reporting purposes.
      const { error } = await supabase
        .from('work_orders')
        .update({ is_active: false, status: 'deleted' })
        .eq('id', id);
      if (error) throw error;
      toast.success("Work order archived");
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

  async function downloadTemplate() {
    const headers = ['po_number', 'buyer', 'style', 'item', 'color', 'order_qty', 'smv', 'cm_per_dozen', 'planned_ex_factory', 'target_per_hour', 'target_per_day', 'status'];
    const sampleRow = ['PO-001', 'ABC Buyer', 'STYLE-001', 'T-Shirt', 'Blue', '5000', '12.5', '45.00', '2026-03-15', '100', '800', 'not_started'];
    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csv], { type: 'text/csv' });
    await downloadFile(blob, 'work_orders_template.csv');
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
        icon={Receipt}
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
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/setup')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold">PO Master</h1>
              <span className="text-xs font-medium bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-full px-2 py-0.5">
                {workOrders.filter(w => w.is_active).length} active
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Manage {workOrders.length} work orders
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
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

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="relative overflow-hidden rounded-xl border border-indigo-200/60 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50 via-white to-blue-50/50 dark:from-indigo-950/40 dark:via-card dark:to-blue-950/20 p-4 transition-all duration-300 hover:shadow-lg group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-indigo-500 opacity-[0.06] rounded-bl-full pointer-events-none" />
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-indigo-600/70 dark:text-indigo-400/70">Total Orders</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-indigo-900 dark:text-indigo-100 mt-1">{workOrders.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-green-50/50 dark:from-emerald-950/40 dark:via-card dark:to-green-950/20 p-4 transition-all duration-300 hover:shadow-lg group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-emerald-500 opacity-[0.06] rounded-bl-full pointer-events-none" />
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">In Progress</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100 mt-1">{workOrders.filter(w => w.status === 'in_progress').length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-white to-orange-50/50 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20 p-4 transition-all duration-300 hover:shadow-lg group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-amber-500 opacity-[0.06] rounded-bl-full pointer-events-none" />
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-amber-600/70 dark:text-amber-400/70">On Hold</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-amber-900 dark:text-amber-100 mt-1">{workOrders.filter(w => w.status === 'on_hold').length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-slate-200/60 dark:border-slate-800/40 bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-950/40 dark:via-card dark:to-slate-950/20 p-4 transition-all duration-300 hover:shadow-lg group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-slate-500 opacity-[0.06] rounded-bl-full pointer-events-none" />
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-600/70 dark:text-slate-400/70">Completed</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">{workOrders.filter(w => w.status === 'completed').length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by PO, buyer, style, or item..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 shadow-md shadow-indigo-500/20 flex items-center justify-center">
              <Receipt className="h-3.5 w-3.5 text-white" />
            </div>
            Work Orders
            <Badge variant="secondary" className="ml-1">{filteredWorkOrders.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
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
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>No work orders found</p>
                      <p className="text-xs mt-1">Add your first work order to get started</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWorkOrders.map((wo) => (
                    <TableRow key={wo.id} className="hover:bg-muted/50">
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
                <Label>Planned Ex-Factory <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={formData.planned_ex_factory}
                  onChange={(e) => setFormData({ ...formData, planned_ex_factory: e.target.value })}
                />
                {formErrors.planned_ex_factory && <p className="text-sm text-destructive">{formErrors.planned_ex_factory}</p>}
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
        title="Archive Work Order"
        description="This will archive the work order and hide it from active lists. All production history will be preserved for reports."
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
