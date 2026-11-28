import { GraduationCap } from "@phosphor-icons/react";
import { categories } from "@/lib/categories";
import { figmaCategoryIcon } from "./figmaCategoryIcons";

const order = ["housework", "handyman", "babysitting", "pets", "gardening", "tutoring", "other"];

/** The category selection screen shown before the manual task form. */
export default function ManualCategoryPicker({ onSelect }: { onSelect: (category: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="בחירת קטגוריה">
      {order.map((value) => {
        const category = categories.find((item) => item.value === value)!;
        const Icon = value === "tutoring" ? GraduationCap : figmaCategoryIcon(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className={`flex min-h-[98px] flex-col items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${value === "handyman" ? "bg-[#FCF9F0]" : value === "gardening" ? "bg-[#F4FAF5]" : "bg-card"}`}
          >
            <span className={`flex size-8 items-center justify-center rounded-full ${value === "handyman" ? "bg-[#F8EBCB]" : value === "gardening" ? "bg-[#E2F0E6]" : ""}`}>
              <Icon size={16} aria-hidden="true" />
            </span>
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
