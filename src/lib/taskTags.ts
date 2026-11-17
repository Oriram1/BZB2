export const TASK_TAGS = [
  { value: "physical", label: "עבודה פיזית" },
  { value: "no_experience", label: "ללא נסיון" },
  { value: "one_time", label: "חד פעמי" },
  { value: "flexible_hours", label: "שעות גמישות" },
] as const;

export type TaskTag = (typeof TASK_TAGS)[number]["value"];

const LABELS: Record<string, string> = Object.fromEntries(TASK_TAGS.map((t) => [t.value, t.label]));

/** Labels in the designed order; unknown values from the database are skipped. */
export function taskTagLabels(tags: readonly string[] | null | undefined): { value: string; label: string }[] {
  const have = new Set(tags ?? []);
  return TASK_TAGS.filter((t) => have.has(t.value)).map((t) => ({ value: t.value, label: LABELS[t.value] }));
}
