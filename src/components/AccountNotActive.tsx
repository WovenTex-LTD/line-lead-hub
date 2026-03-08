import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, LogOut, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/hooks/useSubscription';

/**
 * Mobile-only "Account Not Active" screen shown when the user's subscription
 * is inactive on native iOS/Android builds.
 *
 * Apple App Store guidelines prohibit directing users to external payment flows,
 * so instead of billing CTAs we show a generic contact message.
 */
export function AccountNotActive() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { refresh } = useSubscription();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleRefresh = async () => {
    await refresh();
  };

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <CardTitle>Account Not Active</CardTitle>
          <CardDescription className="text-base mt-2">
            Please contact us at{' '}
            <span className="font-medium text-foreground">productionportal.co</span>{' '}
            for more information.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={handleRefresh} variant="outline" className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Status
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
