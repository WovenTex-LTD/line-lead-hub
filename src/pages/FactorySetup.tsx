import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { 
  Loader2, 
  Settings, 
  Building2, 
  Layers, 
  Rows3, 
  ListOrdered, 
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Factory,
  Package,
  ArrowLeft
} from "lucide-react";

import { BLOCKER_IMPACTS, BLOCKER_IMPACT_LABELS, DEFAULT_STAGES, DEFAULT_BLOCKER_TYPES } from "@/lib/constants";
import { ActiveLinesMeter } from "@/components/ActiveLinesMeter";
import { useActiveLines } from "@/hooks/useActiveLines";
import { isNative } from "@/lib/capacitor";
import { EmailScheduleSettings } from "@/components/insights/EmailScheduleSettings";
import { EmptyState } from "@/components/EmptyState";

const unitSchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

const floorSchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  unit_id: z.string().min(1, "Unit is required"),
});

const lineSchema = z.object({
  line_id: z.string().min(1, "Line ID is required").max(20, "Line ID too long"),
  name: z.string().max(100, "Name too long").optional().nullable(),
  unit_id: z.string().optional().nullable(),
  floor_id: z.string().optional().nullable(),
  target_per_hour: z.number().min(0, "Cannot be negative").max(100000, "Too high").optional().nullable(),
  target_per_day: z.number().min(0, "Cannot be negative").max(1000000, "Too high").optional().nullable(),
});

const stageSchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  sequence: z.number().min(0, "Cannot be negative").max(1000, "Too high"),
});

const blockerTypeSchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  default_owner: z.string().max(100, "Owner too long").optional().nullable(),
  default_impact: z.enum(["low", "medium", "high", "critical"]),
});

// Types
interface Unit {
  id: string;
  code: string;
  name: string;
  is_active: boolean | null;
}

interface Floor {
  id: string;
  code: string;
  name: string;
  unit_id: string;
  is_active: boolean | null;
}

interface Line {
  id: string;
  line_id: string;
  name: string | null;
  unit_id: string | null;
  floor_id: string | null;
  target_per_hour: number | null;
  target_per_day: number | null;
  is_active: boolean | null;
}

interface Stage {
  id: string;
  code: string;
  name: string;
  sequence: number | null;
  is_active: boolean | null;
}

interface BlockerType {
  id: string;
  code: string;
  name: string;
  default_owner: string | null;
  default_impact: string | null;
  is_active: boolean | null;
}


