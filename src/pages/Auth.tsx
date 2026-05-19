import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  ArrowRight,
  KeyRound,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Check,
  X,
  ShieldCheck,
  TrendingUp,
  Truck,
  Sparkles,
  Clock,
  Boxes,
  Activity,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getRememberMe } from "@/lib/auth-storage";
import { getPasswordResetRedirectUrl } from "@/lib/capacitor";
import logoWhiteSvg from "@/assets/logo-white.svg";
import i18n from "@/i18n/config";

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[0-9]/, "Must contain a number");

const passwordSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z
  .object({
    fullName: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const {
    signIn,
    signUp,
    signOut,
    user,
    profile,
    hasRole,
    isAdminOrHigher,
    loading: authLoading,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Force English on Auth (translations live behind auth)
  useEffect(() => {
    if (i18n.language !== "en") i18n.changeLanguage("en");
    document.documentElement.lang = "en";
    return () => {
      const saved = localStorage.getItem("app-language");
      if (saved && saved !== "en") i18n.changeLanguage(saved);
    };
  }, []);

  // Leave the global theme-color alone so the iOS URL bar matches the page
  // background (white on mobile). The dark hero stops at the form card.

  const isForcedPasswordReset =
    typeof window !== "undefined" &&
    sessionStorage.getItem("pp_force_password_reset") === "1";

  // Password-reset mode: detect from URL on mount
  const getIsRecoveryMode = () => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get("access_token");
    const type = hashParams.get("type");
    return !!(accessToken && type === "recovery");
  };
  const [isPasswordResetMode, setIsPasswordResetMode] = useState(getIsRecoveryMode);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordErrors, setResetPasswordErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setIsPasswordResetMode(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Redirect if already logged in (but not if in password reset mode)
  useEffect(() => {
    if (authLoading) return;
    if (isForcedPasswordReset) return;
    if (!user || isPasswordResetMode) return;

    if (profile?.factory_id) {
      if (hasRole("cutting")) {
        navigate("/cutting/submissions", { replace: true });
        return;
      }
      if (hasRole("storage")) {
        navigate("/storage", { replace: true });
        return;
      }
      if (hasRole("qc")) {
        navigate("/quality/daily-sheet", { replace: true });
        return;
      }
      if (isAdminOrHigher()) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (hasRole("sewing")) {
        navigate("/sewing/morning-targets", { replace: true });
        return;
      }
      if (hasRole("finishing")) {
        navigate("/finishing/daily-target", { replace: true });
        return;
      }
      if (profile.department === "finishing") {
        navigate("/finishing/daily-target", { replace: true });
        return;
      }
      if (hasRole("worker")) {
        navigate("/sewing/morning-targets", { replace: true });
        return;
      }
      navigate("/", { replace: true });
    } else if (profile && !profile.is_active) {
      toast.error("Account Deactivated", {
        description: "Your account has been deactivated. Please contact your administrator.",
      });
      signOut().catch(console.error);
    } else if (!profile || profile.factory_id === null) {
      navigate("/subscription", { replace: true });
    }
  }, [
    authLoading,
    user,
    profile,
    navigate,
    isPasswordResetMode,
    hasRole,
    isAdminOrHigher,
    isForcedPasswordReset,
    signOut,
  ]);

  // ── Login / signup state ─────────────────────────────────────────────
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(getRememberMe);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupErrors, setSignupErrors] = useState<Record<string, string>>({});
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);

  // Deep-link handling
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("reset") === "success") {
      toast.success("Password updated", {
        description: "Please sign in with your new password.",
      });
    }
    if (params.get("forgot") === "1") {
      setActiveTab("login");
      setForgotPasswordOpen(true);
    }
    if (params.get("reset") === "success" || params.get("forgot") === "1") {
      navigate("/auth", { replace: true });
    }
  }, [location.search, navigate]);

  // Live password-strength checks for signup + reset
  const passwordChecks = useMemo(() => {
    const v = activeTab === "signup" ? signupPassword : newPassword;
    return {
      length: v.length >= 8,
      lower: /[a-z]/.test(v),
      upper: /[A-Z]/.test(v),
      digit: /[0-9]/.test(v),
    };
  }, [activeTab, signupPassword, newPassword]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !forgotPasswordEmail ||
      !z.string().email().safeParse(forgotPasswordEmail).success
    ) {
      toast.error("Invalid email", {
        description: "Please enter a valid email address.",
      });
      return;
    }
    setForgotPasswordLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    setForgotPasswordLoading(false);
    if (error) {
      toast.error("Error", { description: error.message });
    } else {
      toast.success("Check your email", {
        description: "We've sent you a password reset link.",
      });
      setForgotPasswordOpen(false);
      setForgotPasswordEmail("");
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetPasswordErrors({});
    try {
      passwordSchema.parse({
        password: newPassword,
        confirmPassword: confirmNewPassword,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) errors[e.path[0] as string] = e.message;
        });
        setResetPasswordErrors(errors);
        return;
      }
    }
    setResetPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setResetPasswordLoading(false);
    if (error) {
      toast.error("Error updating password", { description: error.message });
    } else {
      toast.success("Password updated!", {
        description: "Your password has been successfully updated.",
      });
      setIsPasswordResetMode(false);
      setNewPassword("");
      setConfirmNewPassword("");
      window.history.replaceState(null, "", window.location.pathname);
      navigate("/", { replace: true });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErrors({});
    try {
      loginSchema.parse({ email: loginEmail, password: loginPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) errors[e.path[0] as string] = e.message;
        });
        setLoginErrors(errors);
        return;
      }
    }
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword, rememberMe);
    setIsLoading(false);
    if (error) {
      toast.error("Login failed", {
        description:
          error.message === "Invalid login credentials"
            ? "Invalid email or password. Please try again."
            : error.message,
      });
    } else {
      toast.success("Welcome back!", {
        description: "You have successfully logged in.",
      });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupErrors({});
    try {
      signupSchema.parse({
        fullName: signupName,
        email: signupEmail,
        password: signupPassword,
        confirmPassword: signupConfirmPassword,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) errors[e.path[0] as string] = e.message;
        });
        setSignupErrors(errors);
        return;
      }
    }
    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    setIsLoading(false);
    if (error) {
      if (error.message.includes("already registered")) {
        toast.error("Account exists", {
          description:
            "An account with this email already exists. Please log in instead.",
        });
        setActiveTab("login");
        setLoginEmail(signupEmail);
      } else {
        toast.error("Signup failed", { description: error.message });
      }
    } else {
      toast.success("Account created!", {
        description: "Welcome to ProductionPortal.",
      });
      navigate("/subscription");
    }
  };

  return (
    <div
      className="min-h-dvh relative isolate bg-background"
      style={{
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
      }}
    >
      <div className="min-h-dvh flex">
        {/* Left brand panel (hidden below lg) */}
        <BrandPanel />

        {/* Right side: mobile hero + form */}
        <div className="flex-1 flex flex-col min-w-0 relative bg-background">
          {/* Mobile hero (hidden on lg) */}
          <MobileHero />

          {/* Form panel — card overlaps hero on mobile, plain on desktop */}
          <div className="flex-1 flex items-start lg:items-center justify-center px-5 sm:px-6 lg:p-12 pb-10 lg:pt-12 lg:pb-12 relative">
            <div className="relative w-full max-w-md -mt-16 lg:mt-0 rounded-2xl bg-card lg:bg-transparent ring-1 ring-black/5 lg:ring-0 shadow-2xl shadow-black/30 lg:shadow-none p-5 sm:p-6 lg:p-0 space-y-6">

          {isPasswordResetMode ? (
            // Reset mode
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0">
                  <KeyRound className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight">
                    Set a new password
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose something secure you'll remember.
                  </p>
                </div>
              </div>

              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <FieldWithIcon
                  id="new-password"
                  label="New Password"
                  icon={Lock}
                  type={showResetPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={setNewPassword}
                  disabled={resetPasswordLoading}
                  error={resetPasswordErrors.password}
                  trailing={
                    <PasswordToggle
                      show={showResetPassword}
                      onToggle={() => setShowResetPassword((s) => !s)}
                    />
                  }
                />
                <PasswordChecklist checks={passwordChecks} value={newPassword} />
                <FieldWithIcon
                  id="confirm-new-password"
                  label="Confirm New Password"
                  icon={Lock}
                  type={showResetPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  value={confirmNewPassword}
                  onChange={setConfirmNewPassword}
                  disabled={resetPasswordLoading}
                  error={resetPasswordErrors.confirmPassword}
                />
                <Button
                  type="submit"
                  className="w-full h-11 gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/25 text-white"
                  disabled={resetPasswordLoading}
                >
                  {resetPasswordLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Update Password
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setIsPasswordResetMode(false);
                    window.history.replaceState(null, "", window.location.pathname);
                  }}
                >
                  Back to login
                </Button>
              </form>
            </div>
          ) : (
            // Login + Signup
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {activeTab === "login" ? "Welcome back." : "Create your account."}
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {activeTab === "login"
                    ? "Sign in to continue managing your production floor."
                    : "Start tracking output, QC, and dispatches in minutes."}
                </p>
              </div>

              {/* Segmented control */}
              <div className="grid grid-cols-2 p-1 rounded-lg bg-muted/60 border border-border/50 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("login")}
                  className={cn(
                    "py-2 text-sm font-semibold rounded-md transition-all",
                    activeTab === "login"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("signup")}
                  className={cn(
                    "py-2 text-sm font-semibold rounded-md transition-all",
                    activeTab === "signup"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Sign Up
                </button>
              </div>

              {activeTab === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <FieldWithIcon
                    id="login-email"
                    label="Email"
                    icon={Mail}
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={setLoginEmail}
                    disabled={isLoading}
                    error={loginErrors.email}
                  />
                  <FieldWithIcon
                    id="login-password"
                    label="Password"
                    icon={Lock}
                    type={showLoginPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={setLoginPassword}
                    disabled={isLoading}
                    error={loginErrors.password}
                    trailing={
                      <PasswordToggle
                        show={showLoginPassword}
                        onToggle={() => setShowLoginPassword((s) => !s)}
                      />
                    }
                  />

                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="remember-me"
                      className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(c) => setRememberMe(c === true)}
                        disabled={isLoading}
                      />
                      Remember me
                    </label>

                    <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="link"
                          type="button"
                          className="px-0 h-auto text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700"
                        >
                          Forgot password?
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <div className="flex items-start gap-3 mb-2">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
                              <KeyRound className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <DialogTitle>Reset password</DialogTitle>
                              <DialogDescription className="mt-1">
                                Enter your email and we'll send you a reset link.
                              </DialogDescription>
                            </div>
                          </div>
                        </DialogHeader>
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                          <FieldWithIcon
                            id="forgot-email"
                            label="Email"
                            icon={Mail}
                            type="email"
                            autoComplete="username"
                            placeholder="you@example.com"
                            value={forgotPasswordEmail}
                            onChange={setForgotPasswordEmail}
                            disabled={forgotPasswordLoading}
                          />
                          <Button
                            type="submit"
                            className="w-full h-11 gap-2 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 shadow-md shadow-blue-500/25 text-white"
                            disabled={forgotPasswordLoading}
                          >
                            {forgotPasswordLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                Send reset link
                                <ArrowRight className="h-4 w-4" />
                              </>
                            )}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 gap-2 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 shadow-lg shadow-blue-500/30 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  <FieldWithIcon
                    id="signup-name"
                    label="Full Name"
                    icon={UserIcon}
                    type="text"
                    autoComplete="name"
                    placeholder="John Doe"
                    value={signupName}
                    onChange={setSignupName}
                    disabled={isLoading}
                    error={signupErrors.fullName}
                  />
                  <FieldWithIcon
                    id="signup-email"
                    label="Email"
                    icon={Mail}
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={signupEmail}
                    onChange={setSignupEmail}
                    disabled={isLoading}
                    error={signupErrors.email}
                  />
                  <FieldWithIcon
                    id="signup-password"
                    label="Password"
                    icon={Lock}
                    type={showSignupPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Choose a password"
                    value={signupPassword}
                    onChange={setSignupPassword}
                    disabled={isLoading}
                    error={signupErrors.password}
                    trailing={
                      <PasswordToggle
                        show={showSignupPassword}
                        onToggle={() => setShowSignupPassword((s) => !s)}
                      />
                    }
                  />
                  <PasswordChecklist checks={passwordChecks} value={signupPassword} />
                  <FieldWithIcon
                    id="signup-confirm"
                    label="Confirm Password"
                    icon={Lock}
                    type={showSignupPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    value={signupConfirmPassword}
                    onChange={setSignupConfirmPassword}
                    disabled={isLoading}
                    error={signupErrors.confirmPassword}
                  />
                  <Button
                    type="submit"
                    className="w-full h-11 gap-2 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 shadow-lg shadow-blue-500/30 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              <p className="text-center text-[11px] text-muted-foreground pt-2">
                By continuing, you agree to our{" "}
                <span className="underline-offset-2 hover:underline cursor-pointer">
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="underline-offset-2 hover:underline cursor-pointer">
                  Privacy Policy
                </span>
                .
              </p>
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mobile hero (mobile only)

function MobileHero() {
  return (
    <div className="lg:hidden relative bg-gradient-to-br from-blue-900 via-slate-900 to-slate-900 text-white px-5 sm:px-8 pt-9 pb-24 flex flex-col items-center text-center overflow-hidden">
      {/* Decorative dot grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />
      {/* Subtle accent blurs */}
      <div
        aria-hidden
        className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-blue-500/20 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute -bottom-20 -left-16 w-56 h-56 rounded-full bg-sky-500/15 blur-3xl pointer-events-none"
      />

      {/* Logo */}
      <div className="relative flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
          <img src={logoWhiteSvg} alt="" className="h-8 w-8" />
        </div>
        <div className="text-left">
          <p className="text-base font-bold leading-tight">ProductionPortal</p>
          <p className="text-[10px] text-white/60 leading-tight uppercase tracking-[0.14em]">
            by WovenTex
          </p>
        </div>
      </div>

      {/* Headline */}
      <h2 className="relative mt-6 text-[26px] font-bold tracking-tight leading-[1.1] text-balance max-w-sm">
        Run your factory floor in real time.
      </h2>

      {/* Description (mirrors desktop brand panel copy) */}
      <p className="relative mt-3 text-sm text-white/75 leading-relaxed max-w-sm text-pretty">
        Daily output, QC sign-offs, dispatches, and team workflows in one place.
        A single source of truth from the first stitch to the loading bay.
      </p>
    </div>
  );
}

// Brand panel (desktop only)

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 text-white">
      {/* Decorative blurs */}
      <div
        aria-hidden
        className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-amber-400/20 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-blue-400/20 blur-3xl pointer-events-none"
      />
      {/* Dot grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center">
            <img src={logoWhiteSvg} alt="" className="h-8 w-8" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight leading-tight">
              ProductionPortal
            </p>
            <p className="text-[11px] text-white/60 leading-tight uppercase tracking-[0.14em]">
              by WovenTex
            </p>
          </div>
        </div>

        {/* Headline + floating stat cards */}
        <div className="space-y-10">
          <div>
            <h2 className="text-3xl xl:text-4xl font-bold tracking-tight leading-[1.1] text-balance">
              Run your factory floor in real time.
            </h2>
            <p className="text-base text-white/70 mt-4 max-w-md leading-relaxed">
              Daily output, QC sign-offs, dispatches, and team workflows in one
              place. A single source of truth from the first stitch to the loading bay.
            </p>
          </div>

          <DashboardPreview />
        </div>

        {/* Bottom value props */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/70">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Mobile-first
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Real-time updates
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Audit-ready PDFs
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Multi-line
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPreview() {
  const bars = [42, 58, 51, 70, 64, 82, 76, 95];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Now"];

  return (
    <div className="relative max-w-md">
      {/* Decorative layered card behind */}
      <div
        aria-hidden
        className="absolute -inset-0.5 translate-x-3 translate-y-3 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 pointer-events-none"
      />

      {/* Main panel */}
      <div className="relative rounded-2xl bg-white/[0.07] backdrop-blur-xl ring-1 ring-white/15 shadow-2xl shadow-black/40 p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
              Production today
            </span>
          </div>
          <span className="text-[10px] text-white/40">Updated 12s ago</span>
        </div>

        {/* Hero number */}
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">
            Output
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="font-mono text-4xl xl:text-5xl font-bold tabular-nums tracking-tight">
              12,450
            </p>
            <span className="text-base text-white/60 font-medium">pcs</span>
            <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 bg-emerald-500/15 ring-1 ring-emerald-400/30 rounded-md px-1.5 py-0.5">
              <TrendingUp className="h-3 w-3" />
              +8.2%
            </span>
          </div>
        </div>

        {/* Bars */}
        <div className="mt-5">
          <div className="flex items-end gap-1.5 h-16">
            {bars.map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className={cn(
                  "flex-1 rounded-sm transition-all",
                  i === bars.length - 1
                    ? "bg-gradient-to-t from-emerald-500 to-emerald-300 shadow-md shadow-emerald-500/40"
                    : "bg-white/15"
                )}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[9px] font-medium text-white/40 tabular-nums">
            {days.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>

        {/* Mini stat grid */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <PreviewStat icon={ShieldCheck} label="QC pass" value="97.2%" />
          <PreviewStat icon={Clock} label="On-time" value="94%" />
          <PreviewStat icon={Activity} label="Lines" value="6 / 8" />
        </div>
      </div>

      {/* Auxiliary floating card (lower-right) */}
      <div className="absolute -bottom-6 -right-4 xl:-right-8 w-56 rounded-xl bg-white/10 backdrop-blur-xl ring-1 ring-white/20 shadow-xl shadow-black/30 p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shadow-md shrink-0 bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/40">
          <Truck className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.12em] font-semibold text-white/60 leading-tight">
            Ready to ship
          </p>
          <p className="font-mono text-sm font-bold tabular-nums leading-tight mt-0.5">
            3,800 <span className="text-white/70 font-medium">pcs</span>
          </p>
        </div>
      </div>

      {/* Auxiliary floating card (upper-right, hangs off the edge) */}
      <div className="hidden xl:flex absolute -top-4 -right-6 w-48 rounded-xl bg-white/10 backdrop-blur-xl ring-1 ring-white/20 shadow-xl shadow-black/30 p-2.5 items-center gap-2.5">
        <div className="h-8 w-8 rounded-md flex items-center justify-center shadow-md shrink-0 bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/40">
          <Boxes className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.12em] font-semibold text-white/60 leading-tight">
            Active orders
          </p>
          <p className="font-mono text-sm font-bold tabular-nums leading-tight mt-0.5">
            14
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.04] ring-1 ring-white/10 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-white/50">
        <Icon className="h-3 w-3" />
        <p className="text-[9px] uppercase tracking-[0.12em] font-semibold">
          {label}
        </p>
      </div>
      <p className="font-mono text-base font-bold tabular-nums mt-1">{value}</p>
    </div>
  );
}

// Form helpers

function FieldWithIcon({
  id,
  label,
  icon: Icon,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  disabled,
  error,
  trailing,
}: {
  id: string;
  label: string;
  icon: typeof Mail;
  type: string;
  autoComplete?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          name={id}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-11 pl-10 pr-3 transition-shadow",
            trailing && "pr-11",
            error && "border-destructive focus-visible:ring-destructive/30"
          )}
          disabled={disabled}
        />
        {trailing && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            {trailing}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <X className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "Hide password" : "Show password"}
      className="h-9 w-9 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      tabIndex={-1}
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function PasswordChecklist({
  checks,
  value,
}: {
  checks: { length: boolean; lower: boolean; upper: boolean; digit: boolean };
  value: string;
}) {
  // Only render once the user has started typing, keeps the form clean.
  if (!value) return null;
  const items: Array<[boolean, string]> = [
    [checks.length, "8+ characters"],
    [checks.upper, "Uppercase letter"],
    [checks.lower, "Lowercase letter"],
    [checks.digit, "Number"],
  ];
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
      {items.map(([ok, label]) => (
        <div
          key={label}
          className={cn(
            "flex items-center gap-1.5 text-[11px] transition-colors",
            ok ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"
          )}
        >
          {ok ? (
            <Check className="h-3 w-3 shrink-0" />
          ) : (
            <X className="h-3 w-3 shrink-0 opacity-50" />
          )}
          {label}
        </div>
      ))}
    </div>
  );
}
