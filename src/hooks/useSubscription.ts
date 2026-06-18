import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isDeveloperFactory } from '@/lib/constants';

interface SubscriptionStatus {
  subscribed: boolean;
  hasAccess: boolean;
  isTrial?: boolean;
  trialEndDate?: string;
  daysRemaining?: number;
  subscriptionEnd?: string;
  needsPayment?: boolean;
  needsFactory?: boolean;
  isPastDue?: boolean;
  paymentFailedAt?: string;
}

// Module-level cache so all SubscriptionGate instances share the same data
// and don't each trigger their own edge function call + loading spinner.
let cachedStatus: SubscriptionStatus | null = null;
let lastEdgeFetchTime = 0;
// Whether the edge function has completed at least once since page load.
// Used to keep showing a spinner (instead of "renew" screen) while we verify
// with Stripe — prevents false blocks when the DB is stale but Stripe has an
// active subscription (e.g. webhook didn't sync in time).
let edgeCheckedOnce = false;

const EDGE_FETCH_COOLDOWN_MS = 60_000; // Don't re-call edge function within 60s

export function useSubscription() {
  const { user, profile, factory, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(cachedStatus);
  const [loading, setLoading] = useState(!cachedStatus && authLoading);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  // Derive subscription status synchronously from factory data already in AuthContext
  const checkFromFactory = useCallback((): SubscriptionStatus => {
    if (!profile?.factory_id || !factory) {
      return {
        subscribed: false,
        hasAccess: false,
        needsFactory: !profile?.factory_id,
        needsPayment: false
      };
    }

    // Developer/internal factories always have full access, regardless of the
    // Stripe subscription state (the team must never be locked out by billing).
    if (isDeveloperFactory(profile.factory_id)) {
      return { subscribed: true, hasAccess: true, isTrial: false };
    }

    const now = new Date();

    // Check trial status
    if (factory.subscription_status === 'trial' && factory.trial_end_date) {
      const trialEnd = new Date(factory.trial_end_date);
      if (trialEnd > now) {
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          subscribed: false,
          hasAccess: true,
          isTrial: true,
          trialEndDate: factory.trial_end_date,
          daysRemaining,
        };
      }
    }

    // Check active subscription
    if (factory.subscription_status === 'active') {
      return {
        subscribed: true,
        hasAccess: true,
        isTrial: false,
      };
    }

    // Check trialing status (Stripe trial)
    if (factory.subscription_status === 'trialing') {
      const trialEnd = factory.trial_end_date ? new Date(factory.trial_end_date) : null;
      const daysRemaining = trialEnd && trialEnd > now
        ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : undefined;
      return {
        subscribed: true,
        hasAccess: true,
        isTrial: true,
        ...(daysRemaining !== undefined && { daysRemaining }),
        ...(factory.trial_end_date && { trialEndDate: factory.trial_end_date }),
      };
    }

    // Past due: grant grace period access
    if (factory.subscription_status === 'past_due') {
      const GRACE_PERIOD_DAYS = 7;
      const paymentFailedAt = factory.payment_failed_at ? new Date(factory.payment_failed_at) : null;
      const withinGrace = paymentFailedAt &&
        (Date.now() - paymentFailedAt.getTime()) < GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

      return {
        subscribed: false,
        hasAccess: !!withinGrace,
        isPastDue: true,
        needsPayment: !withinGrace,
        paymentFailedAt: factory.payment_failed_at ?? undefined,
      };
    }

    // No valid subscription
    return {
      subscribed: false,
      hasAccess: false,
      needsPayment: true
    };
  }, [profile?.factory_id, factory]);

  // Immediately derive status from factory data when auth finishes loading.
  // This is synchronous — no network call, no loading spinner on navigation.
  useEffect(() => {
    if (authLoading) {
      // Only show loading if we have no cached status at all
      if (!cachedStatus) {
        setLoading(true);
      }
      return;
    }

    if (!user) {
      cachedStatus = null;
      edgeCheckedOnce = false;
      setStatus(null);
      setLoading(false);
      return;
    }

    // If the edge function already verified status, don't overwrite with
    // potentially stale DB data. The edge function is authoritative — it checks
    // Stripe directly and syncs the DB. A subsequent DB read may still return
    // old data (e.g. 'trial' instead of 'active') due to replication lag or
    // AuthContext re-fetching before the DB sync propagates.
    if (edgeCheckedOnce && cachedStatus) {
      const derived = checkFromFactory();
      // Only allow DB to UPGRADE access (e.g. admin manually fixed the DB),
      // never to downgrade what the edge function already confirmed.
      if (derived.hasAccess && !cachedStatus.hasAccess) {
        cachedStatus = derived;
        setStatus(derived);
      } else {
        setStatus(cachedStatus);
      }
      setLoading(false);
      // Trigger a background refresh to re-verify with Stripe
      lastEdgeFetchTime = 0;
      return;
    }

    // First load: derive status from factory data as a fast initial check
    const derived = checkFromFactory();
    cachedStatus = derived;
    setStatus(derived);

    // If the local DB says no access, keep loading until we've verified with
    // the Stripe edge function at least once. This prevents showing a "renew"
    // screen when the DB is stale but the user actually has an active subscription.
    if (!derived.hasAccess && !edgeCheckedOnce) {
      // Stay in loading state — refreshFromEdge will set loading=false
      return;
    }

    setLoading(false);
  }, [authLoading, user, checkFromFactory]);

  // Background edge function validation — never blocks rendering.
  // Runs once after auth loads, then every 5 minutes.
  const refreshFromEdge = useCallback(async () => {
    if (!user || authLoading) return;
    if (inFlightRef.current) return;

    // Cooldown: don't call edge function if we called it recently
    const now = Date.now();
    if (now - lastEdgeFetchTime < EDGE_FETCH_COOLDOWN_MS) return;

    // If the DB already confirms access (active/trialing/trial in grace),
    // skip the edge function entirely — no need to verify with Stripe.
    // Only call when access is uncertain or denied by the DB.
    const derived = checkFromFactory();
    if (derived.hasAccess && edgeCheckedOnce) return;

    inFlightRef.current = true;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;

      const { data, error: fnError } = await supabase.functions.invoke('check-subscription', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });

      // Auth errors (401) or any edge function failure — don't overwrite valid DB status.
      if (fnError) {
        // supabase-js wraps non-2xx as FunctionsHttpError. For ANY failure,
        // fall back to the DB-derived status rather than blocking users.
        const derived = checkFromFactory();
        if (derived.hasAccess) {
          console.warn('Subscription check: edge function failed but DB says active — keeping DB status');
          cachedStatus = derived;
          setStatus(derived);
          lastEdgeFetchTime = Date.now();
          setError(null);
          return;
        }
        // Only throw if DB also says no access (genuine subscription issue)
        throw fnError;
      } else {
        lastEdgeFetchTime = Date.now();
        // Don't let the edge function DOWNGRADE access that the DB already confirms.
        // This protects invited users whose email won't match a Stripe customer.
        const derived = checkFromFactory();
        if (derived.hasAccess && !data.hasAccess) {
          console.warn('Subscription check: edge returned no access but DB says active — keeping DB status');
          cachedStatus = derived;
          setStatus(derived);
        } else {
          cachedStatus = data;
          setStatus(data);
        }
        setError(null);
      }
    } catch (err) {
      console.error('Error checking subscription (background):', err);
      setError('Failed to check subscription status');
      // Don't overwrite status — keep the factory-derived status
    } finally {
      inFlightRef.current = false;
      edgeCheckedOnce = true;
      setLoading(false);
    }
  }, [user, authLoading, checkFromFactory]);

  // Run edge function once after auth loads (background, non-blocking)
  useEffect(() => {
    if (!authLoading && user) {
      refreshFromEdge();

      // Safety timeout: if the edge function hasn't responded after 8 seconds,
      // stop loading and fall back to the DB-derived status.
      if (!edgeCheckedOnce) {
        const timeoutId = setTimeout(() => {
          if (!edgeCheckedOnce) {
            edgeCheckedOnce = true;
            setLoading(false);
          }
        }, 8_000);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [authLoading, user, refreshFromEdge]);

  // Refresh silently every 5 minutes
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(refreshFromEdge, 300_000);
    return () => clearInterval(interval);
  }, [user, refreshFromEdge]);

  return {
    status,
    loading,
    error,
    refresh: refreshFromEdge,
    hasAccess: status?.hasAccess ?? false,
    isTrial: status?.isTrial ?? false,
    needsPayment: status?.needsPayment ?? false,
    needsFactory: status?.needsFactory ?? false,
    isPastDue: status?.isPastDue ?? false,
  };
}
