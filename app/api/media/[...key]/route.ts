import { getMediaBucket } from "../../../media-storage";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { key } = await context.params;
  const objectKey = key.join("/");
  if (!objectKey.startsWith("posts/")) {
    return new Response("Not found", { status: 404 });
  }

  const bucket = await getMediaBucket();
  const object = await bucket.get(objectKey);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
