import { toast } from "sonner";

/** Copies text and tells the person whether it worked. */
export async function copyWithToast(text: string, messages: { success: string; failure: string }) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(messages.success);
  } catch {
    toast.error(messages.failure);
  }
}

/** Opens the native share sheet, or copies the link where there is none. */
export async function shareOrCopy(data: { title: string; url: string }, copyMessages: { success: string; failure: string }) {
  if (!navigator.share) {
    await copyWithToast(data.url, copyMessages);
    return;
  }
  try {
    await navigator.share(data);
  } catch { /* the person closed the share sheet */ }
}
