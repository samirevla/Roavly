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

/** Thrown when the R2 BUCKET binding is missing (e.g. interim staging without R2). */
export class MediaStorageUnavailableError extends Error {
  readonly status = 503 as const;
  constructor(
    message = "Photo storage is unavailable. Media uploads need R2, which is not enabled on this deployment yet.",
  ) {
    super(message);
    this.name = "MediaStorageUnavailableError";
  }
}

export function mediaUnavailableResponse(error: unknown): Response | null {
  if (
    error instanceof MediaStorageUnavailableError ||
    (error instanceof Error && error.message.includes("Photo storage is unavailable"))
  ) {
    const message =
      error instanceof Error
        ? error.message
        : "Photo storage is unavailable. Media uploads need R2, which is not enabled on this deployment yet.";
    return Response.json({ error: message }, { status: 503 });
  }
  return null;
}

export async function getMediaBucket(): Promise<MediaBucket> {
  const injected = (
    globalThis as typeof globalThis & { __ROAVLY_TEST_BUCKET__?: MediaBucket }
  ).__ROAVLY_TEST_BUCKET__;
  if (injected) return injected;

  const { env } = await import("cloudflare:workers");
  const bucket = (env as unknown as { BUCKET?: MediaBucket }).BUCKET;
  if (!bucket) {
    throw new MediaStorageUnavailableError();
  }
  return bucket;
}
