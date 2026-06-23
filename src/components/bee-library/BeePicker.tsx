import { bees, beeById } from "./bees";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  onChange: (id: string, src: string) => void;
};

/**
 * BeePicker - גלריית בחירה של 148 וריאציות דבורה.
 * משמש בתוך AvatarPicker כטאב.
 */
export default function BeePicker({ value, onChange }: Props) {
  const selected = beeById(value);

  return (
    <div
      className="max-h-[50vh] overflow-y-auto rounded-2xl p-3"
      style={{
        background:
          "radial-gradient(600px 400px at 50% -10%, #fff4c2 0%, #ffe28a 50%, #ffd76b 100%)",
      }}
    >
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {bees.map((bee) => {
          const isSel = selected?.id === bee.id;
          return (
            <button
              type="button"
              key={bee.id}
              onClick={() => onChange(bee.id, bee.src)}
              className={cn(
                "aspect-square overflow-hidden rounded-xl bg-white/80 p-1 shadow transition hover:-translate-y-0.5 hover:shadow-xl",
                isSel ? "ring-4 ring-primary" : "ring-1 ring-white/60",
              )}
              aria-label={bee.id}
            >
              <img
                src={bee.src}
                alt=""
                loading="lazy"
                className="h-full w-full rounded-lg bg-gradient-to-b from-amber-50 to-amber-100 object-contain"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
