import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { chatEmailAllowed } from "./chatEmail.ts";

Deno.test("first email sends, then recent email suppresses another", async () => {
  let sent = false;
  const now = new Date().toISOString();
  const admin = { from(table: string) {
    const q = { select: () => q, eq: () => q, order: () => q, in: () => q,
      range: () => Promise.resolve({ data: [{ id: "new", created_at: now, read_at: null }, { id: "old", created_at: now, read_at: null }], error: null }),
      limit: () => Promise.resolve({ data: sent ? [{ id: "delivery" }] : [], error: null }) };
    if (table !== "notifications" && table !== "notification_deliveries") throw new Error("unexpected table");
    return q;
  } } as unknown as SupabaseClient;
  const row = { id: "new", event_type: "message_received" as const, data: { conversation_id: "chat" }, link: null };
  assertEquals(await chatEmailAllowed(admin, row, "user"), { allowed: true, unreadCount: 2 });
  sent = true;
  assertEquals(await chatEmailAllowed(admin, row, "user"), { allowed: false, unreadCount: 2 });
});
