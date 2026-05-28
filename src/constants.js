// ── Design tokens ─────────────────────────────────────────────────
export const C = {
  bg:"#070709", surface:"#101014", surfaceAlt:"#0C0C10",
  border:"#1C1C24", borderHi:"#282833",
  lime:"#C8FF00", limeGlow:"rgba(200,255,0,0.12)",
  teal:"#00E5CC", orange:"#FF5C35", purple:"#9D7FFF", blue:"#4488FF",
  amber:"#FFB800",
  white:"#FFFFFF", gray:"#505060", grayMid:"#808090", grayLight:"#AAAABC",
  dark:"#000000",
};
export const F = {
  display: "'Bebas Neue',sans-serif",
  mono: "'IBM Plex Mono',monospace",
  body: "'Inter',sans-serif",
};

// ── Calendar helpers ──────────────────────────────────────────────
export const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const SPLIT_MAP = { Mon:"Upper A", Tue:"Lower A", Thu:"Upper B", Fri:"Lower B" };

// RIR string → numeric map. easy=~3 reps in reserve, good=~2, hard=~1, fail=0
export const RIR_NUMERIC = { easy: 3, good: 2, hard: 1, fail: 0 };

// ── Pillar info (for PillarInfoDrawer) ───────────────────────────
export const PILLAR_INFO = {
  ACT: {
    clr:"#9D7FFF", title:"ACTIVITY", subtitle:"Training sessions + daily movement",
    what:"Training days: log your session to hit 88, chase a PR to reach 100. Rest days: 75 base for following the plan — steps from wearable will unlock the full rest-day score soon.",
    tips:["Log today's session in LIFTS","Hit your prescribed sets and reps","Chase any PR — even a rep PR counts"],
    restNote:"Rest day — you're doing the right thing. Smart recovery is part of the program. Steps via wearable integration will fully power this ring soon.",
  },
  FUEL: {
    clr:"#FFB800", title:"FUEL", subtitle:"Daily calorie + protein tracking",
    what:"50% from hitting your calorie target + 50% from hitting your protein target. Hit both by end of day = 100.",
    tips:["Log your next meal in FUEL","Prioritize a protein source — chicken, eggs, shake","Track everything — even small snacks add up"],
    restNote:null,
  },
  RECOV: {
    clr:"#4488FF", title:"RECOVERY", subtitle:"Sleep quality + daily weigh-in",
    what:"Up to 70 pts from sleep quality (8 hours = full sleep score) + 30 pts for logging your weight today. Do both = 100.",
    tips:["Tap LOG TODAY on HOME to log last night's sleep","Aim for 7-9h — 8h is the sweet spot","Weigh in every morning for full recovery points"],
    restNote:null,
  },
  PROG: {
    clr:"#00E5CC", title:"PROGRESS", subtitle:"PRs + bulk trajectory",
    what:"50 pts from PRs logged in the last 30 days (5 per PR) + 50 pts from weight progress toward your phase goal of 185 lbs. Your long game.",
    tips:["Hit any PR in any lift — even a rep PR counts","Weigh in daily for an accurate progress picture","Consistent sessions compound into strength gains over time"],
    restNote:null,
  },
};

