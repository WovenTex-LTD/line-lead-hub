import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/lib/constants';
import { setErrorLoggerUserContext } from '@/lib/error-logger';
import { setRememberMe as persistRememberMe, REMEMBER_ME_KEY, sweepAuthTokens } from '@/lib/auth-storage';

const profileSchema = z.object({
  id: z.string(),
  factory_id: z.string().nullable(),
  full_name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  avatar_url: z.string().nullable(),
  is_active: z.boolean().nullable().transform(v => v ?? true),
  department: z.string().nullable(),
  invitation_status: z.string().nullable().optional(),
});

const userRoleSchema = z.object({
  role: z.enum(['worker', 'admin', 'owner', 'storage', 'cutting', 'sewing', 'finishing', 'buyer', 'superadmin', 'gate_officer']),
  factory_id: z.string().nullable(),
});

const factorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  subscription_tier: z.string(),
  subscription_status: z.string().nullable(),
  trial_end_date: z.string().nullable(),
  cutoff_time: z.string().nullable().transform(v => v ?? '16:00:00'),
  morning_target_cutoff: z.string().nullable(),
  evening_actual_cutoff: z.string().nullable(),
  timezone: z.string().nullable().transform(v => v ?? 'Asia/Dhaka'),
  logo_url: z.string().nullable(),
  max_lines: z.number().nullable(),
  low_stock_threshold: z.number(),
  payment_failed_at: z.string().nullable().optional(),
  headcount_cost_value: z.number().nullable().optional(),
  headcount_cost_currency: z.string().nullable().optional().transform(v => v ?? 'BDT'),
});

