import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  getUploadSigningSecret,
  signUploadToken,
  type UploadPurpose,
} from "../../../upload-token";

export const dynamic = "force-dynamic";

const TIP_MEDIA_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const TIP_MEDIA_MAX = 100 * 1024 * 1024;
const TIP_PREVIEW_MAX = 15 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extension(contentType: string): string {
  return (
    (
      {
        "video/mp4": "mp4",
        "video/quicktime": "mov",
        "video/webm": "webm",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      } as Record<string, string>
    )[contentType] || "bin"
  );
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to upload media." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    purpose?: string;
    contentType?: string;
    byteSize?: number;
    tipId?: string;
  } | null;

  if (!body) return Response.json({ error: "Expected JSON body." }, { status: 400 });

  const purpose = body.purpose as UploadPurpose | undefined;
  if (purpose !== "tip_media" && purpose !== "tip_preview") {
    return Response.json({ error: "purpose must be tip_media or tip_preview." }, { status: 400 });
  }

  const tipId = String(body.tipId || "").trim();
  if (!UUID_RE.test(tipId)) {
    return Response.json({ error: "tipId must be a UUID." }, { status: 400 });
  }

  const contentType = String(body.contentType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (!TIP_MEDIA_TYPES.has(contentType)) {
    return Response.json(
      {
        error:
          "Use MP4, MOV, WebM, JPEG, PNG or WebP. Convert HEIC photos on the device before uploading.",
      },
      { status: 400 },
    );
  }

  const byteSize = Math.round(Number(body.byteSize));
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    return Response.json({ error: "byteSize must be a positive number." }, { status: 400 });
  }

  const maxBytes = purpose === "tip_preview" ? TIP_PREVIEW_MAX : TIP_MEDIA_MAX;
  if (byteSize > maxBytes) {
    return Response.json(
      {
        error:
          purpose === "tip_preview"
            ? "Preview files must be under 15 MB."
            : "Media files must be under 100 MB.",
      },
      { status: 400 },
    );
  }

  const key =
    purpose === "tip_preview"
      ? `tips/${tipId}/preview.${extension(contentType)}`
      : `tips/${tipId}/full.${extension(contentType)}`;

  let secret: string;
  try {
    secret = await getUploadSigningSecret();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload signing is unavailable." },
      { status: 503 },
    );
  }

  const signed = await signUploadToken(
    {
      key,
      contentType,
      maxBytes,
      ownerEmail: user.email,
      purpose,
    },
    secret,
  );

  return Response.json({
    tipId,
    key,
    uploadUrl: `/api/uploads/put?token=${encodeURIComponent(signed.token)}`,
    contentType,
    maxBytes,
    expiresAt: signed.expiresAt,
  });
}
