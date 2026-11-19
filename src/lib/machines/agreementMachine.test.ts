import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGREEMENT_CLOSED, agreementClosedFilter, isAgreementClosed } from "./agreement";
import type { AgreementStatus } from "@/types";

describe("AGREEMENT_CLOSED & isAgreementClosed", () => {
  it("treats terminal and disputed states as closed for participants", () => {
    const closed: AgreementStatus[] = ["COMPLETED", "CANCELLED", "DISPUTED"];
    for (const s of closed) {
      expect(isAgreementClosed(s)).toBe(true);
      expect(AGREEMENT_CLOSED).toContain(s);
    }
  });

  it("treats active lifecycle states as open", () => {
    const open: AgreementStatus[] = ["PENDING", "ACTIVE", "DEPOSIT_PAID", "IN_PROGRESS", "REVIEW"];
    for (const s of open) {
      expect(isAgreementClosed(s)).toBe(false);
      expect(AGREEMENT_CLOSED).not.toContain(s);
    }
  });
});

describe("agreementClosedFilter", () => {
  it("formats a valid PostgREST 'in' clause list", () => {
    expect(agreementClosedFilter()).toBe('("COMPLETED","CANCELLED","DISPUTED")');
  });
});

describe("matches server migration invariants (20260824_booking_and_rpc_security.sql)", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../../supabase/migrations/20260824_booking_and_rpc_security.sql"),
    "utf8",
  );

  it("mirrors the terminal resolution states an admin can resolve disputes into", () => {
    expect(sql).toContain("if p_resolution not in ('COMPLETED', 'CANCELLED') then raise exception 'INVALID_RESOLUTION'");
  });

  it("mirrors completion and dispute targets in agreement RPCs", () => {
    expect(sql).toContain("update public.agreements set status = 'COMPLETED'");
    expect(sql).toContain("set status = 'DISPUTED'");
  });
});
