export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

type PhotoLike = {
  name?: string;
  size: number;
  type?: string;
};

const photoTypes = new Map([
  ["image/jpeg", { extension: "jpg", label: "JPG" }],
  ["image/jpg", { extension: "jpg", label: "JPG" }],
  ["image/pjpeg", { extension: "jpg", label: "JPG" }],
  ["image/png", { extension: "png", label: "PNG" }],
  ["image/webp", { extension: "webp", label: "WebP" }],
]);

const extensionTypes = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

export function photoContentType(photo: PhotoLike): string | null {
  const declaredType = (photo.type || "").toLowerCase().split(";")[0].trim();
  if (photoTypes.has(declaredType)) {
    return declaredType === "image/jpg" || declaredType === "image/pjpeg"
      ? "image/jpeg"
      : declaredType;
  }

  const extension = (photo.name || "").split(".").pop()?.toLowerCase() || "";
  return extensionTypes.get(extension) ?? null;
}

export function validatePhoto(photo: PhotoLike): string | null {
  if (!photo.size) return "Choose a photo for your journey.";
  if (!photoContentType(photo)) return "Use a JPG, PNG or WebP photo.";
  if (photo.size > MAX_PHOTO_BYTES) return "Photos must be smaller than 8 MB.";
  return null;
}

export function photoExtension(contentType: string): string {
  return photoTypes.get(contentType)?.extension ?? "jpg";
}

export function friendlyUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("no such table")) {
    return "Waymark is being updated. Please try again shortly.";
  }
  if (
    lowerMessage.includes("expected pattern") ||
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("network")
  ) {
    return "The upload did not reach Waymark. Your photo was already reduced automatically—please try sharing it once more.";
  }
  return message;
}
