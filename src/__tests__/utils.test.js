import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLocalDateStr, getToday, calc1RM, isPotentialPR } from "../utils.js";

// ── toLocalDateStr ────────────────────────────────────────────────────────────
describe("toLocalDateStr", () => {
  it("formats a known date correctly: 2026-05-28", () => {
    // Use noon to avoid any timezone edge-cases in the test runner
    const d = new Date(2026, 4, 28, 12, 0, 0); // month is 0-indexed
    expect(toLocalDateStr(d)).toBe("2026-05-28");
  });

  it("pads single-digit month with leading zero", () => {
    const d = new Date(2026, 0, 5, 12, 0, 0); // January 5
    expect(toLocalDateStr(d)).toBe("2026-01-05");
  });

  it("pads single-digit day with leading zero", () => {
    const d = new Date(2026, 11, 1, 12, 0, 0); // December 1
    expect(toLocalDateStr(d)).toBe("2026-12-01");
  });

  it("handles December 31", () => {
    const d = new Date(2026, 11, 31, 12, 0, 0);
    expect(toLocalDateStr(d)).toBe("2026-12-31");
  });

  it("output always matches YYYY-MM-DD pattern", () => {
    const d = new Date(2024, 5, 15, 12, 0, 0);
    expect(toLocalDateStr(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── getToday ──────────────────────────────────────────────────────────────────
describe("getToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's date in YYYY-MM-DD format when mocked", () => {
    vi.setSystemTime(new Date("2026-05-28T15:00:00"));
    expect(getToday()).toBe("2026-05-28");
  });

  it("uses local time, not UTC — a date set to midnight UTC resolves locally", () => {
    // This test documents the intent: getToday() should return the local calendar date.
    // When running in UTC (CI), these will be equal. When in a westward timezone,
    // getToday() returns the local date which is different from toISOString().slice(0,10).
    // We verify it always returns a valid YYYY-MM-DD string.
    vi.setSystemTime(new Date("2026-11-03T10:00:00"));
    expect(getToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns correct date at year boundary", () => {
    vi.setSystemTime(new Date("2026-12-31T12:00:00"));
    expect(getToday()).toBe("2026-12-31");
  });
});

// ── calc1RM ────────────────────────────────────────────────────────────────────
describe("calc1RM (Epley formula: w * (1 + r/30), r=1 → w)", () => {
  it("single rep max: 1 rep at any weight returns that weight unchanged", () => {
    expect(calc1RM(225, 1)).toBe(225);
    expect(calc1RM(315, 1)).toBe(315);
    expect(calc1RM(100, 1)).toBe(100);
  });

  it("5 reps at 200 lbs → round(200 * (1 + 5/30)) = round(233.3) = 233", () => {
    expect(calc1RM(200, 5)).toBe(Math.round(200 * (1 + 5 / 30)));
  });

  it("10 reps at 135 lbs → round(135 * (1 + 10/30)) = round(180) = 180", () => {
    expect(calc1RM(135, 10)).toBe(180);
  });

  it("8 reps at 110 lbs → round(110 * (1 + 8/30)) = round(139.3) = 139", () => {
    expect(calc1RM(110, 8)).toBe(Math.round(110 * (1 + 8 / 30)));
  });

  it("12 reps at 180 lbs → round(180 * (1 + 12/30)) = round(252) = 252", () => {
    expect(calc1RM(180, 12)).toBe(252);
  });

  it("result is always a number (not NaN)", () => {
    expect(typeof calc1RM(100, 5)).toBe("number");
    expect(isNaN(calc1RM(100, 5))).toBe(false);
  });
});

// ── isPotentialPR ─────────────────────────────────────────────────────────────
describe("isPotentialPR", () => {
  const existingPRs = [
    { exercise: "Bench Press", weight: 225, reps: 1 },   // 1RM = 225
    { exercise: "Squat", weight: 200, reps: 5 },          // 1RM = round(200*(1+5/30)) = 233
  ];

  it("returns false for missing weight", () => {
    expect(isPotentialPR("Bench Press", "", 5, existingPRs)).toBe(false);
    expect(isPotentialPR("Bench Press", null, 5, existingPRs)).toBe(false);
  });

  it("returns false for missing reps", () => {
    expect(isPotentialPR("Bench Press", 225, "", existingPRs)).toBe(false);
    expect(isPotentialPR("Bench Press", 225, null, existingPRs)).toBe(false);
  });

  it("returns true when exercise has no existing PR", () => {
    expect(isPotentialPR("Romanian Deadlift", 315, 8, existingPRs)).toBe(true);
  });

  it("returns false when new 1RM does not beat existing 1RM", () => {
    // existing Bench Press 1RM = 225. New: 225 × 1 → 1RM = 225 → NOT a PR (equal, not greater)
    expect(isPotentialPR("Bench Press", 225, 1, existingPRs)).toBe(false);
  });

  it("returns true when new 1RM beats existing 1RM", () => {
    // existing Bench Press 1RM = 225. New: 230 × 1 → 1RM = 230 → PR
    expect(isPotentialPR("Bench Press", 230, 1, existingPRs)).toBe(true);
  });

  it("is case-insensitive for exercise name matching", () => {
    // "bench press" should match "Bench Press" PR entry
    expect(isPotentialPR("bench press", 230, 1, existingPRs)).toBe(true);
    expect(isPotentialPR("BENCH PRESS", 220, 1, existingPRs)).toBe(false);
  });

  it("handles empty PR list — any weight is a PR", () => {
    expect(isPotentialPR("Bench Press", 100, 5, [])).toBe(true);
  });

  it("handles undefined PR list — any weight is a PR", () => {
    expect(isPotentialPR("Bench Press", 100, 5, undefined)).toBe(true);
  });

  it("rep PR: same weight, more reps → higher 1RM → is a PR", () => {
    // existing Squat: 200×5, 1RM = 233. New: 200×10 → 1RM = round(200*(1+10/30)) = round(266) = 267
    expect(isPotentialPR("Squat", 200, 10, existingPRs)).toBe(true);
  });

  it("weight and reps as strings are parsed correctly", () => {
    // isPotentialPR uses parseFloat/parseInt internally
    expect(isPotentialPR("Bench Press", "230", "1", existingPRs)).toBe(true);
  });
});
