/**
 * Public endpoint: returns a child's recent tasks and stats given a valid
 * parent_contacts.view_token. No auth required — the token IS the auth.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { withCors, json, errorResponse } from "../_shared/auth.ts";

Deno.serve(withCors(async (req) => {
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") return json({ error: "missing_token" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: contact } = await admin
      .from("parent_contacts")
      .select("child_user_id")
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
        const task = t.task as any;
        return sum + (Number(task?.payment) || 0);
      }, 0) ?? 0;

    return json({
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
        const task = t.task as any;
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
