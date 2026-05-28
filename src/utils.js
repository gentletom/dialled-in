// ── Pure date / string utilities ──────────────────────────────────

// Local-time YYYY-MM-DD — using toISOString() is UTC and rolls over at the wrong moment
// for users not in UTC, which silently corrupts dates (e.g. logging 8pm EST as tomorrow).
export function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Convert a Date object to local-time YYYY-MM-DD string (used for date-picker max values, history scans, etc.)
export function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTodayLabel() {
  const d = new Date();
  const days = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${days[d.getDay()]} · ${months[d.getMonth()]} ${d.getDate()} · ${d.getFullYear()}`;
}

export function calc1RM(w, r) { return r === 1 ? w : Math.round(w * (1 + r / 30)); }

export function fmtRelativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

// Inline PR detection: would this weight×reps beat the existing PR?
export function isPotentialPR(exerciseName, weight, reps, prs) {
  const w = parseFloat(weight);
  const r = parseInt(reps);
  if (!w || !r) return false;
  const new1 = calc1RM(w, r);
  const exist = (prs || []).find(p => p.exercise.toLowerCase() === (exerciseName || "").toLowerCase());
  if (!exist) return true;
  return new1 > calc1RM(exist.weight, exist.reps);
}

export function getCompletenessItems(data) {
  const today = getToday();
  const thisWeekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return toLocalDateStr(d); })();
  const todayEntry = data.weightLog.find(w => w.date === today);
  const weekWorkouts = data.workouts.filter(w => w.date >= thisWeekStart);
  const trainingDaysThisWeek = [1,2,4,5].filter(d => {
    const dt = new Date(); dt.setDate(dt.getDate() - (dt.getDay() - d + 7) % 7);
    return toLocalDateStr(dt) <= today && toLocalDateStr(dt) >= thisWeekStart;
  }).length;
  const todayMeals = data.meals[today] || { calories:0, protein:0, carbs:0, fat:0 };
  const latestMeasure = data.measurements?.[data.measurements.length - 1];
  const daysSinceMeasure = latestMeasure?.date ? Math.round((new Date(today) - new Date(latestMeasure.date)) / 86400000) : 999;
  const yesterdayKey = (() => { const d = new Date(); d.setDate(d.getDate()-1); return toLocalDateStr(d); })();
  const yesterdayMeals = data.meals[yesterdayKey];
  return [
    { id:"weight_today", label:"Log today's weight", done:!!todayEntry?.weight, priority:"high", action:"weight", hint:"Opens weight logger" },
    { id:"sleep_today", label:"Log last night's sleep", done:!!todayEntry?.sleep, priority:"high", action:"weight", hint:"Tracked in weight logger" },
    { id:"meals_today", label:"Track today's meals", done:todayMeals.calories >= data.profile.calorieTarget.rest * 0.5, priority:"high", action:"meal", hint:`${todayMeals.calories} kcal logged so far` },
    { id:"protein_today", label:`Hit protein target (${data.profile.proteinTarget}g)`, done:todayMeals.protein >= data.profile.proteinTarget * 0.85, priority:"medium", action:"meal", hint:`${todayMeals.protein}g logged today` },
    { id:"meals_yesterday", label:"Fill in yesterday's meals", done:!!yesterdayMeals?.calories, priority:"medium", action:"meal_hist", hint:"Tap to log yesterday" },
    { id:"workouts_week", label:`Log workouts this week (${weekWorkouts.length}/${trainingDaysThisWeek})`, done:weekWorkouts.length >= trainingDaysThisWeek, priority:"medium", action:"workout", hint:weekWorkouts.length === 0 ? "No sessions logged this week" : `${weekWorkouts.length} session${weekWorkouts.length!==1?"s":""} logged` },
    { id:"measurements", label:"Body measurements this month", done:daysSinceMeasure < 32, priority:"low", action:"measurements", hint:daysSinceMeasure === 999 ? "Never logged" : `Last logged ${daysSinceMeasure} days ago` },
    { id:"prs_current", label:"PR board up to date", done:data.prs.length >= 5, priority:"low", action:"pr", hint:`${data.prs.length} PRs tracked` },
  ];
}
