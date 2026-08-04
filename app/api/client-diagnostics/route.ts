import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

function clean(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, maxLength);
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Sign in to report an upload error." }, { status: 401 });
  }

  if (Number(request.headers.get("content-length") || 0) > 4096) {
    return Response.json({ error: "Diagnostic payload is too large." }, { status: 413 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    console.error("[roavly-client-diagnostic]", JSON.stringify({
      area: clean(payload.area, 50),
      message: clean(payload.message, 300),
      mimeType: clean(payload.mimeType, 80),
      size: Math.max(0, Math.min(30 * 1024 * 1024, Number(payload.size) || 0)),
      extension: clean(payload.extension, 10),
    }));
  } catch {
    return Response.json({ error: "Diagnostic payload is invalid." }, { status: 400 });
  }

  return new Response(null, { status: 204 });
}
