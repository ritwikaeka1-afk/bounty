# Bounty for iOS and Android

This repository uses Capacitor to provide native iOS and Android shells for the Bounty service at `https://joinbounty.dev`. The web service remains the single source of truth for accounts, bounties, and messaging.

## Local prerequisites

- Node.js 20 or later
- macOS with Xcode for iOS builds
- Android Studio with the Android SDK for Android builds
- An Apple Developer account for TestFlight and the App Store
- A Google Play Console account for internal testing and Google Play

## Set up native projects

```bash
npm install
npm run native:prepare
npx cap open ios
npx cap open android
```

Run `npm run native:prepare` once after cloning to create the `ios/` and `android/` projects, and again whenever Capacitor dependencies or native assets change. The native shells intentionally point to the canonical HTTPS service, so users always receive the same current Bounty interface and backend as the website.

## Open website links in the app

Android App Links are added automatically by `npm run native:prepare`. Before a release, set `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT` in Azure to the SHA-256 certificate fingerprint used to sign the release, then verify that `https://joinbounty.dev/.well-known/assetlinks.json` returns the association file. When Google Play App Signing is enabled, use the Play **App signing key certificate** fingerprint; during local release testing, include the upload-key fingerprint too, separated by a comma.

For iOS, in Xcode select the App target, add the **Associated Domains** capability, and add `applinks:joinbounty.dev`. Set `APPLE_APP_TEAM_ID` in Azure to your Apple Developer Team ID. Then verify that `https://joinbounty.dev/.well-known/apple-app-site-association` returns the association file. Website visitors without the app continue to use the website normally.

## Release checklist

1. Confirm `https://joinbounty.dev` is live and its HTTPS certificate is valid.
2. In Supabase Auth, add both `https://joinbounty.dev/**` and `bounty://auth/callback` to redirect URLs.
3. Configure Apple Push Notification service and Firebase Cloud Messaging before enabling native push delivery.
4. In Xcode, select the paid Apple Developer team and set the final bundle identifier.
5. In Android Studio, create the upload keystore and set the final application ID.
6. Test sign-in, messaging, notifications, and 30-minute inactivity logout on real devices before submitting to TestFlight or Play internal testing.

