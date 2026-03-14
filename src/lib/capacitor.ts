/**
 * Capacitor utilities for native mobile functionality
 * Handles deep links, push notifications, and native features
 */

import { Capacitor } from '@capacitor/core';

// Check if running as native app
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios', 'android', or 'web'

// Deep link scheme for the app
export const APP_SCHEME = 'productionportal';
export const APP_HOST = 'app';

/**
 * Parse auth tokens from URL hash/search
 */
function parseAuthTokens(url: URL): { accessToken?: string; refreshToken?: string; type?: string } {
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  const searchParams = url.searchParams;

  return {
    accessToken: hashParams.get('access_token') || searchParams.get('access_token') || undefined,
    refreshToken: hashParams.get('refresh_token') || searchParams.get('refresh_token') || undefined,
    type: hashParams.get('type') || searchParams.get('type') || undefined,
  };
}

/**
 * Handle Supabase auth deep links
 */
async function handleAuthDeepLink(url: URL) {
  const { accessToken, refreshToken, type } = parseAuthTokens(url);

  // Password recovery flow - ALWAYS redirect to reset-password screen
  if (type === 'recovery') {
    // Set flag to enforce password reset before accessing app
    sessionStorage.setItem('pp_force_password_reset', '1');
    
    // Build the reset password URL with all tokens
    const resetUrl = `/reset-password${url.search}${url.hash}`;
    window.location.href = resetUrl;
    return;
  }

  // Magic link / email confirmation
  if (type === 'magiclink' || type === 'signup' || type === 'invite') {
    if (accessToken && refreshToken) {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        // Navigate to home after successful auth
        window.location.href = '/';
      } catch (error) {
        console.error('Failed to set session from deep link:', error);
        window.location.href = '/auth';
      }
    } else {
      window.location.href = '/auth';
    }
    return;
  }

  // Regular auth callback with tokens
  if (accessToken && refreshToken) {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      window.location.href = '/';
    } catch (error) {
      console.error('Failed to set session from deep link:', error);
      window.location.href = '/auth';
    }
    return;
  }

  // Fallback - just navigate to the path
  window.location.href = url.pathname + url.search;
}

/**
 * Initialize Capacitor plugins and listeners
 */
export async function initializeCapacitor() {
  if (!isNative) {
    // For web, still handle URL-based auth on page load
    handleWebAuthOnLoad();
    return;
  }

  try {
    const { App } = await import('@capacitor/app');
    
    // Configure status bar for proper safe area handling
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // iOS: we must extend the WebView behind the status bar + home indicator
      // otherwise the native window background can show through as black during overscroll.
      await StatusBar.setOverlaysWebView({ overlay: platform === 'ios' });

      // Style.Dark = dark icons/text (for light backgrounds)
      // Style.Light = light icons/text (for dark backgrounds)
      const applyStatusBarStyle = async (isDark: boolean) => {
        await StatusBar.setStyle({ style: isDark ? Style.Light : Style.Dark });
        if (platform === 'android') {
          await StatusBar.setBackgroundColor({ color: isDark ? '#0a0a0a' : '#f1f3f5' });
        }
      };

      await applyStatusBarStyle(document.documentElement.classList.contains('dark'));

      // Update status bar whenever the theme class changes
      const observer = new MutationObserver(() => {
        applyStatusBarStyle(document.documentElement.classList.contains('dark'));
      });
      observer.observe(document.documentElement, { attributeFilter: ['class'] });

      console.log('StatusBar configured successfully');
    } catch (statusBarError) {
      console.warn('StatusBar plugin not available:', statusBarError);
    }

    // Handle deep links for auth
    App.addListener('appUrlOpen', async (event) => {
      console.log('App URL Open:', event.url);
      
      try {
        const url = new URL(event.url);
        
        // Check for auth-related deep links
        const isAuthCallback = 
          url.pathname.includes('/auth/callback') ||
          url.pathname.includes('/reset-password') ||
          url.hash.includes('access_token') ||
          url.hash.includes('type=recovery') ||
          url.searchParams.has('type');

        if (isAuthCallback) {
          await handleAuthDeepLink(url);
          return;
        }

        // Handle other deep links - navigate to the path
        const path = url.pathname + url.search + url.hash;
        if (path && path !== '/') {
          window.location.href = path;
        }
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    });

    // Handle app state changes
    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        console.log('App became active');
        
        // Trigger sync when app comes to foreground
        try {
          const { processQueue, hasPendingSubmissions } = await import('@/lib/offline-queue');
          if (navigator.onLine && hasPendingSubmissions()) {
            await processQueue();
          }
        } catch (error) {
          console.warn('Failed to sync on app active:', error);
        }
      }
    });

    // Handle Android back button
    App.addListener('backButton', ({ canGoBack }) => {
      if (!canGoBack) {
        App.exitApp();
      } else {
        window.history.back();
      }
    });

    console.log('Capacitor initialized for platform:', platform);
  } catch (error) {
    console.warn('Capacitor plugins not available:', error);
  }
}

/**
 * Handle auth tokens in URL on web page load
 */
