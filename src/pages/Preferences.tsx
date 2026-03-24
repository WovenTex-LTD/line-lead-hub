import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { TerminateAccountDialog } from "@/components/TerminateAccountDialog";
import { SignatureModal } from "@/components/SignatureModal";
import { useUserSignature } from "@/hooks/useUserSignature";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, UserCog, Bell, Palette, Globe, Sun, Moon, Monitor, AlertTriangle, User, KeyRound, Eye, EyeOff, PenLine, Trash2 } from "lucide-react";

type Language = 'en' | 'bn' | 'zh';

const LANGUAGES = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'bn', label: 'বাংলা', nativeLabel: 'Bangla' },
  { value: 'zh', label: '中文', nativeLabel: 'Chinese' },
] as const;

export default function Preferences() {
  const { t, i18n } = useTranslation();
  const { user, profile, loading, factory, isAdminOrHigher } = useAuth();

  const location = useLocation();
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('app-language') as Language) || 'en';
  });
  const [mounted, setMounted] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const { signature, deleteSignature } = useUserSignature();

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user || !fullName.trim()) { toast.error(t('modals.nameRequired')); return; }
    setProfileSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: fullName.trim(), phone: phone.trim() || null }).eq('id', user.id);
      if (error) throw error;
      toast.success(t('modals.profileUpdated'));
      setEditingProfile(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('modals.failedToUpdateProfile'));
    } finally { setProfileSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!user || !currentPassword || !newPassword) return;
    if (newPassword.length < 8) { toast.error(t('modals.newPasswordMinLength')); return; }
    if (newPassword !== confirmPassword) { toast.error(t('modals.newPasswordsDontMatch')); return; }
    setPasswordSaving(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email!, password: currentPassword });
      if (signInError) { toast.error(t('modals.currentPasswordIncorrect')); return; }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t('modals.passwordUpdated'));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setEditingPassword(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('modals.failedToUpdatePassword'));
    } finally { setPasswordSaving(false); }
  };

  useEffect(() => {
    if (location.hash === '#notifications' && notificationsRef.current) {
      notificationsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash]);

  const handleLanguageChange = (value: Language) => {
    setLanguage(value);
    localStorage.setItem('app-language', value);
    i18n.changeLanguage(value);
  };

  useEffect(() => { setMounted(true); }, []);

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!profile?.factory_id) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <Card className="max-w-md"><CardContent className="pt-6"><p className="text-center text-muted-foreground">{t('preferences.needFactory')}</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-500/10 flex items-center justify-center">
          <UserCog className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t('preferences.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('preferences.description')}</p>
        </div>
      </div>

      {/* ═══ Account ═══ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{t('modals.profileAndSecurity')}</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent ml-2" />
        </div>

        {/* Profile info */}
        <Card className="border-border/50">
          <CardContent className="pt-5">
            {!editingProfile ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">{t('modals.name')}</span>
                  <span className="text-sm font-medium">{profile?.full_name}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">{t('modals.email')}</span>
                  <span className="text-sm font-medium">{user?.email}</span>
                </div>
                {profile?.phone && (
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <span className="text-sm text-muted-foreground">{t('modals.phone')}</span>
                    <span className="text-sm font-medium">{profile.phone}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Factory</span>
                  <span className="text-sm font-medium">{factory?.name || '—'}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)} className="mt-2">
                  {t('modals.editProfile')}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t('modals.fullName')}</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('modals.fullNamePlaceholder')} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t('modals.phone')}</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('modals.phonePlaceholder')} className="h-9" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveProfile} disabled={profileSaving || !fullName.trim()}>
                    {profileSaving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> {t('modals.saving')}</> : t('modals.save')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingProfile(false); setFullName(profile?.full_name || ''); setPhone(profile?.phone || ''); }}>
                    {t('modals.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Password */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 shadow-md shadow-slate-500/20 flex items-center justify-center">
                <KeyRound className="h-3.5 w-3.5 text-white" />
              </div>
              {t('modals.changePassword')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!editingPassword ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('modals.password')}: ••••••••</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditingPassword(true)}>
                  {t('modals.changePassword')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t('modals.currentPassword')}</Label>
                  <div className="relative">
                    <Input type={showCurrentPassword ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t('modals.currentPasswordPlaceholder')} className="h-9 pr-10" />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                      {showCurrentPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t('modals.newPassword')}</Label>
                  <div className="relative">
                    <Input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('modals.newPasswordPlaceholder')} className="h-9 pr-10" />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t('modals.confirmNewPassword')}</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t('modals.confirmNewPasswordPlaceholder')} className="h-9" />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-[11px] text-destructive">{t('modals.passwordsDontMatch')}</p>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleChangePassword} disabled={passwordSaving || !currentPassword || !newPassword || newPassword !== confirmPassword}>
                    {passwordSaving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> {t('modals.updatingPassword')}</> : t('modals.updatePassword')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}>
                    {t('modals.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Approval Signature (admin/owner only) ═══ */}
      {isAdminOrHigher() && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <PenLine className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Approval Signature</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent ml-2" />
          </div>

          <Card className="border-border/50">
            <CardContent className="pt-5">
              {signature ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-white p-4">
                    <img
                      src={signature.signature_url}
                      alt="Your approval signature"
                      className="w-full max-h-32 object-contain"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This signature is embedded in approved gate pass PDFs.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSigModalOpen(true)}>
                      <PenLine className="h-3.5 w-3.5 mr-1.5" />
                      Update Signature
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        try {
                          await deleteSignature.mutateAsync();
                          toast.success("Signature removed.");
                        } catch {
                          toast.error("Failed to remove signature.");
                        }
                      }}
                      disabled={deleteSignature.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No signature registered. Register your signature to approve gate dispatch requests. It will be embedded in the signed gate pass PDF.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setSigModalOpen(true)}>
                    <PenLine className="h-3.5 w-3.5 mr-1.5" />
                    Register Signature
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ Display ═══ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Palette className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{t('preferences.displaySettings')}</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent ml-2" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Theme */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t('preferences.theme')}</CardTitle>
            </CardHeader>
            <CardContent>
              {mounted && (
                <RadioGroup value={theme} onValueChange={setTheme} className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'light', icon: Sun, label: t('preferences.light') },
                    { value: 'dark', icon: Moon, label: t('preferences.dark') },
                    { value: 'system', icon: Monitor, label: t('preferences.system') },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <Label
                        key={opt.value}
                        htmlFor={`theme-${opt.value}`}
                        className={`flex flex-col items-center justify-center rounded-lg border-2 p-3 cursor-pointer transition-all ${
                          theme === opt.value ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-border'
                        }`}
                      >
                        <RadioGroupItem value={opt.value} id={`theme-${opt.value}`} className="sr-only" />
                        <Icon className="h-5 w-5 mb-1.5 text-muted-foreground" />
                        <span className="text-xs font-medium">{opt.label}</span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              )}
            </CardContent>
          </Card>

          {/* Language */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                {t('preferences.language')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('preferences.language')} />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      <span className="flex items-center gap-2">
                        <span>{lang.label}</span>
                        {lang.value !== 'en' && <span className="text-muted-foreground">({lang.nativeLabel})</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-2">{t('preferences.languageDescription')}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ Notifications ═══ */}
      <div className="space-y-4" ref={notificationsRef} id="notifications">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{t('preferences.notifications')}</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent ml-2" />
        </div>

        <Card className="border-border/50">
          <CardContent className="pt-5">
            <NotificationPreferences />
          </CardContent>
        </Card>
      </div>

      {/* ═══ Danger Zone ═══ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-destructive">{t('modals.dangerZone')}</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-destructive/20 to-transparent ml-2" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <div>
            <p className="text-sm font-medium">{t('modals.terminateAccount')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('modals.terminateActionPermanent')}</p>
          </div>
          <TerminateAccountDialog />
        </div>
      </div>

      <SignatureModal open={sigModalOpen} onOpenChange={setSigModalOpen} />
    </div>
  );
}
