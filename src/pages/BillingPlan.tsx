import { useState, useEffect } from "react";
import { openExternalUrl } from "@/lib/capacitor";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { invokeEdgeFn, networkErrorMessage } from "@/lib/network-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Loader2, 
  CreditCard, 
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Rows3,
  Mail,
  Star,
  ExternalLink,
  RefreshCw,
  XCircle,
  Percent,
  AlertTriangle
} from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { ActiveLinesMeter } from "@/components/ActiveLinesMeter";
import { useActiveLines } from "@/hooks/useActiveLines";
import { 
  PLAN_TIERS, 
  formatPlanPrice, 
  getNextTier, 
  PlanTier, 
  mapLegacyTier,
  BillingInterval,
  getDisplayPrice,
  getMonthlyEquivalent
} from "@/lib/plan-tiers";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function BillingPlan() {
  const { user, factory, isAdminOrHigher, signOut } = useAuth();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const { status: lineStatus, loading: linesLoading, refresh: refetchLines } = useActiveLines();
  
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const { isTrial, status: subStatus } = useSubscription();

  const currentTier = mapLegacyTier(factory?.subscription_tier || 'starter');
  const currentPlan = PLAN_TIERS[currentTier];
  const subscriptionStatus = factory?.subscription_status || 'inactive';

  // Handle payment success/cancel from URL params
  useEffect(() => {
    const payment = searchParams.get('payment');
    const tier = searchParams.get('tier');
    const interval = searchParams.get('interval');
    
    if (payment === 'success') {
      toast.success("Payment Successful!", {
        description: tier
          ? `You've been upgraded to the ${PLAN_TIERS[tier as PlanTier]?.name || tier} plan${interval === 'year' ? ' (Yearly)' : ''}.`
          : "Your subscription is now active.",
      });
      // Clear the params
      navigate('/billing-plan', { replace: true });
      // Refetch subscription status
      refetchLines();
    } else if (payment === 'cancelled') {
      toast.error("Payment Cancelled", { description: "You can try again whenever you're ready." });
      navigate('/billing-plan', { replace: true });
    }
  }, [searchParams, navigate, refetchLines]);

  const handleSubscribe = async (tier: PlanTier) => {
    if (tier === 'enterprise') {
      handleContactSales();
      return;
    }

    setCheckoutLoading(tier);
    try {
      const { data, error } = await invokeEdgeFn('create-checkout', { tier, interval: billingInterval });

      if (error) throw error;

      if (data.url) {
        await openExternalUrl(data.url);
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Error creating checkout:', err);
      toast.error("Error", { description: networkErrorMessage(err) });
    } finally {
      setCheckoutLoading(null);
    }
  };

  // Handle plan upgrades and downgrades
  // Upgrades redirect to Stripe Checkout for user confirmation before any charge
  // Downgrades are scheduled for the end of the current billing period
  const handleChangePlan = async (tier: PlanTier) => {
    if (tier === 'enterprise') {
      handleContactSales();
      return;
    }

    setCheckoutLoading(tier);
    try {
      const { data, error } = await invokeEdgeFn('change-subscription', { newTier: tier, billingInterval });

      if (error) throw error;

      if (data.success) {
        // Upgrades return a checkout URL - redirect user to confirm payment
        if (data.requiresCheckout && data.checkoutUrl) {
          await openExternalUrl(data.checkoutUrl);
          return;
        }

        // Downgrades are scheduled for period end
        if (data.changeType === 'downgrade') {
          // Use the pre-formatted message from backend, or format date locally as fallback
          let scheduledDate = 'your next billing date';
          if (data.effectiveDate) {
            try {
              scheduledDate = new Date(data.effectiveDate).toLocaleDateString();
            } catch {
              // Date parsing failed, use fallback
            }
          }
          toast.success("Downgrade Scheduled", {
            description: data.message || `Your plan will change to ${PLAN_TIERS[tier].name} on ${scheduledDate}. You'll keep your current features until then.`,
          });
        }
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Error changing plan:', err);
      toast.error("Plan Change Failed", { description: networkErrorMessage(err) });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleStartTrial = async (tier: PlanTier = 'starter') => {
    setCheckoutLoading(tier);
    try {
      const { data, error } = await invokeEdgeFn('create-checkout', { tier, startTrial: true, interval: billingInterval });

      if (error) throw error;
      
      if (data.success && data.trial) {
        toast.success("Trial Started!", { description: `Your 14-day trial of the ${PLAN_TIERS[tier].name} plan has begun.` });
        refetchLines();
        if (data.redirectUrl) {
          navigate(data.redirectUrl);
        }
      } else if (data.url) {
        await openExternalUrl(data.url);
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Error starting trial:', err);
      toast.error("Error", { description: networkErrorMessage(err) });
    } finally {
      setCheckoutLoading(null);
    }
  };

  // Opens Stripe Customer Portal for managing payment methods, viewing invoices, etc.
  // If no billing account exists, redirects user to subscription page
  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await invokeEdgeFn('customer-portal');

      if (error) throw error;

      if (data.url) {
        await openExternalUrl(data.url);
      } else if (data.redirectTo) {
        // No billing account - redirect to subscription page
        toast.success("No Billing Account", { description: data.message || "Please subscribe to a plan first." });
        navigate(data.redirectTo);
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Error opening portal:', err);
      toast.error("Error", { description: networkErrorMessage(err) });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleContactSales = () => {
    openExternalUrl('mailto:sales@productionportal.app?subject=Enterprise%20Plan%20Inquiry');
  };

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    try {
      const { data, error } = await invokeEdgeFn('cancel-subscription');

      if (error) throw error;
      
      if (data.success) {
        toast.success("Subscription cancelled", { description: "Access removed. You will be signed out." });
        
        // Sign out and redirect to login
        setTimeout(async () => {
          await signOut();
          navigate('/auth');
        }, 1500);
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Error cancelling subscription:', err);
      toast.error("Cancellation Failed", { description: networkErrorMessage(err) });
    } finally {
      setCancelLoading(false);
      setCancelDialogOpen(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const dot = (color: string, label: string) => (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${color}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${color.replace('text-', 'bg-')}`} />
        {label}
      </span>
    );
    switch (status) {
      case 'active': return dot('text-emerald-600 dark:text-emerald-400', 'Active');
      case 'trialing': case 'trial': return dot('text-blue-600 dark:text-blue-400', 'Trial');
      case 'past_due': return dot('text-red-600 dark:text-red-400', 'Past Due');
      case 'canceled': return dot('text-red-600 dark:text-red-400', 'Canceled');
      case 'expired': return dot('text-red-600 dark:text-red-400', 'Expired');
      default: return dot('text-muted-foreground', status || 'Inactive');
    }
  };

  const isExpired = ['expired', 'canceled', 'past_due'].includes(subscriptionStatus);
  const hasActiveSubscription = ['active', 'trialing', 'trial'].includes(subscriptionStatus);

  if (!user) {
    navigate('/auth');
    return null;
  }

  if (!isAdminOrHigher()) {
    return (
      <div className="container max-w-2xl py-8 px-4">
        <Card>
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>
              Only factory owners and admins can view billing and plan information.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-3 md:py-4 lg:py-6 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-xl bg-slate-500/10 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Billing & Plan</h1>
          <p className="text-sm text-muted-foreground">
            Manage your subscription and active line usage
          </p>
        </div>
      </div>

      {/* Trial countdown banner */}
      {isTrial && (
        <Card className="mb-6 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                  <CreditCard className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-200">
                    {subStatus?.daysRemaining != null
                      ? `${subStatus.daysRemaining} ${subStatus.daysRemaining === 1 ? 'day' : 'days'} left on your trial`
                      : "You're currently on a trial"}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Subscribe to a plan below to keep access after your trial ends.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Status Overview */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Active Lines Meter */}
        <ActiveLinesMeter showUpgrade={false} />

        {/* Current Plan Card */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <p className="font-medium">Current Plan</p>
                  <p className="text-xs text-muted-foreground">Subscription status</p>
                </div>
              </div>
              {getStatusBadge(subscriptionStatus)}
            </div>
              <div className={`p-3 rounded-lg ${isExpired ? 'bg-destructive/10 border border-destructive/30' : 'bg-muted'}`}>
                <p className="text-2xl font-bold">{currentPlan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {currentPlan.priceMonthly > 0 
                    ? `${formatPlanPrice(currentPlan.priceMonthly)} / month`
                    : 'Custom pricing'}
                </p>
                {isExpired && (
                  <p className="text-sm text-destructive font-medium mt-2">
                    Your subscription has expired. Please renew to continue using all features.
                  </p>
                )}
              </div>
              {hasActiveSubscription && (
                <Button 
                  onClick={handleManageBilling} 
                  disabled={portalLoading}
                  variant="outline"
                  className="w-full mt-4"
                >
                  {portalLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Manage Billing
                </Button>
              )}
              {isExpired && (
                <Button 
                  onClick={() => handleSubscribe(currentTier)}
                  disabled={checkoutLoading === currentTier}
                  className="w-full mt-4"
                >
                  {checkoutLoading === currentTier ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Renew Subscription
                </Button>
              )}
          </CardContent>
        </Card>
      </div>

      <div className="border-t border-border/60 my-8" />

      {/* Plan Tiers */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Available Plans</h2>
            <p className="text-sm text-muted-foreground">
              All plans include full access to all production modules. Plans are based on active production lines.
            </p>
          </div>
          
          {/* Billing Interval Toggle */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Label 
              htmlFor="billing-toggle" 
              className={`text-sm font-medium cursor-pointer ${billingInterval === 'month' ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              Monthly
            </Label>
            <Switch
              id="billing-toggle"
              checked={billingInterval === 'year'}
              onCheckedChange={(checked) => setBillingInterval(checked ? 'year' : 'month')}
            />
            <div className="flex items-center gap-1.5">
              <Label 
                htmlFor="billing-toggle" 
                className={`text-sm font-medium cursor-pointer ${billingInterval === 'year' ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                Yearly
              </Label>
              {billingInterval === 'year' && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  <Percent className="h-3 w-3 mr-1" />
                  Save 15%
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.values(PLAN_TIERS).map((plan) => {
          const isCurrent = plan.id === currentTier;
          const isUpgrade = !isCurrent && (
            (currentTier === 'starter' && ['growth', 'scale', 'enterprise'].includes(plan.id)) ||
            (currentTier === 'growth' && ['scale', 'enterprise'].includes(plan.id)) ||
            (currentTier === 'scale' && plan.id === 'enterprise')
          );
          const isDowngrade = !isCurrent && !isUpgrade && plan.id !== 'enterprise';
          const isLoading = checkoutLoading === plan.id;
          
          const displayPrice = getDisplayPrice(plan, billingInterval);
          const isYearly = billingInterval === 'year';
          const monthlyEquivalent = isYearly ? getMonthlyEquivalent(plan.priceYearly) : null;

          return (
            <Card 
              key={plan.id} 
              className={`relative ${isCurrent ? 'border-primary ring-2 ring-primary/20' : ''} ${plan.popular ? 'border-primary/50' : ''}`}
            >
              {/* Badges container */}
              <div className="absolute -top-3 left-0 right-0 flex justify-between px-4">
                {plan.popular && (
                  <Badge className="bg-primary">
                    <Star className="h-3 w-3 mr-1" />
                    Popular
                  </Badge>
                )}
                {!plan.popular && <span />}
                {isCurrent && (
                  <Badge variant="secondary">Current</Badge>
                )}
                {!isCurrent && isYearly && plan.priceMonthly > 0 && (
                  <Badge className="bg-green-600 text-white">
                    15% off
                  </Badge>
                )}
              </div>
              
              <CardHeader className="pb-2 pt-6">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <CardDescription className="text-xs">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="mb-4">
                  {displayPrice > 0 ? (
                    <>
                      {isYearly ? (
                        <div>
                          <span className="text-3xl font-bold">
                            {formatPlanPrice(displayPrice)}
                          </span>
                          <span className="text-muted-foreground text-sm">/yr</span>
                          {monthlyEquivalent && (
                            <p className="text-xs text-muted-foreground mt-1">
                              ({formatPlanPrice(monthlyEquivalent)}/mo equivalent)
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          <span className="text-3xl font-bold">
                            {formatPlanPrice(displayPrice)}
                          </span>
                          <span className="text-muted-foreground text-sm">/mo</span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-2xl font-bold">Custom</span>
                  )}
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted rounded mb-4">
                  <Rows3 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {plan.maxActiveLines ? `Up to ${plan.maxActiveLines} lines` : 'Unlimited lines'}
                  </span>
                </div>
                <ul className="space-y-2">
                  {plan.features.slice(0, 4).map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {plan.id === 'enterprise' ? (
                  <Button 
                    onClick={handleContactSales}
                    variant={isCurrent ? "outline" : "default"}
                    className="w-full"
                    disabled={isCurrent && !isExpired}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {isCurrent && !isExpired ? 'Current Plan' : 'Contact Sales'}
                  </Button>
                ) : isCurrent && isExpired ? (
                  <Button 
                    onClick={() => handleSubscribe(plan.id)}
                    variant="default"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Renew
                  </Button>
                ) : isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : isExpired ? (
                  <Button 
                    onClick={() => handleSubscribe(plan.id)}
                    variant={isUpgrade ? "default" : "outline"}
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : isUpgrade ? (
                      <>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Upgrade
                      </>
                    ) : (
                      <>
                        <TrendingDown className="h-4 w-4 mr-2" />
                        Downgrade
                      </>
                    )}
                  </Button>
                ) : !hasActiveSubscription ? (
                  <Button 
                    onClick={() => handleSubscribe(plan.id)}
                    variant="default"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      'Get Started'
                    )}
                  </Button>
                ) : isUpgrade ? (
                  <Button 
                    onClick={() => handleChangePlan(plan.id)}
                    variant="default"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Upgrade
                      </>
                    )}
                  </Button>
                ) : isDowngrade ? (
                  <Button 
                    onClick={() => handleChangePlan(plan.id)}
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <>
                        <TrendingDown className="h-4 w-4 mr-2" />
                        Downgrade
                      </>
                    )}
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* At Line Limit Banner */}
      {lineStatus && currentPlan.maxActiveLines && lineStatus.activeCount >= currentPlan.maxActiveLines && (
        <Card className="mt-8 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  You've reached your plan limit
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  You're using all {currentPlan.maxActiveLines} active lines included in your {currentPlan.name} plan. 
                  Upgrade to get more lines and additional features.
                </p>
                {getNextTier(currentTier) && (
                  <Button 
                    onClick={() => handleChangePlan(getNextTier(currentTier)!)}
                    size="sm"
                    className="mt-3"
                    disabled={checkoutLoading === getNextTier(currentTier)}
                  >
                    {checkoutLoading === getNextTier(currentTier) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <TrendingUp className="h-4 w-4 mr-2" />
                    )}
                    Upgrade to {PLAN_TIERS[getNextTier(currentTier)!].name}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Subscription Banner */}
      {!hasActiveSubscription && !isExpired && (
        <Card className="mt-8 border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  No active subscription
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Subscribe to a plan to unlock all features and start tracking your production lines.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="border-t border-border/60 my-8" />

      {/* FAQ Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Frequently Asked Questions</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium mb-2">What are active production lines?</h3>
            <p className="text-sm text-muted-foreground">
              Active lines are production lines that have submitted data in the last 30 days. 
              Inactive lines don't count towards your plan limit.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">Can I upgrade or downgrade anytime?</h3>
            <p className="text-sm text-muted-foreground">
              Yes! Upgrades take effect immediately with prorated billing. 
              Downgrades are scheduled for your next billing cycle.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">What's included in all plans?</h3>
            <p className="text-sm text-muted-foreground">
              Every plan includes sewing, finishing, and cutting modules, 
              real-time insights, work order management, and unlimited users.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">How does yearly billing work?</h3>
            <p className="text-sm text-muted-foreground">
              Choose yearly billing to save 15% compared to monthly payments. 
              You'll be billed once per year at the discounted rate.
            </p>
          </div>
        </div>
      </div>

      {/* Cancel Subscription Section */}
      {hasActiveSubscription && (
        <>
          <div className="border-t border-border/60 my-8" />
          <div className="mb-8">
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Cancelling your subscription will immediately remove access for all users in your factory.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="destructive" 
                  onClick={() => setCancelDialogOpen(true)}
                  disabled={cancelLoading}
                >
                  {cancelLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Cancel Subscription
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancel subscription?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-medium text-destructive">
                This will remove access for all users in your factory immediately.
              </p>
              <p>
                You can resubscribe at any time to restore access.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelLoading}>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={cancelLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Yes, cancel subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}