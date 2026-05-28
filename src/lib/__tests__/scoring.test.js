import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computePillarActivity,
  computePillarFuel,
  computePillarRecovery,
  computePillarProgress,
  computeTodayScore,
  getAvgRIRForExercise,
} from "../scoring.js";

// ── Date constants ───────────────────────────────────────────────────────────
// 2026-05-28 is a Thursday → SPLIT_MAP["Thu"] = "Upper B" → TRAINING day
const TRAINING_DAY = "2026-05-28";
// 2026-05-27 is a Wednesday → not in SPLIT_MAP → REST day
const REST_DAY = "2026-05-27";

// ── Minimal data factory ──────────────────────────────────────────────────────
function makeData(overrides = {}) {
  return {
    workouts: [],
    meals: {},
    weightLog: [],
    prs: [],
    measurements: [],
    profile: {
      calorieTarget: { training: 3000, rest: 2500 },
      proteinTarget: 180,
    },
    ...overrides,
  };
}

// ── computePillarActivity ────────────────────────────────────────────────────
describe("computePillarActivity", () => {
  it("rest day with no steps returns 75", () => {
    const data = makeData();
    expect(computePillarActivity(data, REST_DAY)).toBe(75);
  });

  it("rest day with steps < 8000 returns proportional score between 50-100", () => {
    // steps=4000 → Math.round(Math.min(100, 50 + (4000/8000)*50)) = 75
    const data = makeData({
      weightLog: [{ date: REST_DAY, steps: 4000 }],
    });
    expect(computePillarActivity(data, REST_DAY)).toBe(75);
  });

  it("rest day with steps = 8000 returns 100", () => {
    const data = makeData({
      weightLog: [{ date: REST_DAY, steps: 8000 }],
    });
    expect(computePillarActivity(data, REST_DAY)).toBe(100);
  });

  it("rest day with steps > 8000 caps at 100", () => {
    const data = makeData({
      weightLog: [{ date: REST_DAY, steps: 12000 }],
    });
    expect(computePillarActivity(data, REST_DAY)).toBe(100);
  });

  it("rest day with steps = 0 still returns 75 (base plan adherence)", () => {
    const data = makeData({
      weightLog: [{ date: REST_DAY, steps: 0 }],
    });
    expect(computePillarActivity(data, REST_DAY)).toBe(75);
  });

  it("training day with no workout logged returns 15", () => {
    const data = makeData();
    expect(computePillarActivity(data, TRAINING_DAY)).toBe(15);
  });

  it("training day with workout logged (no PRs) returns 88", () => {
    const data = makeData({
      workouts: [{ date: TRAINING_DAY, prs: 0 }],
    });
    expect(computePillarActivity(data, TRAINING_DAY)).toBe(88);
  });

  it("training day with workout + 1 PR returns 92", () => {
    // recentPRs from last 3 workouts: prs=1 → 88 + min(1*4, 12) = 92
    const data = makeData({
      workouts: [{ date: TRAINING_DAY, prs: 1 }],
    });
    expect(computePillarActivity(data, TRAINING_DAY)).toBe(92);
  });

  it("training day with workout + 3 PRs returns 100 (capped)", () => {
    // 88 + min(3*4, 12) = 88 + 12 = 100
    const data = makeData({
      workouts: [{ date: TRAINING_DAY, prs: 3 }],
    });
    expect(computePillarActivity(data, TRAINING_DAY)).toBe(100);
  });

  it("training day: sums PRs across last 3 workouts (not just today)", () => {
    // 3 recent workouts, 1 PR each → recentPRs = 3 → 88 + 12 = 100
    const data = makeData({
      workouts: [
        { date: TRAINING_DAY, prs: 1 },
        { date: "2026-05-26", prs: 1 },
        { date: "2026-05-25", prs: 1 },
        { date: "2026-05-20", prs: 5 }, // 4th workout — outside slice(-3), shouldn't count
      ],
    });
    // slice(-3) of the array filtered by date <= TRAINING_DAY gives last 3
    expect(computePillarActivity(data, TRAINING_DAY)).toBe(100);
  });

  it("training day: missing prs field treated as 0", () => {
    const data = makeData({
      workouts: [{ date: TRAINING_DAY }], // no prs key
    });
    expect(computePillarActivity(data, TRAINING_DAY)).toBe(88);
  });
});

