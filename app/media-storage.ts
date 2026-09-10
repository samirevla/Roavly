type StoredMedia = {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  writeHttpMetadata(headers: Headers): void;
};

type MediaObjectMeta = {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  size?: number;
};

type MediaBucket = {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | null,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<StoredMedia | null>;
  head?(key: string): Promise<MediaObjectMeta | null>;
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

/** Confirm an object exists without buffering its body (prefer head; fall back to get + cancel). */
export async function assertMediaObjectExists(
  bucket: MediaBucket,
  key: string,
): Promise<MediaObjectMeta> {
  if (typeof bucket.head === "function") {
    const meta = await bucket.head(key);
    if (!meta) throw new Error(`Missing media object: ${key}`);
    return meta;
  }
  const object = await bucket.get(key);
  if (!object) throw new Error(`Missing media object: ${key}`);
  try {
    await object.body.cancel();
  } catch {
    // Best-effort cancel when head is unavailable.
  }
  return {
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata,
  };
}
