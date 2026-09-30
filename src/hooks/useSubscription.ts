import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

export type Subscription = Tables<"subscriptions">;

/**
 * The signed-in user's subscription, or null when they have none. RLS lets a
 * user read only their own row, so no filter here is what protects the data;
 * it is there so a missing row is unambiguous.
 */
export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setFailed(Boolean(error));
    setSubscription(error ? null : data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { subscription, loading, failed, reload: load };
}

/** Access is honoured while a failed renewal is still being retried. */
export const hasAccess = (subscription: Subscription | null) =>
  subscription?.status === "active" || subscription?.status === "past_due";
