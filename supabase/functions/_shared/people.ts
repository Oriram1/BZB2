import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { sendEmail } from "./email.ts";
import { emailContent } from "./notificationCopy.ts";
import type { NotificationEvent } from "./notificationEvents.ts";

/** Display name ("First Last", blank when the profile has none) and stored gender of a user. */
export async function childName(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("first_name, last_name, gender")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    name: `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim(),
    gender: data?.gender as string | null | undefined,
  };
}

/**
 * Sends an email and reports whether it went out. A failure is logged, never
 * thrown, for callers whose main work must survive a bounced mail.
 */
export async function tryEmail(
  options: Parameters<typeof sendEmail>[0],
  context: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    await sendEmail(options);
    return true;
  } catch (error) {
    console.error("email_send_failed", {
      tag: options.tag,
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Mails a parent contact, who has no account: their copy links to the public
 * view page behind their own token instead of an in-app screen.
 */
export function mailParentContact(
  contact: { id: string; email: string; view_token?: string | null },
  event: NotificationEvent,
  data: Record<string, unknown>,
) {
  return tryEmail({
    to: contact.email,
    tag: event,
    content: emailContent({
      id: contact.id,
      event_type: event,
      data: { ...data, view_token: contact.view_token },
      link: contact.view_token ? `/parent/view/${contact.view_token}` : "/",
    }),
  }, { contactId: contact.id });
}
