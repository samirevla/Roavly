type StoredMedia = {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  writeHttpMetadata(headers: Headers): void;
};

type MediaBucket = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  get(key: string): Promise<StoredMedia | null>;
  delete(key: string): Promise<void>;
};

export async function getMediaBucket(): Promise<MediaBucket> {
  const injected = (
    globalThis as typeof globalThis & { __ROAVLY_TEST_BUCKET__?: MediaBucket }
  ).__ROAVLY_TEST_BUCKET__;
  if (injected) return injected;

  const { env } = await import("cloudflare:workers");
  const bucket = (env as unknown as { BUCKET?: MediaBucket }).BUCKET;
  if (!bucket) {
    throw new Error("Photo storage is unavailable. Please try again shortly.");
  }
  return bucket;
}
