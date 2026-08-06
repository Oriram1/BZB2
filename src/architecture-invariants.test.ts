import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("architecture invariants", () => {
  it("does not grant UI access from unverified role metadata", () => {
    const source = readFileSync(resolve(root, "src/contexts/AuthContext.tsx"), "utf8");
    expect(source).not.toContain("return [metadataRole]");
    // Roles always come back from a re-read of the database, never from the
    // metadata that prompted the repair.
    expect(source).toContain("return repaired.roles;");
    // A failed read is not evidence of a roleless account, so it must not
    // license the insert below it.
    expect(source).toContain("if (!nextUser || rolesFailed || currentRoles.length > 0)");
  });

  it("keeps machine endpoints explicit and user endpoints JWT protected", () => {
    const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
    expect(config).toContain("[functions.send-auth-email]");
    expect(config).toContain("[functions.notify-dispatch]");
    expect(config).toContain("[functions.send-quiet-digest]\nverify_jwt = false");
    expect(config).toContain("[functions.admin-manage-users]\nverify_jwt = true");
    expect(config).toContain("[functions.geocode-address]\nverify_jwt = true");
  });

  it("keeps every deployed Edge Function declared in config", () => {
    const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
    const functionDirs = readdirSync(resolve(root, "supabase/functions"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && readdirSync(resolve(root, "supabase/functions", entry.name)).includes("index.ts"))
      .map((entry) => entry.name);
    for (const name of functionDirs) {
      expect(config, `${name} missing from supabase/config.toml`).toContain(`[functions.${name}]`);
    }
  });

  it("bounds external geocoding input and request time", () => {
    const source = readFileSync(resolve(root, "supabase/functions/geocode-address/index.ts"), "utf8");
    expect(source).toContain("length > 500");
    expect(source).toContain("AbortSignal.timeout(8_000)");
  });

  it("bounds Resend requests", () => {
    const email = readFileSync(resolve(root, "supabase/functions/_shared/email.ts"), "utf8");
    expect(email).toContain("AbortSignal.timeout(10_000)");
  });

  it("keeps task cancellation on one server command", () => {
    const page = readFileSync(resolve(root, "src/pages/MyTasks.tsx"), "utf8");
    const migration = readFileSync(resolve(root, "supabase/migrations/20260804130000_canonical_task_cancellation.sql"), "utf8");
    expect(page).toContain('rpc("cancel_task"');
    expect(page).not.toContain('.from("notifications").insert');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.cancel_task");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.cancel_task(UUID) TO authenticated");
  });

  it("keeps task completion on one server command", () => {
    const page = readFileSync(resolve(root, "src/pages/MyTasks.tsx"), "utf8");
    const migration = readFileSync(resolve(root, "supabase/migrations/20260805120000_canonical_task_completion.sql"), "utf8");
    expect(page).toContain('rpc("complete_task"');
    // Closing a task is what credits a bee, so the client must never write the
    // status itself and reach the payment receipts through a plain update.
    expect(page).not.toContain('.update({ status: "completed" })');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.complete_task");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.complete_task(UUID) TO authenticated");
    // Completion is terminal on both sides: it needs someone to pay, and it
    // cannot be undone by cancelling afterwards.
    expect(migration).toContain("no_accepted_worker");
    expect(migration).toContain("task_completed");
  });

  it("counts a bee's completed tasks and earnings from task status, not acceptance", () => {
    const profile = readFileSync(resolve(root, "src/pages/Profile.tsx"), "utf8");
    // The old stat counted accepted applications, so a bee who was picked but
    // never paid still read as having completed the work.
    expect(profile).not.toContain("// approximation");
    expect(profile).toContain('t.status === "completed"');
  });

  it("caps accepted workers at the number the task asked for", () => {
    const page = readFileSync(resolve(root, "src/pages/MyTasks.tsx"), "utf8");
    const migration = readFileSync(resolve(root, "supabase/migrations/20260805160000_task_worker_capacity.sql"), "utf8");
    // The screen hides the approval button when full, but two taskers racing on
    // the last position is settled by the row lock, not by the button.
    expect(page).toContain("workers_needed");
    expect(page).toContain("task_positions_full");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("RAISE EXCEPTION 'task_positions_full'");
    expect(migration).toContain("BEFORE UPDATE OF status ON public.task_applications");
  });

  // switch_my_role exchanges tasker for bee, but the tasks an account published
  // and the applications it submitted stay with it, and RLS keeps permitting
  // both. A screen that gates on the current role instead of what the account
  // owns is how a switched publisher lost every way to accept a candidate.
  it("reaches published tasks and applications by ownership, not current role", () => {
    const page = readFileSync(resolve(root, "src/pages/MyTasks.tsx"), "utf8");
    expect(page).toContain("const managesTasks = isTasker || publishedTasks.length > 0");
    expect(page).toContain("const performsTasks = isBee || performingTasks.length > 0");
    // Neither the fetch nor any tab may be behind a bare role check again.
    expect(page).not.toContain("if (isTasker) {");
    expect(page).not.toContain("if (isBee) {");
    expect(page).not.toContain("{isTasker && <TabsTrigger");
    expect(page).not.toContain("{isBee && <TabsTrigger");
  });

  it("keeps production security headers configured", () => {
    const vercel = readFileSync(resolve(root, "vercel.json"), "utf8");
    expect(vercel).toContain('"Content-Security-Policy"');
    expect(vercel).toContain('"X-Content-Type-Options"');
    expect(vercel).toContain('"Referrer-Policy"');
    expect(vercel).toContain("object-src 'none'");
    expect(vercel).toContain("script-src 'self' https://accounts.google.com https://maps.googleapis.com");
    expect(vercel).toContain("wss://nrqgoaxraywprlbyzrso.supabase.co");
  });

  it("does not expose raw Edge Function exceptions", () => {
    const auth = readFileSync(resolve(root, "supabase/functions/_shared/auth.ts"), "utf8");
    expect(auth).toContain('return json({ error: "internal_error" }, 500);');
    expect(auth).toContain('console.error("edge_function_failure", error);');
    expect(auth).toContain('"Cache-Control": "no-store"');
    const reset = readFileSync(resolve(root, "supabase/functions/admin-reset-password/index.ts"), "utf8");
    expect(reset).toContain('return json({ error: "internal_error" }, 500);');
    expect(reset).toContain('return json({ error: "password_reset_failed" }, 500);');
    expect(reset).not.toContain('return json({ error: updateErr.message }, 500);');
    const authHook = readFileSync(resolve(root, "supabase/functions/send-auth-email/index.ts"), "utf8");
    expect(authHook).toContain('message: "email_send_failed"');
    expect(authHook).toContain('console.error("send_auth_email_failed", error);');
  });

  // Archiving is this app's delete. It sets archived_at instead of removing the
  // row, so a query that forgets the filter shows deleted records as if they
  // were live — which is how the profile came to list a task that its own
  // detail page refused to open.
  it("hides archived tasks and applications from every screen that reads them", () => {
    const readers = [
      "src/pages/Profile.tsx",
      "src/pages/MyTasks.tsx",
      "src/pages/TaskList.tsx",
      "src/pages/TaskDetail.tsx",
      "src/pages/PublicProfile.tsx",
      "src/pages/ParentalHub.tsx",
      "src/pages/Admin.tsx",
    ];

    for (const file of readers) {
      const source = readFileSync(resolve(root, file), "utf8");
      const reads: string[] = source.match(/\.from\("(tasks|task_applications)"\)[\s\S]*?;/g) ?? [];
      const selects = reads.filter((query) => query.includes(".select("));
      expect(selects.length, `${file} should read tasks`).toBeGreaterThan(0);
      for (const query of selects) {
        expect(query, `${file} reads archived rows`).toContain('.is("archived_at", null)');
      }
    }
  });

  // The client renders notification labels and the server renders email and
  // push. Both inflect Hebrew by gender, and a Deno module cannot import a Vite
  // one, so the vocabulary exists twice. Two copies that are allowed to drift
  // are two sources of truth; this makes drift a failing test instead.
  it("keeps the gender vocabulary identical on both sides", () => {
    const client = readFileSync(resolve(root, "src/lib/gender.ts"), "utf8");
    const server = readFileSync(resolve(root, "supabase/functions/_shared/gender.ts"), "utf8");
    expect(server).toBe(client);
  });

  // A slash form is the app writing "הגיש/ה" because it does not know who it is
  // talking about. Now that it does, the only legitimate slashes left are the
  // plural fallbacks inside the vocabulary itself.
  // The screens listed here all render someone whose gender is on file — the
  // profile being viewed, the child behind a share token, the signed-in user
  // pressing the button — so none of them has an excuse for a slash form.
  // Screens that describe a person with no account (a parent contact, a child
  // the app has not loaded yet) are deliberately absent from this list.
  it("does not reintroduce slash forms in notification copy", () => {
    for (const file of [
      "supabase/functions/_shared/notificationCopy.ts",
      "src/lib/notificationCopy.ts",
      "supabase/functions/admin-manage-users/index.ts",
      "src/pages/PublicProfile.tsx",
      "src/pages/TaskDetail.tsx",
      "src/components/tasks/MapView.tsx",
    ]) {
      const source = readFileSync(resolve(root, file), "utf8");
      const slashes: string[] = source.match(/[א-ת]\/[א-ת]/g) ?? [];
      expect(slashes, `${file} still hard-codes gendered slash forms`).toEqual([]);
    }
  });

  // RLS hides a profile from anyone with no relationship to its owner, so a
  // direct read of a stranger's profile does not error — it silently returns
  // nothing, and the screen shows a fallback name forever. get_public_profile
  // is the sanctioned crossing: SECURITY DEFINER, public-safe columns only.
  it("reads unrelated profiles through get_public_profile, not the table", () => {
    for (const file of ["src/pages/TaskDetail.tsx", "src/pages/PublicProfile.tsx", "src/pages/ParentalHub.tsx"]) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, `${file} should use the public-profile RPC`).toContain("get_public_profile");
    }
    // TaskDetail shows the publisher to any visitor; it must not read the table.
    const taskDetail = readFileSync(resolve(root, "src/pages/TaskDetail.tsx"), "utf8");
    expect(taskDetail).not.toContain('.from("profiles")');
  });

  it("protects system-owned columns at the database boundary", () => {
    const migration = readFileSync(
      resolve(root, "supabase/migrations/20260802153000_protect_system_columns.sql"),
      "utf8",
    );
    for (const field of ["creator_id", "views_count", "applicant_id", "sender_id", "parent_user_id"]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("prevent_client_system_column_changes");
  });
});
