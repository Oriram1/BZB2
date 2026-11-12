import { House, Wrench, BookOpen, Baby, Dog, Plant, Polygon, Sparkle, type Icon } from "@phosphor-icons/react";

/**
 * Category icons for the screens that follow the Figma redesign, which uses the
 * Phosphor set. Everything else keeps the Lucide icons from `@/lib/categories`.
 */
const FIGMA_CATEGORY_ICONS: Record<string, Icon> = {
  all: Sparkle,
  housework: House,
  handyman: Wrench,
  tutoring: BookOpen,
  babysitting: Baby,
  pets: Dog,
  gardening: Plant,
  other: Polygon,
};

export const figmaCategoryIcon = (value: string): Icon => FIGMA_CATEGORY_ICONS[value] ?? Polygon;