// ── Workout definitions ───────────────────────────────────────────
export const WORKOUTS = {
  "Upper A": {
    label:"UPPER A", focus:"Chest · Back · Shoulders", color:C.blue, bg:"#080E1A",
    duration:"~55 min", note:"Chest is the priority. Lock in incline bench before going heavier.",
    exercises:[
      { name:"Incline Bench Press (Smith Machine)", sets:"4", reps:"8-10", current:"110 lbs", target:"130 lbs by Aug", pr:"110 × 8", note:"Full ROM. Last 2 sets to failure with a spot." },
      { name:"Chest Fly (Pec Deck / Cable)", sets:"3", reps:"12-15", current:"~105 lbs", target:"130 lbs", pr:null, note:"Slow negative, big stretch. This is where chest grows." },
      { name:"Lat Pulldown (Wide Grip)", sets:"3", reps:"10-12", current:"140 lbs", target:"160 lbs", pr:null, note:"Pull elbows down and back. Lats wide.", supersetGroup:"A" },
      { name:"Lat Pulldown (Reverse Grip)", sets:"3", reps:"10-12", current:"140 lbs", target:"160 lbs", pr:null, note:"Elbows to hips at bottom. Pause squeeze.", supersetGroup:"A" },
      { name:"Seated Cable Row (V-Grip)", sets:"3", reps:"10-12", current:"140-160 lbs", target:"175 lbs", pr:null, note:"Retract fully, pause at peak contraction." },
      { name:"Shoulder Press (Machine Plates)", sets:"3", reps:"12-15", current:"55 lbs", target:"70 lbs", pr:"55 × 22", note:"Own 15 clean reps before touching 60 lbs." },
      { name:"Lateral Raise (DB or Cable)", sets:"3", reps:"15-20", current:"17.5 lbs", target:"27.5 lbs", pr:null, note:"Slow and controlled. Lead with elbows." },
      { name:"Cable Crunch", sets:"3", reps:"12-15", current:"52.5 lbs", target:"70 lbs", pr:null, note:"Pull from the core, not the arms." },
      { name:"Plank", sets:"2", reps:"60-90s", current:"66s", target:"90s+", pr:null, metric:"time", note:"Squeeze everything. Hips level." },
    ],
  },
  "Lower A": {
    label:"LOWER A", focus:"Posterior Chain", color:C.teal, bg:"#040E0C",
    duration:"~55 min", note:"RDL is your signature lift. Treat this day like the main event.",
    exercises:[
      { name:"Romanian Deadlift (Barbell)", sets:"4", reps:"8-10", current:"315 lbs", target:"365 lbs by Aug", pr:"315 × 10", note:"Slow and strict. Hips back, feel the hamstring stretch fully." },
      { name:"Bulgarian Split Squat", sets:"3", reps:"10 each", current:"160-180 lbs", target:"200 lbs", pr:null, unilateral:true, note:"3-count eccentric. Quad at parallel or below." },
      { name:"Hip Adduction (Machine)", sets:"3", reps:"10-12", current:"305 lbs", target:"330 lbs", pr:"305 × 6", note:"Full squeeze at close. Don't let it snap back." },
      { name:"Hip Abduction (Machine)", sets:"4", reps:"14-16", current:"240 lbs", target:"265 lbs", pr:"240 × 15", note:"Lean forward slightly for glutes. 5 slow pulses last set." },
      { name:"Lying Leg Curl (Machine)", sets:"3", reps:"12-14", current:"105-120 lbs", target:"135 lbs", pr:null, note:"Slow on the negative. Squeeze hard at top." },
      { name:"Seated Calf Raise", sets:"3", reps:"12-15", current:"210-235 lbs", target:"255 lbs", pr:null, note:"Full stretch at bottom every rep. Pause at top." },
      { name:"Plank", sets:"2", reps:"60s", current:"66s", target:"90s+", pr:null, metric:"time", note:"Core braced, hold it." },
    ],
  },
  "Upper B": {
    label:"UPPER B", focus:"Chest Flies · Triceps", color:C.orange, bg:"#130800",
    duration:"~55 min", note:"Pec deck is the priority today — secondary chest growth driver.",
    exercises:[
      { name:"Pec Deck (Chest Fly Machine)", sets:"4", reps:"12-15", current:"~105 lbs", target:"135 lbs by Aug", pr:null, note:"THIS is the set. Slow negative, huge stretch, hard squeeze." },
      { name:"Decline Chest Press (Machine)", sets:"3", reps:"10-12", current:"~172 lbs", target:"210 lbs", pr:null, note:"Different angle from Monday. Let it load the lower chest." },
      { name:"Triceps Pressdown (Wide Bar)", sets:"4", reps:"10-12", current:"65 lbs", target:"80 lbs", pr:null, note:"Elbows pinned. Drop sets last 2 sets." },
      { name:"Skull Crusher / Overhead Extension", sets:"3", reps:"10-12", current:"~45 lbs", target:"65 lbs", pr:null, note:"Long head stretch. Full lockout." },
      { name:"Lat Pulldown (Wide Grip)", sets:"3", reps:"10-12", current:"140 lbs", target:"160 lbs", pr:null, note:"Pull elbows down and back." },
      { name:"Preacher Curl (Machine)", sets:"4", reps:"8-10", current:"81-106 lbs", target:"120 lbs", pr:"106 × 6", note:"Peak contraction, full stretch. Last set = absolute failure." },
      { name:"Torso Rotation (Cable)", sets:"3", reps:"20 each", current:"110 lbs", target:"130 lbs", pr:null, note:"Rotate from core, not shoulders." },
      { name:"Plank", sets:"2", reps:"60s", current:"66s", target:"90s+", pr:null, metric:"time", note:"Lock it in." },
    ],
  },
  "Lower B": {
    label:"LOWER B", focus:"Quads · Squat Focus", color:C.purple, bg:"#0C0818",
    duration:"~55 min", note:"Squat is the mission this day. Depth first, then add weight.",
    exercises:[
      { name:"Squat (Barbell)", sets:"4", reps:"5-8", current:"205 lbs", target:"245 lbs by Aug", pr:"205 × 4", note:"Parallel or below every rep. Add 5 lbs when you own all 4 sets." },
      { name:"Leg Press (Horizontal)", sets:"3", reps:"12-15", current:"275-285 lbs", target:"315 lbs", pr:"285 × 5 / 275 × 14", note:"Legs are pre-fatigued after squats. Higher reps, full ROM." },
      { name:"Hack Squat or Leg Extension", sets:"3", reps:"12-15", current:"building", target:"establish by Jun", pr:null, note:"Quad isolation. Squeeze at top." },
      { name:"Romanian Deadlift (Light)", sets:"3", reps:"12-15", current:"225-250 lbs", target:"keep light", pr:null, note:"Stretch focused today, not strength. 225-250 max." },
      { name:"Standing Calf Raise", sets:"3", reps:"12-15", current:"320-330 lbs", target:"345 lbs", pr:"330 × 11", note:"Full stretch at bottom every rep. Pause at top." },
      { name:"Plank", sets:"2", reps:"75-90s", current:"84s", target:"90s+", pr:null, metric:"time", note:"End strong." },
    ],
  },
};

