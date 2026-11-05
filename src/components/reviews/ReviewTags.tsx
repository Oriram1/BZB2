import { ALL_TAG_LABELS } from "@/lib/reviewTags";

export function ReviewTags({ tags }: { tags?: string[] | null }) {
  if (!tags?.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="תגיות משוב">
      {tags.map((tag) => ALL_TAG_LABELS[tag] && (
        <li key={tag} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">{ALL_TAG_LABELS[tag]}</li>
      ))}
    </ul>
  );
}