// ── computePillarFuel ────────────────────────────────────────────────────────
describe("computePillarFuel", () => {
  it("no meals logged returns 0", () => {
    const data = makeData();
    expect(computePillarFuel(data, TRAINING_DAY, false)).toBe(0);
  });

  it("calories at 100% target, protein at 0% → returns 50", () => {
    const data = makeData({
      meals: { [TRAINING_DAY]: { calories: 3000, protein: 0 } },
    });
    expect(computePillarFuel(data, TRAINING_DAY, false)).toBe(50);
  });

  it("calories at 0%, protein at 100% target → returns 50", () => {
    const data = makeData({
      meals: { [TRAINING_DAY]: { calories: 0, protein: 180 } },
    });
    expect(computePillarFuel(data, TRAINING_DAY, false)).toBe(50);
  });

  it("both at 100% → returns 100", () => {
    const data = makeData({
      meals: { [TRAINING_DAY]: { calories: 3000, protein: 180 } },
    });
    expect(computePillarFuel(data, TRAINING_DAY, false)).toBe(100);
  });

  it("both at 50% → returns 50", () => {
    const data = makeData({
      meals: { [TRAINING_DAY]: { calories: 1500, protein: 90 } },
    });
    expect(computePillarFuel(data, TRAINING_DAY, false)).toBe(50);
  });

  it("over target on both → capped at 100", () => {
    const data = makeData({
      meals: { [TRAINING_DAY]: { calories: 6000, protein: 360 } },
    });
    expect(computePillarFuel(data, TRAINING_DAY, false)).toBe(100);
  });

  it("uses rest calorie target when isRest=true", () => {
    // rest target = 2500. Log 2500 cal + 180 protein = 100
    const data = makeData({
      meals: { [REST_DAY]: { calories: 2500, protein: 180 } },
    });
    expect(computePillarFuel(data, REST_DAY, true)).toBe(100);
  });

  it("uses training calorie target when isRest=false", () => {
    // training target = 3000. Log 2500 cal (83%) + 180 protein (100%) = 41 + 50 = 91
    const data = makeData({
      meals: { [TRAINING_DAY]: { calories: 2500, protein: 180 } },
    });
    expect(computePillarFuel(data, TRAINING_DAY, false)).toBe(Math.round(0.833 * 50 + 50));
  });

  it("returns 0 if calorie and protein targets are 0 (guard division by zero)", () => {
    const data = makeData({
      meals: { [TRAINING_DAY]: { calories: 500, protein: 100 } },
      profile: { calorieTarget: { training: 0, rest: 0 }, proteinTarget: 0 },
    });
    expect(computePillarFuel(data, TRAINING_DAY, false)).toBe(0);
  });
});

// ── computePillarRecovery ────────────────────────────────────────────────────
describe("computePillarRecovery", () => {
  it("no sleep logged, no weight → returns 0", () => {
    const data = makeData();
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(0);
  });

  it("sleep = 8h, no weight → returns 70", () => {
    // sleepPts = round(min(1, 8/8) * 70) = 70; weightPts = 0
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, sleep: 8 }],
    });
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(70);
  });

  it("sleep = 4h, no weight → returns 35", () => {
    // sleepPts = round(min(1, 4/8) * 70) = round(35) = 35
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, sleep: 4 }],
    });
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(35);
  });

  it("no sleep, weight logged → returns 30", () => {
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, weight: 180 }],
    });
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(30);
  });

  it("sleep = 8h + weight logged → returns 100", () => {
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, sleep: 8, weight: 180 }],
    });
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(100);
  });

  it("sleep > 8h → sleep pts capped at 70 (does not exceed 100 with weight)", () => {
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, sleep: 12, weight: 180 }],
    });
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(100);
  });

  it("sleep = 6h + weight → returns 83 (round(6/8 * 70) + 30 = 52 + 30)", () => {
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, sleep: 6, weight: 180 }],
    });
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(Math.round((6 / 8) * 70) + 30);
  });

  it("reads sleep from yesterday's entry if today has no sleep", () => {
    // yesterday = 2026-05-27 (REST_DAY)
    const data = makeData({
      weightLog: [
        { date: REST_DAY, sleep: 8 },        // yesterday's sleep
        { date: TRAINING_DAY, weight: 180 },  // today's weight but no sleep
      ],
    });
    // should pick up sleep from yesterday → 70 + 30 = 100
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(100);
  });

  it("prefers today's sleep over yesterday's if both present", () => {
    const data = makeData({
      weightLog: [
        { date: REST_DAY, sleep: 8 },
        { date: TRAINING_DAY, sleep: 4, weight: 180 },
      ],
    });
    // todayEntry.sleep = 4 → sleepPts = 35; weightPts = 30 → 65
    expect(computePillarRecovery(data, TRAINING_DAY)).toBe(35 + 30);
  });
});

