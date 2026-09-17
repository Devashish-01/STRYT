import { describe, it, expect } from "vitest";
import { expectedIntervalSeconds, assessJob } from "../scripts/check-cron-health.mjs";

/**
 * The value of a monitor is entirely in whether it fires when it should. These test the two decisions it
 * makes — how often a job is supposed to run, and whether what it actually did counts as a problem — without
 * needing a database.
 *
 * The case that matters most is the last one: a schedule shape the parser does not recognise must be
 * reported, never treated as healthy. A monitor that silently passes on input it does not understand is
 * worse than no monitor, because it is trusted.
 */

describe("expectedIntervalSeconds", () => {
  it.each([
    ["* * * * *", 60],
    ["*/10 * * * *", 600],
    ["*/5 * * * *", 300],
    ["0 * * * *", 3600],
    ["30 2 * * *", 86400],
    ["0 */6 * * *", 21600],
  ])("reads %s as %i seconds", (schedule, expected) => {
    expect(expectedIntervalSeconds(schedule)).toBe(expected);
  });

  it("returns null for a shape it does not understand, rather than guessing", () => {
    expect(expectedIntervalSeconds("0 0 * * 1-5")).toBeNull();
    expect(expectedIntervalSeconds("")).toBeNull();
    expect(expectedIntervalSeconds(undefined)).toBeNull();
  });
});

describe("assessJob", () => {
  const healthy = {
    jobname: "close-expired-business-sessions",
    schedule: "* * * * *",
    active: true,
    last_start: "2026-09-18T03:00:00Z",
    failures: 0,
    last_failure: null,
    last_failure_message: null,
    seconds_since_last_run: 30,
  };

  it("passes a job that ran recently with no failures", () => {
    expect(assessJob(healthy)).toEqual([]);
  });

  it("flags a job that has never run", () => {
    const problems = assessJob({ ...healthy, last_start: null });
    expect(problems.join(" ")).toContain("never run");
  });

  it("flags a job that is overdue by more than twice its schedule", () => {
    // Every minute, last seen 5 minutes ago.
    const problems = assessJob({ ...healthy, seconds_since_last_run: 300 });
    expect(problems.join(" ")).toContain("more than 2x");
  });

  it("tolerates one missed tick, which is jitter rather than a fault", () => {
    expect(assessJob({ ...healthy, seconds_since_last_run: 90 })).toEqual([]);
  });

  it("flags recent failures and carries the message through", () => {
    const problems = assessJob({
      ...healthy,
      failures: 3,
      last_failure_message: 'ERROR: relation "bulk_deals" does not exist',
    });
    expect(problems.join(" ")).toContain("3 failed run(s)");
    expect(problems.join(" ")).toContain("does not exist");
  });

  it("reports both problems when a job is overdue AND failing", () => {
    const problems = assessJob({ ...healthy, seconds_since_last_run: 600, failures: 2 });
    expect(problems).toHaveLength(2);
  });

  it("does not call an unknown schedule healthy", () => {
    const problems = assessJob({ ...healthy, schedule: "0 0 * * 1-5", seconds_since_last_run: 999999 });
    expect(problems.join(" ")).toContain("not a shape this check understands");
  });
});