export default function FactorySetup() {
  const { profile, isAdminOrHigher, user, factory } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("units");

  // Active lines hook for plan limits
  const { 
    status: lineStatus, 
    canActivateMore, 
    isAtLimit, 
    refresh: refreshLineStatus 
  } = useActiveLines();

  // Data
  const [units, setUnits] = useState<Unit[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [blockerTypes, setBlockerTypes] = useState<BlockerType[]>([]);
  

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Bulk add lines state
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkLineCount, setBulkLineCount] = useState(10);
  const [bulkStartNumber, setBulkStartNumber] = useState(1);
  const [bulkUnitId, setBulkUnitId] = useState('');
  const [bulkFloorId, setBulkFloorId] = useState('');
  const [bulkLineNamePattern, setBulkLineNamePattern] = useState('Line {n}');
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  // Factory creation state
  const [isCreatingFactory, setIsCreatingFactory] = useState(false);
  const [newFactoryName, setNewFactoryName] = useState("");
  const [newFactorySlug, setNewFactorySlug] = useState("");

  // Storage settings state
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(factory?.low_stock_threshold ?? 10);
  const [isSavingStorage, setIsSavingStorage] = useState(false);

  // Factory name edit state
  const [isEditingFactoryName, setIsEditingFactoryName] = useState(false);
  const [editedFactoryName, setEditedFactoryName] = useState(factory?.name || "");
  const [isSavingFactoryName, setIsSavingFactoryName] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Update lowStockThreshold when factory changes
  useEffect(() => {
    if (factory?.low_stock_threshold !== undefined) {
      setLowStockThreshold(factory.low_stock_threshold);
    }
    if (factory?.name) {
      setEditedFactoryName(factory.name);
    }
  }, [factory?.low_stock_threshold, factory?.name]);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchAllData();
    } else if (profile !== undefined) {
      setLoading(false);
    }
  }, [profile?.factory_id, profile]);

  async function fetchAllData() {
    if (!profile?.factory_id) return;

    try {
      const [unitsRes, floorsRes, linesRes, stagesRes, blockerTypesRes] = await Promise.all([
        supabase.from('units').select('*').eq('factory_id', profile.factory_id).order('code'),
        supabase.from('floors').select('*').eq('factory_id', profile.factory_id).order('code'),
        supabase.from('lines').select('*').eq('factory_id', profile.factory_id).order('line_id'),
        supabase.from('stages').select('*').eq('factory_id', profile.factory_id).order('sequence'),
        supabase.from('blocker_types').select('*').eq('factory_id', profile.factory_id).order('sort_order'),
      ]);

      setUnits(unitsRes.data || []);
      setFloors(floorsRes.data || []);
      // Sort lines numerically by extracting the number from line_id
      const sortedLines = (linesRes.data || []).sort((a, b) => {
        const numA = parseInt(a.line_id.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.line_id.replace(/\D/g, '') || '0', 10);
        return numA - numB;
      });
      setLines(sortedLines);
      setStages(stagesRes.data || []);
      setBlockerTypes(blockerTypesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setDialogMode('create');
    setEditingItem(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(item: any) {
    setDialogMode('edit');
    setEditingItem(item);
    setIsDialogOpen(true);
  }

  async function handleSave(formData: any) {
    if (!profile?.factory_id) return;
    setIsSaving(true);

    try {
      const data = { ...formData, factory_id: profile.factory_id };

      if (dialogMode === 'create') {
        let error: any = null;
        if (activeTab === 'units') {
          const res = await supabase.from('units').insert(data);
          error = res.error;
        } else if (activeTab === 'floors') {
          const res = await supabase.from('floors').insert(data);
          error = res.error;
        } else if (activeTab === 'lines') {
          const res = await supabase.from('lines').insert(data);
          error = res.error;
        } else if (activeTab === 'stages') {
          const res = await supabase.from('stages').insert(data);
          error = res.error;
        } else if (activeTab === 'blockerTypes') {
          const res = await supabase.from('blocker_types').insert(data);
          error = res.error;
        }
        if (error) throw error;
        toast.success("Created successfully");
      } else {
        let error: any = null;
        if (activeTab === 'units') {
          const res = await supabase.from('units').update(data).eq('id', editingItem.id);
          error = res.error;
        } else if (activeTab === 'floors') {
          const res = await supabase.from('floors').update(data).eq('id', editingItem.id);
          error = res.error;
        } else if (activeTab === 'lines') {
          const res = await supabase.from('lines').update(data).eq('id', editingItem.id);
          error = res.error;
        } else if (activeTab === 'stages') {
          const res = await supabase.from('stages').update(data).eq('id', editingItem.id);
          error = res.error;
        } else if (activeTab === 'blockerTypes') {
          const res = await supabase.from('blocker_types').update(data).eq('id', editingItem.id);
          error = res.error;
        }
        if (error) throw error;
        toast.success("Updated successfully");
      }

      setIsDialogOpen(false);
      fetchAllData();
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    } finally {
      setIsSaving(false);
    }
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
      let error: any = null;
      if (activeTab === 'units') {
        const res = await supabase.from('units').delete().eq('id', id);
        error = res.error;
      } else if (activeTab === 'floors') {
        const res = await supabase.from('floors').delete().eq('id', id);
        error = res.error;
      } else if (activeTab === 'lines') {
        const res = await supabase.from('lines').delete().eq('id', id);
        error = res.error;
      } else if (activeTab === 'stages') {
        const res = await supabase.from('stages').delete().eq('id', id);
        error = res.error;
      } else if (activeTab === 'blockerTypes') {
        const res = await supabase.from('blocker_types').delete().eq('id', id);
        error = res.error;
      }
      if (error) throw error;
      toast.success("Deleted successfully");
      fetchAllData();
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    }
  }

  async function toggleActive(id: string, currentValue: boolean | null) {
    try {
      // For lines: check plan limits before activating
      if (activeTab === 'lines' && !currentValue && !canActivateMore) {
        toast.error("Plan limit reached", { description: "Upgrade your plan to activate more production lines." });
        return;
      }

      let error: any = null;
      if (activeTab === 'units') {
        const res = await supabase.from('units').update({ is_active: !currentValue }).eq('id', id);
        error = res.error;
      } else if (activeTab === 'floors') {
        const res = await supabase.from('floors').update({ is_active: !currentValue }).eq('id', id);
        error = res.error;
      } else if (activeTab === 'lines') {
        const res = await supabase.from('lines').update({ is_active: !currentValue }).eq('id', id);
        error = res.error;
      } else if (activeTab === 'stages') {
        const res = await supabase.from('stages').update({ is_active: !currentValue }).eq('id', id);
        error = res.error;
      } else if (activeTab === 'blockerTypes') {
        const res = await supabase.from('blocker_types').update({ is_active: !currentValue }).eq('id', id);
        error = res.error;
      }
      if (error) throw error;
      fetchAllData();
      if (activeTab === 'lines') {
        refreshLineStatus();
      }
    } catch (error: any) {
      // Check for plan limit error from trigger
      if (error.message?.includes('Plan limit reached') || error.message?.includes('limit')) {
        toast.error("Plan limit reached", { description: "Upgrade your plan to activate more production lines." });
      } else {
        toast.error("Error", { description: error?.message ?? "An error occurred" });
      }
    }
  }

  async function handleCreateFactory() {
    if (!user || !newFactoryName.trim() || !newFactorySlug.trim()) return;
    
    setIsCreatingFactory(true);
    try {
      // Calculate 14-day trial period
      const trialStartDate = new Date();
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14);

      // IMPORTANT: avoid `.select()` on the insert.
      // The SELECT RLS policy depends on `profiles.factory_id`, which isn't set yet,
      // and Postgres enforces SELECT policies on `INSERT ... RETURNING`.
      // Instead, we generate the id client-side so we can reference it immediately.
      const factoryId = crypto.randomUUID();

      // Create the factory with a 14-day free trial
      const { error: factoryError } = await supabase
        .from('factory_accounts')
        .insert({
          id: factoryId,
          name: newFactoryName.trim(),
          slug: newFactorySlug.trim().toLowerCase().replace(/\s+/g, '-'),
          subscription_status: 'trial',
          subscription_tier: 'starter',
          max_lines: 30,
          trial_start_date: trialStartDate.toISOString(),
          trial_end_date: trialEndDate.toISOString(),
        });

      if (factoryError) throw factoryError;

      // Update user's profile to assign them to the new factory,
      // clearing stale fields from any previous factory membership.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          factory_id: factoryId,
          department: null,
          assigned_unit_id: null,
          assigned_floor_id: null,
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Verify the profile update actually took effect.
      // Supabase RLS can silently block updates (returns success but 0 rows affected).
      const { data: verifyProfile } = await supabase
        .from('profiles')
        .select('factory_id')
        .eq('id', user.id)
        .maybeSingle();

      if (verifyProfile?.factory_id !== factoryId) {
        throw new Error('Failed to assign factory to your profile. Please try again or contact support.');
      }

      // Remove any leftover roles from previous factories before assigning owner
      const { error: deleteRolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', user.id);

      if (deleteRolesError) {
        console.error('Error clearing old roles (non-fatal):', deleteRolesError);
      }

      // Assign owner role to the user who created the factory
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: 'owner',
          factory_id: factoryId,
        });

      if (roleError) {
        // Owner role is critical — throw so the user knows something went wrong
        throw new Error(`Factory created but failed to assign owner role: ${roleError.message}`);
      }

      // Seed default stages
      const stagesData = DEFAULT_STAGES.map((stage) => ({
        ...stage,
        factory_id: factoryId,
      }));
      await supabase.from('stages').insert(stagesData);

      // Seed default blocker types
      const blockerTypesData = DEFAULT_BLOCKER_TYPES.map((bt) => ({
        code: bt.code,
        name: bt.name,
        default_owner: bt.default_owner,
        default_impact: bt.default_impact,
        factory_id: factoryId,
      }));
      await supabase.from('blocker_types').insert(blockerTypesData);

      // Seed default stage progress options
      const { DEFAULT_STAGE_PROGRESS_OPTIONS, DEFAULT_NEXT_MILESTONE_OPTIONS, DEFAULT_BLOCKER_OWNER_OPTIONS, DEFAULT_BLOCKER_IMPACT_OPTIONS } = await import('@/lib/constants');
      
      const stageProgressData = DEFAULT_STAGE_PROGRESS_OPTIONS.map((opt) => ({
        ...opt,
        factory_id: factoryId,
      }));
      await supabase.from('stage_progress_options').insert(stageProgressData);

      // Seed default next milestone options
      const nextMilestoneData = DEFAULT_NEXT_MILESTONE_OPTIONS.map((opt) => ({
        ...opt,
        factory_id: factoryId,
      }));
      await supabase.from('next_milestone_options').insert(nextMilestoneData);

      // Seed default blocker owner options
      const blockerOwnerData = DEFAULT_BLOCKER_OWNER_OPTIONS.map((opt) => ({
        ...opt,
        factory_id: factoryId,
      }));
      await supabase.from('blocker_owner_options').insert(blockerOwnerData);

      // Seed default blocker impact options
      const blockerImpactData = DEFAULT_BLOCKER_IMPACT_OPTIONS.map((opt) => ({
        ...opt,
        factory_id: factoryId,
      }));
      await supabase.from('blocker_impact_options').insert(blockerImpactData);

      // Try to link factory to existing Stripe subscription (if user came from checkout)
      let subscriptionLinked = false;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (accessToken) {
          const { data: linkResult } = await supabase.functions.invoke('link-factory-subscription', {
            body: { factory_id: factoryId },
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (linkResult?.linked) {
            subscriptionLinked = true;
            console.log('Factory linked to Stripe subscription:', linkResult);
          }
        }
      } catch (linkError) {
        console.error('Error linking subscription (non-fatal):', linkError);
      }

      toast.success("Factory created!", {
        description: subscriptionLinked
          ? "Your subscription has been activated. Default settings have been added."
          : "Your 14-day free trial has started. Default settings have been added."
      });

      // Navigate to dashboard (full reload to refresh auth context with new factory)
      window.location.href = '/dashboard';
    } catch (error: any) {
      console.error('Error creating factory:', error);
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    } finally {
      setIsCreatingFactory(false);
    }
  }

  async function handleBulkAddLines() {
    if (!profile?.factory_id) return;

    // Validate required fields
    if (!bulkUnitId) {
      toast.error("Error", { description: "Unit is required" });
      return;
    }
    if (!bulkFloorId) {
      toast.error("Error", { description: "Floor is required" });
      return;
    }

    setIsBulkAdding(true);

    try {
      // Calculate how many lines can be added based on plan limits
      const maxAllowed = lineStatus?.maxLines ?? 9999;
      const currentActive = lineStatus?.activeCount ?? 0;
      const availableSlots = maxAllowed - currentActive;
      const linesToCreate = Math.min(bulkLineCount, availableSlots);

      if (linesToCreate <= 0) {
        toast.error("Plan limit reached", { description: "Upgrade your plan to add more production lines." });
        return;
      }

      // Generate line data
      const newLines = [];
      const hasPlaceholder = /\{n\}|\{number\}/i.test(bulkLineNamePattern);

      for (let i = 0; i < linesToCreate; i++) {
        const lineNum = bulkStartNumber + i;
        let lineName: string;

        if (hasPlaceholder) {
          // Replace {n} or {number} in the pattern with the line number
          lineName = bulkLineNamePattern
            .replace(/\{n\}/gi, lineNum.toString())
            .replace(/\{number\}/gi, lineNum.toString());
        } else {
          // No placeholder found - intelligently insert the number
          // Check if pattern ends with letter(s) like "Line A" or "LineA"
          const trailingLettersMatch = bulkLineNamePattern.match(/^(.*?)([A-Za-z]+)$/);
          if (trailingLettersMatch && trailingLettersMatch[1].trim()) {
            // Pattern like "Line A" -> "Line 1A", "Line 2A"
            const prefix = trailingLettersMatch[1].trimEnd();
            const suffix = trailingLettersMatch[2];
            lineName = `${prefix} ${lineNum}${suffix}`;
          } else {
            // No trailing letters or just letters, append number at end
            lineName = `${bulkLineNamePattern} ${lineNum}`;
          }
        }

        newLines.push({
          factory_id: profile.factory_id,
          line_id: `L${lineNum}`,
          name: lineName,
          unit_id: bulkUnitId,
          floor_id: bulkFloorId,
          is_active: true,
        });
      }

      const { error } = await supabase.from('lines').insert(newLines);
      if (error) throw error;

      toast.success(`${linesToCreate} lines created`, {
        description: linesToCreate < bulkLineCount
          ? `Only ${linesToCreate} lines added due to plan limits.`
          : `Lines L${bulkStartNumber} to L${bulkStartNumber + linesToCreate - 1} created.`
      });

      setIsBulkAddOpen(false);
      fetchAllData();
      refreshLineStatus();
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    } finally {
      setIsBulkAdding(false);
    }
  }

  async function handleSaveStorageSettings() {
    if (!profile?.factory_id) return;
    setIsSavingStorage(true);
    try {
      const { error } = await supabase
        .from('factory_accounts')
        .update({ low_stock_threshold: lowStockThreshold })
        .eq('id', profile.factory_id);
      
      if (error) throw error;
      toast.success("Storage settings saved");
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    } finally {
      setIsSavingStorage(false);
    }
  }

  async function handleSaveFactoryName() {
    if (!profile?.factory_id || !editedFactoryName.trim()) return;
    setIsSavingFactoryName(true);
    try {
      const { error } = await supabase
        .from('factory_accounts')
        .update({ name: editedFactoryName.trim() })
        .eq('id', profile.factory_id);
      
      if (error) throw error;
      toast.success("Factory name updated");
      setIsEditingFactoryName(false);
      // Reload to update auth context
      window.location.reload();
    } catch (error: any) {
      toast.error("Error", { description: error?.message ?? "An error occurred" });
    } finally {
      setIsSavingFactoryName(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile?.factory_id) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Factory className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Create Your Factory</CardTitle>
            <CardDescription>
              Set up your factory to start tracking production
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="factoryName">Factory Name</Label>
              <Input
                id="factoryName"
                placeholder="e.g., Woventex Industries"
                value={newFactoryName}
                onChange={(e) => {
                  setNewFactoryName(e.target.value);
                  // Auto-generate slug from name
                  setNewFactorySlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="factorySlug">Factory Slug (URL identifier)</Label>
              <Input
                id="factorySlug"
                placeholder="e.g., woventex-industries"
                value={newFactorySlug}
                onChange={(e) => setNewFactorySlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs. Only lowercase letters, numbers, and hyphens.
              </p>
            </div>
            <Button 
              className="w-full" 
              onClick={handleCreateFactory}
              disabled={isCreatingFactory || !newFactoryName.trim() || !newFactorySlug.trim()}
            >
              {isCreatingFactory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Factory
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdminOrHigher()) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Access Denied"
        description="You need admin permissions to access factory setup."
        iconClassName="text-warning"
        action={{ label: "Go to Dashboard", onClick: () => navigate('/dashboard') }}
      />
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/setup')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
          <Rows3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Lines, Units & Floors</h1>
          <p className="text-sm text-muted-foreground">
            Manage production lines and factory structure
          </p>
        </div>
      </div>

      {/* Factory Name Card */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Factory className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Factory Name</CardTitle>
              <CardDescription className="text-xs">
                Your organization's display name • ID: <span className="font-mono text-foreground/70">{factory?.id?.slice(0, 8)}</span>
              </CardDescription>
            </div>
          </div>
          {!isEditingFactoryName ? (
            <div className="flex items-center gap-3">
              <span className="font-medium">{factory?.name}</span>
              <Button variant="outline" size="sm" onClick={() => setIsEditingFactoryName(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={editedFactoryName}
                onChange={(e) => setEditedFactoryName(e.target.value)}
                className="w-64"
                placeholder="Factory name"
              />
              <Button 
                size="sm" 
                onClick={handleSaveFactoryName}
                disabled={isSavingFactoryName || !editedFactoryName.trim()}
              >
                {isSavingFactoryName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setIsEditingFactoryName(false);
                  setEditedFactoryName(factory?.name || "");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3 h-auto p-1 rounded-xl bg-muted/60 border border-border/50 mb-5">
          <TabsTrigger value="lines" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2.5 rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300">
            <Rows3 className="h-3.5 w-3.5" />
            Lines
          </TabsTrigger>
          <TabsTrigger value="units" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2.5 rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300">
            <Building2 className="h-3.5 w-3.5" />
            Units
          </TabsTrigger>
          <TabsTrigger value="floors" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2.5 rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300">
            <Layers className="h-3.5 w-3.5" />
            Floors
          </TabsTrigger>
        </TabsList>

        {/* Units Tab */}
        <TabsContent value="units">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Units</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Manage factory units (e.g., Unit A, Unit B)</p>
              </div>
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Unit
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p>No units yet</p>
                        <p className="text-xs mt-1">Add your first unit to organize your factory</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    units.map((unit) => (
                      <TableRow key={unit.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono">{unit.code}</TableCell>
                        <TableCell>{unit.name}</TableCell>
                        <TableCell>
                          <Switch
                            checked={unit.is_active ?? true}
                            onCheckedChange={() => toggleActive(unit.id, unit.is_active)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(unit)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(unit.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Floors Tab */}
        <TabsContent value="floors">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Floors</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Manage floors within each unit</p>
              </div>
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Floor
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {floors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <Layers className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p>No floors yet</p>
                        <p className="text-xs mt-1">Add floors within your units</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    floors.map((floor) => (
                      <TableRow key={floor.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono">{floor.code}</TableCell>
                        <TableCell>{floor.name}</TableCell>
                        <TableCell>{units.find(u => u.id === floor.unit_id)?.name || '-'}</TableCell>
                        <TableCell>
                          <Switch
                            checked={floor.is_active ?? true}
                            onCheckedChange={() => toggleActive(floor.id, floor.is_active)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(floor)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(floor.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lines Tab */}
        <TabsContent value="lines">
          {/* Active Lines Meter */}
          <div className="mb-4">
            <ActiveLinesMeter showUpgrade={!isNative} />
          </div>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Production Lines</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Manage production lines (e.g., L1, L2, L3)</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    // Set default start number based on existing lines
                    const highestNum = lines.reduce((max, l) => {
                      const num = parseInt(l.line_id.replace(/\D/g, '') || '0', 10);
                      return num > max ? num : max;
                    }, 0);
                    setBulkStartNumber(highestNum + 1);
                    setIsBulkAddOpen(true);
                  }}
                  size="sm"
                  variant="outline"
                  disabled={isAtLimit}
                  title={isAtLimit ? "Plan limit reached" : "Add multiple lines at once"}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Bulk Add
                </Button>
                <Button 
                  onClick={openCreateDialog} 
                  size="sm"
                  disabled={isAtLimit}
                  title={isAtLimit ? "Plan limit reached. Upgrade to add more lines." : "Add a new line"}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Line ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Target/Day</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Rows3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p>No lines yet</p>
                        <p className="text-xs mt-1">Add your first production line</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line) => (
                      <TableRow key={line.id} className={!line.is_active ? 'opacity-60' : ''}>
                        <TableCell className="font-mono font-medium">{line.line_id}</TableCell>
                        <TableCell>{line.name || '-'}</TableCell>
                        <TableCell>{units.find(u => u.id === line.unit_id)?.name || '-'}</TableCell>
                        <TableCell>{floors.find(f => f.id === line.floor_id)?.name || '-'}</TableCell>
                        <TableCell>{line.target_per_day?.toLocaleString() || '-'}</TableCell>
                        <TableCell>
                          <Switch
                            checked={line.is_active ?? true}
                            onCheckedChange={() => toggleActive(line.id, line.is_active)}
                            disabled={!line.is_active && !canActivateMore}
                            title={!line.is_active && !canActivateMore ? "Plan limit reached" : ""}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(line)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(line.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>


      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Item"
        description="Are you sure you want to delete this item? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Add New' : 'Edit'} {
                activeTab === 'units' ? 'Unit' :
                activeTab === 'floors' ? 'Floor' :
                activeTab === 'lines' ? 'Line' :
                activeTab === 'stages' ? 'Stage' :
                'Blocker Type'
              }
            </DialogTitle>
          </DialogHeader>
          
          {activeTab === 'units' && (
            <UnitForm
              initialData={editingItem}
              onSave={handleSave}
              onCancel={() => setIsDialogOpen(false)}
              isSaving={isSaving}
            />
          )}
          {activeTab === 'floors' && (
            <FloorForm
              initialData={editingItem}
              units={units}
              onSave={handleSave}
              onCancel={() => setIsDialogOpen(false)}
              isSaving={isSaving}
            />
          )}
          {activeTab === 'lines' && (
            <LineForm
              initialData={editingItem}
              units={units}
              floors={floors}
              onSave={handleSave}
              onCancel={() => setIsDialogOpen(false)}
              isSaving={isSaving}
            />
          )}
          {activeTab === 'stages' && (
            <StageForm
              initialData={editingItem}
              onSave={handleSave}
              onCancel={() => setIsDialogOpen(false)}
              isSaving={isSaving}
            />
          )}
          {activeTab === 'blockerTypes' && (
            <BlockerTypeForm
              initialData={editingItem}
              onSave={handleSave}
              onCancel={() => setIsDialogOpen(false)}
              isSaving={isSaving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Add Lines Dialog */}
      <Dialog open={isBulkAddOpen} onOpenChange={setIsBulkAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Add Lines</DialogTitle>
            <DialogDescription>
              Quickly create multiple production lines at once with custom naming.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start From</Label>
                <Input
                  type="number"
                  min={1}
                  value={bulkStartNumber}
                  onChange={(e) => setBulkStartNumber(parseInt(e.target.value) || 1)}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">First line number (e.g., L1)</p>
              </div>
              <div className="space-y-2">
                <Label>Number of Lines</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={bulkLineCount}
                  onChange={(e) => setBulkLineCount(Math.min(100, parseInt(e.target.value) || 1))}
                  placeholder="10"
                />
                <p className="text-xs text-muted-foreground">How many to create</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Naming Pattern *</Label>
              <Input
                value={bulkLineNamePattern}
                onChange={(e) => setBulkLineNamePattern(e.target.value)}
                placeholder="e.g., Line {n} or Line{n}A"
              />
              <p className="text-xs text-muted-foreground">
                Use {`{n}`} for custom placement, or enter a label like "Line A" to auto-generate "Line 1A, Line 2A..."
              </p>
            </div>

            <div className="space-y-2">
              <Label>Unit *</Label>
              <Select value={bulkUnitId} onValueChange={(v) => { setBulkUnitId(v); setBulkFloorId(''); }}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.filter(u => u.is_active).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Floor *</Label>
              <Select value={bulkFloorId} onValueChange={setBulkFloorId} disabled={!bulkUnitId}>
                <SelectTrigger><SelectValue placeholder="Select floor" /></SelectTrigger>
                <SelectContent>
                  {floors.filter(f => f.is_active && f.unit_id === bulkUnitId).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {lineStatus && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium">Preview</p>
                <p className="text-muted-foreground">
                  Will create lines: L{bulkStartNumber} to L{bulkStartNumber + bulkLineCount - 1}
                </p>
                <p className="text-muted-foreground">
                  Names: {(() => {
                    const hasPlaceholder = /\{n\}|\{number\}/i.test(bulkLineNamePattern);
                    const generateName = (num: number) => {
                      if (hasPlaceholder) {
                        return bulkLineNamePattern.replace(/\{n\}/gi, num.toString()).replace(/\{number\}/gi, num.toString());
                      }
                      const trailingLettersMatch = bulkLineNamePattern.match(/^(.*?)([A-Za-z]+)$/);
                      if (trailingLettersMatch && trailingLettersMatch[1].trim()) {
                        const prefix = trailingLettersMatch[1].trimEnd();
                        const suffix = trailingLettersMatch[2];
                        return `${prefix} ${num}${suffix}`;
                      }
                      return `${bulkLineNamePattern} ${num}`;
                    };
                    return `${generateName(bulkStartNumber)}, ${generateName(bulkStartNumber + 1)}, ...`;
                  })()}
                </p>
                <p className="text-muted-foreground">
                  Available slots: {lineStatus.maxLines !== null
                    ? Math.max(0, lineStatus.maxLines - lineStatus.activeCount)
                    : 'Unlimited'}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkAddOpen(false)}>Cancel</Button>
            <Button
              onClick={handleBulkAddLines}
              disabled={isBulkAdding || bulkLineCount < 1 || !bulkUnitId || !bulkFloorId || !bulkLineNamePattern.trim()}
            >
              {isBulkAdding ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
              ) : (
                `Create ${bulkLineCount} Lines`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Form Components
function UnitForm({ initialData, onSave, onCancel, isSaving }: { initialData?: Unit, onSave: (data: any) => void, onCancel: () => void, isSaving: boolean }) {
  const [code, setCode] = useState(initialData?.code || '');
  const [name, setName] = useState(initialData?.name || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const result = unitSchema.safeParse({ code, name });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSave(result.data);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Code *</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., UNIT-A" />
        {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
      </div>
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Unit Alpha" />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
          ) : (
            'Save'
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

function FloorForm({ initialData, units, onSave, onCancel, isSaving }: { initialData?: Floor, units: Unit[], onSave: (data: any) => void, onCancel: () => void, isSaving: boolean }) {
  const [code, setCode] = useState(initialData?.code || '');
  const [name, setName] = useState(initialData?.name || '');
  const [unitId, setUnitId] = useState(initialData?.unit_id || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const result = floorSchema.safeParse({ code, name, unit_id: unitId });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSave(result.data);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Code *</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., 1F" />
        {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
      </div>
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., First Floor" />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-2">
        <Label>Unit *</Label>
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
          <SelectContent>
            {units.filter(u => u.is_active).map(u => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.unit_id && <p className="text-sm text-destructive">{errors.unit_id}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
          ) : (
            'Save'
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

function LineForm({ initialData, units, floors, onSave, onCancel, isSaving }: { initialData?: Line, units: Unit[], floors: Floor[], onSave: (data: any) => void, onCancel: () => void, isSaving: boolean }) {
  const [lineId, setLineId] = useState(initialData?.line_id || '');
  const [name, setName] = useState(initialData?.name || '');
  const [unitId, setUnitId] = useState(initialData?.unit_id || '');
  const [floorId, setFloorId] = useState(initialData?.floor_id || '');
  const [targetPerHour, setTargetPerHour] = useState(initialData?.target_per_hour?.toString() || '');
  const [targetPerDay, setTargetPerDay] = useState(initialData?.target_per_day?.toString() || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredFloors = floors.filter(f => !unitId || f.unit_id === unitId);

  const handleSave = () => {
    const data = {
      line_id: lineId,
      name: name || null,
      unit_id: unitId || null,
      floor_id: floorId || null,
      target_per_hour: targetPerHour ? parseInt(targetPerHour) : null,
      target_per_day: targetPerDay ? parseInt(targetPerDay) : null,
    };
    const result = lineSchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSave(result.data);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Line ID *</Label>
        <Input value={lineId} onChange={(e) => setLineId(e.target.value.toUpperCase())} placeholder="e.g., L1" />
        {errors.line_id && <p className="text-sm text-destructive">{errors.line_id}</p>}
      </div>
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Line 1 - Jackets" />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Unit</Label>
          <Select value={unitId} onValueChange={(v) => { setUnitId(v); setFloorId(''); }}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {units.filter(u => u.is_active).map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Floor</Label>
          <Select value={floorId} onValueChange={setFloorId} disabled={!unitId}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {filteredFloors.filter(f => f.is_active).map(f => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Target/Hour</Label>
          <Input type="number" value={targetPerHour} onChange={(e) => setTargetPerHour(e.target.value)} placeholder="0" />
          {errors.target_per_hour && <p className="text-sm text-destructive">{errors.target_per_hour}</p>}
        </div>
        <div className="space-y-2">
          <Label>Target/Day</Label>
          <Input type="number" value={targetPerDay} onChange={(e) => setTargetPerDay(e.target.value)} placeholder="0" />
          {errors.target_per_day && <p className="text-sm text-destructive">{errors.target_per_day}</p>}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
          ) : (
            'Save'
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

function StageForm({ initialData, onSave, onCancel, isSaving }: { initialData?: Stage, onSave: (data: any) => void, onCancel: () => void, isSaving: boolean }) {
  const [code, setCode] = useState(initialData?.code || '');
  const [name, setName] = useState(initialData?.name || '');
  const [sequence, setSequence] = useState(initialData?.sequence?.toString() || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const data = { code, name, sequence: parseInt(sequence) || 0 };
    const result = stageSchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSave(result.data);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Code *</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., SEW" />
        {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
      </div>
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Sewing" />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-2">
        <Label>Sequence</Label>
        <Input type="number" value={sequence} onChange={(e) => setSequence(e.target.value)} placeholder="1" />
        {errors.sequence && <p className="text-sm text-destructive">{errors.sequence}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
          ) : (
            'Save'
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

function BlockerTypeForm({ initialData, onSave, onCancel, isSaving }: { initialData?: BlockerType, onSave: (data: any) => void, onCancel: () => void, isSaving: boolean }) {
  const [code, setCode] = useState(initialData?.code || '');
  const [name, setName] = useState(initialData?.name || '');
  const [defaultOwner, setDefaultOwner] = useState(initialData?.default_owner || '');
  const [defaultImpact, setDefaultImpact] = useState(initialData?.default_impact || 'medium');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const data = {
      code,
      name,
      default_owner: defaultOwner || null,
      default_impact: defaultImpact as "low" | "medium" | "high" | "critical",
    };
    const result = blockerTypeSchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSave(result.data);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Code *</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., MATERIAL" />
        {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
      </div>
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Material Shortage" />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-2">
        <Label>Default Owner</Label>
        <Input value={defaultOwner} onChange={(e) => setDefaultOwner(e.target.value)} placeholder="e.g., Procurement" />
        {errors.default_owner && <p className="text-sm text-destructive">{errors.default_owner}</p>}
      </div>
      <div className="space-y-2">
        <Label>Default Impact</Label>
        <Select value={defaultImpact} onValueChange={setDefaultImpact}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(BLOCKER_IMPACT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.default_impact && <p className="text-sm text-destructive">{errors.default_impact}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
          ) : (
            'Save'
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