// ── computePillarProgress ────────────────────────────────────────────────────
describe("computePillarProgress", () => {
  // Weight math: phaseTarget=185, startWeight=175.8
  // weightProgress = max(0, min(1, (currentW - 175.8) / (185 - 175.8)))
  // At starting weight (175.8 or no log): weightProgress = 0 → weightPts = 0

  it("no PRs, no weight log → returns 0", () => {
    const data = makeData();
    // currentW defaults to 175.8 → weightProgress = 0
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(0);
  });

  it("1 PR in last 30 days → 5 pts from PRs (+ 0 weight pts)", () => {
    const data = makeData({
      workouts: [{ date: TRAINING_DAY, prs: 1 }],
    });
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(5);
  });

  it("10 PRs in last 30 days → PR pts capped at 50", () => {
    const data = makeData({
      workouts: [{ date: TRAINING_DAY, prs: 10 }],
    });
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(50);
  });

  it("PRs older than 30 days do NOT count", () => {
    // 31 days before TRAINING_DAY (2026-05-28) = 2026-04-27
    const data = makeData({
      workouts: [{ date: "2026-04-27", prs: 5 }],
    });
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(0);
  });

  it("weight at phase goal (185 lbs) → full 50 weight pts", () => {
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, weight: 185 }],
    });
    // prPts = 0; weightProgress = 1 → weightPts = 50
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(50);
  });

  it("weight beyond phase goal still caps at 50 weight pts", () => {
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, weight: 200 }],
    });
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(50);
  });

  it("weight exactly halfway (180.4 lbs) → ~25 weight pts", () => {
    // (180.4 - 175.8) / (185 - 175.8) = 4.6 / 9.2 = 0.5 → 25 pts
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, weight: 180.4 }],
    });
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(Math.round(0.5 * 50));
  });

  it("weight below start (176 lbs) → weight progress above 0 (approaching start)", () => {
    // (176 - 175.8) / 9.2 ≈ 0.022 → round(0.022*50) = 1
    const data = makeData({
      weightLog: [{ date: TRAINING_DAY, weight: 176 }],
    });
    const result = computePillarProgress(data, TRAINING_DAY);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThan(5);
  });

  it("5 PRs in 30d + weight at 185 → returns 100", () => {
    const data = makeData({
      workouts: [{ date: TRAINING_DAY, prs: 10 }],
      weightLog: [{ date: TRAINING_DAY, weight: 185 }],
    });
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(100);
  });

  it("PRs exactly on the 30-day boundary date are included", () => {
    // 30 days before 2026-05-28 = 2026-04-28
    const data = makeData({
      workouts: [{ date: "2026-04-28", prs: 2 }],
    });
    // date >= date30Ago: "2026-04-28" >= "2026-04-28" → true → 10 pts
    expect(computePillarProgress(data, TRAINING_DAY)).toBe(10);
  });
});

