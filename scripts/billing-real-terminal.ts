/**
 * Drives the DEPLOYED billing functions against the real Cardcom TEST terminal.
 * Keys are read through the Supabase CLI at run time and never printed.
 *
 *   deno run -A scripts/billing-real-terminal.ts <step>
 *
 * Steps are separate because two of them need a person to type a test card on
 * Cardcom's hosted page (it sits behind a bot check an automated browser fails).
 */
const REF = "nrqgoaxraywprlbyzrso";
const URL_ = `https://${REF}.supabase.co`;
const STATE = Deno.env.get("STATE_FILE") ?? "/tmp/billing-real-state.json";

async function keys() {
  const out = await new Deno.Command("supabase", { args: ["projects", "api-keys", "--project-ref", REF, "-o", "json"] }).output();
  const list = JSON.parse(new TextDecoder().decode(out.stdout)) as { name: string; api_key: string }[];
  return {
    anon: list.find((k) => k.name === "anon")!.api_key,
    service: list.find((k) => k.name === "service_role")!.api_key,
  };
}

const load = () => {
  try { return JSON.parse(Deno.readTextFileSync(STATE)); } catch { return {}; }
};
const save = (s: unknown) => Deno.writeTextFileSync(STATE, JSON.stringify(s, null, 2));

async function rest(service: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: r.status, body: body as any };
}

async function makeUser(service: string, anon: string, label: string, roles: string[]) {
  const email = `${label}-${Date.now()}@bzb-e2e.test`;
  const password = `E2e-${crypto.randomUUID()}-Aa1!`;
  const created = await rest(service, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { first_name: "בדיקה", last_name: label } }),
  });
  if (created.status >= 300) throw new Error(`create user failed: ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`);
  const id = created.body.id as string;
  for (const role of roles) {
    await rest(service, "/rest/v1/user_roles?on_conflict=user_id,role", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: id, role }),
    });
  }
  const signed = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await signed.json();
  if (!session.access_token) throw new Error("sign in failed");
  return { id, email, password, token: session.access_token as string };
}

async function fn(name: string, token: string, body: Record<string, unknown>, anon: string) {
  const r = await fetch(`${URL_}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) as Record<string, any> };
}

const step = Deno.args[0];
const { anon, service } = await keys();
const state = load();

if (step === "users") {
  state.admin = await makeUser(service, anon, "e2e-admin", ["admin"]);
  state.owner = await makeUser(service, anon, "e2e-owner", ["tasker"]);
  state.payer = await makeUser(service, anon, "e2e-payer", ["tasker"]);
  save(state);
  console.log("users created:", Object.keys(state).join(", "));
} else if (step === "card-setup") {
  const r = await fn("task-pay", state.owner.token, { action: "card_setup" }, anon);
  console.log(r.status, JSON.stringify(r.data));
  state.cardSetup = r.data;
  save(state);
} else if (step === "subscribe") {
  const r = await fn("billing-create-checkout", state.payer.token, { plan_id: "quarterly", accept_renewal: true }, anon);
  console.log(r.status, JSON.stringify(r.data));
  state.subscribe = r.data;
  save(state);
} else if (step === "settle") {
  // Asks the deployed functions what Cardcom says about the pages already paid.
  const out: Record<string, unknown> = {};
  if (state.cardSetup?.charge_id) out.cardSetup = (await fn("billing-confirm", state.owner.token, { charge_id: state.cardSetup.charge_id }, anon)).data;
  if (state.subscribe?.order_id) out.subscribe = (await fn("billing-confirm", state.payer.token, { order_id: state.subscribe.order_id }, anon)).data;
  console.log(JSON.stringify(out));
} else {
  console.log("unknown step");
}
