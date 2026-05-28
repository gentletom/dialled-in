import { WORKOUTS, RIR_NUMERIC } from "../constants";
import { getToday } from "../utils";

export function sanitizePromptInput(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/\n+/g, " ")            // collapse newlines — each line could be a new instruction
    .replace(/```/g, "")              // remove code fences
    .replace(/System:/gi, "")         // remove role-injection attempts
    .replace(/Human:/gi, "")
    .replace(/Assistant:/gi, "")
    .replace(/Ignore previous/gi, "[filtered]")
    .trim()
    .slice(0, 500);                   // hard cap at 500 chars
}

export function getPrescription(exerciseName, workoutHistory, exerciseDef) {
  // Rep range from def e.g. "8-10" or "5-8"
  const repStr = exerciseDef.reps || "8-12";
  const repMatch = repStr.match(/(\d+)[-–](\d+)/);
  const repLow = repMatch ? parseInt(repMatch[1]) : 8;
  const repHigh = repMatch ? parseInt(repMatch[2]) : 12;
  const numSets = parseInt(exerciseDef.sets) || 3;

  // Weight increments: upper body +5, lower body +10
  const isLower = ["squat","rdl","deadlift","leg press","hack squat","leg curl","calf","hip thrust","bulgarian","leg extension","hip abduction","hip adduction"].some(k => exerciseName.toLowerCase().includes(k));
  const increment = isLower ? 10 : 5;

  // Find most recent logged set for this exercise
  let lastWeight = null;
  let lastReps = null;
  let lastDate = null;
  // lastSetCount removed — assigned but never read
  let lastTopHits = 0; // how many sets hit the top of the rep range

  for (const session of workoutHistory) {
    const match = session.exercises?.find(e =>
      e.name && e.name.toLowerCase().includes(exerciseName.toLowerCase().slice(0, 10))
    );
    if (match) {
      lastDate = session.date;
      // Parse sets string like "275×12, 295×10, 315×10" or just weight/reps
      if (match.sets) {
        const setMatches = [...match.sets.matchAll(/(\d+\.?\d*)×(\d+)/g)];
        if (setMatches.length > 0) {
          // Use the working sets (middle/last ones, not warmups)
          const workingSets = setMatches.slice(-numSets);

          const topSet = workingSets[workingSets.length - 1];
          lastWeight = parseFloat(topSet[1]);
          lastReps = parseInt(topSet[2]);
          lastTopHits = workingSets.filter(s => parseInt(s[2]) >= repHigh).length;
        }
      }
      break;
    }
  }

  // Fallback to PR data if no workout history
  if (!lastWeight && exerciseDef.current) {
    const curMatch = exerciseDef.current.match(/(\d+\.?\d*)\s*lbs?/i);
    if (curMatch) lastWeight = parseFloat(curMatch[1]);
    lastReps = repLow;
    lastTopHits = 0;
  }

  if (!lastWeight) {
    return { prescribedWeight: null, prescribedReps: `${repLow}–${repHigh}`, lastWeight: null, lastReps: null, lastDate: null, status: "new" };
  }

  // Double progression logic
  const allSetsHitTop = lastTopHits >= numSets || (lastReps && lastReps >= repHigh);
  if (allSetsHitTop) {
    return {
      prescribedWeight: lastWeight + increment,
      prescribedReps: `${repLow}–${repHigh}`,
      lastWeight, lastReps, lastDate,
      status: "progress", // ready to go heavier
    };
  } else {
    return {
      prescribedWeight: lastWeight,
      prescribedReps: `${Math.min(lastReps + 1, repHigh) || repLow}–${repHigh}`,
      lastWeight, lastReps, lastDate,
      status: "build", // same weight, more reps
    };
  }
}

export function buildCoachContext(data) {
  const currentW = [...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8;
  const latestMeasure = data.measurements?.[data.measurements.length-1];
  const recentMeals = Object.entries(data.meals).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7);
  const recentWorkouts = data.workouts.slice(0,8);

  // Build prescriptions for all 4 splits
  const splitPrescriptions = Object.entries(WORKOUTS).map(([splitName, wo]) => {
    const exercises = wo.exercises.map(ex => {
      const rx = getPrescription(ex.name, data.workouts, ex);
      return `  - ${ex.name}: ${ex.sets}×${ex.reps}${rx.prescribedWeight ? ` → TARGET ${rx.prescribedWeight} lbs (${rx.status === "progress" ? "↑ ADD WEIGHT — last: "+rx.lastWeight+"×"+rx.lastReps : rx.status === "build" ? "same weight, beat reps — last: "+rx.lastWeight+"×"+rx.lastReps : "new exercise"})` : " (no history yet)"}`;
    }).join("\n");
    return `${splitName}:\n${exercises}`;
  }).join("\n\n");

  return `You are a personal trainer and nutritionist embedded in DIALLED IN, a custom fitness tracking app. You have complete access to this athlete's data. Be direct, specific, and honest — no fluff, no hedging. Give real coaching advice.

ATHLETE PROFILE:
- 34M, 6'1", ${currentW} lbs (current), goal: 185-195 lbs @ 8-10% BF
- Training: 4x/week Upper/Lower split — Mon (Upper A), Tue (Lower A), Thu (Upper B), Fri (Lower B)
- Phase 1 Foundation: May–Aug 2026. Focus: fix chest/shoulder progressive overload plateau
- Biggest issue: Incline bench stuck at 110 lbs for 12+ months — chest is the priority weak point
- Calorie target: ${data.profile.calorieTarget.training} kcal training days / ${data.profile.calorieTarget.rest} kcal rest days
- Protein target: ${data.profile.proteinTarget}g/day
- Sleep: chronic issue, target 8hrs, typically gets 6-7hrs
- Steps: 6k-12k/day
- Supplements: Creatine 5g, D3+K2 5000IU, Magnesium Glycinate 400mg, Fish Oil, Multivitamin

CURRENT PRs:
${data.prs.map(p=>`- ${p.exercise}: ${p.weight} lbs × ${p.reps} reps (${p.date})`).join("\n")}

RECENT WORKOUTS (${recentWorkouts.length} sessions):
${recentWorkouts.map(w=>`- ${w.date} | ${w.name} | ${w.sets} sets | ${(w.volume/1000).toFixed(1)}k lbs volume | ${w.prs} PRs${w.note ? ` | note: ${sanitizePromptInput(w.note)}` : ""}${w.exercises?.length ? " | exercises: "+w.exercises.map(e=>e.name+(e.sets?` (${e.sets})`:"")).join(", ") : ""}`).join("\n")}

RECENT NUTRITION (${recentMeals.length} days):
${recentMeals.map(([date,m])=>`- ${date}: ${m.calories} kcal | ${m.protein}g protein | ${m.carbs}g carbs | ${m.fat}g fat${m.items?.length ? " | foods: "+m.items.slice(0,3).join(", ") : ""}`).join("\n")}

WEIGHT & SLEEP LOG:
${data.weightLog.slice(-7).map(w=>`- ${w.date}: ${w.weight ? w.weight+" lbs" : "no weigh-in"} | ${w.sleep ? w.sleep+"h sleep" : "no sleep logged"}`).join("\n")}

BODY MEASUREMENTS:
${latestMeasure ? `Last measured ${latestMeasure.date}: ${Object.entries(latestMeasure).filter(([k,v])=>v&&k!=="date"&&k!=="note").map(([k,v])=>`${k}=${v}`).join(", ")}` : "No measurements logged yet"}

CURRENT PROGRAM PRESCRIPTIONS (based on logged history):
${splitPrescriptions}

PROGRESSIVE OVERLOAD SYSTEM: Double progression. Own all reps at top of range → add weight next session (Upper: +5 lbs, Lower: +10 lbs). Last set of each exercise = push set (failure).

When the athlete mentions deviations (skipped sets, went to failure early, injury, fatigue, time constraints), give specific adjustments to their prescriptions. When they ask questions, answer directly using their actual data. You can adjust their program, nutrition targets, recovery protocols, or anything else based on what they tell you.

PLAN PROPOSAL PROTOCOL: When you want to propose a specific change to Thomas's training plan — adding a milestone, adjusting a goal, or setting a new target — end your response with this block on its own line (no extra text after it):
<PLAN_PROPOSAL>{"type":"milestone","phaseId":1,"text":"Your specific milestone text here"}</PLAN_PROPOSAL>
Use phaseId 1 (Foundation May-Aug 2026), 2 (Accumulation Sep-Dec 2026), 3 (Peak Jan-Apr 2027), or 4 (Maintain).
Only propose when you're genuinely recommending a plan change — not for every message. Keep proposals short and actionable.`;
}