// ── computeTodayScore ─────────────────────────────────────────────────────────
describe("computeTodayScore", () => {
  // computeTodayScore calls getToday() internally — we mock Date to control it

  beforeEach(() => {
    // Fix "today" to TRAINING_DAY (Thursday 2026-05-28)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fully zeroed data → composite is low (activity=15 on training day, rest=0)", () => {
    const data = makeData();
    const result = computeTodayScore(data);
    // Training day, no workout → activity=15, fuel=0, recovery=0, progress=0 → composite=4
    expect(result.composite).toBe(Math.round((15 + 0 + 0 + 0) / 4));
    expect(result.label).toBe("SLIPPING");
    expect(result.pillars).toMatchObject({ activity: 15, fuel: 0, recovery: 0, progress: 0 });
  });

  it("full perfect day → composite = 100, label = DIALLED", () => {
    const data = makeData({
      workouts: [{ date: "2026-05-28", prs: 10 }],
      meals: { "2026-05-28": { calories: 3000, protein: 180 } },
      weightLog: [{ date: "2026-05-28", weight: 185, sleep: 8 }],
    });
    const result = computeTodayScore(data);
    expect(result.composite).toBe(100);
    expect(result.label).toBe("DIALLED");
  });

  it("label DIALLED when composite >= 85", () => {
    // Craft data to get composite ≥ 85
    // activity=88 (workout, no PR), fuel=100, recovery=100, progress=50 → avg = 84.5 → 85
    const data = makeData({
      workouts: [{ date: "2026-05-28", prs: 0 }],
      meals: { "2026-05-28": { calories: 3000, protein: 180 } },
      weightLog: [{ date: "2026-05-28", weight: 185, sleep: 8 }],
    });
    const result = computeTodayScore(data);
    expect(result.composite).toBeGreaterThanOrEqual(85);
    expect(result.label).toBe("DIALLED");
  });

  it("label ON TRACK when composite 70-84", () => {
    // activity=88 (workout), fuel=50 (half cal, no protein), recovery=30 (weight only), progress=0
    // avg = (88+50+30+0)/4 = 42 — adjust to land in 70-84 range
    // activity=88, fuel=100, recovery=70 (sleep only, no weight), progress=0 → avg=64 — still low
    // activity=88, fuel=100, recovery=100, progress=0 → avg=72 → ON TRACK
    const data = makeData({
      workouts: [{ date: "2026-05-28", prs: 0 }],
      meals: { "2026-05-28": { calories: 3000, protein: 180 } },
      weightLog: [{ date: "2026-05-28", weight: 175.8, sleep: 8 }],
      // progress=0 because weight=175.8 (start) and no PRs
    });
    const result = computeTodayScore(data);
    expect(result.composite).toBeGreaterThanOrEqual(70);
    expect(result.composite).toBeLessThan(85);
    expect(result.label).toBe("ON TRACK");
  });

  it("label BUILDING when composite 55-69", () => {
    // activity=88, fuel=50, recovery=30, progress=0 → avg = (88+50+30+0)/4 = 42 — too low
    // activity=88, fuel=100, recovery=0, progress=0 → avg = 47 — too low
    // activity=88, fuel=75, recovery=70, progress=0 → avg = 58 → BUILDING
    const data = makeData({
      workouts: [{ date: "2026-05-28", prs: 0 }],
      meals: { "2026-05-28": { calories: 2250, protein: 90 } }, // 75% cal, 50% protein = 37+25=62 fuel
      weightLog: [{ date: "2026-05-28", sleep: 8 }],            // sleep only, no weight → 70 recovery
    });
    const result = computeTodayScore(data);
    expect(result.composite).toBeGreaterThanOrEqual(55);
    expect(result.composite).toBeLessThan(70);
    expect(result.label).toBe("BUILDING");
  });

  it("label SLIPPING when composite < 55", () => {
    const data = makeData(); // no workout → activity=15, everything else=0
    const result = computeTodayScore(data);
    expect(result.composite).toBeLessThan(55);
    expect(result.label).toBe("SLIPPING");
  });

  it("returns all four pillars in result", () => {
    const data = makeData();
    const result = computeTodayScore(data);
    expect(result).toHaveProperty("composite");
    expect(result).toHaveProperty("label");
    expect(result.pillars).toHaveProperty("activity");
    expect(result.pillars).toHaveProperty("fuel");
    expect(result.pillars).toHaveProperty("recovery");
    expect(result.pillars).toHaveProperty("progress");
  });
});

