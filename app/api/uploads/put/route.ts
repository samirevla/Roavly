import { getChatGPTUser } from "../../../chatgpt-auth";
import { getMediaBucket, mediaUnavailableResponse } from "../../../media-storage";
import { getUploadSigningSecret, verifyUploadToken } from "../../../upload-token";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to upload media." }, { status: 401 });

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return Response.json({ error: "Missing upload token." }, { status: 400 });

  let secret: string;
  try {
    secret = await getUploadSigningSecret();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload signing is unavailable." },
      { status: 503 },
    );
  }

  const payload = await verifyUploadToken(token, secret);
  if (!payload) return Response.json({ error: "Upload token is invalid or expired." }, { status: 403 });
  if (payload.ownerEmail !== user.email) {
    return Response.json({ error: "Upload token does not match this account." }, { status: 403 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader) {
    return Response.json({ error: "Content-Length is required." }, { status: 411 });
  }
  const contentLength = Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return Response.json({ error: "Content-Length is invalid." }, { status: 400 });
  }
  if (contentLength > payload.maxBytes) {
    return Response.json({ error: "Upload exceeds the signed size limit." }, { status: 413 });
  }

  const declaredType = (request.headers.get("content-type") || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (declaredType && declaredType !== payload.contentType) {
    return Response.json({ error: "Content-Type must match the signed upload." }, { status: 415 });
  }

  if (!request.body) {
    return Response.json({ error: "Empty upload body." }, { status: 400 });
  }

  let customMetadata: Record<string, string>;
  if (payload.purpose === "post_photo") {
    const postIdMatch = payload.key.match(/^posts\/([^/.]+)\./);
    const postId = postIdMatch?.[1] || "";
    customMetadata = { owner: user.email, postId, access: "journey" };
  } else {
    const tipIdMatch = payload.key.match(/^tips\/([^/]+)\//);
    const tipId = tipIdMatch?.[1] || "";
    const access = payload.purpose === "tip_preview" ? "preview" : "paid";
    customMetadata = { owner: user.email, tipId, access };
  }

  let bucket;
  try {
    bucket = await getMediaBucket();
  } catch (error) {
    const unavailable = mediaUnavailableResponse(error);
    if (unavailable) return unavailable;
    throw error;
  }

  // Stream the request body into R2 — never buffer the whole file in Worker memory.
  await bucket.put(payload.key, request.body, {
    httpMetadata: { contentType: payload.contentType },
    customMetadata,
  });

  return Response.json({ key: payload.key }, { status: 201 });
}
