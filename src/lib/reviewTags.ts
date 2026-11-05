/** Optional feedback tags. Display only; they never affect the average. */
export const TAGS_FOR_WORKER = {
  on_time: "הגיע בזמן",
  pleasant: "תקשורת נעימה",
  as_agreed: "ביצע כפי שסוכם",
  thorough: "עבודה יסודית",
} as const;
export const TAGS_FOR_PUBLISHER = {
  clear_instructions: "הסבר ברור",
  pleasant: "תקשורת נעימה",
  matched_description: "המטלה תאמה לתיאור",
  paid_as_agreed: "תשלום כפי שסוכם",
} as const;
export const ALL_TAG_LABELS: Record<string, string> = { ...TAGS_FOR_WORKER, ...TAGS_FOR_PUBLISHER };
