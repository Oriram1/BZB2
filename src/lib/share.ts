import { toast } from "sonner";

export async function copyWithToast(text: string, messages: { success: string; failure: string }) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(messages.success);
  } catch {
    toast.error(messages.failure);
  }
}

export async function shareOrCopy(data: { title: string; url: string }, copyMessages: { success: string; failure: string }) {
  if (!navigator.share) {
    await copyWithToast(data.url, copyMessages);
    return;
  }
  try {
    await navigator.share(data);
  } catch { /* the person closed the share sheet */ }
}
