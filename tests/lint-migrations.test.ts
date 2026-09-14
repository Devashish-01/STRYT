import { describe, it, expect } from "vitest";
import {
  lintMigrationContent,
  checkAppliedImmutability,
  splitSqlStatements,
  PII_TABLES,
  ANON_ALLOWED_FUNCTIONS,
} from "../scripts/lint-migrations.mjs";

describe("Database Migration Linter (W8 Guardrails)", () => {
  describe("Rule 1: SECURITY DEFINER search_path enforcement", () => {
    it("flags SECURITY DEFINER function missing search_path", () => {
      const sql = `
        CREATE OR REPLACE FUNCTION public.dangerous_func()
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
          NULL;
        END;
        $$;
        REVOKE ALL ON FUNCTION public.dangerous_func() FROM public, anon;
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.some((e) => e.rule === "RULE_1_SECURITY_DEFINER_SEARCH_PATH")).toBe(true);
      expect(errors.find((e) => e.rule === "RULE_1_SECURITY_DEFINER_SEARCH_PATH")?.message).toContain("dangerous_func");
    });

    it("passes SECURITY DEFINER function with SET search_path = public", () => {
      const sql = `
        CREATE OR REPLACE FUNCTION public.safe_func()
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        BEGIN
          NULL;
        END;
        $$;
        REVOKE ALL ON FUNCTION public.safe_func() FROM public, anon;
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.filter((e) => e.rule === "RULE_1_SECURITY_DEFINER_SEARCH_PATH")).toHaveLength(0);
    });

    it("passes SECURITY DEFINER function with SET search_path TO 'public'", () => {
      const sql = `
        CREATE OR REPLACE FUNCTION public.safe_func_quotes()
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path TO 'public'
        AS $$
        BEGIN
          NULL;
        END;
        $$;
        REVOKE ALL ON FUNCTION public.safe_func_quotes() FROM public, anon;
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.filter((e) => e.rule === "RULE_1_SECURITY_DEFINER_SEARCH_PATH")).toHaveLength(0);
    });
  });

  describe("Rule 2: Explicit REVOKE ... FROM public, anon", () => {
    it("flags function missing REVOKE from public, anon", () => {
      const sql = `
        CREATE OR REPLACE FUNCTION public.unprotected_trigger_func()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          RETURN NEW;
        END;
        $$;
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.some((e) => e.rule === "RULE_2_MISSING_REVOKE_ANON")).toBe(true);
      expect(errors.find((e) => e.rule === "RULE_2_MISSING_REVOKE_ANON")?.message).toContain("unprotected_trigger_func");
    });

    it("passes function with explicit REVOKE ALL ON FUNCTION from public, anon", () => {
      const sql = `
        CREATE OR REPLACE FUNCTION public.protected_trigger_func()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        BEGIN
          RETURN NEW;
        END;
        $$;
        REVOKE ALL ON FUNCTION public.protected_trigger_func() FROM public, anon;
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.filter((e) => e.rule === "RULE_2_MISSING_REVOKE_ANON")).toHaveLength(0);
    });

    it("allows whitelisted public functions without REVOKE", () => {
      const sql = `
        CREATE OR REPLACE FUNCTION public.queue_waiting_line(p_business_ids text[])
        RETURNS TABLE(business_id text, line_position integer, party_size text, my_token_id uuid)
        LANGUAGE sql
        STABLE SECURITY DEFINER
        SET search_path TO 'public'
        AS $$
          SELECT business_id, 1, '1 person', NULL::uuid FROM public.businesses;
        $$;
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.filter((e) => e.rule === "RULE_2_MISSING_REVOKE_ANON")).toHaveLength(0);
    });
  });

  describe("Rule 3: Ban USING (true) on PII tables", () => {
    it("flags USING (true) on sensitive queue_tokens table", () => {
      const sql = `
        CREATE POLICY queue_tokens_bad_policy ON public.queue_tokens
        FOR SELECT TO PUBLIC
        USING (true);
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.some((e) => e.rule === "RULE_3_PII_TABLE_USING_TRUE")).toBe(true);
      expect(errors.find((e) => e.rule === "RULE_3_PII_TABLE_USING_TRUE")?.message).toContain("queue_tokens");
    });

    it("flags USING ((true OR ...)) compound bypass on users table", () => {
      const sql = `
        CREATE POLICY users_leaky_policy ON public.users
        FOR SELECT TO PUBLIC
        USING ((true OR (auth.uid() = id)));
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.some((e) => e.rule === "RULE_3_PII_TABLE_USING_TRUE")).toBe(true);
    });

    it("passes scoped participant policy on queue_tokens", () => {
      const sql = `
        CREATE POLICY queue_tokens_select_participants ON public.queue_tokens
        FOR SELECT TO authenticated
        USING (
          customer_user_id = (SELECT auth.uid())::text
          OR EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = queue_tokens.business_id AND b.owner_user_id = (SELECT auth.uid())::text
          )
        );
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.filter((e) => e.rule === "RULE_3_PII_TABLE_USING_TRUE")).toHaveLength(0);
    });

    it("allows USING (true) on non-sensitive catalog tables", () => {
      const sql = `
        CREATE POLICY places_read_all ON public.places_to_visit
        FOR SELECT TO PUBLIC
        USING (true);
      `;
      const { errors } = lintMigrationContent(sql, "test.sql");
      expect(errors.filter((e) => e.rule === "RULE_3_PII_TABLE_USING_TRUE")).toHaveLength(0);
    });
  });

  describe("Rule 4: Applied Migrations Immutability", () => {
    it("verifies all recorded applied migrations in repo match authentic hashes", () => {
      const result = checkAppliedImmutability();
      expect(result.appliedCount).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("SQL Parser & Constants", () => {
    it("correctly splits statements separated by semicolons outside quotes", () => {
      const sql = `
        -- comment 1
        SELECT 1;
        /* block comment */
        SELECT 'foo;bar';
        SELECT $$test;semicolon$$;
      `;
      const stmts = splitSqlStatements(sql);
      expect(stmts).toHaveLength(3);
    });

    it("includes critical PII tables", () => {
      expect(PII_TABLES.has("users")).toBe(true);
      expect(PII_TABLES.has("queue_tokens")).toBe(true);
      expect(PII_TABLES.has("appointments")).toBe(true);
      expect(PII_TABLES.has("notifications")).toBe(true);
      expect(PII_TABLES.has("location_shares")).toBe(true);
    });

    it("includes allowed public/anon functions", () => {
      expect(ANON_ALLOWED_FUNCTIONS.has("queue_waiting_line")).toBe(true);
      expect(ANON_ALLOWED_FUNCTIONS.has("can_manage_business")).toBe(true);
    });
  });
});
