# Roavly iPhone beta

This native Expo/React Native client uses the same Roavly accounts, posts,
friends, comments and conversations as the hosted web app.

## Local development

1. Copy `.env.example` to `.env`.
2. Set `ROAVLY_GOOGLE_MAPS_IOS_KEY` to an iOS-restricted Google Maps key.
3. Run `npm install`.
4. Run `npm run ios` for a simulator, or create an Expo development build for a
   physical iPhone.

The sign-in callback uses the `roavly://auth` scheme and therefore needs a
development or TestFlight build rather than Expo Go.

## TestFlight

1. Enrol in the Apple Developer Program.
2. Create the `com.roavly.app` bundle identifier.
3. Add the project to an Expo account and set `EXPO_OWNER`.
4. Add the Google Maps iOS key as an EAS environment secret.
5. Run `eas build --platform ios --profile production`.
6. Run `eas submit --platform ios --profile production`.

Never commit Apple credentials, signing certificates or unrestricted API keys.
