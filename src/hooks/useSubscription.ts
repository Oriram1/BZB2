import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

export type Subscription = Tables<"subscriptions">;
type LoadResult = { subscription: Subscription | null; failed: boolean };

/** Subscription state belongs to the signed-in account, never the device. */
export function useSubscription() {
  const { user } = useAuth();
  const userId = user?.id;
  const request = useRef({ version: 0 });
  const [state, setState] = useState<LoadResult & { userId?: string; loading: boolean }>({
    subscription: null, failed: false, loading: true,
  });

  const load = useCallback(async (): Promise<LoadResult | null> => {
    const current = ++request.current.version;
    if (!userId) {
      setState({ subscription: null, failed: false, loading: false });
      return null;
    }
    setState((previous) => ({ ...previous, loading: true }));
    let result: LoadResult;
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      result = { subscription: error ? null : data, failed: Boolean(error) };
    } catch {
      // A rejected transport request must leave loading and show a retryable error.
      result = { subscription: null, failed: true };
    }
    if (current !== request.current.version) return null;
    setState({ ...result, userId, loading: false });
    return result;
  }, [userId]);

  useEffect(() => {
    const requests = request.current;
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      ++requests.version;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const sameAccount = state.userId === userId;
  return {
    subscription: sameAccount ? state.subscription : null,
    loading: Boolean(userId) && (!sameAccount || state.loading),
    failed: sameAccount && state.failed,
    reload: load,
  };
}

/** Access is honoured while a failed renewal is still being retried. */
export const hasAccess = (subscription: Subscription | null) =>
  subscription?.status === "active" || subscription?.status === "past_due";