function handleWebAuthOnLoad() {
  const url = new URL(window.location.href);
  const { type } = parseAuthTokens(url);

  // If recovery type is present, ensure we're on reset-password page
  if (type === 'recovery' && !window.location.pathname.includes('/reset-password')) {
    sessionStorage.setItem('pp_force_password_reset', '1');
    window.location.href = `/reset-password${url.search}${url.hash}`;
  }
}

/**
 * Initialize push notifications
 */
export async function initializePushNotifications() {
  if (!isNative) return null;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Check current permission status
    const permStatus = await PushNotifications.checkPermissions();
    
    if (permStatus.receive === 'prompt') {
      // Request permission
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') {
        console.log('Push notification permission denied');
        return null;
      }
    } else if (permStatus.receive !== 'granted') {
      console.log('Push notifications not permitted');
      return null;
    }

    // Register for push notifications
    // Wrapped in try/catch because register() crashes at native level
    // if google-services.json / Firebase is not configured
    try {
      await PushNotifications.register();
    } catch (registerError) {
      console.warn('Push notification registration failed (Firebase may not be configured):', registerError);
      return null;
    }

    // Handle registration success
    PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration success:', token.value);
      await savePushToken(token.value);
    });

    // Handle registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });

    // Handle received push notification (foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification);
      // Could show an in-app toast or banner here
    });

    // Handle notification tap
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push notification action:', action);
      const data = action.notification.data;
      
      // Navigate based on notification type
      if (data?.url) {
        window.location.href = data.url;
      } else if (data?.type === 'blocker') {
        window.location.href = '/blockers';
      } else if (data?.type === 'missing_update') {
        window.location.href = '/today';
      }
    });

    return permStatus;
  } catch (error) {
    console.warn('Push notifications not available:', error);
    return null;
  }
}

/**
 * Save push token to backend
 */
async function savePushToken(token: string) {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (user) {
      // Store token - you may want to create a separate table for push tokens
      // to support multiple devices per user
      console.log('Push token for user', user.id, ':', token);
      
      // TODO: Implement push token storage when the column/table is added
      // await supabase.from('push_tokens').upsert({
      //   user_id: user.id,
      //   token,
      //   platform,
      //   updated_at: new Date().toISOString(),
      // });
    }
  } catch (error) {
    console.error('Failed to save push token:', error);
  }
}

/**
 * Get app info
 */
export async function getAppInfo() {
  if (!isNative) return null;

  try {
    const { App } = await import('@capacitor/app');
    return await App.getInfo();
  } catch {
    return null;
  }
}

/**
 * Share content using native share sheet
 */
export async function shareContent(title: string, text: string, url?: string) {
  if (!isNative) {
    // Fallback to Web Share API
    if (navigator.share) {
      await navigator.share({ title, text, url });
    }
    return;
  }

  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({
      title,
      text,
      url,
      dialogTitle: 'Share',
    });
  } catch (error) {
    console.warn('Share failed:', error);
  }
}

/**
 * Haptic feedback
 */
export async function hapticFeedback(style: 'light' | 'medium' | 'heavy' = 'medium') {
  if (!isNative) return;

  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');

    const impactStyle = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    }[style];

    await Haptics.impact({ style: impactStyle });
  } catch {
    // Haptics not available
  }
}

/**
 * Get safe area insets for notched devices
 */
export function getSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('--safe-area-inset-top') || '0', 10),
    right: parseInt(style.getPropertyValue('--safe-area-inset-right') || '0', 10),
    bottom: parseInt(style.getPropertyValue('--safe-area-inset-bottom') || '0', 10),
    left: parseInt(style.getPropertyValue('--safe-area-inset-left') || '0', 10),
  };
}

/**
 * Get the correct redirect URL for Supabase auth based on platform
 */
export function getAuthRedirectUrl(path: string = '/'): string {
  if (isNative) {
    // Use deep link scheme for native apps
    return `${APP_SCHEME}://${APP_HOST}${path}`;
  }
  // Use web origin for PWA/web
  return `${window.location.origin}${path}`;
}

/**
 * Get the correct password reset redirect URL
 */
export function getPasswordResetRedirectUrl(): string {
  return getAuthRedirectUrl('/reset-password');
}

/**
 * Check if running in Tauri desktop app (works with Tauri 2.x)
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Tauri 2.x uses __TAURI_INTERNALS__ instead of __TAURI__
  const hasTauri2 = !!(window as any).__TAURI_INTERNALS__;
  // Tauri 1.x fallback
  const hasTauri1 = !!(window as any).__TAURI__;
  
  return hasTauri2 || hasTauri1;
}

/**
 * Open an external URL - works in Tauri, Capacitor, and web
 */
export async function openExternalUrl(url: string): Promise<void> {
  // Tauri desktop app
  if (isTauri()) {
    try {
      // Dynamic import with error handling for web environments
      const shellModule = await import('@tauri-apps/plugin-shell').catch(() => null);
      if (shellModule?.open) {
        await shellModule.open(url);
        return;
      }
    } catch (error) {
      console.warn('Tauri shell open failed, falling back to window.open:', error);
    }
  }

  // Web/PWA fallback
  window.open(url, '_blank', 'noopener,noreferrer');
}
