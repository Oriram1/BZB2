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

export const categories: Category[] = [
  { value: "housework", label: "עבודות בית", icon: Home },
  { value: "handyman", label: "הנדימן", icon: Wrench },
  { value: "tutoring", label: "לימודים", icon: BookOpen },
  { value: "babysitting", label: "בייביסיטר", icon: Baby },
  { value: "pets", label: "חיות מחמד", icon: PawPrint },
  { value: "gardening", label: "גינון", icon: Leaf },
  { value: "other", label: "אחר", icon: Package },
];

/** Category list with the "all" pseudo-option, for filter bars. */
export const categoryFilters: Category[] = [
  { value: "all", label: "הכל", icon: Sparkles },
  ...categories,
];

export const categoryLabel = (value: string): string =>
  categories.find((c) => c.value === value)?.label ?? "אחר";

export const categoryIcon = (value: string): LucideIcon =>
  categories.find((c) => c.value === value)?.icon ?? Package;
