import { categoryIcon } from "@/lib/categories";
import { figmaCategoryIcon } from "./figmaCategoryIcons";

const categoryColorMap: Record<string, string> = {
  housework: "bg-primary/10 text-primary-ink",
  handyman: "bg-secondary/20 text-secondary-foreground",
  tutoring: "bg-accent/20 text-accent-foreground",
  babysitting: "bg-destructive/10 text-destructive",
  pets: "bg-primary/10 text-primary-ink",
  gardening: "bg-accent/20 text-accent-foreground",
  other: "bg-muted text-muted-foreground",
};

/** Tints from the redesign file; used only on screens that exist in Figma. */
const figmaColorMap: Record<string, string> = {
  housework: "bg-[#F4DDE9]",
  handyman: "bg-[#D9EBEA]",
  tutoring: "bg-[#FFEBAD]",
  babysitting: "bg-[#DDEAF8]",
  pets: "bg-[#D9EBEA]",
  gardening: "bg-[#E2F0DC]",
  other: "bg-[#E8E5DC]",
};

interface CategoryIconProps {
  category: string;
  size?: number;
  showBg?: boolean;
  className?: string;
  variant?: "default" | "figma";
}

const CategoryIcon = ({ category, size = 20, showBg = true, className = "", variant = "default" }: CategoryIconProps) => {
  const Icon = categoryIcon(category);
  const colors = categoryColorMap[category] || categoryColorMap.other;

  if (!showBg) return <Icon size={size} className={className} />;

  if (variant === "figma") {
    const FigmaIcon = figmaCategoryIcon(category);
    return (
      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-[#151515] ${figmaColorMap[category] || figmaColorMap.other} ${className}`}>
        <FigmaIcon size={size} />
      </div>
    );
  }

  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors} ${className}`}>
      <Icon size={size} />
    </div>
  );
};

export { CategoryIcon };
export default CategoryIcon;
