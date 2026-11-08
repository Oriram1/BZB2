/**
 * The notification vocabulary shared by the edge functions that raise and
 * deliver notifications and the client that lists them and lets people mute
 * them. Free of imports so both runtimes can load it.
 */
export type NotificationEvent =
  | "application_received"
  | "application_decided"
  | "message_received"
  | "review_approved"
  | "review_reminder"
  | "review_rejected"
  | "review_response_approved"
  | "review_report_resolved"
  | "review_appeal_resolved"
  | "task_completed"
  | "parent_child_accepted"
  | "parent_digest"
  | "family_link_code"
  | "quiet_hours_digest"
  | "task_cancelled"
  // Raised by a parent from the public view page and delivered to the child,
  // who is the only one who may approve it.
  | "parent_contact_requested"
  // Addressed to a parent who has no account, so it is mailed directly and
  // never stored in public.notifications (which is keyed by user_id).
  | "parent_contact_added"
  | "child_signed_in"
  // Fanned out to a child's parent contacts by notify-dispatch. Same three
  // moments the child is already told about, worded for someone watching from
  // the outside. Copy-only, like the two above: no row in notification_event.
  | "parent_child_completed"
  | "parent_child_cancelled"
  // Subscription billing. Transactional: raised by the billing functions, never
  // by a user action, so they sit outside the per-event settings screen.
  | "billing_renewal_reminder"
  | "billing_payment_succeeded"
  | "billing_payment_failed"
  | "billing_subscription_canceled"
  | "billing_subscription_ended"
  | "billing_refunded"
  | "billing_plan_changed"
  | "task_approved"
  | "task_rejected"
  | "task_payment_failed"
  | "task_payment_reminder"
  | "task_returned_to_draft"
  | "tasks_hidden"
  | "task_refunded";

export type NotificationRow = {
  id: string;
  event_type: NotificationEvent;
  data: Record<string, unknown>;
  link: string | null;
};

/**
 * Channel defaults for users who never touched the settings screen.
 * Operationally critical events default on; nice-to-know push defaults off.
 */
export const CHANNEL_DEFAULTS: Record<NotificationEvent, { email: boolean; push: boolean }> = {
  application_received: { email: true, push: true },
  application_decided: { email: true, push: true },
  message_received: { email: true, push: true },
  review_approved: { email: true, push: true },
  review_reminder: { email: false, push: true },
  review_rejected: { email: true, push: true },
  review_response_approved: { email: true, push: true },
  review_report_resolved: { email: true, push: true },
  review_appeal_resolved: { email: true, push: true },
  task_completed: { email: true, push: false },
  parent_child_accepted: { email: true, push: true },
  parent_digest: { email: true, push: true },
  family_link_code: { email: true, push: false },
  quiet_hours_digest: { email: true, push: true },
  task_cancelled: { email: true, push: true },
  // Sent to an address, not to an account, so the per-user settings screen
  // never reaches these. The child removes the contact to stop them.
  parent_contact_added: { email: true, push: false },
  child_signed_in: { email: true, push: false },
  parent_contact_requested: { email: true, push: true },
  parent_child_completed: { email: true, push: false },
  parent_child_cancelled: { email: true, push: false },
  // Billing is transactional: about money the user is charged, so both
  // channels default on. They are not on the settings screen.
  billing_renewal_reminder: { email: true, push: true },
  billing_payment_succeeded: { email: true, push: true },
  billing_payment_failed: { email: true, push: true },
  billing_subscription_canceled: { email: true, push: true },
  billing_subscription_ended: { email: true, push: true },
  billing_refunded: { email: true, push: true },
  billing_plan_changed: { email: true, push: false },
  task_approved: { email: true, push: true },
  task_rejected: { email: true, push: true },
  task_refunded: { email: true, push: true },
  task_payment_failed: { email: true, push: true },
  task_payment_reminder: { email: true, push: false },
  task_returned_to_draft: { email: true, push: false },
  tasks_hidden: { email: true, push: true },
};
