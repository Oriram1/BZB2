import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { NotificationRow } from "@/lib/notificationCopy";

const PAGE_SIZE = 30;

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
    const { data } = await supabase
      .from("notifications")
      .select("id, event_type, data, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

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
        (payload) => setItems((prev) => [payload.new as NotificationRow, ...prev].slice(0, PAGE_SIZE)),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
