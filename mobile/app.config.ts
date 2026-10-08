import type { ExpoConfig } from "expo/config";

const googleMapsKey = process.env.ROAVLY_GOOGLE_MAPS_IOS_KEY;

const config: ExpoConfig = {
  name: "Waymark",
  slug: "roavly",
  owner: process.env.EXPO_OWNER,
  version: "0.1.0",
  orientation: "portrait",
  scheme: "roavly",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "com.roavly.app",
    buildNumber: "1",
    supportsTablet: false,
    config: googleMapsKey ? { googleMapsApiKey: googleMapsKey } : undefined,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription:
        "Waymark uses your photo library so you can share photos from your outdoor journeys.",
      NSCameraUsageDescription:
        "Waymark uses the camera so you can capture and share outdoor journeys.",
      NSLocationWhenInUseUsageDescription:
        "Waymark uses your location only when you choose a place or explore nearby outdoor journeys.",
    },
  },
  plugins: [
    [
      "expo-image-picker",
      {
        photosPermission:
          "Choose outdoor photos to share with the Waymark community.",
        cameraPermission:
          "Take outdoor photos to share with the Waymark community.",
      },
    ],
    [
      "expo-secure-store",
      {
        faceIDPermission:
          "Allow Waymark to securely access your signed-in account.",
      },
    ],
  ],
  extra: {
    apiBaseUrl:
      process.env.EXPO_PUBLIC_ROAVLY_API_URL ||
      "https://roavly-staging.ssemsedinovski.workers.dev",
  },
};

export default config;
