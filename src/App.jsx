import { useState, useEffect, lazy, Suspense } from "react";
import { Home, Zap, Brain, Dumbbell, Utensils, User } from "lucide-react";
import { C, F, DAYS, SPLIT_MAP, WORKOUTS } from "./constants";
import { getToday, getTodayLabel, toLocalDateStr, getCompletenessItems } from "./utils";
import { sGet, sSet, takeSnapshotIfNeeded } from "./lib/storage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WeightModal } from "./components/WeightModal";
import { WeeklyCheckinModal } from "./components/WeeklyCheckinModal";
import { HomeTab, MobileWebViewBanner } from "./components/HomeTab";
import { LiftsTab } from "./components/LiftsTab";
import { ProfileTab } from "./components/ProfileTab";
import { CoachDrawer, SettingsDrawer } from "./components/CoachDrawer";
import { MealModal } from "./components/MealModal";
import { PRModal } from "./components/PRModal";
import { MeasurementsModal } from "./components/MeasurementsModal";

const FuelTab = lazy(() => import("./components/FuelTab").then(m => ({ default: m.FuelTab })));

// ── Storage helpers ───────────────────────────────────────────────
// ── Anthropic API key — entered on-device, stored locally, never in the repo ──







// ── Seed data ─────────────────────────────────────────────────────
const SEED = {
  profile: { calorieTarget:{training:3200,rest:3000}, proteinTarget:190, carbTarget:350, fatTarget:95 },
  weightLog: [
    { date:"2026-05-02", weight:175.8, sleep:7 },
    { date:"2026-05-03", weight:null, sleep:9 },
  ],
  prs: [
    { exercise:"RDL (Barbell)", weight:315, reps:10, date:"2026-05-01" },
    { exercise:"Leg Press (Horiz)", weight:285, reps:5, date:"2026-05-01" },
    { exercise:"Calf Raise (Standing)", weight:330, reps:11, date:"2026-05-01" },
    { exercise:"Squat (Barbell)", weight:205, reps:4, date:"2026-05-01" },
    { exercise:"Hip Abduction (Machine)", weight:240, reps:15, date:"2026-04-28" },
    { exercise:"Hip Adduction (Machine)", weight:305, reps:6, date:"2026-04-28" },
    { exercise:"Incline Bench (Smith)", weight:110, reps:8, date:"2026-04-27" },
    { exercise:"Preacher Curl (Machine)", weight:106, reps:6, date:"2026-04-27" },
    { exercise:"Shoulder Press (Machine)", weight:55, reps:22, date:"2026-04-27" },
  ],
  workouts: [
    { id:"w1", date:"2026-05-01", name:"Lower B", note:'"These legs are goofy"', split:"Lower B", duration:54, volume:25070, sets:14, prs:5,
      exercises:[{name:"Leg Press"},{name:"Squat"},{name:"Plank"},{name:"RDL"},{name:"Calf Raise"}] },
    { id:"w2", date:"2026-04-28", name:"Lower A", note:'"Squeeze ems getting maxed"', split:"Lower A", duration:53, volume:22800, sets:16, prs:3,
      exercises:[{name:"RDL"},{name:"Hip Adduction"},{name:"Hip Abduction"},{name:"Calf Raise"},{name:"Bulgarian Split Squat"}] },
    { id:"w3", date:"2026-04-27", name:"Upper A", note:'"We back"', split:"Upper A", duration:43, volume:18900, sets:17, prs:2,
      exercises:[{name:"Incline Bench"},{name:"Shoulder Press"},{name:"Lat Pulldown"},{name:"Cable Row"},{name:"Preacher Curl"}] },
  ],
  meals: {
    "2026-05-01":{ calories:4200, protein:290, carbs:500, fat:110, items:["2 chicken thighs","2 bananas","2 eggs","Protein pancakes","15 plates sushi","Oikos + protein drinks"] },
    "2026-05-02":{ calories:1575, protein:93, carbs:126, fat:70, items:["Taro milk tea","Pastry","Costco food court"] },
    "2026-05-03":{ calories:575, protein:20, carbs:63, fat:28, items:["Turkey sandwich w/ cheese + avo mayo","Beef tallow chips","Pineapple"] },
  },
  measurements: [],
};