// ── Freestyle workout placeholder ─────────────────────────────────
export const FREESTYLE_WO = {
  label:"FREESTYLE", focus:"Open session — add exercises as you go", color:"#AAAAAA", bg:"#0A0A0A",
  duration:null, note:"No plan today — just train. Add any exercises you want.",
  exercises:[],
};

// ── 4-Phase Roadmap ───────────────────────────────────────────────
export const PHASES = [
  {
    id:1, name:"FOUNDATION", sub:"Fix the Imbalances", emoji:"🔧",
    months:"May – Aug 2026", duration:"4 months", status:"active", color:C.blue, bg:"#080E1A",
    weightRange:"175.8 → 182 lbs", bfRange:"~16% → ~14%",
    calTraining:3200, calRest:3000, protein:"190–200g", carbs:"350–400g", fat:"90–100g",
    surplus:"+200 kcal lean surplus",
    goal:"Establish chest & shoulder progressive overload. Lock in nutrition consistency. Build the habit of showing up every single week.",
    keyLifts:[
      { name:"Incline Bench (Smith)", now:"110 × 8", target:"130 × 8" },
      { name:"Shoulder Press (Machine)", now:"55 × 16", target:"70 × 12" },
      { name:"RDL (Barbell)", now:"315 × 10", target:"365 × 8" },
      { name:"Squat (Barbell)", now:"205 × 4", target:"245 × 5" },
      { name:"Preacher Curl (Machine)", now:"106 × 6", target:"120 × 8" },
      { name:"Calf Raise (Standing)", now:"330 × 11", target:"350 × 12" },
    ],
    milestones:[
      "Hit protein target (190g+) 5 out of 7 days consistently",
      "Incline bench past 125 lbs for 8 clean reps",
      "Squat hitting 225 lbs with full depth",
      "Sleep average above 7.5 hrs/night",
      "Body weight reaches 180 lbs",
      "Take progress photos at end of Aug",
    ],
    supplements:["Creatine 5g/day","D3+K2 5000 IU morning","Magnesium Glycinate 400mg bedtime","Fish Oil (Costco)","Multivitamin (Costco)"],
  },
  {
    id:2, name:"ACCUMULATION", sub:"Push Everything Up", emoji:"📈",
    months:"Sep – Dec 2026", duration:"4 months", status:"future", color:C.teal, bg:"#040E0C",
    weightRange:"182 → 188 lbs", bfRange:"~14% → ~13%",
    calTraining:3400, calRest:3100, protein:"200–210g", carbs:"380–420g", fat:"95–105g",
    surplus:"+300 kcal surplus",
    goal:"Increase training volume. Add sets. Push all lifts hard. Measure body fat — not just weight. Chest should be noticeably fuller.",
    keyLifts:[
      { name:"Incline Bench (Smith)", now:"130 × 8", target:"150 × 8" },
      { name:"Shoulder Press", now:"70 × 12", target:"85 × 10" },
      { name:"RDL (Barbell)", now:"365 × 8", target:"405 × 6" },
      { name:"Squat (Barbell)", now:"245 × 5", target:"275 × 5" },
      { name:"Pec Deck", now:"~120 lbs", target:"145 × 12" },
      { name:"Triceps Pressdown", now:"70 lbs", target:"85 lbs" },
    ],
    milestones:[
      "Incline bench past 145 lbs — year-long sticking point broken",
      "Visible upper chest fullness in mirror",
      "Body weight 185+ lbs",
      "Body fat measured below 14%",
      "RDL hits 400+ lbs",
      "Mid-phase progress photos vs Phase 1",
    ],
    supplements:["Same stack — consider Ashwagandha for cortisol under higher volume"],
  },
  {
    id:3, name:"LEAN OUT", sub:"Reveal the Physique", emoji:"⚡",
    months:"Jan – Apr 2027", duration:"4 months", status:"future", color:C.amber, bg:"#0F0900",
    weightRange:"188 → 190–192 lbs", bfRange:"~13% → ~10%",
    calTraining:3100, calRest:2800, protein:"210g+", carbs:"320–350g", fat:"80–90g",
    surplus:"Mild deficit — protect muscle, reveal it",
    goal:"Slight cut while maintaining all muscle. Abs start appearing. Protein goes UP to protect gains while calories come down.",
    keyLifts:[
      { name:"Incline Bench", now:"150 × 8", target:"Maintain / +5-10 lbs" },
      { name:"RDL", now:"405 × 6", target:"Maintain strength" },
      { name:"Squat", now:"275 × 5", target:"Maintain or improve" },
      { name:"Shoulder Press", now:"85 × 10", target:"Maintain" },
    ],
    milestones:[
      "Abs visible at rest — the 6-pack shows up",
      "V-taper visible from front and back",
      "Weight 190–193 lbs at ~10% BF",
      "Full chest visible in a T-shirt",
      "Capped shoulders — 3D look achieved",
      "Before/after photos tell the full story",
    ],
    supplements:["Same base stack","Consider L-Carnitine for fat metabolism during cut"],
  },
  {
    id:4, name:"ATHLETE MODE", sub:"This Is the Goal", emoji:"🏆",
    months:"May 2027+", duration:"Ongoing", status:"future", color:C.lime, bg:"#0A1100",
    weightRange:"185–195 lbs sustained", bfRange:"8–10% sustained",
    calTraining:3100, calRest:2800, protein:"190–200g", carbs:"330–360g", fat:"85–95g",
    surplus:"Intuitive — mini-bulks and mini-cuts as needed",
    goal:"Athletic, aesthetic, lean. Visible 6-pack year-round. Full chest, capped shoulders, V-taper. Mini-bulks if weight drops below 185. Mini-cuts if above 195.",
    keyLifts:[
      { name:"Incline Bench", now:"", target:"175–185 × 6-8" },
      { name:"Shoulder Press", now:"", target:"100–110 × 10" },
      { name:"RDL", now:"", target:"425+ × 6" },
      { name:"Squat", now:"", target:"315 × 5" },
    ],
    milestones:[
      "Goal physique held year-round",
      "Clothes fit completely differently",
      "Performance athlete strength + aesthetic physique",
      "Sleep optimized, nutrition intuitive",
      "This version of you becomes the new normal",
    ],
    supplements:["Creatine, D3+K2, Magnesium, Fish Oil, Multi — forever"],
  },
];

