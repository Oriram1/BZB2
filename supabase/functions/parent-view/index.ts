/**
 * Public endpoint: returns a child's recent tasks and stats given a valid
 * parent_contacts.view_token. No auth required — the token IS the auth.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { withCors, json, errorResponse, readJsonObject } from "../_shared/auth.ts";

Deno.serve(withCors(async (req) => {
  try {
    const { token } = await readJsonObject(req);
    if (typeof token !== "string" || !token.trim()) return json({ error: "missing_token" }, 400);
    if (token.length > 256) return json({ error: "invalid_token" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: contact } = await admin
      .from("parent_contacts")
      .select(
        "child_user_id, email, notify_signin, notify_accepted, notify_digest, notify_completed, notify_cancelled",
      )
      .eq("view_token", token)
      .maybeSingle();

    if (!contact) return json({ error: "invalid_token" }, 404);

    const childId = contact.child_user_id;

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name, avatar_url, age, gender")
      .eq("user_id", childId)
      .maybeSingle();

    const { data: tasks } = await admin
      .from("task_applications")
      .select(`
        status,
        applied_at,
        task:tasks!inner(name, short_desc, status, payment, payment_type, category, created_at)
      `)
      .eq("applicant_id", childId)
      .order("applied_at", { ascending: false })
      .limit(20);

    const completedCount = tasks?.filter((t) => t.status === "completed").length ?? 0;
    const totalEarned = tasks
      ?.filter((t) => t.status === "completed")
      .reduce((sum, t) => {
        const task = t.task as { payment?: unknown } | null;
        return sum + (Number(task?.payment) || 0);
      }, 0) ?? 0;

    return json({
      // Only this token's own row. A parent sees the switches for their own
      // address and learns nothing about who else is on the child's list.
      contact: {
        email: contact.email,
        prefs: {
          notify_signin: contact.notify_signin,
          notify_accepted: contact.notify_accepted,
          notify_digest: contact.notify_digest,
          notify_completed: contact.notify_completed,
          notify_cancelled: contact.notify_cancelled,
        },
      },
      child: {
        first_name: profile?.first_name ?? "",
        last_name: profile?.last_name ?? "",
        avatar_url: profile?.avatar_url ?? null,
        age: profile?.age ?? null,
        gender: profile?.gender ?? null,
      },
      stats: {
        total_tasks: tasks?.length ?? 0,
        completed: completedCount,
        total_earned: totalEarned,
      },
      tasks: (tasks ?? []).map((t) => {
        const task = t.task as { name?: unknown; short_desc?: unknown; status?: unknown; payment?: unknown; payment_type?: unknown; category?: unknown } | null;
        return {
          name: task?.name ?? "",
          short_desc: task?.short_desc ?? "",
          status: t.status,
          task_status: task?.status ?? "",
          payment: task?.payment ?? 0,
          payment_type: task?.payment_type ?? "",
          category: task?.category ?? "",
          applied_at: t.applied_at,
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}));
