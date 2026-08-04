import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { NotificationRow } from "@/lib/notificationCopy";
import { fetchAllPages } from "@/lib/fetchAllPages";

/**
 * The in-app notification feed.
 *
 * This is the only channel with full reach — email can land in spam and push
 * needs both permission and, on iOS, a home-screen install — so it is wired to
 * realtime and kept current whether or not the other two ever fire.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await fetchAllPages((from, to) => supabase
      .from("notifications")
      .select("id, event_type, data, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to));

    setItems((data ?? []) as NotificationRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const incoming = payload.new as NotificationRow;
          setItems((prev) => (prev.some((item) => item.id === incoming.id) ? prev : [incoming, ...prev]));
        },
      )
      .subscribe();

    // The socket drops when a phone locks or the tab backgrounds, and
    // Supabase never replays what was missed while it was down — so the
    // badge can go stale until something else remounts this hook. Reload on
    // return to catch up.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user, load]);

  const unreadCount = items.filter((item) => !item.read_at).length;

  const markRead = useCallback(
    async (id: string) => {
      if (!user) return;
      const now = new Date().toISOString();
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read_at: now } : item)));
      await supabase.from("notifications").update({ read_at: now }).eq("id", id).eq("user_id", user.id);
    },
    [user],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((item) => (item.read_at ? item : { ...item, read_at: now })));
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
  }, [user]);

  return { items, loading, unreadCount, markRead, markAllRead, reload: load };
}
