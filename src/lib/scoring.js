import { DAYS, SPLIT_MAP, RIR_NUMERIC } from "../constants";
import { getToday, toLocalDateStr } from "../utils";

export function computePillarActivity(data, today) {
  // 0-100: 100 = did everything you could do TODAY for activity
  const dayName = DAYS[new Date(today + "T12:00:00").getDay()];
  const isRest = !SPLIT_MAP[dayName];
  const todayEntry = (data.weightLog || []).find(w => w.date === today);
  const steps = todayEntry?.steps || 0;
  if (isRest) {
    // Rest day: following the plan = 75 base. Steps add up to 25 bonus (wearable placeholder).
    if (steps > 0) return Math.round(Math.min(100, 50 + (steps / 8000) * 50));
    return 75;
  }
  // Training day
  const sessionDone = (data.workouts || []).some(w => w.date === today);
  if (!sessionDone) return 15; // Session due — go log it
  const recentPRs = (data.workouts || []).filter(w => w.date <= today).slice(-3).reduce((a, w) => a + (w.prs || 0), 0);
  return Math.round(Math.min(100, 88 + Math.min(recentPRs * 4, 12)));
}

export function computePillarFuel(data, today, isRest) {
  // 0-100: hit daily kcal target (50%) + protein target (50%) = 100
  const todayMeals = data.meals[today] || { calories:0, protein:0 };
  const calTarget = isRest ? data.profile.calorieTarget.rest : data.profile.calorieTarget.training;
  const proteinTarget = data.profile.proteinTarget;
  const calRatio = calTarget > 0 ? Math.min(1, todayMeals.calories / calTarget) : 0;
  const protRatio = proteinTarget > 0 ? Math.min(1, todayMeals.protein / proteinTarget) : 0;
  return Math.round(calRatio * 50 + protRatio * 50);
}

export function computePillarRecovery(data, today) {
  // 0-100: log sleep (up to 70 pts based on hours, 8h = 70) + weigh in today (30 pts)
  const todayEntry = (data.weightLog || []).find(w => w.date === today);
  const yesterdayDate = (() => {
    const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - 1);
    return toLocalDateStr(d);
  })();
  const ydEntry = (data.weightLog || []).find(w => w.date === yesterdayDate);
  const lastSleep = todayEntry?.sleep || ydEntry?.sleep || 0;
  const sleepPts = lastSleep > 0 ? Math.round(Math.min(1, lastSleep / 8) * 70) : 0;
  const weightPts = (todayEntry?.weight) ? 30 : 0;
  return Math.min(100, sleepPts + weightPts);
}

export function computePillarProgress(data, today) {
  // 0-100: 50 pts from PRs in last 30 days (5 pts each, cap 50) + 50 pts from bulk trajectory
  const date30Ago = (() => {
    const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - 30);
    return toLocalDateStr(d);
  })();
  const recentPRs = (data.workouts || []).filter(w => w.date >= date30Ago).reduce((a, w) => a + (w.prs || 0), 0);
  const prPts = Math.min(50, recentPRs * 5);
  const lastWeight = [...(data.weightLog || [])].filter(w => w.weight).pop();
  const currentW = lastWeight?.weight || 175.8;
  const phaseTarget = 185;
  const weightProgress = Math.max(0, Math.min(1, (currentW - 175.8) / (phaseTarget - 175.8)));
  return Math.round(Math.min(100, prPts + weightProgress * 50));
}

export function computeTodayScore(data) {
  // Each pillar is 0-100. Composite = avg of all 4. If you nail everything today = 100.
  const today = getToday();
  const dayName = DAYS[new Date().getDay()];
  const isRest = !SPLIT_MAP[dayName];
  const activity = computePillarActivity(data, today);
  const fuel = computePillarFuel(data, today, isRest);
  const recovery = computePillarRecovery(data, today);
  const progress = computePillarProgress(data, today);
  const composite = Math.round((activity + fuel + recovery + progress) / 4);
  const label = composite >= 85 ? "DIALLED"
              : composite >= 70 ? "ON TRACK"
              : composite >= 55 ? "BUILDING"
              : "SLIPPING";
  return { composite, label, pillars: { activity, fuel, recovery, progress } };
}

export function calcProteinConsistency(data) {
  const today = getToday();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - i);
    days.push(toLocalDateStr(d));
  }
  const target = data.profile?.proteinTarget || 180;
  const hits = days.filter(date => {
    const m = data.meals?.[date];
    return m && (m.protein || 0) >= target * 0.9;
  }).length;
  return hits;
}

export function getAvgRIRForExercise(data, exerciseName, lookback = 3) {
  const recent = (data.workouts || [])
    .filter(w => w.exercises?.some(e =>
      e.name && e.name.toLowerCase().includes(exerciseName.toLowerCase().slice(0, 10))
    ))
    .slice(0, lookback);

  const rirValues = recent.flatMap(w =>
    (w.exercises || [])
      .filter(e => e.name && e.name.toLowerCase().includes(exerciseName.toLowerCase().slice(0, 10)))
      .flatMap(e => (e.sets || []).map(s => {
        const raw = s.rir;
        if (raw === null || raw === undefined) return null;
        // Handle both legacy numeric and new string formats (easy/good/hard/fail)
        if (typeof raw === "number") return raw;
        return RIR_NUMERIC[raw] ?? null;
      }).filter(r => r !== null))
  );

  if (rirValues.length === 0) return null;
  return rirValues.reduce((a, b) => a + b, 0) / rirValues.length;
}

export function getReadinessBanner(data) {
  const today = getToday();
  const entry = (data.weightLog || []).find(w => w.date === today);
  if (!entry?.readiness) return null;
  if (entry.readiness <= 2) return {
    text: `Low readiness today (${["","💀 Wrecked","😴 Tired"][entry.readiness]}) — reduce working sets by 1, prioritize movement quality`,
    color: "#ff4444", bg: "#1a0000"
  };
  if (entry.readiness === 5) return {
    text: "🔥 Fully dialled — push hard today, chase PRs",
    color: "#c6f135", bg: "#0d1a00"
  };
  return null;
}