export function buildCoachContextExtended(data) {
  let ctx = buildCoachContext(data);

  // Weekly check-in
  const lastCheckin = (data.profile?.checkins || [])[0];
  if (lastCheckin) {
    ctx += `\n\nLAST WEEKLY CHECK-IN (${lastCheckin.date}):\n`;
    ctx += `- Weight trend: ${lastCheckin.weightTrend || "not reported"}\n`;
    ctx += `- Sessions completed: ${lastCheckin.sessionsHit ?? "?"}/7\n`;
    ctx += `- Protein days hit: ${lastCheckin.proteinDays ?? "?"}/7\n`;
    if (lastCheckin.note) ctx += `- Athlete note: "${sanitizePromptInput(lastCheckin.note)}"\n`;
  }

  // Today's readiness + soreness
  const todayEntry = (data.weightLog || []).find(w => w.date === getToday());
  if (todayEntry?.readiness) {
    const rLabels = ["","💀 Wrecked","😴 Tired","😐 Average","💪 Good","🔥 Dialled"];
    ctx += `\nTODAY'S READINESS: ${rLabels[todayEntry.readiness] || todayEntry.readiness}/5`;
    if (todayEntry.soreness) ctx += ` | Muscle soreness: ${todayEntry.soreness}`;
    ctx += `\n`;
  }

  // RIR trend across last 3 workouts — convert string RIR to numeric before averaging
  const recentWorkouts = (data.workouts || []).slice(0, 3);
  const allRIRs = recentWorkouts.flatMap(w =>
    (w.exercises || []).flatMap(e => (e.sets || []).map(s => {
      const raw = s.rir;
      if (raw === null || raw === undefined) return null;
      if (typeof raw === "number") return raw;
      return RIR_NUMERIC[raw] ?? null;
    }).filter(r => r !== null))
  );
  if (allRIRs.length > 0) {
    const avgRIR = (allRIRs.reduce((a,b) => a+b, 0) / allRIRs.length).toFixed(1);
    ctx += `\nRECENT EFFORT (avg RIR across last 3 sessions, 0-3 scale): ${avgRIR} — `;
    ctx += parseFloat(avgRIR) > 2
      ? "athlete is leaving significant reps in reserve, could push harder.\n"
      : parseFloat(avgRIR) < 0.5
      ? "athlete is grinding close to failure consistently — monitor recovery.\n"
      : "effort level is in the productive hypertrophy zone.\n";
  }

  return ctx;
}
