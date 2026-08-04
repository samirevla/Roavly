import { getChatGPTUser } from "../../../../chatgpt-auth";

export const dynamic = "force-dynamic";

type PlacesEnvironment = {
  GOOGLE_MAPS_API_KEY?: string;
};

type GooglePlacesResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }>;
  error?: { message?: string };
};

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Sign in to search locations." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as { query?: string };
  const query = payload.query?.trim().slice(0, 120) || "";
  if (query.length < 2) {
    return Response.json({ places: [] });
  }

  const { env } = await import("cloudflare:workers");
  const apiKey = (env as unknown as PlacesEnvironment).GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "Location search is temporarily unavailable." },
      { status: 503 },
    );
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask":
        "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 6,
      languageCode: "en",
    }),
  });
  const result = (await response.json()) as GooglePlacesResponse;
  if (!response.ok) {
    return Response.json(
      { error: result.error?.message || "Google location search could not load." },
      { status: 502 },
    );
  }

  const places = (result.places ?? []).flatMap((place) => {
    if (
      !place.id ||
      !place.formattedAddress ||
      typeof place.location?.latitude !== "number" ||
      typeof place.location?.longitude !== "number"
    ) {
      return [];
    }
    return [{
      id: place.id,
      name: place.displayName?.text || place.formattedAddress,
      address: place.formattedAddress,
      latitude: place.location.latitude,
      longitude: place.location.longitude,
    }];
  });
  return Response.json(
    { places },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}
