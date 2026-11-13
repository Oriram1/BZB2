import { supabase } from "@/integrations/supabase/client";

/** What we accept from the picker. Phones hand over HEIC/HEIF, and some Android pickers send no type at all. */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1024;

export type AvatarUploadError = "not_image" | "too_large" | "upload_failed" | "profile_failed";

export const isImageFile = (file: File) =>
  file.type.startsWith("image/") || (!file.type && IMAGE_EXT.test(file.name));

/**
 * Shrinks a phone photo to a small JPEG. Phone photos are often HEIC or larger
 * than the bucket's 10MB budget; re-encoding fixes both. Returns null when the
 * browser cannot decode the file (for example HEIC outside Safari).
 */
async function toJpeg(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}

/**
 * Uploads a picked photo as the user's avatar and saves its public URL on the
 * profile. Each upload gets its own file name so the public CDN and the
 * browser never keep serving the previous picture under the same URL.
 */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ url: string; error?: undefined } | { url?: undefined; error: AvatarUploadError }> {
  if (!isImageFile(file)) return { error: "not_image" };
  if (file.size > MAX_SOURCE_BYTES) return { error: "too_large" };

  const jpeg = await toJpeg(file);
  const body: Blob = jpeg ?? file;
  if (body.size > MAX_UPLOAD_BYTES) return { error: "too_large" };

  const ext = jpeg ? "jpg" : (file.name.match(IMAGE_EXT)?.[1]?.toLowerCase() ?? "jpg");
  const contentType = jpeg ? "image/jpeg" : file.type || `image/${ext === "jpg" ? "jpeg" : ext}`;
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const bucket = supabase.storage.from("avatars");
  const { error: uploadError } = await bucket.upload(path, body, { contentType, upsert: true });
  if (uploadError) {
    console.error("avatar upload failed", uploadError);
    return { error: "upload_failed" };
  }

  const url = bucket.getPublicUrl(path).data.publicUrl;
  const { error: profileError } = await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", userId);
  if (profileError) {
    console.error("avatar profile update failed", profileError);
    return { error: "profile_failed" };
  }

  // Best effort: drop the user's older avatar files.
  const { data: old } = await bucket.list(userId);
  const stale = (old ?? []).map((o) => `${userId}/${o.name}`).filter((p) => p !== path);
  if (stale.length) await bucket.remove(stale);

  return { url };
}
