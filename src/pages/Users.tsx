import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Users as UsersIcon, Search, UserPlus, Shield, Mail, Phone, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";
import { InviteUserDialog } from "@/components/users/InviteUserDialog";
import { EditUserDialog } from "@/components/users/EditUserDialog";
import { CleanupGlobalRolesDialog } from "@/components/users/CleanupGlobalRolesDialog";

interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
  invitation_status: 'pending' | 'active';
  role: string | null;
  department: string | null;
  assigned_line_ids: string[];
  assigned_line_names: string[];
  created_at: string | null;
}

export default function UsersPage() {
  const { profile, isAdminOrHigher, user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchUsers();
    }
  }, [profile?.factory_id]);

  async function fetchUsers() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      // Fetch profiles, roles, lines, line assignments, AND buyer memberships in parallel
      const [profilesRes, rolesRes, linesRes, lineAssignmentsRes, buyerMembershipsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('factory_id', profile.factory_id)
          .order('full_name'),
        supabase
          .from('user_roles')
          .select('user_id, role, factory_id')
          .or(`factory_id.eq.${profile.factory_id},factory_id.is.null`),
        supabase
          .from('lines')
          .select('id, line_id, name')
          .eq('factory_id', profile.factory_id),
        supabase
          .from('user_line_assignments')
          .select('user_id, line_id')
          .eq('factory_id', profile.factory_id),
        // Fetch buyer memberships for this factory (buyers may have a different active factory_id)
        supabase
          .from('buyer_factory_memberships')
          .select('user_id, company_name')
          .eq('factory_id', profile.factory_id)
          .eq('is_active', true),
      ]);

      // Collect buyer user IDs that have a membership here but aren't in profilesRes
      const profileUserIds = new Set((profilesRes.data || []).map(p => p.id));
      const buyerUserIdsToFetch = (buyerMembershipsRes.data || [])
        .map(m => m.user_id)
        .filter(uid => !profileUserIds.has(uid));

      // Fetch those extra buyer profiles
      let extraBuyerProfiles: typeof profilesRes.data = [];
      if (buyerUserIdsToFetch.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .in('id', buyerUserIdsToFetch);
        extraBuyerProfiles = data || [];
      }

      const allProfiles = [...(profilesRes.data || []), ...(extraBuyerProfiles || [])];

      // Build a set of buyer user IDs for this factory
      const buyerMembershipUserIds = new Set(
        (buyerMembershipsRes.data || []).map(m => m.user_id)
      );

      const roleMap = new Map<string, string>();
      rolesRes.data?.forEach((r: any) => {
        const isFactoryScoped = r.factory_id === profile.factory_id;

        // Ignore roles that aren't scoped to this factory
        if (!isFactoryScoped) return;

        const existingRole = roleMap.get(r.user_id);
        const roleOrder = ['owner', 'admin', 'supervisor', 'sewing', 'finishing', 'storage', 'cutting', 'gate_officer', 'buyer', 'worker'];
        if (!existingRole || roleOrder.indexOf(r.role) < roleOrder.indexOf(existingRole)) {
          roleMap.set(r.user_id, r.role);
        }
      });

      const lineMap = new Map<string, { line_id: string; name: string | null }>();
      linesRes.data?.forEach(l => lineMap.set(l.id, { line_id: l.line_id, name: l.name }));

      // Group line assignments by user
      const userLineAssignments = new Map<string, string[]>();
      lineAssignmentsRes.data?.forEach(la => {
        const existing = userLineAssignments.get(la.user_id) || [];
        existing.push(la.line_id);
        userLineAssignments.set(la.user_id, existing);
      });

      const formattedUsers: User[] = allProfiles.map(p => {
        const lineIds = userLineAssignments.get(p.id) || [];
        const lineNames = lineIds.map(id => {
          const line = lineMap.get(id);
          return line?.name || line?.line_id || id;
        });

        // For buyer users whose active factory_id is elsewhere, still show with buyer role
        const role = roleMap.get(p.id) || (buyerMembershipUserIds.has(p.id) ? 'buyer' : 'worker');

        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          avatar_url: p.avatar_url,
          is_active: p.is_active,
          invitation_status: (p.invitation_status as 'pending' | 'active') || 'active',
          role,
          department: p.department,
          assigned_line_ids: lineIds,
          assigned_line_names: lineNames,
          created_at: p.created_at,
        };
      });

      setUsers(formattedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadgeClass = (role: string | null) => {
    switch (role) {
      case 'owner': return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/40';
      case 'admin': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700/40';
      case 'supervisor': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700/40';
      case 'sewing': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700/40';
      case 'finishing': return 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-200/60 dark:border-violet-700/40';
      case 'cutting': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700/40';
      case 'storage': return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 border border-orange-200/60 dark:border-orange-700/40';
      case 'buyer': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300 border border-cyan-200/60 dark:border-cyan-700/40';
      case 'gate_officer': return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 border border-orange-200/60 dark:border-orange-700/40';
      default: return 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/40';
    }
  };


  const activeUsers = users.filter(u => u.invitation_status === 'active');
  const pendingUsers = users.filter(u => u.invitation_status === 'pending');
  const adminCount = users.filter(u => ['admin', 'owner'].includes(u.role || '')).length;

  function handleEditUser(user: User) {
    setSelectedUser(user);
    setShowEditDialog(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-500/10 flex items-center justify-center">
            <UsersIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Users</h1>
            <p className="text-sm text-muted-foreground">Manage factory users and roles</p>
          </div>
        </div>
        {isAdminOrHigher() && (
          <div className="flex items-center gap-2">
            <CleanupGlobalRolesDialog onSuccess={fetchUsers} />
            <Button onClick={() => setShowInviteDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <div className="relative overflow-hidden rounded-xl border border-slate-200/60 dark:border-slate-800/40 bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-950/40 dark:via-card dark:to-slate-950/20 p-4 hover:shadow-lg transition-all duration-300">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-600/70 dark:text-slate-400/70">Total Users</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">{users.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-green-50/50 dark:from-emerald-950/40 dark:via-card dark:to-green-950/20 p-4 hover:shadow-lg transition-all duration-300">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">Active</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100 mt-1">{activeUsers.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-white to-orange-50/50 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20 p-4 hover:shadow-lg transition-all duration-300">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-amber-600/70 dark:text-amber-400/70">Pending</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-amber-900 dark:text-amber-100 mt-1">{pendingUsers.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-indigo-200/60 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50 via-white to-blue-50/50 dark:from-indigo-950/40 dark:via-card dark:to-blue-950/20 p-4 hover:shadow-lg transition-all duration-300">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-indigo-600/70 dark:text-indigo-400/70">Admins</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-indigo-900 dark:text-indigo-100 mt-1">{adminCount}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Users Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Assigned Lines</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  {isAdminOrHigher() && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                            {getInitials(user.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {user.full_name}
                            {user.id === currentUser?.id && (
                              <span className="text-muted-foreground text-xs ml-2">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        // If worker role with a department, show the department as the role
                        const effectiveRole = (user.role === 'worker' && user.department && user.department !== 'both')
                          ? user.department
                          : user.role;
                        return (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${getRoleBadgeClass(effectiveRole)}`}>
                            <Shield className="h-3 w-3" />
                            {ROLE_LABELS[effectiveRole as keyof typeof ROLE_LABELS] || 'Manager'}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate max-w-[150px]">{user.email}</span>
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.role === 'buyer' ? (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">Buyer — PO access</span>
                      ) : ['admin', 'owner', 'storage', 'finishing', 'cutting'].includes(user.role || '') ? (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">All lines</span>
                      ) : user.assigned_line_names.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.assigned_line_names.slice(0, 3).map((name, i) => (
                            <span 
                              key={i} 
                              className="text-xs bg-muted px-2 py-0.5 rounded"
                            >
                              {name}
                            </span>
                          ))}
                          {user.assigned_line_names.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{user.assigned_line_names.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No lines assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {user.invitation_status === 'pending' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Pending
                        </span>
                      ) : user.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                          Inactive
                        </span>
                      )}
                    </TableCell>
                    {isAdminOrHigher() && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditUser(user)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit User
                            </DropdownMenuItem>
                            {user.id !== currentUser?.id && user.role !== 'owner' && (
                              <DropdownMenuItem 
                                onClick={() => handleEditUser(user)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove Access
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdminOrHigher() ? 6 : 5} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <InviteUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onSuccess={fetchUsers}
      />
      <EditUserDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        user={selectedUser}
        onSuccess={fetchUsers}
      />
    </div>
  );
}
