import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/security.ts";

// Product ID to tier mapping - must match frontend plan-tiers.ts (LIVE)
const PRODUCT_TO_TIER: Record<string, string> = {
  'prod_Tkl8Q1w6HfSqER': 'starter',
  'prod_Tkl8hBoNi8dZZL': 'growth',
  'prod_Tkl8LGqEjZVnRG': 'scale',
};

// Price amount to tier mapping (fallback)
const PRICE_TO_TIER: Record<number, string> = {
  39999: 'starter',
  54999: 'growth',
  62999: 'scale',
};

const TIER_MAX_LINES: Record<string, number> = {
  'starter': 30,
  'growth': 60,
  'scale': 100,
  'enterprise': 999999, // Unlimited
};

const TIER_PRIORITY: Record<string, number> = {
  'starter': 1,
  'growth': 2,
  'scale': 3,
  'enterprise': 4,
};

const getHigherTier = (defaultTier: string, existingTier: string | null | undefined): string => {
  if (!existingTier) return defaultTier;
  const defaultPriority = TIER_PRIORITY[defaultTier] ?? 0;
  const existingPriority = TIER_PRIORITY[existingTier] ?? 0;
  return existingPriority > defaultPriority ? existingTier : defaultTier;
};

// Emails granted free access without Stripe subscription.
// Map email → tier. These users skip all Stripe checks.
const GRANTED_FREE_ACCESS: Record<string, string> = {
  'karimsabbagh21@gmail.com': 'starter',
  'karimsabbagh@woventex.co': 'growth',
};

