import type { Database } from "@/integrations/supabase/types";
import type { ReviewForm } from "@/lib/taskForm";

type SourceTask = Pick<Database["public"]["Tables"]["tasks"]["Row"],
  "category" | "name" | "short_desc" | "full_desc" | "payment" | "payment_type" | "workers_needed" |
  "location" | "latitude" | "longitude" | "duration_hours" | "expiry_hours" | "notes" | "tags" |
  "scheduled_date" | "scheduled_time" | "image_url" | "insurance">;

/** Copies editable details into a new unsent form. */
export function duplicateTaskDraft(task: SourceTask): { form: ReviewForm; lat: number | null; lng: number | null; tags: string[]; imageUrl: string | null; insurance: boolean; omittedFields: string[] } {
  const durationInDays = task.duration_hours != null && task.duration_hours % 24 === 0;
  const expiryInDays = task.expiry_hours != null && task.expiry_hours % 24 === 0;
  return {
    form: {
      category: task.category, taskName: task.name, shortDesc: task.short_desc, fullDesc: task.full_desc ?? "",
      payment: String(task.payment), paymentType: task.payment_type, workers: String(task.workers_needed),
      location: task.location ?? "", date: task.scheduled_date ?? "", time: task.scheduled_time?.slice(0, 5) ?? "", duration: task.duration_hours == null ? "" : String(durationInDays ? task.duration_hours / 24 : task.duration_hours),
      durationUnit: durationInDays ? "days" : "hours", expiry: task.expiry_hours == null ? "3" : String(expiryInDays ? task.expiry_hours / 24 : task.expiry_hours), expiryUnit: task.expiry_hours == null || expiryInDays ? "days" : "hours", notes: task.notes ?? "",
    },
    lat: task.latitude, lng: task.longitude, tags: [...(task.tags ?? [])], imageUrl: task.image_url, insurance: task.insurance, omittedFields: [],
  };
}
