# Waymark iPhone beta

Native Expo/React Native client for the same Waymark accounts, journeys, friends,
comments and conversations as the web app.

**API (staging):** `https://roavly-staging.ssemsedinovski.workers.dev`

Deep link scheme is still `roavly://auth` (Expo Go cannot complete sign-in — use a
dev or TestFlight build).

## Local development

1. Copy `.env.example` to `.env`.
2. Set `ROAVLY_GOOGLE_MAPS_IOS_KEY` to an **iOS-restricted** Google Maps key
   (bundle id `com.roavly.app`).
3. Optionally set `EXPO_OWNER` to your Expo username/org.
4. Run `npm install`.
5. Run `npm run ios` (simulator) or an EAS development build on a physical iPhone.

## TestFlight checklist

### You (Apple / Expo / Google)

1. Enrol in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr).
2. In Certificates, Identifiers & Profiles, register bundle id **`com.roavly.app`**.
3. Create the app in [App Store Connect](https://appstoreconnect.apple.com) (same bundle id).
4. Create/login an [Expo](https://expo.dev) account; note your username for `EXPO_OWNER`.
5. Create a Google Maps API key restricted to **iOS apps** → bundle `com.roavly.app`.
6. In EAS, set secrets/env for production:
   - `EXPO_PUBLIC_ROAVLY_API_URL` = `https://roavly-staging.ssemsedinovski.workers.dev`
   - `ROAVLY_GOOGLE_MAPS_IOS_KEY` = (iOS key)
   - `EXPO_OWNER` = your Expo account

### Build & submit

```bash
cd mobile
npx eas-cli login
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

Then add TestFlight internal testers in App Store Connect.

### App Store listing (before public release)

- Screenshots (6.7" and 6.1" iPhone)
- Privacy policy URL + App Privacy answers
- Support URL, age rating, category
- Review notes + a test account

Never commit Apple credentials, signing certificates, or unrestricted API keys.
