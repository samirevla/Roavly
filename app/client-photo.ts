"use client";

import HeicToJpeg from "canvas-heic-to-jpeg";
import { photoContentType, validatePhoto } from "./photo-upload";

const MAX_SOURCE_PHOTO_BYTES = 30 * 1024 * 1024;
const TARGET_UPLOAD_BYTES = 850 * 1024;
const MAX_IMAGE_EDGE = 1600;
const PHOTO_PREPARATION_TIMEOUT_MS = 30000;
const compressionSteps = [
  { maxEdge: 1600, quality: .76 },
  { maxEdge: 1440, quality: .68 },
  { maxEdge: 1280, quality: .62 },
  { maxEdge: 1080, quality: .58 },
  { maxEdge: 960, quality: .52 },
  { maxEdge: 800, quality: .46 },
  { maxEdge: 640, quality: .4 },
  { maxEdge: 480, quality: .35 },
];

export type PreparedPhoto = {
  file: File;
  preview: string;
  optimised: boolean;
};

function looksLikeHeic(file: File) {
  const type = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence"
  ) {
    return true;
  }
  if (type && type !== "application/octet-stream") return false;
  return extension === "heic" || extension === "heif";
}

function jpegName(name: string) {
  const stem = name.replace(/\.[^.]+$/, "") || "roavly-photo";
  return `${stem}.jpg`;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string" && reader.result) resolve(reader.result);
      else reject(new Error("The selected photo could not be opened."));
    });
    reader.addEventListener("error", () => {
      reject(new Error("The selected photo could not be opened."));
    });
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("The selected photo could not be opened.")),
      { once: true },
    );
    image.src = source;
  });
}

async function withTimeout<T>(work: Promise<T>, message: string): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), PHOTO_PREPARATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The selected photo could not be optimised."));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function renderCompressedJpeg(
  image: HTMLImageElement,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The selected photo could not be optimised.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas, quality);
}

async function optimisePhoto(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await withTimeout(
      loadImage(objectUrl),
      "The photo took too long to open. Please choose it again.",
    );
    let blob: Blob | null = null;
    for (const step of compressionSteps) {
      blob = await renderCompressedJpeg(image, step.maxEdge, step.quality);
      if (blob.size <= TARGET_UPLOAD_BYTES) break;
    }
    if (!blob || blob.size > TARGET_UPLOAD_BYTES) {
      throw new Error("The selected photo could not be reduced enough for upload.");
    }
    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function convertHeicPhoto(source: File): Promise<File> {
  try {
    const converter = new HeicToJpeg();
    const converted = await withTimeout(
      converter.convertToFile(source, jpegName(source.name), {
        quality: .76,
        maxWidth: MAX_IMAGE_EDGE,
        maxHeight: MAX_IMAGE_EDGE,
      }),
      "The iPhone photo took too long to convert.",
    );
    return new File([converted], jpegName(source.name), {
      type: "image/jpeg",
      lastModified: source.lastModified,
    });
  } catch (nativeError) {
    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await withTimeout(
        heic2any({
          blob: source,
          toType: "image/jpeg",
          quality: .78,
        }),
        "The iPhone photo took too long to convert.",
      );
      const jpeg = Array.isArray(converted) ? converted[0] : converted;
      return new File([jpeg], jpegName(source.name), {
        type: "image/jpeg",
        lastModified: source.lastModified,
      });
    } catch {
      const detail = nativeError instanceof Error ? nativeError.message : "";
      throw new Error(
        detail.includes("too long")
          ? detail
          : "This iPhone photo could not be opened. Roavly recorded the error—try choosing the photo once more.",
      );
    }
  }
}

export async function preparePhotoForUpload(source: File): Promise<PreparedPhoto> {
  if (!source.size) throw new Error("Choose a photo for your journey.");
  if (source.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new Error("Choose a photo smaller than 30 MB. Roavly will optimise it for you.");
  }

  let file = source;
  let optimised = false;
  if (looksLikeHeic(source)) {
    file = await convertHeicPhoto(source);
    optimised = true;
  }

  if (!photoContentType(file)) {
    throw new Error("Choose an iPhone HEIC/HEIF, JPG, PNG or WebP photo.");
  }
  if (file.size > TARGET_UPLOAD_BYTES) {
    file = await optimisePhoto(file);
    optimised = true;
  }

  const validationError = validatePhoto(file);
  if (validationError) throw new Error(validationError);
  return {
    file,
    preview: await readAsDataUrl(file),
    optimised,
  };
}

async function reportPhotoFailure(error: unknown, source: File, area: string): Promise<void> {
  try {
    await fetch("/api/client-diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area,
        message: error instanceof Error ? error.message.slice(0, 300) : "Unknown photo preparation error",
        mimeType: source.type.slice(0, 80),
        size: source.size,
        extension: source.name.split(".").pop()?.toLowerCase().slice(0, 10) || "",
      }),
    });
  } catch {
    // Diagnostics must never block the user from trying another photo.
  }
}

export function reportPhotoPreparationFailure(error: unknown, source: File): Promise<void> {
  return reportPhotoFailure(error, source, "photo-preparation");
}

export function reportPhotoUploadFailure(error: unknown, source: File): Promise<void> {
  return reportPhotoFailure(error, source, "photo-upload");
}
