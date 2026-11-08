import { CATEGORY_VALUES, type CategoryValue } from "@shared/taskLimits.ts";
import { Home, Wrench, BookOpen, Baby, PawPrint, Leaf, Package, Sparkles, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for task categories.
 * Labels carry no emoji — the Lucide icon is the visual, so the same category
 * never shows up as an emoji in one place and an icon in another.
 */
export type Category = {
  value: string;
  label: string;
  icon: LucideIcon;
};

const CATEGORY_DETAILS: Record<CategoryValue, Pick<Category, "label" | "icon">> = {
  housework: { label: "עבודות בית", icon: Home },
  handyman: { label: "הנדימן", icon: Wrench },
  tutoring: { label: "לימודים", icon: BookOpen },
  babysitting: { label: "בייביסיטר", icon: Baby },
  pets: { label: "חיות מחמד", icon: PawPrint },
  gardening: { label: "גינון", icon: Leaf },
  other: { label: "אחר", icon: Package },
};

export const categories: Category[] = CATEGORY_VALUES.map((value) => ({ value, ...CATEGORY_DETAILS[value] }));

/** Category list with the "all" pseudo-option, for filter bars. */
export const categoryFilters: Category[] = [
  { value: "all", label: "הכל", icon: Sparkles },
  ...categories,
];

export const categoryLabel = (value: string): string =>
  categories.find((c) => c.value === value)?.label ?? "אחר";
