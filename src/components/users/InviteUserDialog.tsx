import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFn, networkErrorMessage } from "@/lib/network-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, UserPlus, Mail, User, Shield, GitBranch, Key, Eye, EyeOff, Info, Building2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ROLE_LABELS, DEPARTMENT_WIDE_ROLES, type AppRole } from "@/lib/constants";

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Line {
  id: string;
  line_id: string;
  name: string | null;
}

interface WorkOrder {
  id: string;
  po_number: string;
  style: string;
  buyer: string;
}

const ASSIGNABLE_ROLES: AppRole[] = ['sewing', 'finishing', 'admin', 'storage', 'cutting', 'gate_officer', 'buyer'];

const inviteUserSchema = z.object({
  email: z.string().email("Invalid email address").max(255, "Email too long"),
  fullName: z.string().min(1, "Full name is required").max(100, "Name too long"),
  role: z.enum(["sewing", "finishing", "admin", "storage", "cutting", "gate_officer", "buyer"]),
  temporaryPassword: z.string().min(6, "Password must be at least 6 characters").max(100, "Password too long").optional(),
});

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
  const { t } = useTranslation();
  const { profile, hasRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [useTemporaryPassword, setUseTemporaryPassword] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    role: "sewing" as AppRole,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [buyerCompanyName, setBuyerCompanyName] = useState("");
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWorkOrderIds, setSelectedWorkOrderIds] = useState<string[]>([]);

  // Admins can invite all roles including other admins
  const availableRoles = hasRole('admin') || hasRole('owner')
    ? ASSIGNABLE_ROLES
    : ASSIGNABLE_ROLES.filter(r => r !== 'admin');

  const isDeptWide = DEPARTMENT_WIDE_ROLES.includes(formData.role);
  const isBuyerRole = formData.role === 'buyer';
  const showLinePicker = formData.role === 'sewing';

  useEffect(() => {
    if (open && profile?.factory_id) {
      fetchLines();
      fetchWorkOrders();
    }
  }, [open, profile?.factory_id]);

  async function fetchLines() {
    if (!profile?.factory_id) return;

    const { data } = await supabase
      .from('lines')
      .select('id, line_id, name')
      .eq('factory_id', profile.factory_id)
      .eq('is_active', true);

    if (data) {
      // Sort numerically by extracting number from line_id
      const sorted = [...data].sort((a, b) => {
        const numA = parseInt(a.line_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.line_id.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      setLines(sorted);
    }
  }

  async function fetchWorkOrders() {
    if (!profile?.factory_id) return;

    const { data } = await supabase
      .from('work_orders')
      .select('id, po_number, style, buyer')
      .eq('factory_id', profile.factory_id)
      .eq('is_active', true)
      .order('po_number');

    if (data) setWorkOrders(data);
  }

  function toggleWorkOrder(woId: string) {
    setSelectedWorkOrderIds(prev =>
      prev.includes(woId)
        ? prev.filter(id => id !== woId)
        : [...prev, woId]
    );
  }

  function toggleLine(lineId: string) {
    setSelectedLineIds(prev =>
      prev.includes(lineId)
        ? prev.filter(id => id !== lineId)
        : [...prev, lineId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.factory_id) return;

    const dataToValidate = {
      email: formData.email,
      fullName: formData.fullName,
      role: formData.role,
      temporaryPassword: useTemporaryPassword ? temporaryPassword : undefined,
    };

    const result = inviteUserSchema.safeParse(dataToValidate);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setFormErrors(fieldErrors);
      return;
    }
    setFormErrors({});

    setLoading(true);

    try {
      // Map standalone roles to department for the profile record
      const department = formData.role === 'sewing' ? 'sewing'
        : formData.role === 'finishing' ? 'finishing'
        : null;

      // Sewing is line-bound; finishing/storage/cutting get all lines; admin/buyer gets none
      const lineIds = isBuyerRole
        ? []
        : formData.role === 'sewing'
          ? selectedLineIds
          : isDeptWide
            ? lines.map(l => l.id)
            : [];

      // Use edge function to create user (doesn't affect current session)
      const { data, error } = await invokeEdgeFn('admin-invite-user', {
        email: formData.email,
        fullName: formData.fullName,
        factoryId: profile.factory_id,
        role: formData.role,
        department,
        lineIds,
        temporaryPassword: useTemporaryPassword ? temporaryPassword : undefined,
        buyerCompanyName: isBuyerRole ? buyerCompanyName : undefined,
        workOrderIds: isBuyerRole ? selectedWorkOrderIds : undefined,
      });

      if (error) {
        console.error("Invite error:", error);
        toast.error(networkErrorMessage(error));
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // Send welcome email
      try {
        const { data: factoryData } = await supabase
          .from('factory_accounts')
          .select('name')
          .eq('id', profile.factory_id)
          .single();

        await invokeEdgeFn('send-welcome-email', {
          email: formData.email,
          fullName: formData.fullName,
          resetLink: `${window.location.origin}/reset-password`,
          factoryName: factoryData?.name,
        });
      } catch (emailErr) {
        console.error("Welcome email error:", emailErr);
        // Don't block success if email fails
      }

      toast.success(
        useTemporaryPassword
          ? t('modals.userCreatedWithPassword', { name: formData.fullName })
          : t('modals.userInvitedSuccess', { name: formData.fullName })
      );
      onSuccess();
      onOpenChange(false);
      setFormData({ email: "", fullName: "", role: "sewing" });
      setSelectedLineIds([]);
      setSelectedWorkOrderIds([]);
      setBuyerCompanyName("");
      setUseTemporaryPassword(false);
      setTemporaryPassword("");
      setShowPassword(false);
    } catch (error) {
      console.error("Error inviting user:", error);
      toast.error(t('modals.failedToInviteUser'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('modals.inviteNewUser')}
          </DialogTitle>
          <DialogDescription>
            {t('modals.inviteDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              {t('modals.fullName')}
            </Label>
            <Input
              id="fullName"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder={t('modals.enterFullName')}
              required
            />
            {formErrors.fullName && <p className="text-sm text-destructive">{formErrors.fullName}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {t('modals.emailAddress')}
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('modals.emailPlaceholder')}
              required
            />
            {formErrors.email && <p className="text-sm text-destructive">{formErrors.email}</p>}
          </div>

          {/* Temporary Password Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="usePassword" className="text-sm font-medium cursor-pointer">
                  {t('modals.setTempPassword')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('modals.forOnboarding')}
                </p>
              </div>
            </div>
            <Switch
              id="usePassword"
              checked={useTemporaryPassword}
              onCheckedChange={setUseTemporaryPassword}
            />
          </div>

          {/* Temporary Password Input */}
          {useTemporaryPassword && (
            <div className="space-y-2">
              <Label htmlFor="temporaryPassword" className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                {t('modals.tempPassword')}
              </Label>
              <div className="relative">
                <Input
                  id="temporaryPassword"
                  type={showPassword ? "text" : "password"}
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  placeholder={t('modals.enterTempPassword')}
                  minLength={6}
                  required={useTemporaryPassword}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('modals.shareTempPassword')}
              </p>
              {formErrors.temporaryPassword && <p className="text-sm text-destructive">{formErrors.temporaryPassword}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="role" className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              {t('modals.role')}
            </Label>
            <Select
              value={formData.role}
              onValueChange={(value: AppRole) => setFormData({ ...formData, role: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('modals.selectRole')} />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Buyer-specific fields */}
          {isBuyerRole && (
            <>
              <div className="space-y-2">
                <Label htmlFor="buyerCompany" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Company Name
                </Label>
                <Input
                  id="buyerCompany"
                  value={buyerCompanyName}
                  onChange={(e) => setBuyerCompanyName(e.target.value)}
                  placeholder="e.g. Acme Apparel Inc."
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  Assign POs
                  {selectedWorkOrderIds.length > 0 && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {selectedWorkOrderIds.length} selected
                    </span>
                  )}
                </Label>
                <ScrollArea className="h-40 border rounded-md p-2">
                  {workOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No active work orders found
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {workOrders.map((wo) => (
                        <div key={wo.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`wo-${wo.id}`}
                            checked={selectedWorkOrderIds.includes(wo.id)}
                            onCheckedChange={() => toggleWorkOrder(wo.id)}
                          />
                          <label
                            htmlFor={`wo-${wo.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            <span className="font-medium">{wo.po_number}</span>
                            <span className="text-muted-foreground"> — {wo.style}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <p className="text-xs text-muted-foreground">
                  Select which POs this buyer can view. You can add more later.
                </p>
              </div>
            </>
          )}

          {/* Line assignments - only for sewing (line-bound) */}
          {showLinePicker && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                {t('modals.assignedLines')}
                {selectedLineIds.length > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {selectedLineIds.length} {t('modals.selected')}
                  </span>
                )}
              </Label>
              <ScrollArea className="h-32 border rounded-md p-2">
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('modals.noLinesAvailable')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lines.map((line) => (
                      <div key={line.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`line-${line.id}`}
                          checked={selectedLineIds.includes(line.id)}
                          onCheckedChange={() => toggleLine(line.id)}
                        />
                        <label
                          htmlFor={`line-${line.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {line.name || line.line_id}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {t('modals.selectWhichLines')}
              </p>
            </div>
          )}

          {/* Info note for department-wide roles (not shown for buyer) */}
          {isDeptWide && !isBuyerRole && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border text-sm text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t('modals.roleAllAccess')}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('modals.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('modals.inviting')}</>
              ) : (
                t('modals.inviteUser')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
