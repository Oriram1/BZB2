import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
    expect(config).toContain("[functions.admin-manage-users]\nverify_jwt = true");
    expect(config).toContain("[functions.geocode-address]\nverify_jwt = true");
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
  it("does not reintroduce slash forms in notification copy", () => {
    for (const file of ["supabase/functions/_shared/notificationCopy.ts", "src/lib/notificationCopy.ts"]) {
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
