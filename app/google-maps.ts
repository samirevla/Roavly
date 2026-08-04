type MapsConfig = {
  apiKey: string;
  mapId: string;
};

type RoavlyMapsWindow = Window & {
  __roavlyGoogleMapsReady?: () => void;
};

let mapsPromise: Promise<MapsConfig> | null = null;

function requiredLibrariesReady() {
  return Boolean(
    window.google?.maps?.Map &&
    window.google.maps.places?.PlaceAutocompleteElement &&
    window.google.maps.marker?.AdvancedMarkerElement,
  );
}

export function loadGoogleMaps(): Promise<MapsConfig> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser."));
  }
  if (mapsPromise) return mapsPromise;

  mapsPromise = (async () => {
    const response = await fetch("/api/maps/config");
    const payload = (await response.json()) as Partial<MapsConfig> & { error?: string };
    if (!response.ok || !payload.apiKey || !payload.mapId) {
      throw new Error(payload.error || "Maps could not load.");
    }

    if (!requiredLibrariesReady()) {
      await new Promise<void>((resolve, reject) => {
        const mapsWindow = window as RoavlyMapsWindow;
        const existing = document.querySelector<HTMLScriptElement>(
          'script[data-roavly-google-maps="true"]',
        );
        existing?.remove();

        const script = document.createElement("script");
        script.dataset.roavlyGoogleMaps = "true";
        const callbackName = "__roavlyGoogleMapsReady";
        const cleanup = () => {
          delete mapsWindow.__roavlyGoogleMapsReady;
        };
        mapsWindow.__roavlyGoogleMapsReady = () => {
          cleanup();
          if (requiredLibrariesReady()) resolve();
          else reject(new Error("Google Maps libraries did not initialise."));
        };
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(payload.apiKey!)}&v=weekly&loading=async&libraries=places,marker&callback=${callbackName}`;
        script.async = true;
        script.referrerPolicy = "origin";
        script.addEventListener(
          "error",
          () => {
            cleanup();
            script.remove();
            reject(new Error("Google Maps could not load."));
          },
          { once: true },
        );
        document.head.appendChild(script);
      });
    }

    if (!requiredLibrariesReady()) {
      throw new Error("Google Maps did not initialise.");
    }
    return { apiKey: payload.apiKey, mapId: payload.mapId };
  })().catch((error) => {
    mapsPromise = null;
    throw error;
  });

  return mapsPromise;
}
