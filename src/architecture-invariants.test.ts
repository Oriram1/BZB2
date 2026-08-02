import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("architecture invariants", () => {
  it("does not grant UI access from unverified role metadata", () => {
    const source = readFileSync(resolve(root, "src/contexts/AuthContext.tsx"), "utf8");
    expect(source).not.toContain("return [metadataRole]");
    expect(source).toContain("return repairedRoles;");
  });

  it("keeps machine endpoints explicit and user endpoints JWT protected", () => {
    const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
    expect(config).toContain("[functions.send-auth-email]");
    expect(config).toContain("[functions.notify-dispatch]");
    expect(config).toContain("[functions.admin-manage-users]\nverify_jwt = true");
    expect(config).toContain("[functions.geocode-address]\nverify_jwt = true");
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