// ── Session / storage keys ────────────────────────────────────────
export const LIVE_SESSION_KEY = "ft:liveSession";
export const LIVE_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
export const CUSTOM_ROUTINES_KEY = "ft:customRoutines";
export const PLAN_CUSTOM_KEY = "ft:planCustomizations";

// ── Exercise Catalogue ───────────────────────────────────────────
export const EXERCISE_CATALOGUE = [
  // Chest
  { name:"Bench Press (Barbell)",                muscle:"Chest",       equipment:"Barbell" },
  { name:"Incline Bench Press (Barbell)",         muscle:"Chest",       equipment:"Barbell" },
  { name:"Incline Bench Press (Smith Machine)",   muscle:"Chest",       equipment:"Smith Machine" },
  { name:"Decline Bench Press (Barbell)",         muscle:"Chest",       equipment:"Barbell" },
  { name:"Chest Fly (Pec Deck)",                  muscle:"Chest",       equipment:"Machine" },
  { name:"Chest Fly (Cable)",                     muscle:"Chest",       equipment:"Cable" },
  { name:"Chest Fly (Dumbbell)",                  muscle:"Chest",       equipment:"Dumbbell" },
  { name:"Chest Press (Machine)",                 muscle:"Chest",       equipment:"Machine" },
  { name:"Decline Chest Press (Machine)",         muscle:"Chest",       equipment:"Machine" },
  { name:"Cable Crossover",                       muscle:"Chest",       equipment:"Cable" },
  { name:"Low Cable Fly",                         muscle:"Chest",       equipment:"Cable" },
  { name:"Push-Up",                               muscle:"Chest",       equipment:"Bodyweight" },
  // Back
  { name:"Deadlift",                              muscle:"Back",        equipment:"Barbell" },
  { name:"Romanian Deadlift (Barbell)",           muscle:"Back",        equipment:"Barbell" },
  { name:"Romanian Deadlift (Dumbbell)",          muscle:"Back",        equipment:"Dumbbell" },
  { name:"Bent Over Row (Barbell)",               muscle:"Back",        equipment:"Barbell" },
  { name:"Bent Over Row (Dumbbell)",              muscle:"Back",        equipment:"Dumbbell" },
  { name:"Lat Pulldown (Wide Grip)",              muscle:"Back",        equipment:"Cable" },
  { name:"Lat Pulldown (Reverse Grip)",           muscle:"Back",        equipment:"Cable" },
  { name:"Lat Pulldown (Close Grip)",             muscle:"Back",        equipment:"Cable" },
  { name:"Seated Cable Row (V-Grip)",             muscle:"Back",        equipment:"Cable" },
  { name:"Seated Cable Row (Wide Grip)",          muscle:"Back",        equipment:"Cable" },
  { name:"T-Bar Row",                             muscle:"Back",        equipment:"Barbell" },
  { name:"Chest Supported Row (Machine)",         muscle:"Back",        equipment:"Machine" },
  { name:"Single Arm Dumbbell Row",               muscle:"Back",        equipment:"Dumbbell" },
  { name:"Straight Arm Pulldown",                 muscle:"Back",        equipment:"Cable" },
  { name:"Pull-Up",                               muscle:"Back",        equipment:"Bodyweight" },
  { name:"Chin-Up",                               muscle:"Back",        equipment:"Bodyweight" },
  // Shoulders
  { name:"Overhead Press (Barbell)",              muscle:"Shoulders",   equipment:"Barbell" },
  { name:"Shoulder Press (Machine Plates)",       muscle:"Shoulders",   equipment:"Machine" },
  { name:"Shoulder Press (Dumbbell)",             muscle:"Shoulders",   equipment:"Dumbbell" },
  { name:"Lateral Raise (DB)",                    muscle:"Shoulders",   equipment:"Dumbbell" },
  { name:"Lateral Raise (Cable)",                 muscle:"Shoulders",   equipment:"Cable" },
  { name:"Front Raise (Dumbbell)",                muscle:"Shoulders",   equipment:"Dumbbell" },
  { name:"Face Pull",                             muscle:"Shoulders",   equipment:"Cable" },
  { name:"Reverse Fly (Cable)",                   muscle:"Shoulders",   equipment:"Cable" },
  { name:"Reverse Fly (Pec Deck)",                muscle:"Shoulders",   equipment:"Machine" },
  { name:"Arnold Press",                          muscle:"Shoulders",   equipment:"Dumbbell" },
  { name:"Upright Row (Barbell)",                 muscle:"Shoulders",   equipment:"Barbell" },
  // Biceps
  { name:"Bicep Curl (Barbell)",                  muscle:"Biceps",      equipment:"Barbell" },
  { name:"Bicep Curl (DB)",                       muscle:"Biceps",      equipment:"Dumbbell" },
  { name:"Bicep Curl (Cable)",                    muscle:"Biceps",      equipment:"Cable" },
  { name:"Preacher Curl (Machine)",               muscle:"Biceps",      equipment:"Machine" },
  { name:"Preacher Curl (Barbell)",               muscle:"Biceps",      equipment:"Barbell" },
  { name:"Hammer Curl (Dumbbell)",                muscle:"Biceps",      equipment:"Dumbbell" },
  { name:"Incline Dumbbell Curl",                 muscle:"Biceps",      equipment:"Dumbbell" },
  { name:"Spider Curl",                           muscle:"Biceps",      equipment:"Dumbbell" },
  { name:"Concentration Curl",                    muscle:"Biceps",      equipment:"Dumbbell" },
  // Triceps
  { name:"Triceps Pressdown",                     muscle:"Triceps",     equipment:"Cable" },
  { name:"Triceps Pressdown (Rope)",              muscle:"Triceps",     equipment:"Cable" },
  { name:"Skull Crusher",                         muscle:"Triceps",     equipment:"Barbell" },
  { name:"Skull Crusher (Dumbbell)",              muscle:"Triceps",     equipment:"Dumbbell" },
  { name:"Overhead Tricep Extension",             muscle:"Triceps",     equipment:"Cable" },
  { name:"Overhead Tricep Extension (Dumbbell)",  muscle:"Triceps",     equipment:"Dumbbell" },
  { name:"Close Grip Bench Press",                muscle:"Triceps",     equipment:"Barbell" },
  { name:"Tricep Dip",                            muscle:"Triceps",     equipment:"Bodyweight" },
  // Quads
  { name:"Squat (Barbell)",                       muscle:"Quads",       equipment:"Barbell" },
  { name:"Front Squat (Barbell)",                 muscle:"Quads",       equipment:"Barbell" },
  { name:"Leg Press (Horizontal)",                muscle:"Quads",       equipment:"Machine" },
  { name:"Hack Squat",                            muscle:"Quads",       equipment:"Machine" },
  { name:"Leg Extension",                         muscle:"Quads",       equipment:"Machine" },
  { name:"Bulgarian Split Squat",                 muscle:"Quads",       equipment:"Dumbbell", unilateral:true },
  { name:"Lunge (Barbell)",                       muscle:"Quads",       equipment:"Barbell" },
  { name:"Lunge (Dumbbell)",                      muscle:"Quads",       equipment:"Dumbbell" },
  { name:"Step-Up (Dumbbell)",                    muscle:"Quads",       equipment:"Dumbbell" },
  // Hamstrings
  { name:"Lying Leg Curl (Machine)",              muscle:"Hamstrings",  equipment:"Machine" },
  { name:"Seated Leg Curl (Machine)",             muscle:"Hamstrings",  equipment:"Machine" },
  { name:"Sumo Deadlift",                         muscle:"Hamstrings",  equipment:"Barbell" },
  // Glutes
  { name:"Hip Thrust (Barbell)",                  muscle:"Glutes",      equipment:"Barbell" },
  { name:"Hip Thrust (Machine)",                  muscle:"Glutes",      equipment:"Machine" },
  { name:"Hip Abduction (Machine)",               muscle:"Glutes",      equipment:"Machine" },
  { name:"Hip Adduction (Machine)",               muscle:"Glutes",      equipment:"Machine" },
  { name:"Glute Kickback (Cable)",                muscle:"Glutes",      equipment:"Cable" },
  { name:"Romanian Deadlift (Light)",             muscle:"Glutes",      equipment:"Barbell" },
  // Calves
  { name:"Standing Calf Raise (Machine)",         muscle:"Calves",      equipment:"Machine" },
  { name:"Standing Calf Raise",                   muscle:"Calves",      equipment:"Machine" },
  { name:"Seated Calf Raise",                     muscle:"Calves",      equipment:"Machine" },
  { name:"Calf Raise (Leg Press Machine)",        muscle:"Calves",      equipment:"Machine" },
  // Core
  { name:"Plank",                                 muscle:"Core",        equipment:"Bodyweight" },
  { name:"Side Plank",                            muscle:"Core",        equipment:"Bodyweight" },
  { name:"Cable Crunch",                          muscle:"Core",        equipment:"Cable" },
  { name:"Hanging Leg Raise",                     muscle:"Core",        equipment:"Bodyweight" },
  { name:"Ab Wheel Rollout",                      muscle:"Core",        equipment:"Bodyweight" },
  { name:"Russian Twist",                         muscle:"Core",        equipment:"Bodyweight" },
  { name:"Torso Rotation (Cable)",                muscle:"Core",        equipment:"Cable" },
  { name:"Decline Sit-Up",                        muscle:"Core",        equipment:"Bodyweight" },
  // Cardio
  { name:"Treadmill",                             muscle:"Cardio",      equipment:"Machine" },
  { name:"Stationary Bike",                       muscle:"Cardio",      equipment:"Machine" },
  { name:"Rowing Machine",                        muscle:"Cardio",      equipment:"Machine" },
  { name:"Stair Climber",                         muscle:"Cardio",      equipment:"Machine" },
  { name:"Jump Rope",                             muscle:"Cardio",      equipment:"Bodyweight" },
];
// Backwards-compat alias — filters / autocompletes that used string EXERCISE_LIST
// now get objects; any code that still does `e.toLowerCase()` is updated below.
export const EXERCISE_LIST = EXERCISE_CATALOGUE;

// ── Measurement fields ───────────────────────────────────────────
export const MEASURE_FIELDS = [
  {key:"chest",label:"Chest",color:C.orange},
  {key:"shoulders",label:"Shoulders",color:C.purple},
  {key:"waist",label:"Waist",color:C.teal},
  {key:"leftBicep",label:"L Bicep",color:C.lime},
  {key:"rightBicep",label:"R Bicep",color:C.lime},
  {key:"leftThigh",label:"L Thigh",color:C.amber},
  {key:"rightThigh",label:"R Thigh",color:C.amber},
  {key:"calves",label:"Calves",color:C.blue},
  {key:"bodyFat",label:"Body Fat %",color:C.orange},
];
