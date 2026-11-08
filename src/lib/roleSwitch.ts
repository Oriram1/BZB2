import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logUserActivity } from "@/lib/activityLog";
import type { Database } from "@/integrations/supabase/types";

/** Moves the signed-in account to another role. Shows the error itself and returns false when it fails. */
export async function switchMyRole(target: Database["public"]["Enums"]["app_role"], userId?: string): Promise<boolean> {
  const { error } = await supabase.rpc("switch_my_role", { target_role: target });
  if (error) {
    toast.error("לא ניתן להחליף תפקיד כרגע");
    return false;
  }
  const id = userId ?? (await supabase.auth.getUser()).data.user?.id;
  logUserActivity(id, "role_switched", { details: { role: target } });
  return true;
}
