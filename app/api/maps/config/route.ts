import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

type MapsEnvironment = {
  GOOGLE_MAPS_API_KEY?: string;
};

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { error: "Sign in to use Roavly maps." },
      { status: 401 },
    );
  }

  const { env } = await import("cloudflare:workers");
  const apiKey = (env as unknown as MapsEnvironment).GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "Maps are temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  return Response.json(
    { apiKey, mapId: "DEMO_MAP_ID" },
    { headers: { "cache-control": "private, max-age=300" } },
  );
}
