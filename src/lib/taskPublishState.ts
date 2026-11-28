export type TaskPublishState =
  | "live"
  | "pending_review"
  | "awaiting_charge"
  | "pending_payment"
  | "draft"
  | "rejected"
  | "hidden";

export const publishStateLabel: Record<TaskPublishState, string> = {
  live: "פורסמה",
  pending_review: "ממתינה לאישור",
  awaiting_charge: "מאושרת, בתהליך חיוב",
  pending_payment: "ממתינה לתשלום",
  draft: "טיוטה",
  rejected: "לא אושרה",
  hidden: "מוסתרת",
};
