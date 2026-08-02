/* eslint-disable react-refresh/only-export-components -- the icon registry is part of this component's public API. */
import { Home, Wrench, BookOpen, Baby, PawPrint, Leaf, Package, type LucideIcon } from "lucide-react";

const categoryIconMap: Record<string, LucideIcon> = {
  housework: Home,
  handyman: Wrench,
  tutoring: BookOpen,
  babysitting: Baby,
  pets: PawPrint,
  gardening: Leaf,
  other: Package,
};

const categoryColorMap: Record<string, string> = {
  housework: "bg-primary/10 text-primary-ink",
  handyman: "bg-secondary/20 text-secondary-foreground",
  tutoring: "bg-accent/20 text-accent-foreground",
  babysitting: "bg-destructive/10 text-destructive",
  pets: "bg-primary/10 text-primary-ink",
  gardening: "bg-accent/20 text-accent-foreground",
  other: "bg-muted text-muted-foreground",
};

interface CategoryIconProps {
  category: string;
  size?: number;
  showBg?: boolean;
  className?: string;
}

const CategoryIcon = ({ category, size = 20, showBg = true, className = "" }: CategoryIconProps) => {
  const Icon = categoryIconMap[category] || Package;
  const colors = categoryColorMap[category] || categoryColorMap.other;

  if (!showBg) return <Icon size={size} className={className} />;

  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors} ${className}`}>
      <Icon size={size} />
    </div>
  );
};

export { CategoryIcon, categoryIconMap };
export default CategoryIcon;
