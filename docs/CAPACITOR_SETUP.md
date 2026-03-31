# Native Apps Build Guide

## Stack Confirmation
- **Framework**: Vite + React 19 + TypeScript
- **Build Output**: `dist/` directory
- **Capacitor Config**: `capacitor.config.ts`

---

## Build Commands

### Web Build
```bash
npm run build
```

### Mobile (Capacitor)
```bash
# After first-time setup
npm run build
npx cap sync

# Run on iOS (requires Mac + Xcode)
npx cap run ios

# Run on Android (requires Android Studio)
npx cap run android

# Open in IDE for native debugging
npx cap open ios
npx cap open android
```

---

## First-Time Capacitor Setup

### 1. Clone
```bash
git clone <your-repo-url>
cd <repo-name>
npm install
```

### 2. Add Native Platforms
```bash
# Add iOS (Mac only)
npx cap add ios

# Add Android
npx cap add android
```

### 3. Build and Sync
```bash
npm run build
npx cap sync
```

### 4. Run on Device/Emulator
```bash
# iOS
npx cap run ios

# Android
npx cap run android
```

---

## Supabase URL Configuration

### Required Redirect URLs

Add these URLs in the Supabase dashboard under **Authentication → URL Configuration → Redirect URLs**:

#### Local Development
```
http://localhost:5173
http://localhost:5173/reset-password
http://localhost:5173/auth/callback
```

#### Production Web
```
https://your-custom-domain.com
https://your-custom-domain.com/reset-password
https://your-custom-domain.com/auth/callback
```

#### Mobile Deep Links
```
productionportal://app
productionportal://app/reset-password
productionportal://app/auth/callback
```

### Site URL
Set to your production web domain:
```
https://your-custom-domain.com
```

---

## Deep Link Configuration

### iOS (Required for Auth)

Edit `ios/App/App/Info.plist` and add:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.woventex.productionportal</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>productionportal</string>
    </array>
  </dict>
</array>
```

### Android (Required for Auth)

Edit `android/app/src/main/AndroidManifest.xml`, add inside `<activity>`:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="productionportal" android:host="app" />
</intent-filter>
```

---

## Offline Mode

### How It Works

1. **Automatic Detection**: Network status is monitored automatically
2. **Queue on Failure**: Form submissions are queued to localStorage when offline or network fails
3. **Auto-Sync**: Queue is processed when:
   - App comes online
   - App returns to foreground (native)
   - User manually triggers sync

### Supported Forms
- `sewing_targets` / `sewing_actuals`
- `finishing_targets` / `finishing_actuals` / `finishing_daily_sheets` / `finishing_hourly_logs`
- `cutting_targets` / `cutting_actuals`
- `storage_bin_cards`
- `production_updates_sewing` / `production_updates_finishing`

### UI Indicators
- **Network Status Icon**: Shows in header (Wifi/WifiOff)
- **Pending Count Badge**: Shows number of queued submissions
- **Sync Popover**: Click for details and manual sync button

### Queue Storage
- **Key**: `pp_offline_submission_queue`
- **Format**: JSON array of queued submissions
- **Max Retries**: 5 per submission

---

## Password Reset Flow

### Enforcement
1. Recovery links contain `type=recovery` parameter
2. On detection, `sessionStorage.pp_force_password_reset` is set to `"1"`
3. All routes redirect to `/reset-password` until password is updated
4. After successful reset, user signs out and must re-authenticate

### Deep Link Flow (Native)
1. User clicks reset link in email
2. Link opens app via `productionportal://app/reset-password?...`
3. Capacitor captures URL and routes to reset password screen
4. User sets new password → signed out → redirected to login

---

## Test Checklist

### Offline Submissions
- [ ] Turn off WiFi/data
- [ ] Submit a sewing morning target form
- [ ] Verify "Saved for later" toast appears
- [ ] Verify pending count badge shows in header
- [ ] Turn WiFi back on
- [ ] Verify "Back online" toast appears
- [ ] Verify submission syncs automatically
- [ ] Verify pending count returns to 0
- [ ] Check database for submitted record

### Auth Deep Links (Native Only)
- [ ] Send password reset email
- [ ] Click link on device → app opens to reset screen
- [ ] Verify cannot navigate away from reset screen
- [ ] Enter new password → verify success
- [ ] Verify redirected to login
- [ ] Login with new password → verify success

### Auth Deep Links (Web/PWA)
- [ ] Send password reset email
- [ ] Click link → opens reset password page
- [ ] Verify type=recovery forces reset-password route
- [ ] Enter new password → verify redirect to /auth?reset=success
- [ ] Login with new password

### Network Status UI
- [ ] Go offline → verify WifiOff icon appears
- [ ] Submit form offline → verify pending badge
- [ ] Click indicator → verify popover shows queue details
- [ ] Click "Sync Now" when online → verify sync happens
- [ ] Verify failed submissions can be retried or cleared

### Native Features (Capacitor)
- [ ] App installs and launches
- [ ] Back button works correctly (Android)
- [ ] App state changes trigger queue sync
- [ ] Share functionality works
- [ ] Safe area insets applied correctly

---

## Production Builds

### iOS Release
```bash
npm run build
npx cap sync ios
npx cap open ios
# In Xcode: Product → Archive → Distribute App
```

### Android Release
```bash
npm run build
npx cap sync android
npx cap open android
# In Android Studio: Build → Generate Signed Bundle/APK
```

### PWA
The app is already PWA-ready with:
- `public/manifest.json` - App manifest
- `public/sw.js` - Service worker for offline caching
- Offline queue for form submissions

Users can install via browser menu (Share → Add to Home Screen).

---

## Troubleshooting

### "Network error" on all submissions
- Check Supabase URL in environment
- Verify CORS settings allow your domain
- Check if service worker is intercepting incorrectly

### Deep links not working
- Verify URL scheme in native configs matches `productionportal`
- Ensure redirect URLs are added in Supabase dashboard
- Check native app is registered for the scheme

### Offline queue not syncing
- Verify user is authenticated
- Check localStorage for `pp_offline_submission_queue`
- Try manual sync via popover
- Check console for sync errors

### Password reset loop
- Clear `sessionStorage.pp_force_password_reset`
- Navigate to `/auth` directly
- Re-request password reset if needed
