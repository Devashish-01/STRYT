import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Geofence Discovery Hardening Migration (20261024_harden_geofence_discovery.sql)", () => {
  const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20261024_harden_geofence_discovery.sql");
  const rollbackPath = path.join(process.cwd(), "supabase", "rollbacks", "20261024_harden_geofence_discovery.rollback.sql");

  it("migration file exists and is non-empty", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content.length).toBeGreaterThan(500);
  });

  it("rollback file exists and is non-empty", () => {
    expect(fs.existsSync(rollbackPath)).toBe(true);
    const content = fs.readFileSync(rollbackPath, "utf8");
    expect(content.length).toBeGreaterThan(500);
  });

  it("all covered spatial discovery functions retain caller privileges and pin search_path", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    const functions = [
      "businesses_nearby",
      "providers_nearby",
      "community_posts_nearby",
      "stories_nearby",
      "search_businesses_nearby",
      "search_providers_nearby",
      "category_counts_nearby",
    ];

    for (const fn of functions) {
      expect(content).toContain(`create or replace function public.${fn}`);
      // Full-row listing functions must not bypass table RLS or column grants.
      const fnBlockRegex = new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?\\$\\$;`, "i");
      const match = content.match(fnBlockRegex);
      expect(match, `Function ${fn} block not found`).not.toBeNull();
      if (match) {
        expect(match[0].toLowerCase()).toContain("security invoker");
        expect(match[0].toLowerCase()).not.toContain("security definer");
        expect(match[0].toLowerCase()).toContain("search_path = public");
      }
    }
  });

  it("enforces coordinate range checks on latitude and longitude", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content).toContain("INVALID_COORDINATES");
    expect(content).toContain("in_lat < -90 or in_lat > 90");
    expect(content).toContain("in_lng < -180 or in_lng > 180");
  });

  it("enforces server-side 1.0 km radius clamp for anonymous / guest users", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    // Verify anon role check and clamp
    expect(content).toContain("auth.role() = 'anon' or auth.uid() is null");
    expect(content).toContain("least(greatest(coalesce(in_radius_km, 1.0), 0.05), 1.0)");
  });

  it("enforces 50.0 km ceiling for authenticated callers to prevent DoS scans", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content).toContain("least(greatest(coalesce(in_radius_km, 50.0), 0.05), 50.0)");
  });

  it("preserves the existing execute grants", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    const functions = [
      "businesses_nearby",
      "providers_nearby",
      "community_posts_nearby",
      "stories_nearby",
      "search_businesses_nearby",
      "search_providers_nearby",
      "category_counts_nearby",
    ];

    for (const fn of functions) {
      expect(content).not.toContain(`revoke all on function public.${fn}`);
      expect(content).not.toContain(`grant execute on function public.${fn}`);
    }
  });
});