// Stripe may return timestamps as Unix seconds (number) or ISO strings depending on API version.
const parseStripeTimestamp = (value: unknown): Date => {
  if (typeof value === 'number') return new Date(value * 1000);
  if (typeof value === 'string') return new Date(value);
  return new Date(NaN); // fallback — caller should handle
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader.trim() === "Bearer") {
      logStep("No valid authorization header");
      return new Response(JSON.stringify({
        error: "No authorization header",
        authError: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      logStep("Auth failed, returning unauthenticated response", { error: userError?.message });
      return new Response(JSON.stringify({
        error: "Auth session missing or expired",
        authError: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Check if user has been granted free access
    const grantedTier = GRANTED_FREE_ACCESS[user.email!.toLowerCase()];
    if (grantedTier) {
      logStep("Granted free access", { email: user.email, tier: grantedTier });

      // Look up their factory (if any) to include factory name and sync DB
      const { data: grantedProfile } = await supabaseClient
        .from('profiles')
        .select('factory_id')
        .eq('id', user.id)
        .single();

      if (grantedProfile?.factory_id) {
        const { data: existingFactory } = await supabaseClient
          .from('factory_accounts')
          .select('name, subscription_tier')
          .eq('id', grantedProfile.factory_id)
          .maybeSingle();

        const effectiveTier = getHigherTier(grantedTier, existingFactory?.subscription_tier);

        // Sync the factory record so DB-based checks also work.
        // Never downgrade an existing tier for free-access users.
        await supabaseClient
          .from('factory_accounts')
          .update({
            subscription_status: 'active',
            subscription_tier: effectiveTier,
            max_lines: TIER_MAX_LINES[effectiveTier] || 30,
          })
          .eq('id', grantedProfile.factory_id);

        return new Response(JSON.stringify({
          subscribed: true,
          hasAccess: true,
          isTrial: false,
          currentTier: effectiveTier,
          maxLines: TIER_MAX_LINES[effectiveTier] || 30,
          factoryName: existingFactory?.name,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // No factory yet — still grant access so they can create one
      return new Response(JSON.stringify({
        subscribed: true,
        hasAccess: true,
        isTrial: false,
        needsFactory: true,
        currentTier: grantedTier,
        maxLines: TIER_MAX_LINES[grantedTier] || 30,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Get user's factory
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('factory_id')
      .eq('id', user.id)
      .single();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // If user has no factory, check if they have an active Stripe subscription
    // This allows users who subscribed but haven't created a factory yet to proceed
    if (!profile?.factory_id) {
      logStep("No factory assigned, checking Stripe directly");
      
      // Look for Stripe customer by email
      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      
      if (customers.data.length > 0) {
        const customerId = customers.data[0].id;
        logStep("Found Stripe customer", { customerId });
        
        // Check for active subscriptions
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
        const activeSub = subs.data.find((s: Stripe.Subscription) => s.status === 'active' || s.status === 'trialing');
        
        if (activeSub) {
          const isTrial = activeSub.status === 'trialing';
          const trialEndDate = activeSub.trial_end ? parseStripeTimestamp(activeSub.trial_end) : null;
          const daysRemaining = isTrial && trialEndDate && !isNaN(trialEndDate.getTime())
            ? Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null;
          
          // Get tier from subscription
          let tier = 'starter';
          if (activeSub.items.data.length > 0) {
            const item = activeSub.items.data[0];
            const productId = typeof item.price.product === 'string'
              ? item.price.product
              : item.price.product.id;
            tier = PRODUCT_TO_TIER[productId] || 'starter';
          }
          
          logStep("User has active subscription but no factory", { 
            subscriptionId: activeSub.id, 
            status: activeSub.status,
            tier 
          });
          
          return new Response(JSON.stringify({ 
            subscribed: !isTrial,
            hasAccess: true,
            isTrial,
            needsFactory: true,
            currentTier: tier,
            maxLines: TIER_MAX_LINES[tier] || 30,
            daysRemaining,
            stripeCustomerId: customerId,
            stripeSubscriptionId: activeSub.id,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
      }
      
      logStep("No factory and no active subscription");
      return new Response(JSON.stringify({ 
        subscribed: false, 
        needsFactory: true,
        hasAccess: false 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Get factory subscription status
    const { data: factory } = await supabaseClient
      .from('factory_accounts')
      .select('subscription_status, trial_end_date, stripe_customer_id, stripe_subscription_id, subscription_tier, max_lines, name, payment_failed_at')
      .eq('id', profile.factory_id)
      .single();

    if (!factory) {
      logStep("Factory not found");
      return new Response(JSON.stringify({ 
        subscribed: false, 
        needsFactory: true,
        hasAccess: false 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Factory found", { 
      factoryId: profile.factory_id, 
      status: factory.subscription_status,
      tier: factory.subscription_tier,
      trialEnd: factory.trial_end_date 
    });

    const deriveTierAndMaxLines = (subscription: Stripe.Subscription) => {
      let tier = factory.subscription_tier || 'starter';
      let maxLines = factory.max_lines || 30;

      if (subscription.items.data.length > 0) {
        const item = subscription.items.data[0];
        const productId = typeof item.price.product === 'string'
          ? item.price.product
          : item.price.product.id;

        if (PRODUCT_TO_TIER[productId]) {
          tier = PRODUCT_TO_TIER[productId];
          maxLines = TIER_MAX_LINES[tier] || 30;
        } else if (item.price.unit_amount && PRICE_TO_TIER[item.price.unit_amount]) {
          tier = PRICE_TO_TIER[item.price.unit_amount];
          maxLines = TIER_MAX_LINES[tier] || 30;
        }
      }

      return { tier, maxLines };
    };

    const respondWithActiveSubscription = async (subscription: Stripe.Subscription) => {
      const { tier, maxLines } = deriveTierAndMaxLines(subscription);
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

      // Keep factory in sync even if webhooks are not configured.
      await supabaseClient
        .from('factory_accounts')
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          subscription_tier: tier,
          max_lines: maxLines,
          subscription_status: subscription.status,
          payment_failed_at: null,
        })
        .eq('id', profile.factory_id);

      const isTrial = subscription.status === 'trialing';
      const periodEnd = parseStripeTimestamp(subscription.current_period_end);
      const subscriptionEnd = !isNaN(periodEnd.getTime()) ? periodEnd.toISOString() : null;
      const trialEnd = subscription.trial_end ? parseStripeTimestamp(subscription.trial_end) : null;
      const daysRemaining = isTrial && trialEnd && !isNaN(trialEnd.getTime())
        ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      return new Response(JSON.stringify({
        subscribed: !isTrial,
        hasAccess: true,
        isTrial,
        subscriptionEnd,
        currentTier: tier,
        maxLines,
        factoryName: factory.name,
        daysRemaining,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    };

    const tryFindSubscriptionByCustomerEmail = async () => {
      // Search all customers with this email (there may be multiple from different payment attempts)
      const customers = await stripe.customers.list({ email: user.email!, limit: 10 });
      
      if (customers.data.length === 0) {
        logStep("No Stripe customers found for email");
        return null;
      }
      
      logStep("Found Stripe customers by email", { count: customers.data.length, ids: customers.data.map((c: Stripe.Customer) => c.id) });
      
      // Check all customers for an active or past_due subscription
      let pastDueSub: Stripe.Subscription | null = null;
      for (const customer of customers.data) {
        const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 10 });
        const activeSub = subs.data.find((s: Stripe.Subscription) => s.status === 'active' || s.status === 'trialing');

        if (activeSub) {
          logStep("Active subscription found", {
            customerId: customer.id,
            subscriptionId: activeSub.id,
            status: activeSub.status
          });
          return activeSub;
        }

        // Track past_due as fallback (recoverable subscription)
        if (!pastDueSub) {
          const pdSub = subs.data.find((s: Stripe.Subscription) => s.status === 'past_due');
          if (pdSub) pastDueSub = pdSub;
        }
      }

      // Return past_due subscription if no active one found
      if (pastDueSub) {
        logStep("Past due subscription found (no active)", {
          subscriptionId: pastDueSub.id,
          status: pastDueSub.status,
        });
        return pastDueSub;
      }

      logStep("No active or past_due subscriptions found across all customers");
      return null;
    };

    const GRACE_PERIOD_DAYS = 7;
    const now = new Date();

    const respondWithPastDueSubscription = (paymentFailedAt: string | null) => {
      const failedAt = paymentFailedAt ? new Date(paymentFailedAt) : null;
      const withinGrace = failedAt &&
        (now.getTime() - failedAt.getTime()) < GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

      logStep("Past due subscription", { paymentFailedAt, withinGrace });

      return new Response(JSON.stringify({
        subscribed: false,
        hasAccess: !!withinGrace,
        isPastDue: true,
        needsPayment: !withinGrace,
        paymentFailedAt,
        gracePeriodDays: GRACE_PERIOD_DAYS,
        currentTier: factory.subscription_tier || 'starter',
        maxLines: factory.max_lines || 30,
        factoryName: factory.name,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    };

    // IMPORTANT: Always check for active subscription by email first
    // This catches cases where customer ID in DB doesn't match the one with active subscription
    let stripeCheckedSuccessfully = false;
    try {
      const subByEmail = await tryFindSubscriptionByCustomerEmail();
      stripeCheckedSuccessfully = true; // Stripe API responded (even if no sub found)
      if (subByEmail) {
        const currentCustomerId = typeof subByEmail.customer === 'string'
          ? subByEmail.customer
          : subByEmail.customer.id;

        // Check if we need to sync the Stripe IDs
        if (factory.stripe_customer_id !== currentCustomerId ||
            factory.stripe_subscription_id !== subByEmail.id) {
          logStep("Syncing mismatched Stripe IDs", {
            oldCustomerId: factory.stripe_customer_id,
            newCustomerId: currentCustomerId,
            oldSubId: factory.stripe_subscription_id,
            newSubId: subByEmail.id,
          });
        }

        if (subByEmail.status === 'past_due') {
          // If the DB already says 'active', the webhook likely processed a successful
          // payment but Stripe hasn't transitioned the subscription status yet.
          // Trust the webhook — don't downgrade to past_due.
          if (factory.subscription_status === 'active') {
            logStep("Stripe says past_due but DB says active — trusting webhook, not downgrading");
            return await respondWithActiveSubscription(subByEmail);
          }

          // Only set payment_failed_at if it's not already set.
          // Never re-create it — the webhook clears it on successful payment.
          const paymentFailedAt = factory.payment_failed_at || new Date().toISOString();
          await supabaseClient
            .from('factory_accounts')
            .update({
              stripe_customer_id: currentCustomerId,
              stripe_subscription_id: subByEmail.id,
              subscription_status: 'past_due',
              payment_failed_at: paymentFailedAt,
            })
            .eq('id', profile.factory_id);
          return respondWithPastDueSubscription(paymentFailedAt);
        }

        return await respondWithActiveSubscription(subByEmail);
      }
    } catch (err) {
      logStep("Error checking subscription by email", { error: String(err) });
      // stripeCheckedSuccessfully stays false — don't make destructive DB changes
    }

    // Fall back to checking stored subscription ID if email lookup failed
    if (factory.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(factory.stripe_subscription_id);
        stripeCheckedSuccessfully = true;
        logStep("Stripe subscription retrieved by stored ID", {
          id: subscription.id,
          status: subscription.status,
        });

        if (subscription.status === 'active' || subscription.status === 'trialing') {
          return await respondWithActiveSubscription(subscription);
        }

        if (subscription.status === 'past_due') {
          // If the DB already says 'active', the webhook likely processed a successful
          // payment but Stripe hasn't transitioned the subscription status yet.
          // Trust the webhook — don't downgrade to past_due.
          if (factory.subscription_status === 'active') {
            logStep("Stripe says past_due but DB says active — trusting webhook, not downgrading");
            return await respondWithActiveSubscription(subscription);
          }

          const paymentFailedAt = factory.payment_failed_at || new Date().toISOString();
          await supabaseClient
            .from('factory_accounts')
            .update({
              subscription_status: 'past_due',
              payment_failed_at: paymentFailedAt,
            })
            .eq('id', profile.factory_id);
          return respondWithPastDueSubscription(paymentFailedAt);
        }

        // Subscription not active - update status
        await supabaseClient
          .from('factory_accounts')
          .update({ subscription_status: subscription.status })
          .eq('id', profile.factory_id);
        logStep("Stored subscription not active", { status: subscription.status });
      } catch (err) {
        logStep("Error checking stored Stripe subscription", { error: String(err) });
        // stripeCheckedSuccessfully stays unchanged — don't make destructive DB changes
      }
    }

    // Database-backed access (authoritative when webhook/checkout updates factory_accounts).
    // This also protects against missing Stripe permissions on restricted keys.
    if (factory.subscription_status === 'active') {
      logStep("Access granted from DB status", { status: factory.subscription_status });
      return new Response(JSON.stringify({
        subscribed: true,
        hasAccess: true,
        isTrial: false,
        currentTier: factory.subscription_tier || 'starter',
        maxLines: factory.max_lines || 30,
        factoryName: factory.name,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (factory.subscription_status === 'trialing') {
      const trialEnd = factory.trial_end_date ? new Date(factory.trial_end_date) : null;
      const daysRemaining = trialEnd && trialEnd > now
        ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      logStep("Access granted from DB status", { status: factory.subscription_status, daysRemaining });
      return new Response(JSON.stringify({
        subscribed: true,
        hasAccess: true,
        isTrial: true,
        currentTier: factory.subscription_tier || 'starter',
        maxLines: factory.max_lines || 30,
        factoryName: factory.name,
        ...(daysRemaining !== null && { daysRemaining }),
        ...(factory.trial_end_date && { trialEndDate: factory.trial_end_date }),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (factory.subscription_status === 'trial' && factory.trial_end_date) {
      const trialEnd = new Date(factory.trial_end_date);

      if (trialEnd > now) {
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        logStep("Active trial (from DB)", { trialEndDate: factory.trial_end_date, daysRemaining });
        return new Response(JSON.stringify({
          subscribed: false,
          hasAccess: true,
          isTrial: true,
          trialEndDate: factory.trial_end_date,
          daysRemaining,
          currentTier: factory.subscription_tier || 'starter',
          maxLines: factory.max_lines || 30,
          factoryName: factory.name,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Trial expired — only mark as 'expired' in DB if we successfully confirmed
      // with Stripe that there's no active subscription. If Stripe checks failed
      // (transient API error), the user may have a valid subscription we couldn't reach.
      if (stripeCheckedSuccessfully) {
        await supabaseClient
          .from('factory_accounts')
          .update({ subscription_status: 'expired' })
          .eq('id', profile.factory_id);
        logStep("Trial expired (confirmed via Stripe)");
      } else {
        logStep("Trial expired locally but Stripe check failed — not marking as expired in DB");
      }
    }

    // Past due: grant grace period access
    if (factory.subscription_status === 'past_due') {
      return respondWithPastDueSubscription(factory.payment_failed_at);
    }

    // No active subscription or trial
    logStep("No active subscription or trial");
    return new Response(JSON.stringify({
      subscribed: false,
      hasAccess: false,
      needsPayment: true,
      currentTier: factory.subscription_tier || 'starter',
      maxLines: factory.max_lines || 30,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
