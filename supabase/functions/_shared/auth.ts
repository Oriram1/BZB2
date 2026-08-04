import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.100.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function authenticatedClients(req: Request): Promise<{
  user: User;
  admin: SupabaseClient;
}> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("server_not_configured");
  if (!authHeader.startsWith("Bearer ")) throw new Error("unauthorized");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("unauthorized");

  return {
    user: data.user,
    admin: createClient(supabaseUrl, serviceKey),
  };
}

export async function hasRole(admin: SupabaseClient, userId: string, role: string) {
  const { data } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return Boolean(data);
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown_error";
  if (message === "unauthorized") return json({ error: message }, 401);
  if (message === "forbidden") return json({ error: message }, 403);
  if (message === "server_not_configured") return json({ error: message }, 500);
  // Never expose database/provider errors, SQL text or stack details to callers.
  // Keep diagnosis in server logs only.
  console.error("edge_function_failure", error);
  return json({ error: "internal_error" }, 500);
}
