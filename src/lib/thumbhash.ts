import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash";

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

/**
 * A ThumbHash (a few dozen base64 characters) of an image file, or null when the
 * browser cannot decode it. Never throws: a missing preview must not block a send.
 */
export async function imageFileToThumbHash(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = 100 / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)));
    const height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    return toBase64(rgbaToThumbHash(width, height, data));
  } catch {
    return null;
  }
}

/** A data: URL for painting the preview as a background, or undefined when the hash is unusable. */
export function thumbHashToUrl(hash: string | null | undefined): string | undefined {
  if (!hash) return undefined;
  try {
    return thumbHashToDataURL(fromBase64(hash));
  } catch {
    return undefined;
  }
}
