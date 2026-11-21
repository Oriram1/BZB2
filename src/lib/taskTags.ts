export const TASK_TAGS = [
  { value: "physical", label: "עבודה פיזית" },
  { value: "no_experience", label: "ללא נסיון" },
  { value: "experience_required", label: "נדרש נסיון" },
  { value: "one_time", label: "חד פעמי" },
  { value: "flexible_hours", label: "שעות גמישות" },
  { value: "immediate_payment", label: "תשלום מיידי" },
] as const;

/** Chip colours from the Figma cards: experience tags yellow, physical work peach, the rest grey. */
export function taskTagClass(value: string): string {
  if (value === "no_experience" || value === "experience_required") return "bg-[#FFF0A8]";
  if (value === "physical") return "bg-[#FDE6D0]";
  return "bg-secondary";
}

export type TaskTag = (typeof TASK_TAGS)[number]["value"];

const LABELS: Record<string, string> = Object.fromEntries(TASK_TAGS.map((t) => [t.value, t.label]));

/** Labels in the designed order; unknown values from the database are skipped. */
export function taskTagLabels(tags: readonly string[] | null | undefined): { value: string; label: string }[] {
  const have = new Set(tags ?? []);
  return TASK_TAGS.filter((t) => have.has(t.value)).map((t) => ({ value: t.value, label: LABELS[t.value] }));
}
