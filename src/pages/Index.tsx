import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, LogOut, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Index() {
  const { user, loading, profile, roles, hasRole, isAdminOrHigher, signOut } = useAuth();
  const navigate = useNavigate();

  // Show loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect authenticated users based on role
  if (user) {
    if (!profile) return <Navigate to="/auth" replace />;

    // Buyer users: route to workspace selector or dashboard
    if (hasRole('buyer')) {
      if (!profile.factory_id) {
        // No active workspace set — go to selector
        return <Navigate to="/buyer/select-workspace" replace />;
      }
      return <Navigate to="/buyer/dashboard" replace />;
    }

    if (!profile.factory_id) {
      return <Navigate to="/subscription" replace />;
    }

    // Check for cutting role first
    if (hasRole('cutting')) {
      return <Navigate to="/cutting/submissions" replace />;
    }

    // Check for storage role
    if (hasRole('storage')) {
      return <Navigate to="/storage" replace />;
    }

    // Admins and owners always go to dashboard
    if (isAdminOrHigher()) {
      return <Navigate to="/dashboard" replace />;
    }

    // Standalone sewing role
    if (hasRole('sewing')) {
      return <Navigate to="/sewing/morning-targets" replace />;
    }

    // Standalone finishing role
    if (hasRole('finishing')) {
      return <Navigate to="/finishing/daily-target" replace />;
    }

    // Legacy: finishing department workers
    if (profile.department === 'finishing') {
      return <Navigate to="/finishing/daily-target" replace />;
    }

    // Gate officer
    if (hasRole('gate_officer')) {
      return <Navigate to="/dispatch/new" replace />;
    }

    // Legacy: sewing department workers
    if (hasRole('worker')) {
      return <Navigate to="/sewing/morning-targets" replace />;
    }

    // No recognized role — show a message instead of redirecting to a protected
    // route (which would bounce back here and create an infinite loop).
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>Account Setup Incomplete</CardTitle>
            <CardDescription>
              Your account exists but no role has been assigned yet. Please ask your factory administrator to re-invite you or assign a role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await signOut();
                navigate('/auth');
              }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Redirect unauthenticated users to auth page
  return <Navigate to="/auth" replace />;
}
