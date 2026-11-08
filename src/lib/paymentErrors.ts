import { SESSION_EXPIRED } from "@/lib/invokeFunction";

const ERROR_TEXT: Record<string, string> = {
  [SESSION_EXPIRED]: "ההתחברות פגה. יש להיכנס שוב כדי לפתוח את דף התשלום. לא בוצע חיוב",
  unauthorized: "ההתחברות פגה. יש להיכנס שוב כדי לפתוח את דף התשלום. לא בוצע חיוב",
  consent_required: "צריך לאשר את תנאי החידוש האוטומטי כדי להמשיך",
  unknown_plan: "המסלול לא נמצא",
  tasker_only: "מנויים זמינים למציעי מטלות בלבד",
  already_subscribed: "כבר יש לכם מנוי פעיל",
  too_many_attempts: "יותר מדי ניסיונות תשלום. כדאי לנסות שוב בעוד שעה",
  billing_disabled: "התשלומים לא פעילים כרגע",
  network_error: "לא הצלחנו להתחבר לשירות התשלום. בדקו את החיבור ונסו שוב",
  payment_unavailable: "שירות התשלום לא זמין כרגע. נסו שוב בעוד כמה דקות",
  bit_unavailable: "תשלום ב-Bit עדיין לא זמין. אפשר לשלם בכרטיס או בארנק דיגיטלי",
  card_required: "צריך לשמור כרטיס אשראי קודם",
  not_waiting_for_payment: "המטלה כבר לא ממתינה לתשלום",
  no_active_subscription: "לא נמצא מנוי פעיל",
  cannot_resume: "אי אפשר לחדש את המנוי הזה. אפשר לרכוש מנוי חדש",
  not_found: "לא נמצא, או שאין הרשאה לפעולה הזאת",
  trial_already_used: "החודש החינם כבר נוצל",
  same_plan: "זה כבר המסלול שלכם",
  refund_already_used: "ביטול עם החזר ל־14 יום כבר נוצל, והמנוי הבא הוא עד הסוף",
  window_passed: "עברו יותר מ־14 יום מהתשלום, ולכן אי אפשר לבטל עם החזר",
  charge_failed: "החיוב על המשימות שנשארו נדחה. אפשר לנסות כרטיס אחר",
  nothing_to_refund: "אין תשלום שאפשר להחזיר",
  refund_requires_review: "אי אפשר להשלים את ההחזר אוטומטית כרגע. פנו לתמיכה לבדיקת החיובים",
  no_active_subscription_refund: "אין מנוי פעיל",
};

/** Hebrew text for a payment function's failure code, for subscriptions and task payments alike. */
export const paymentErrorText = (code: string) => ERROR_TEXT[code] ?? "משהו השתבש, נסו שוב בעוד רגע";