// ── getAvgRIRForExercise ──────────────────────────────────────────────────────
describe("getAvgRIRForExercise", () => {
  it("no workouts → returns null", () => {
    const data = makeData();
    expect(getAvgRIRForExercise(data, "Bench Press")).toBeNull();
  });

  it("workouts exist but exercise not present → returns null", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [{ name: "Squat", sets: [{ rir: 2 }] }],
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Bench Press")).toBeNull();
  });

  it("single workout, all sets string 'hard' → returns 1.0", () => {
    // RIR_NUMERIC.hard = 1
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [
            { name: "Bench Press", sets: [{ rir: "hard" }, { rir: "hard" }] },
          ],
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Bench Press")).toBe(1.0);
  });

  it("mixed string RIR: 'easy'(3) + 'hard'(1) → avg = 2.0", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [
            { name: "Bench Press", sets: [{ rir: "easy" }, { rir: "hard" }] },
          ],
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Bench Press")).toBe(2.0);
  });

  it("handles numeric RIR values directly", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [
            { name: "Bench Press", sets: [{ rir: 2 }, { rir: 0 }] },
          ],
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Bench Press")).toBe(1.0);
  });

  it("null/undefined RIR values on sets are skipped", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [
            {
              name: "Bench Press",
              sets: [{ rir: null }, { rir: undefined }, { rir: "good" }],
            },
          ],
        },
      ],
    });
    // Only "good"=2 counts
    expect(getAvgRIRForExercise(data, "Bench Press")).toBe(2.0);
  });

  it("all sets have null RIR → returns null", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [
            { name: "Bench Press", sets: [{ rir: null }, { rir: null }] },
          ],
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Bench Press")).toBeNull();
  });

  it("lookback=2 with 3 matching workouts → only uses last 2", () => {
    // Workouts ordered most-recent first (as they'd be stored)
    // Last 2: RIR 0 ("fail") each; 3rd has RIR 3 ("easy") — should NOT factor in
    const data = makeData({
      workouts: [
        {
          date: "2026-05-28",
          exercises: [{ name: "Bench Press", sets: [{ rir: "fail" }] }],
        },
        {
          date: "2026-05-26",
          exercises: [{ name: "Bench Press", sets: [{ rir: "fail" }] }],
        },
        {
          date: "2026-05-24",
          exercises: [{ name: "Bench Press", sets: [{ rir: "easy" }] }], // outside lookback
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Bench Press", 2)).toBe(0);
  });

  it("exercise name matching is case-insensitive and partial (first 10 chars)", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [
            { name: "incline bench press (smith machine)", sets: [{ rir: "good" }] },
          ],
        },
      ],
    });
    // Search "Incline Be" (first 10 chars) → should match "incline be..."
    expect(getAvgRIRForExercise(data, "Incline Bench Press")).toBe(2.0);
  });

  it("RIR 'fail' = 0 is included (not treated as null)", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [{ name: "Squat", sets: [{ rir: "fail" }] }],
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Squat")).toBe(0);
  });

  it("RIR 'good' = 2 → returns 2.0", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [{ name: "Deadlift", sets: [{ rir: "good" }, { rir: "good" }] }],
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Deadlift")).toBe(2.0);
  });
});

// ── calcProteinConsistency ────────────────────────────────────────────────────
import { calcProteinConsistency, getReadinessBanner } from "../scoring.js";

describe("calcProteinConsistency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no meals logged → returns 0 hits", () => {
    const data = makeData();
    expect(calcProteinConsistency(data)).toBe(0);
  });

  it("all 7 days hit protein target (>=90%) → returns 7", () => {
    // Today=2026-05-28. Build 7 days back.
    const meals = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date("2026-05-28T12:00:00");
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      meals[key] = { protein: 180 }; // exactly at target
    }
    const data = makeData({ meals });
    expect(calcProteinConsistency(data)).toBe(7);
  });

  it("protein exactly at 90% threshold → counts as hit", () => {
    // target=180. 90% of 180 = 162. protein=162 should count.
    const meals = { "2026-05-28": { protein: 162 } };
    const data = makeData({ meals });
    expect(calcProteinConsistency(data)).toBe(1);
  });

  it("protein just below 90% threshold → does NOT count", () => {
    // target=180. 90% = 162. protein=161 should not count.
    const meals = { "2026-05-28": { protein: 161 } };
    const data = makeData({ meals });
    expect(calcProteinConsistency(data)).toBe(0);
  });

  it("uses custom proteinTarget from profile", () => {
    // target=200. 90% = 180. Log 180 → should count.
    const meals = { "2026-05-28": { protein: 180 } };
    const data = makeData({
      meals,
      profile: { calorieTarget: { training: 3000, rest: 2500 }, proteinTarget: 200 },
    });
    expect(calcProteinConsistency(data)).toBe(1);
  });

  it("falls back to 180 when proteinTarget is missing", () => {
    const meals = { "2026-05-28": { protein: 162 } }; // 90% of 180
    const data = makeData({ meals, profile: {} });
    expect(calcProteinConsistency(data)).toBe(1);
  });

  it("only checks last 7 days (older meals don't count)", () => {
    const meals = { "2026-05-01": { protein: 200 } }; // 27 days ago
    const data = makeData({ meals });
    expect(calcProteinConsistency(data)).toBe(0);
  });
});

