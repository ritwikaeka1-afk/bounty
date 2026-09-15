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

## Release checklist

1. Confirm `https://joinbounty.dev` is live and its HTTPS certificate is valid.
2. In Supabase Auth, add `https://joinbounty.dev/**` to redirect URLs.
3. Configure Apple Push Notification service and Firebase Cloud Messaging before enabling native push delivery.
4. In Xcode, select the paid Apple Developer team and set the final bundle identifier.
5. In Android Studio, create the upload keystore and set the final application ID.
6. Test sign-in, messaging, notifications, and 30-minute inactivity logout on real devices before submitting to TestFlight or Play internal testing.

