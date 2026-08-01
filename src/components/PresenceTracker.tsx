import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** How often an open tab refreshes its presence stamp. */
const PING_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Keeps `profiles.last_active_at` current.
 *
 * The dispatcher uses it to skip chat emails for someone who is already
 * reading the conversation — without it, every message sent during a live
 * back-and-forth would also arrive as mail.
 */
const PresenceTracker = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let stopped = false;

    const ping = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      await supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", user.id);
    };

    ping();
    const timer = window.setInterval(ping, PING_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [user]);

  return null;
};

export default PresenceTracker;