// ── Exercise Catalogue (V2.1 Chunk 6) — name + muscle group + equipment ─────



// CURRENT_DATA_VERSION bumps every time we change storage shape.
// runMigrations() runs once on app load. It only ADDS new data,
// never deletes the old. Safe to re-run; safe across crashes.
const CURRENT_DATA_VERSION = 3;

async function runMigrations() {
  let version = 1;
  try {
    const r = await window.storage.get("ft:dataVersion");
    if (r && r.value) version = parseInt(JSON.parse(r.value)) || 1;
  } catch (_e) { /* best-effort */ }

  // v1 → v2: photos go from single-key to indexed multi-photo system
  if (version < 2) {
    let migrationSucceeded = false;
    try {
      // Read existing index (in case migration was partially run before)
      let progressIdx = [];
      let goalIdx = [];
      try { progressIdx = JSON.parse((await window.storage.get("ft:photoProgressIndex")).value); } catch (_e) { /* best-effort */ }
      try { goalIdx = JSON.parse((await window.storage.get("ft:photoGoalIndex")).value); } catch (_e) { /* best-effort */ }

      const existingProgressDates = new Set(progressIdx.map(p => p.date));
      const existingGoalIds = new Set(goalIdx.map(g => g.id));

      // Migrate ft:photoHistory (array of {src, date}) → progress photos
      try {
        const hist = JSON.parse((await window.storage.get("ft:photoHistory")).value);
        for (let i = 0; i < hist.length; i++) {
          const h = hist[i];
          const id = `mig${(h.date||"").replace(/-/g,"")}_${i}`;
          // De-dupe by stable id (re-running migration produces same ids)
          if (progressIdx.some(p => p.id === id)) continue;
          await window.storage.set(`ft:photo:progress:${id}`, JSON.stringify({
            id, date: h.date || getToday(), src: h.src, caption: "", weight: null, bodyFat: null,
          }));
          progressIdx.push({ id, date: h.date || getToday() });
        }
      } catch (_e) { /* best-effort */ }

      // Migrate ft:photoCurrentLatest → most recent progress photo (if not already in history)
      try {
        const cur = JSON.parse((await window.storage.get("ft:photoCurrentLatest")).value);
        if (!existingProgressDates.has(cur.date)) {
          const id = `mig_cur_${(cur.date||"").replace(/-/g,"")}`;
          if (!progressIdx.some(p => p.id === id)) {
            await window.storage.set(`ft:photo:progress:${id}`, JSON.stringify({
              id, date: cur.date || getToday(), src: cur.src, caption: "", weight: null, bodyFat: null,
            }));
            progressIdx.push({ id, date: cur.date || getToday() });
          }
        }
      } catch (_e) { /* best-effort */ }

      // Migrate ft:photoGoal → goal photo
      try {
        const goal = JSON.parse((await window.storage.get("ft:photoGoal")).value);
        const id = `mig_goal_${(goal.date||"").replace(/-/g,"") || "init"}`;
        if (!existingGoalIds.has(id)) {
          await window.storage.set(`ft:photo:goal:${id}`, JSON.stringify({
            id, date: goal.date || getToday(), src: goal.src, caption: "", weight: null, bodyFat: null,
          }));
          goalIdx.push({ id, date: goal.date || getToday() });
        }
      } catch (_e) { /* best-effort */ }

      // Sort newest first
      progressIdx.sort((a, b) => (b.date||"").localeCompare(a.date||""));
      goalIdx.sort((a, b) => (b.date||"").localeCompare(a.date||""));

      // Write indexes (new system reads from here)
      await window.storage.set("ft:photoProgressIndex", JSON.stringify(progressIdx));
      await window.storage.set("ft:photoGoalIndex", JSON.stringify(goalIdx));

      // NOTE: old keys (ft:photoCurrentLatest, ft:photoGoal, ft:photoHistory) are LEFT INTACT
      // as a safety net. They are not read by the new system.
      migrationSucceeded = true;
    } catch (e) {
      // If migration fails, version stays < 2 and we'll retry next load.
      // Migration is idempotent (uses stable ids + de-dupe) so retry is safe.
      console.warn("Photo migration failed, will retry next load:", e);
    }

    // Only stamp version on full success — failures retry
    if (migrationSucceeded) {
      try { await window.storage.set("ft:dataVersion", JSON.stringify(2)); } catch (_e) { /* best-effort */ }
    }
  }

  // v2 → v3: meals get individual entries array (so they're editable/deletable)
  // Re-read version since it may have just been bumped to 2
  let v2 = 2;
  try {
    const r = await window.storage.get("ft:dataVersion");
    if (r && r.value) v2 = parseInt(JSON.parse(r.value)) || 2;
  } catch (_e) { /* best-effort */ }

  if (v2 < 3) {
    let succeeded = false;
    try {
      const meals = await sGet("ft:meals", {});
      const migrated = {};
      for (const [date, day] of Object.entries(meals)) {
        if (!day) continue;
        // If day already has entries, leave as-is (idempotent re-run)
        if (Array.isArray(day.entries) && day.entries.length > 0) {
          migrated[date] = day;
          continue;
        }
        // Convert legacy day → single legacy entry with that day's totals
        const hasAnyMacros = (day.calories||0) + (day.protein||0) + (day.carbs||0) + (day.fat||0) > 0;
        if (!hasAnyMacros) {
          migrated[date] = { ...day, entries: [] };
          continue;
        }
        const description = Array.isArray(day.items) && day.items.length > 0
          ? day.items.join(", ")
          : "Imported entry";
        const legacyEntry = {
          id: `legacy_${date.replace(/-/g,"")}`,
          time: "00:00",
          calories: day.calories || 0,
          protein: day.protein || 0,
          carbs: day.carbs || 0,
          fat: day.fat || 0,
          description,
          legacy: true,
        };
        migrated[date] = {
          calories: day.calories || 0,
          protein: day.protein || 0,
          carbs: day.carbs || 0,
          fat: day.fat || 0,
          items: day.items || [description],
          entries: [legacyEntry],
        };
      }
      await window.storage.set("ft:meals", JSON.stringify(migrated));
      succeeded = true;
    } catch (e) {
      console.warn("Meal migration failed, will retry:", e);
    }
    if (succeeded) {
      try { await window.storage.set("ft:dataVersion", JSON.stringify(CURRENT_DATA_VERSION)); } catch (_e) { /* best-effort */ }
    }
  } else {
    // Already at current version
    try { await window.storage.set("ft:dataVersion", JSON.stringify(CURRENT_DATA_VERSION)); } catch (_e) { /* best-effort */ }
  }
}

