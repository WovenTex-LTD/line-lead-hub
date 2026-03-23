import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { invokeEdgeFn } from '@/lib/network-utils';
import { openExternalUrl, isNative } from '@/lib/capacitor';
import { Loader2, AlertCircle, AlertTriangle, Lock, LogOut, CreditCard, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccountNotActive } from '@/components/AccountNotActive';

interface SubscriptionGateProps {
  children: React.ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { user, profile, loading: authLoading, roles, hasRole, signOut } = useAuth();
  const { hasAccess, needsFactory, needsPayment, loading: subLoading, isTrial, isPastDue, status } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const [portalLoading, setPortalLoading] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleUpdatePaymentMethod = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await invokeEdgeFn('customer-portal');
      if (error) throw error;
      if (data.url) {
        await openExternalUrl(data.url);
      } else if (data.redirectTo) {
        navigate(data.redirectTo);
      }
    } catch (err) {
      console.error('Error opening billing portal:', err);
      // Fallback to billing page
      navigate('/billing-plan');
    } finally {
      setPortalLoading(false);
    }
  };

  // If user was invited to an existing factory (has factory_id but is not the owner),
  // they don't need to pay - the factory owner pays
  // Admins who are invited should also have access
  const isOwner = hasRole('owner');
  const isAdmin = hasRole('admin');
  const isGateOfficer = hasRole('gate_officer');
  const isInvitedUser = profile?.factory_id && !isOwner;

  // Gate officers are operational users — never block them with billing screens.
  // Their factory's subscription is the owner's responsibility.
  if (isGateOfficer && profile?.factory_id) {
    return <>{children}</>;
  }

  // Still loading
  if (authLoading || subLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking access...</p>
        </div>
      </div>
    );
  }

  // Not logged in - redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Invited users don't need their own subscription
  if (isInvitedUser) {
    // Check if the factory has access
    if (!hasAccess) {
      // On native mobile, show generic "Account Not Active" (Apple compliance)
      if (isNative) return <AccountNotActive />;

      return (
        <div className="flex min-h-[50vh] items-center justify-center p-4">
          <Card className="max-w-md">
            <CardHeader className="text-center">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <CardTitle>Account Suspended</CardTitle>
              <CardDescription>
                Your factory's subscription has expired. Please contact your factory administrator
                to reactivate the subscription.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={() => navigate('/billing-plan')} className="w-full">
                <CreditCard className="h-4 w-4 mr-2" />
                Renew Subscription
              </Button>
              <Button onClick={handleSignOut} variant="outline" className="w-full">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return <>{children}</>;
  }

  // User has subscription but needs to create a factory
  if (needsFactory && hasAccess) {
    // If already on /setup/factory, let them through to the actual page
    if (location.pathname === '/setup/factory') {
      return <>{children}</>;
    }

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-primary mb-4" />
            <CardTitle>Almost There!</CardTitle>
            <CardDescription>
              Your subscription is active{isTrial ? ' (trial)' : ''}. Now let's set up your factory to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => navigate('/setup/factory')} className="w-full">
              Set Up Your Factory
            </Button>
            <Button onClick={handleSignOut} variant="outline" className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin/Owner who needs to subscribe first (no active subscription and no factory)
  if (needsFactory && !hasAccess) {
    if (isNative) return <AccountNotActive />;

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-primary mb-4" />
            <CardTitle>Welcome to ProductionPortal</CardTitle>
            <CardDescription>
              Start your 14-day free trial or subscribe to begin setting up your factory.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => navigate('/subscription')} className="w-full">
              Get Started
            </Button>
            <Button onClick={handleSignOut} variant="outline" className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No access - past due (payment failed, grace period expired)
  if (!hasAccess && isPastDue) {
    if (isNative) return <AccountNotActive />;

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
            <CardTitle>Payment Failed</CardTitle>
            <CardDescription>
              Your recent payment couldn't be processed. Please update your payment method to restore access.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={handleUpdatePaymentMethod} disabled={portalLoading} className="w-full">
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Update Payment Method
            </Button>
            <Button onClick={() => navigate('/billing-plan')} variant="outline" className="w-full">
              View Billing
            </Button>
            <Button onClick={handleSignOut} variant="ghost" className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No access - needs payment (expired/canceled)
  if (!hasAccess && needsPayment) {
    if (isNative) return <AccountNotActive />;

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 mx-auto text-destructive mb-4" />
            <CardTitle>Subscription Required</CardTitle>
            <CardDescription>
              Your subscription has expired.
              Please renew to continue using ProductionPortal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => navigate('/subscription')} className="w-full">
              Manage Subscription
            </Button>
            <Button onClick={handleSignOut} variant="outline" className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Has access but payment failed - show warning banner (hide billing CTA on native mobile)
  if (hasAccess && isPastDue) {
    return (
      <>
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
          <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {isNative
                  ? 'Your account has a billing issue. Please contact productionportal.co for help.'
                  : 'Payment failed. Please update your payment method to avoid losing access.'}
              </span>
            </div>
            {!isNative && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleUpdatePaymentMethod}
                disabled={portalLoading}
                className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
              >
                {portalLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <ExternalLink className="h-3 w-3 mr-1" />
                )}
                Update Payment
              </Button>
            )}
          </div>
        </div>
        {children}
      </>
    );
  }

  // Has access - render children
  return <>{children}</>;
}