// ── getReadinessBanner ────────────────────────────────────────────────────────
describe("getReadinessBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no weight log entry for today → returns null", () => {
    const data = makeData();
    expect(getReadinessBanner(data)).toBeNull();
  });

  it("today's entry has no readiness → returns null", () => {
    const data = makeData({
      weightLog: [{ date: "2026-05-28", weight: 180 }],
    });
    expect(getReadinessBanner(data)).toBeNull();
  });

  it("readiness = 1 (Wrecked) → returns red banner with low-readiness text", () => {
    const data = makeData({
      weightLog: [{ date: "2026-05-28", readiness: 1 }],
    });
    const result = getReadinessBanner(data);
    expect(result).not.toBeNull();
    expect(result.color).toBe("#ff4444");
    expect(result.text).toContain("Low readiness");
    expect(result.text).toContain("Wrecked");
  });

  it("readiness = 2 (Tired) → returns red banner", () => {
    const data = makeData({
      weightLog: [{ date: "2026-05-28", readiness: 2 }],
    });
    const result = getReadinessBanner(data);
    expect(result).not.toBeNull();
    expect(result.text).toContain("Tired");
  });

  it("readiness = 3 (Average) → returns null (no banner for mid-range)", () => {
    const data = makeData({
      weightLog: [{ date: "2026-05-28", readiness: 3 }],
    });
    expect(getReadinessBanner(data)).toBeNull();
  });

  it("readiness = 4 (Good) → returns null", () => {
    const data = makeData({
      weightLog: [{ date: "2026-05-28", readiness: 4 }],
    });
    expect(getReadinessBanner(data)).toBeNull();
  });

  it("readiness = 5 (Dialled) → returns green banner with push-hard text", () => {
    const data = makeData({
      weightLog: [{ date: "2026-05-28", readiness: 5 }],
    });
    const result = getReadinessBanner(data);
    expect(result).not.toBeNull();
    expect(result.color).toBe("#c6f135");
    expect(result.text).toContain("push hard");
  });
});

// ── Branch coverage: defensive null paths ────────────────────────────────────
describe("getAvgRIRForExercise — branch coverage for null guards", () => {
  it("data.workouts = undefined → returns null (uses [] fallback)", () => {
    const data = makeData({ workouts: undefined });
    expect(getAvgRIRForExercise(data, "Bench Press")).toBeNull();
  });

  it("workout has no exercises key → skipped (uses [] fallback)", () => {
    const data = makeData({
      workouts: [{ date: TRAINING_DAY, exercises: undefined }],
    });
    // exercises?.some → false, so not matched — returns null
    expect(getAvgRIRForExercise(data, "Bench Press")).toBeNull();
  });

  it("exercise has no name → skipped (e.name falsy branch)", () => {
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [{ name: null, sets: [{ rir: "good" }] }],
        },
      ],
    });
    expect(getAvgRIRForExercise(data, "Bench Press")).toBeNull();
  });

  it("unknown RIR string not in RIR_NUMERIC map → treated as null (falls back to null)", () => {
    // RIR_NUMERIC has: easy/good/hard/fail. "moderate" is unknown → RIR_NUMERIC["moderate"] = undefined → ?? null
    const data = makeData({
      workouts: [
        {
          date: TRAINING_DAY,
          exercises: [{ name: "Bench Press", sets: [{ rir: "moderate" }] }],
        },
      ],
    });
    // "moderate" maps to null → rirValues is empty → returns null
    expect(getAvgRIRForExercise(data, "Bench Press")).toBeNull();
  });
});

describe("getReadinessBanner — branch coverage for null guards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("data.weightLog = undefined → returns null (uses [] fallback)", () => {
    const data = makeData({ weightLog: undefined });
    expect(getReadinessBanner(data)).toBeNull();
  });
});