// ── Meal entry helpers ───────────────────────────────────────────
// ── Main App ──────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("home");
  const [appData, setAppData] = useState(null);
  const [modal, setModal] = useState(null);
  const [mealEditDate, setMealEditDate] = useState(null);
  const [coachDrawerOpen, setCoachDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showWeeklyCheckin, setShowWeeklyCheckin] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.background = C.bg;
  }, []);

  useEffect(() => {
    async function load() {
      // Run any pending data migrations FIRST — protects existing data across updates
      await runMigrations();

      // Load app data and render UI ASAP — these are quick
      const [profile, weightLog, prs, workouts, meals, measurements] = await Promise.all([
        sGet("ft:profile", SEED.profile),
        sGet("ft:weightLog", SEED.weightLog),
        sGet("ft:prs", SEED.prs),
        sGet("ft:workouts", SEED.workouts),
        sGet("ft:meals", SEED.meals),
        sGet("ft:measurements", SEED.measurements),
      ]);
      setAppData({ profile, weightLog, prs, workouts, meals, measurements });

      // Background tasks — don't block UI
      // Take today's snapshot (silent in-app safety net)
      takeSnapshotIfNeeded().catch(() => {});

      // Sunday weekly check-in trigger
      const today = getToday();
      const dayOfWeek = new Date(today + "T12:00:00").getDay();
      const lastCheckin = profile?.lastCheckinDate;
      if (dayOfWeek === 0 && lastCheckin !== today) {
        setShowWeeklyCheckin(true);
      }
    }
    load();
  }, []);

  async function updateData(key, val) {
    setAppData(prev => ({ ...prev, [key]: val }));
    await sSet(`ft:${key}`, val);
  }

  if (!appData) {
    return (
      <div style={{ background:C.bg, minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:C.lime, letterSpacing:3 }}>DIALLED IN</div>
        <div style={{ fontFamily:"monospace", fontSize:12, color:C.gray }}>Loading your plan...</div>
      </div>
    );
  }

  const currentW = [...appData.weightLog].filter(w => w.weight).pop()?.weight || 175.8;
  const dayName = DAYS[new Date().getDay()];
  const todayWo = SPLIT_MAP[dayName];
  const woColor = todayWo ? WORKOUTS[todayWo]?.color : C.gray;

  const items = getCompletenessItems(appData);
  const coachScore = Math.round((items.filter(i => i.done).length / items.length) * 100);
  const coachColor = coachScore >= 80 ? C.lime : coachScore >= 50 ? C.amber : C.orange;

  const navItems = [
    { id:"home",    label:"HOME",    Icon:Home },
    { id:"lifts",   label:"LIFTS",   Icon:Dumbbell },
    { id:"fuel",    label:"FUEL",    Icon:Utensils },
    { id:"profile", label:"PROFILE", Icon:User },
  ];

  function handleCoachAction(action) {
    if (action === "meal") setModal("meal");
    else if (action === "meal_hist") setModal("meal_hist");
    else if (action === "weight") setModal("weight");
    else if (action === "workout") setTab("lifts");
    else if (action === "measurements") setModal("measurements");
    else if (action === "pr") setModal("pr");
    else if (action === "settings") setSettingsOpen(true);
    else if (action === "fuel_tab") setTab("fuel");
  }

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:F.body, color:C.white, maxWidth:480, margin:"0 auto", paddingBottom:80, overflowX:"hidden" }}>

      {/* Sticky header */}
      <div style={{ padding:"14px 16px 0", background:C.bg, position:"sticky", top:0, zIndex:100, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <div style={{ fontFamily:F.display, fontSize:26, color:C.lime, letterSpacing:2 }}>DIALLED IN</div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {/* Coach score badge */}
            <div style={{ background:`${coachColor}18`, border:`1px solid ${coachColor}50`, borderRadius:20, padding:"3px 9px", fontFamily:F.mono, fontSize:11, color:coachColor, cursor:"pointer" }}
              onClick={() => setCoachDrawerOpen(true)}>
              📊 {coachScore}%
            </div>
            {todayWo && (
              <div style={{ background:`${woColor}18`, border:`1px solid ${woColor}`, borderRadius:20, padding:"3px 9px", fontFamily:F.mono, fontSize:11, color:woColor }}>
                <Zap size={8} style={{ display:"inline", marginRight:3 }} />{todayWo}
              </div>
            )}
            <div style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:20, padding:"3px 10px", fontFamily:F.mono, fontSize:12, color:C.white }}>
              {currentW} lbs
            </div>
          </div>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, paddingBottom:10 }}>
          {getTodayLabel()} · {todayWo || "REST DAY"}
        </div>
      </div>

      {/* Mobile app webview warning (shows above any tab content) */}
      <MobileWebViewBanner />

      <ErrorBoundary>
        {tab === "home"    && <HomeTab data={appData} onLogMeal={() => setModal("meal")} onLogWeight={() => setModal("weight")} onAction={handleCoachAction} />}
        {tab === "lifts"   && <LiftsTab data={appData} updateData={updateData} onLogMeal={() => setModal("meal")} />}
        {tab === "fuel"    && (
          <Suspense fallback={<div style={{ padding:32, textAlign:"center", fontFamily:"monospace", fontSize:12, color:"#505060" }}>Loading…</div>}>
            <FuelTab data={appData} updateData={updateData} onLogMeal={() => setModal("meal")} />
          </Suspense>
        )}
        {tab === "profile" && (
          <ProfileTab
            data={appData}
            updateData={updateData}
            onLogMeasurements={() => setModal("measurements")}
            onLogMeal={() => setModal("meal")}
            onLogPR={() => setModal("pr")}
            onEditDay={(date) => { setMealEditDate(date); setModal("meal"); }}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </ErrorBoundary>

      {/* Bottom nav — center-FAB layout: [HOME][LIFTS][🧠][FUEL][PROFILE] */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:C.bg, borderTop:"1px solid "+C.border, display:"flex", alignItems:"flex-end", zIndex:100 }}>
        {navItems.slice(0,2).map(function({ id, label, Icon }) {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex:1, padding:"9px 0 13px", background:"none", border:"none", color:active?C.lime:C.gray, fontFamily:F.mono, fontSize:7, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <Icon size={15} />
              {label}
            </button>
          );
        })}
        {/* Center Coach FAB */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", paddingBottom:10, position:"relative" }}>
          <button
            onClick={() => setCoachDrawerOpen(true)}
            style={{ width:52, height:52, background:"linear-gradient(135deg,"+C.lime+",#8FD400)", borderRadius:"50%", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 24px "+C.lime+"55", position:"relative", bottom:14, marginBottom:-10 }}
          >
            <Brain size={22} color={C.dark} strokeWidth={2} />
          </button>
          <div style={{ fontFamily:F.mono, fontSize:7, color:C.gray }}>COACH</div>
          {coachScore < 80 && (
            <div style={{ position:"absolute", top:2, right:"22%", width:6, height:6, borderRadius:"50%", background:coachColor, border:"1.5px solid "+C.bg }} />
          )}
        </div>
        {navItems.slice(2).map(function({ id, label, Icon }) {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex:1, padding:"9px 0 13px", background:"none", border:"none", color:active?C.lime:C.gray, fontFamily:F.mono, fontSize:7, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>

      {showWeeklyCheckin && appData && (
        <WeeklyCheckinModal data={appData} updateData={updateData} onClose={() => setShowWeeklyCheckin(false)} />
      )}
      {coachDrawerOpen && (
        <CoachDrawer data={appData} updateData={updateData} onAction={handleCoachAction} onClose={() => setCoachDrawerOpen(false)} />
      )}
      {settingsOpen && (
        <SettingsDrawer onClose={() => setSettingsOpen(false)} />
      )}
      {modal === "weight" && <WeightModal data={appData} updateData={updateData} onClose={() => setModal(null)} />}
      {modal === "meal" && <MealModal data={appData} updateData={updateData} onClose={() => { setModal(null); setMealEditDate(null); }} initialDate={mealEditDate || undefined} />}
      {modal === "meal_hist" && <MealModal data={appData} updateData={updateData} onClose={() => setModal(null)} initialDate={(() => { const d = new Date(); d.setDate(d.getDate()-1); return toLocalDateStr(d); })()} />}
      {modal === "pr" && <PRModal data={appData} updateData={updateData} onClose={() => setModal(null)} />}
      {modal === "measurements" && <MeasurementsModal data={appData} updateData={updateData} onClose={() => setModal(null)} />}
    </div>
  );
}