type Profile = z.infer<typeof profileSchema>;
type UserRole = z.infer<typeof userRoleSchema>;
export type Factory = z.infer<typeof factorySchema>;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  factory: Factory | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshFactory: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdminOrHigher: () => boolean;
  isSuperAdmin: () => boolean;
  isStorageUser: () => boolean;
  isCuttingUser: () => boolean;
  isSewingUser: () => boolean;
  isFinishingUser: () => boolean;
  isBuyerUser: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [factory, setFactory] = useState<Factory | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchingRef = useRef(false);
  const lastFetchedUserId = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // On sign-in, set loading=true BEFORE the async fetchUserData starts.
          // Without this, React flushes user (set) + loading (still false) + profile (still null)
          // and Auth.tsx's redirect useEffect fires prematurely, sending everyone to /setup/factory.
          if (event === 'SIGNED_IN') {
            setLoading(true);
          }
          fetchUserData(session.user.id);
        } else {
          setProfile(null);
          setRoles([]);
          setFactory(null);
          setErrorLoggerUserContext(null, null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user && lastFetchedUserId.current !== session.user.id) {
        fetchUserData(session.user.id);
      } else if (!session) {
        setLoading(false);
      }
    });

    // Re-validate session when tab becomes visible (handles sign-out in other tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !isMounted) return;

      supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
        if (!isMounted) return;

        if (!currentSession && lastFetchedUserId.current) {
          // Session was removed in another tab — clear local state
          setSession(null);
          setUser(null);
          setProfile(null);
          setRoles([]);
          setFactory(null);
          setErrorLoggerUserContext(null, null);
          lastFetchedUserId.current = null;
        } else if (currentSession?.user?.id && currentSession.user.id !== lastFetchedUserId.current) {
          // Session user changed — re-fetch user data
          setSession(currentSession);
          setUser(currentSession.user);
          fetchUserData(currentSession.user.id);
        }
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  async function fetchUserData(userId: string) {
    if (fetchingRef.current && lastFetchedUserId.current === userId) {
      return;
    }

    fetchingRef.current = true;
    lastFetchedUserId.current = userId;

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('[AuthContext] Profile fetch error:', profileError.message);
      }

      if (!profileData) {
        console.warn('[AuthContext] No profile row found', profileError ? `(error: ${profileError.message})` : '');
      }

      if (profileData) {
        if (profileData.invitation_status === 'pending') {
          // Update invitation status to active now that user has logged in
          try {
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ invitation_status: 'active' })
              .eq('id', userId);
            if (updateError) {
              console.error('[AuthContext] Failed to update invitation_status:', updateError.message);
            }
          } catch (e) {
            console.error('[AuthContext] Exception updating invitation_status:', e);
          }
          profileData.invitation_status = 'active';
        }

        const profileResult = profileSchema.safeParse(profileData);
        if (!profileResult.success) {
          console.error('[AuthContext] Invalid profile data — schema parse failed:', profileResult.error.flatten());
          // Still set what we can so the user isn't stuck — use raw data as fallback
          setProfile({
            id: profileData.id,
            factory_id: profileData.factory_id ?? null,
            full_name: profileData.full_name ?? 'Unknown',
            email: profileData.email ?? '',
            phone: profileData.phone ?? null,
            avatar_url: profileData.avatar_url ?? null,
            is_active: profileData.is_active ?? true,
            department: profileData.department ?? null,
            invitation_status: profileData.invitation_status ?? null,
          });
          setErrorLoggerUserContext(userId, profileData.factory_id ?? null);
        } else {
          setProfile(profileResult.data);
          setErrorLoggerUserContext(userId, profileResult.data.factory_id);
        }

        const factoryId = profileData.factory_id;

        // Fetch roles and factory in parallel (both only need userId/factory_id from profile)
        const [rolesResponse, factoryResponse] = await Promise.all([
          supabase
            .from('user_roles')
            .select('role, factory_id')
            .eq('user_id', userId),
          factoryId
            ? supabase
                .from('factory_accounts')
                .select('*')
                .eq('id', factoryId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (rolesResponse.error) {
          console.error('[AuthContext] Roles fetch error:', rolesResponse.error.message);
        }
        if (rolesResponse.data) {
          const rolesResult = z.array(userRoleSchema).safeParse(rolesResponse.data);
          if (rolesResult.success) {
            const filtered = rolesResult.data.filter((r) => {
              if (factoryId) return r.factory_id === factoryId;
              return r.factory_id === null;
            });
            setRoles(filtered);
          } else {
            console.error('[AuthContext] Invalid roles data — schema parse failed');
          }
        }

        if (factoryResponse.error) {
          console.error('[AuthContext] Factory fetch error:', factoryResponse.error.message);
        }
        if (factoryResponse.data) {
          const factoryResult = factorySchema.safeParse(factoryResponse.data);
          if (factoryResult.success) {
            setFactory(factoryResult.data);
          } else {
            console.error('[AuthContext] Invalid factory data — schema parse failed:', factoryResult.error.flatten());
          }
        }
      }
    } catch (error) {
      console.error('[AuthContext] Error fetching user data:', error);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }

  async function refreshFactory() {
    const factoryId = profile?.factory_id;
    if (!factoryId) return;
    const { data, error } = await supabase
      .from('factory_accounts')
      .select('*')
      .eq('id', factoryId)
      .maybeSingle();
    if (error) {
      console.error('[AuthContext] Factory refresh error:', error.message);
      return;
    }
    if (data) {
      const result = factorySchema.safeParse(data);
      if (result.success) {
        setFactory(result.data);
      }
    }
  }

  async function signIn(email: string, password: string, rememberMe = true) {
    // Set preference BEFORE the Supabase call so the storage adapter routes
    // the session token to the correct store immediately.
    persistRememberMe(rememberMe);

    // If not remembering, clear stale tokens from localStorage so the adapter
    // starts fresh in sessionStorage.
    if (!rememberMe) {
      sweepAuthTokens(localStorage);
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }

  async function signUp(email: string, password: string, fullName: string) {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  }

  async function signOut() {
    // Clear local state first to ensure UI updates immediately
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setFactory(null);
    setErrorLoggerUserContext(null, null);

    // Then attempt to sign out from Supabase (may fail if session already expired)
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Ignore sign out errors - session may already be invalid
      console.log('Sign out completed (session may have already expired)');
    }

    // Clear remember-me preference and sweep auth tokens from both stores
    localStorage.removeItem(REMEMBER_ME_KEY);
    sweepAuthTokens(localStorage);
    sweepAuthTokens(sessionStorage);
  }

  function hasRole(role: AppRole): boolean {
    return roles.some(r => r.role === role);
  }

  function isAdminOrHigher(): boolean {
    return roles.some(r => ['admin', 'owner'].includes(r.role));
  }

  // Keep for backwards compatibility - admin now has all privileges
  function isSuperAdmin(): boolean {
    return roles.some(r => r.role === 'admin');
  }

  function isStorageUser(): boolean {
    return roles.some(r => r.role === 'storage');
  }

  function isCuttingUser(): boolean {
    return roles.some(r => r.role === 'cutting');
  }

  function isSewingUser(): boolean {
    return roles.some(r => r.role === 'sewing') || (hasRole('worker') && profile?.department === 'sewing');
  }

  function isFinishingUser(): boolean {
    return roles.some(r => r.role === 'finishing') || (hasRole('worker') && profile?.department === 'finishing');
  }

  function isBuyerUser(): boolean {
    return roles.some(r => r.role === 'buyer');
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        factory,
        loading,
        signIn,
        signUp,
        signOut,
        refreshFactory,
        hasRole,
        isAdminOrHigher,
        isSuperAdmin,
        isStorageUser,
        isCuttingUser,
        isSewingUser,
        isFinishingUser,
        isBuyerUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
