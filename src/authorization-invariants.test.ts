import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationsDir = resolve(root, "supabase/migrations");

// Migrations are applied in filename order, so the last definition of a function
// wins. Asserting against the first one found would pass forever while the live
// database ran something else entirely.
const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => ({ file, sql: readFileSync(resolve(migrationsDir, file), "utf8") }));

const effectiveFunction = (name: string) => {
  // Anchored on CREATE so the REVOKE/GRANT lines that follow a definition, and
  // name the same function, are not mistaken for the body.
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  for (const { sql } of [...migrations].reverse()) {
    const start = sql.lastIndexOf(marker);
    if (start === -1) continue;
    const end = sql.indexOf("$$;", start);
    expect(end, `${name} definition is not $$-quoted`).toBeGreaterThan(start);
    return sql.slice(start, end);
  }
  throw new Error(`no migration defines ${name}`);
};

const allSql = migrations.map((m) => m.sql).join("\n");

describe("authorization invariants", () => {
  // The "change member to admin in devtools" attack only works when the server
  // takes the client's word for the role. Everything below is what makes the
  // browser's copy of the role cosmetic.

  it("never lets a client grant itself admin", () => {
    const guard = effectiveFunction("prevent_role_escalation");
    // The INSERT policy on user_roles only checks auth.uid() = user_id, so the
    // trigger is the sole thing standing between a signed-in user and admin.
    expect(guard).toContain("NEW.role = 'admin'");
    expect(guard).toContain("private.has_role(auth.uid(), 'admin')");
    expect(guard).toContain("admin_role_not_self_assignable");
    // auth.uid() IS NULL means service_role or a psql session — the only place
    // admin may be granted. If that escape ever stops being paired with an
    // authenticated check, self-assignment is back.
    expect(guard).toMatch(/auth\.uid\(\) IS NOT NULL AND NOT private\.has_role/);
  });

  it("keeps the escalation guard attached to user_roles inserts", () => {
    expect(allSql).toMatch(
      /CREATE TRIGGER enforce_role_invariants\s+BEFORE INSERT ON public\.user_roles/,
    );
  });

  it("forbids clients from rewriting an existing role row", () => {
    // Without this, the guard above is pointless: a user would simply UPDATE
    // their own row instead of inserting a second one.
    expect(allSql).toContain("REVOKE UPDATE, DELETE ON public.user_roles FROM anon, authenticated");
  });

  it("keeps one functional role per account", () => {
    const guard = effectiveFunction("prevent_role_escalation");
    expect(guard).toContain("one_role_per_user");
    // Admin sits alongside a functional role, so it must not count as the one.
    expect(guard).toMatch(/role <> 'admin'/);
  });

  it("does not let the sanctioned role switch reach admin", () => {
    const fn = effectiveFunction("switch_my_role");
    expect(fn).toContain("target_role = 'admin'::public.app_role");
    expect(fn).toContain("role_switch_not_allowed");
    // ...and does not strip an existing admin grant on the way past.
    expect(fn).toMatch(/DELETE FROM public\.user_roles[\s\S]*role <> 'admin'/);
  });

  it("enables row level security on every table it creates", () => {
    const created = new Set<string>();
    const guarded = new Set<string>();
    for (const { sql } of migrations) {
      for (const [, table] of sql.matchAll(
        /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z_]+)/g,
      )) {
        created.add(table);
      }
      for (const [, table] of sql.matchAll(
        /ALTER TABLE (?:public\.)?([a-z_]+)\s+ENABLE ROW LEVEL SECURITY/g,
      )) {
        guarded.add(table);
      }
    }
    expect(created.size).toBeGreaterThan(0);
    expect([...created].filter((table) => !guarded.has(table))).toEqual([]);
  });

  it("never ships a service role key to the browser", () => {
    // This key bypasses RLS entirely. One of these in client code makes every
    // other guard in this file decorative.
    const clientFiles = [
      "src/integrations/supabase/client.ts",
      "src/contexts/AuthContext.tsx",
      "src/pages/Register.tsx",
      "src/pages/Admin.tsx",
    ];
    for (const file of clientFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, `${file} references a service role key`).not.toMatch(/service_role|SERVICE_ROLE/);
    }
  });
});
