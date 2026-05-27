import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Dumbbell, Utensils, TrendingUp, Home, X, Plus, Zap, Map, Calendar, ChevronRight, Check } from "lucide-react";

// ── Storage helpers ───────────────────────────────────────────────
async function sGet(key, fallback) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : fallback;
  } catch {
    return fallback;
  }
}
async function sSet(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {}
}

// ── Anthropic API key — entered on-device, stored locally, never in the repo ──
const API_KEY_STORAGE = "ft:anthropicApiKey";
function getApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ""; } catch { return ""; }
}
function setApiKey(k) {
  try {
    if (k && k.trim()) localStorage.setItem(API_KEY_STORAGE, k.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch {}
}
function aiHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": getApiKey(),
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}


// ── Data Migrations ───────────────────────────────────────────────
// CURRENT_DATA_VERSION bumps every time we change storage shape.
// runMigrations() runs once on app load. It only ADDS new data,
// never deletes the old. Safe to re-run; safe across crashes.
const CURRENT_DATA_VERSION = 3;

async function runMigrations() {
  let version = 1;
  try {
    const r = await window.storage.get("ft:dataVersion");
    if (r && r.value) version = parseInt(JSON.parse(r.value)) || 1;
  } catch {}

  // v1 → v2: photos go from single-key to indexed multi-photo system
  if (version < 2) {
    let migrationSucceeded = false;
    try {
      // Read existing index (in case migration was partially run before)
      let progressIdx = [];
      let goalIdx = [];
      try { progressIdx = JSON.parse((await window.storage.get("ft:photoProgressIndex")).value); } catch {}
      try { goalIdx = JSON.parse((await window.storage.get("ft:photoGoalIndex")).value); } catch {}

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
      } catch {}

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
      } catch {}

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
      } catch {}

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
      try { await window.storage.set("ft:dataVersion", JSON.stringify(2)); } catch {}
    }
  }

  // v2 → v3: meals get individual entries array (so they're editable/deletable)
  // Re-read version since it may have just been bumped to 2
  let v2 = 2;
  try {
    const r = await window.storage.get("ft:dataVersion");
    if (r && r.value) v2 = parseInt(JSON.parse(r.value)) || 2;
  } catch {}

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
      await sSet("meals", migrated);
      succeeded = true;
    } catch (e) {
      console.warn("Meal migration failed, will retry:", e);
    }
    if (succeeded) {
      try { await window.storage.set("ft:dataVersion", JSON.stringify(CURRENT_DATA_VERSION)); } catch {}
    }
  } else {
    // Already at current version
    try { await window.storage.set("ft:dataVersion", JSON.stringify(CURRENT_DATA_VERSION)); } catch {}
  }
}

// ── Meal entry helpers ───────────────────────────────────────────
function recomputeMealDay(day) {
  const entries = day?.entries || [];
  const totals = entries.reduce((acc, e) => ({
    calories: acc.calories + (parseFloat(e.calories) || 0),
    protein: acc.protein + (parseFloat(e.protein) || 0),
    carbs: acc.carbs + (parseFloat(e.carbs) || 0),
    fat: acc.fat + (parseFloat(e.fat) || 0),
  }), { calories:0, protein:0, carbs:0, fat:0 });
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
    items: entries.map(e => e.description).filter(Boolean),
    entries,
  };
}

function newEntryId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// ── Auto-snapshot system (in-app safety net) ─────────────────────
// Takes a daily snapshot of core data. Keeps last N days, rotates oldest out.
// Snapshots are intentionally photo-INDEX-free (photos have their own lifecycle).
const SNAPSHOT_RETENTION_DAYS = 14;
const BACKUP_NAG_DAYS = 7;

async function takeSnapshotIfNeeded() {
  const today = getToday();
  const snapKey = `ft:snapshot:${today}`;

  // Skip if today's snapshot already exists
  try {
    const existing = await window.storage.get(snapKey);
    if (existing) return false;
  } catch {} // doesn't exist, continue

  try {
    const snapshot = {
      date: today,
      ts: Date.now(),
      version: CURRENT_DATA_VERSION,
      data: {
        profile: await sGet("ft:profile", null),
        weightLog: await sGet("ft:weightLog", []),
        prs: await sGet("ft:prs", []),
        workouts: await sGet("ft:workouts", []),
        meals: await sGet("ft:meals", {}),
        measurements: await sGet("ft:measurements", []),
      },
    };

    await window.storage.set(snapKey, JSON.stringify(snapshot));

    // Update index
    let idx = [];
    try { idx = JSON.parse((await window.storage.get("ft:snapshotIndex")).value); } catch {}
    idx = idx.filter(s => s.date !== today);
    idx.unshift({ date: today, ts: Date.now() });
    idx.sort((a, b) => b.date.localeCompare(a.date));

    // Trim to retention limit
    const toRemove = idx.slice(SNAPSHOT_RETENTION_DAYS);
    idx = idx.slice(0, SNAPSHOT_RETENTION_DAYS);
    for (const old of toRemove) {
      try { await window.storage.delete(`ft:snapshot:${old.date}`); } catch {}
    }

    await window.storage.set("ft:snapshotIndex", JSON.stringify(idx));
    return true;
  } catch (e) {
    console.warn("Snapshot failed:", e);
    return false;
  }
}

async function getSnapshotIndex() {
  try { return JSON.parse((await window.storage.get("ft:snapshotIndex")).value) || []; }
  catch { return []; }
}

async function getSnapshot(date) {
  try { return JSON.parse((await window.storage.get(`ft:snapshot:${date}`)).value); }
  catch { return null; }
}

async function restoreFromSnapshot(date) {
  const snap = await getSnapshot(date);
  if (!snap || !snap.data) throw new Error("Snapshot not found");
  const { data } = snap;
  // Best-effort write of all keys
  await sSet("profile", data.profile);
  await sSet("weightLog", data.weightLog);
  await sSet("prs", data.prs);
  await sSet("workouts", data.workouts);
  await sSet("meals", data.meals);
  await sSet("measurements", data.measurements);
  return true;
}

// ── Full backup (download as JSON) ────────────────────────────────
async function generateFullBackup() {
  const progressIdx = await sGet("ft:photoProgressIndex", []);
  const goalIdx = await sGet("ft:photoGoalIndex", []);

  const progressPhotos = [];
  for (const p of progressIdx) {
    try {
      const r = await window.storage.get(`ft:photo:progress:${p.id}`);
      progressPhotos.push(JSON.parse(r.value));
    } catch {}
  }
  const goalPhotos = [];
  for (const p of goalIdx) {
    try {
      const r = await window.storage.get(`ft:photo:goal:${p.id}`);
      goalPhotos.push(JSON.parse(r.value));
    } catch {}
  }

  return {
    app: "DIALLED IN",
    version: CURRENT_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: await sGet("ft:profile", null),
    weightLog: await sGet("ft:weightLog", []),
    prs: await sGet("ft:prs", []),
    workouts: await sGet("ft:workouts", []),
    meals: await sGet("ft:meals", {}),
    measurements: await sGet("ft:measurements", []),
    photos: { progress: progressPhotos, goal: goalPhotos },
  };
}

// ── Restore a full backup JSON (inverse of generateFullBackup). Used by Import + future SSD restore. ──
async function importBackup(b) {
  if (!b || typeof b !== "object") throw new Error("not a valid backup file");
  const setk = (k, v) => window.storage.set(k, JSON.stringify(v));
  if ("profile" in b) await setk("ft:profile", b.profile);
  if ("weightLog" in b) await setk("ft:weightLog", b.weightLog || []);
  if ("prs" in b) await setk("ft:prs", b.prs || []);
  if ("workouts" in b) await setk("ft:workouts", b.workouts || []);
  if ("meals" in b) await setk("ft:meals", b.meals || {});
  if ("measurements" in b) await setk("ft:measurements", b.measurements || []);
  if ("chatHistory" in b) await setk("ft:chatHistory", b.chatHistory || []);
  if ("coachAnalyses" in b) await setk("ft:lastCoachAnalysis", b.coachAnalyses);
  const photos = b.photos || {};
  for (const type of ["progress", "goal"]) {
    const arr = Array.isArray(photos[type]) ? photos[type] : [];
    const idx = [];
    for (const p of arr) {
      if (!p || !p.id) continue;
      await window.storage.set(`ft:photo:${type}:${p.id}`, JSON.stringify(p));
      idx.push({ id: p.id, date: p.date });
    }
    await setk(type === "progress" ? "ft:photoProgressIndex" : "ft:photoGoalIndex", idx);
  }
  if ("version" in b) await setk("ft:dataVersion", b.version);
}


function downloadJSON(obj, filename) {
  try {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 200);
    return true;
  } catch (e) {
    console.warn("Download failed:", e);
    return false;
  }
}

async function downloadBackup() {
  const backup = await generateFullBackup();
  const filename = `dialledin_backup_${getToday()}.json`;
  const ok = downloadJSON(backup, filename);
  if (ok) {
    try { await window.storage.set("ft:lastBackupDownload", JSON.stringify({ ts: Date.now(), date: getToday() })); } catch {}
  }
  return ok;
}

async function getLastBackupInfo() {
  try { return JSON.parse((await window.storage.get("ft:lastBackupDownload")).value); }
  catch { return null; }
}

function daysSince(ts) {
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

// ── Mobile webview detection (for file upload limitation banner) ─
// claude.ai mobile app renders artifacts in a restricted webview that blocks
// file pickers. Detect this so we can warn the user and link them to the
// browser version where uploads work.
function detectMobileAppContext() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  if (!isMobile) return null;

  // iOS: real Safari has both "Safari/" and "Version/" in UA.
  // iOS in-app webviews (WKWebView) typically lack one or both of these.
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS && (!/Safari\//.test(ua) || !/Version\//.test(ua))) {
    return "ios-webview";
  }

  // Android WebView includes "; wv)" in UA.
  if (/Android/.test(ua) && /; wv\)/.test(ua)) {
    return "android-webview";
  }

  return null;
}

// ── Image processing (downscale + compress for storage) ───────────
async function processImageFile(file, maxDim = 1000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Meal context for in-app AI calls ──────────────────────────────
function buildMealContext(data) {
  const today = getToday();
  const todayMeals = data.meals[today] || { calories:0, protein:0, carbs:0, fat:0, items:[] };
  const currentW = [...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8;
  const dayName = DAYS[new Date().getDay()];
  const isTrainingDay = !!SPLIT_MAP[dayName];
  const calTarget = isTrainingDay ? data.profile.calorieTarget.training : data.profile.calorieTarget.rest;

  return `ATHLETE: 6'1", 34M, ${currentW} lbs, lean bulk goal 185-195 @ 8-10% BF. Training day: ${isTrainingDay ? "yes" : "no"}.
TARGETS today: ${calTarget} kcal · ${data.profile.proteinTarget}g protein · 350-400g carbs · 90-100g fat.
TODAY SO FAR: ${todayMeals.calories} kcal · ${todayMeals.protein}g protein · ${todayMeals.carbs}g carbs · ${todayMeals.fat}g fat${todayMeals.items?.length ? " | "+todayMeals.items.join(", ") : ""}.
REMAINING: ~${Math.max(0, calTarget - todayMeals.calories)} kcal · ~${Math.max(0, data.profile.proteinTarget - todayMeals.protein)}g protein.`;
}

// Shared macro estimation prompt — itemized + accurate, not conservative
function buildMacroPrompt(ctx, foodInput) {
  return `${ctx}

You are estimating food macros for an athletic adult male on a lean bulk. Goal: ACCURATE estimates, not conservative ones.

RULES:
1. ITEMIZE every food component you identify — give per-item macros
2. Use realistic substantial adult home/restaurant portions when quantities aren't specified
3. Include cooking fats, oils, butters, sauces, dressings — they add real calories that get missed
4. For brand-name foods (Kodiak, RXBAR, specific protein powders), use that brand's actual nutrition label
5. For "Xg protein drink/shake" — that X is the protein content, not powder weight
6. For multi-component meals, identify EVERY part — don't lump things together
7. Don't undershoot — when uncertain between two estimates, pick the higher realistic one
8. Sum ALL items. Verify: total fields MUST equal the sum of item fields
9. ⚠️ ONLY include foods explicitly mentioned by the user OR clearly visible in the photo. DO NOT assume sides, drinks, condiments, or accompaniments the user didn't mention (e.g. don't add milk to cereal unless they said milk; don't add a side salad to a steak unless they said it). When in doubt, leave it out and flag uncertainty in the "comment" field.

Each item: { "name": "specific food with quantity", "calories": kcal, "protein": g, "carbs": g, "fat": g }

${foodInput ? `\nFOOD: ${foodInput}` : "\nAnalyze the attached food photo."}

Return ONLY valid JSON, no markdown:
{
  "items": [{"name": "...", "calories": N, "protein": N, "carbs": N, "fat": N}, ...],
  "calories": <sum of item calories>,
  "protein": <sum of item protein>,
  "carbs": <sum of item carbs>,
  "fat": <sum of item fat>,
  "description": "short meal label (e.g. 'Breakfast: pancakes + fruit + shake')",
  "slot": "<exactly one of: breakfast | lunch | snack | pre_workout | post_workout | dinner — infer from text ('breakfast', 'lunch', 'pre-workout' wins) else from typical time of day>",
  "comment": "one sentence: how this fits today's targets, what's left to hit"
}`;
}

// ── Meal slot model (used by MealModal + meal entry list) ──
const MEAL_SLOTS = [
  { id: "breakfast",    label: "Breakfast", emoji: "🍳" },
  { id: "lunch",        label: "Lunch",     emoji: "🥗" },
  { id: "snack",        label: "Snack",     emoji: "🥨" },
  { id: "pre_workout",  label: "Pre-WO",    emoji: "⚡" },
  { id: "post_workout", label: "Post-WO",   emoji: "💪" },
  { id: "dinner",       label: "Dinner",    emoji: "🍽️" },
];

// Infer the meal slot from free-text description first (keywords win), then time of day.
function inferMealSlot(text, dt) {
  const t = (text || "").toLowerCase();
  if (/\b(pre[-\s]?workout|pre[-\s]?wo)\b/.test(t)) return "pre_workout";
  if (/\b(post[-\s]?workout|post[-\s]?wo)\b/.test(t)) return "post_workout";
  if (/\bbreakfast\b/.test(t)) return "breakfast";
  if (/\blunch\b/.test(t)) return "lunch";
  if (/\bdinner\b/.test(t)) return "dinner";
  if (/\bsnack\b/.test(t)) return "snack";
  const h = (dt instanceof Date ? dt : new Date()).getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 14) return "lunch";
  if (h >= 14 && h < 17) return "snack";
  if (h >= 17 && h < 21) return "dinner";
  return "snack";
}

// ── Constants ─────────────────────────────────────────────────────
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const SPLIT_MAP = { Mon:"Upper A", Tue:"Lower A", Thu:"Upper B", Fri:"Lower B" };

const C = {
  bg:"#070709", surface:"#101014", surfaceAlt:"#0C0C10",
  border:"#1C1C24", borderHi:"#282833",
  lime:"#C8FF00", limeGlow:"rgba(200,255,0,0.12)",
  teal:"#00E5CC", orange:"#FF5C35", purple:"#9D7FFF", blue:"#4488FF",
  amber:"#FFB800",
  white:"#FFFFFF", gray:"#505060", grayMid:"#808090", grayLight:"#AAAABC",
  dark:"#000000",
};
const F = {
  display: "'Bebas Neue',sans-serif",
  mono: "'IBM Plex Mono',monospace",
  body: "'Inter',sans-serif",
};

function getToday() {
  // Local-time YYYY-MM-DD — using toISOString() is UTC and rolls over at the wrong moment
  // for users not in UTC, which silently corrupts dates (e.g. logging 8pm EST as tomorrow).
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Convert a Date object to local-time YYYY-MM-DD string (used for date-picker max values, history scans, etc.)
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayLabel() {
  const d = new Date();
  const days = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${days[d.getDay()]} · ${months[d.getMonth()]} ${d.getDate()} · ${d.getFullYear()}`;
}

function calc1RM(w, r) { return r === 1 ? w : Math.round(w * (1 + r / 30)); }

// ── Active workout (in-progress session) persistence ──────────────
const ACTIVE_WORKOUT_KEY = "ft:activeWorkout";
const ACTIVE_WORKOUT_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// ── Live structured session (TodayTab) persistence ─────────────────
const LIVE_SESSION_KEY = "ft:liveSession";
const LIVE_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function fmtRelativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

// Look up the most recent recorded performance for an exercise (data.workouts is newest-first)
function lookupLastPerformance(exerciseName, workouts) {
  if (!exerciseName) return null;
  const lower = exerciseName.toLowerCase();
  for (const w of workouts || []) {
    const ex = (w.exercises || []).find(e => e.name && e.name.toLowerCase() === lower);
    if (ex) return { date: w.date, sets: ex.sets };
  }
  return null;
}

// Inline PR detection: would this weight×reps beat the existing PR?
function isPotentialPR(exerciseName, weight, reps, prs) {
  const w = parseFloat(weight);
  const r = parseInt(reps);
  if (!w || !r) return false;
  const new1 = calc1RM(w, r);
  const exist = (prs || []).find(p => p.exercise.toLowerCase() === (exerciseName || "").toLowerCase());
  if (!exist) return true;
  return new1 > calc1RM(exist.weight, exist.reps);
}

// ── Workout definitions ───────────────────────────────────────────
const WORKOUTS = {
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

// ── 4-Phase Roadmap ───────────────────────────────────────────────
const PHASES = [
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

const EXERCISE_LIST = [
  "Bench Press (Barbell)","Incline Bench Press (Smith Machine)","Chest Fly (Pec Deck)","Chest Fly (Cable)",
  "Decline Chest Press (Machine)","Squat (Barbell)","Hack Squat","Leg Press (Horizontal)",
  "Romanian Deadlift (Barbell)","Deadlift","Leg Curl (Machine)","Leg Extension",
  "Hip Thrust (Barbell)","Bulgarian Split Squat","Hip Abduction (Machine)","Hip Adduction (Machine)",
  "Standing Calf Raise (Machine)","Seated Calf Raise","Overhead Press (Barbell)",
  "Shoulder Press (Machine Plates)","Lateral Raise (DB)","Lat Pulldown (Cable)",
  "Reverse Grip Lat Pulldown","Seated Cable Row (V-Grip)","Bent Over Row",
  "Preacher Curl (Machine)","Bicep Curl (DB)","Triceps Pressdown","Skull Crusher",
  "Overhead Tricep Extension","Torso Rotation (Cable)","Plank","Cable Crunch",
  "Hanging Leg Raise","Treadmill",
];

const MEASURE_FIELDS = [
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

// ── UI Primitives ─────────────────────────────────────────────────
function Card({ children, style, highlight }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${highlight ? C.lime : C.border}`,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SL({ children, color }) {
  return (
    <div style={{
      fontFamily: F.mono,
      fontSize: 10,
      color: color || C.gray,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function BigN({ children, unit, color, size }) {
  return (
    <div style={{
      fontFamily: F.display,
      fontSize: size || 44,
      color: color || C.white,
      lineHeight: 1,
      display: "flex",
      alignItems: "baseline",
      gap: 4,
    }}>
      {children}
      {unit && <span style={{ fontSize: 13, color: C.gray, fontFamily: F.mono }}>{unit}</span>}
    </div>
  );
}

function MBar({ value, target, color }) {
  const pct = Math.min((value / target) * 100, 100);
  return (
    <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .6s ease" }} />
    </div>
  );
}

function Tag({ children, color }) {
  const c = color || C.lime;
  return (
    <div style={{
      background: `${c}18`,
      border: `1px solid ${c}`,
      borderRadius: 6,
      padding: "2px 8px",
      fontFamily: F.mono,
      fontSize: 10,
      color: c,
      display: "inline-flex",
      alignItems: "center",
    }}>
      {children}
    </div>
  );
}

function SBtn({ onClick, children, color }) {
  const c = color || C.lime;
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: `1px solid ${c}`,
        borderRadius: 6,
        padding: "3px 9px",
        fontFamily: F.mono,
        fontSize: 9,
        color: c,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function FInput({ label, value, onChange, placeholder, type, color }) {
  return (
    <div>
      <div style={{
        fontFamily: F.mono,
        fontSize: 10,
        color: color || C.white,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 6,
      }}>
        {label}
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        type={type || "number"}
        style={{
          width: "100%",
          background: "#1A1A22",
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "11px 14px",
          color: color || C.white,
          fontSize: 15,
          fontFamily: F.mono,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function SaveBtn({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        background: C.lime,
        border: "none",
        borderRadius: 12,
        padding: 14,
        fontFamily: F.display,
        fontSize: 20,
        color: C.dark,
        cursor: "pointer",
        letterSpacing: 1,
        marginTop: 4,
      }}
    >
      {label || "SAVE"}
    </button>
  );
}

// ── Modal shell ───────────────────────────────────────────────────
function Sheet({ onClose, title, children }) {
  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300 }}
      onClick={onClose}
    >
      <div
        style={{ background:"#111116", borderRadius:"20px 20px 0 0", padding:"24px 20px 40px", width:"100%", maxWidth:480, border:`1px solid ${C.border}`, borderBottom:"none", maxHeight:"90vh", overflowY:"auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontFamily:F.display, fontSize:24, color:C.lime, letterSpacing:1 }}>{title}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", padding:4 }}>
            <X size={18} color={C.gray} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Weight Modal ──────────────────────────────────────────────────
function WeightModal({ data, updateData, onClose }) {
  const [weight, setWeight] = useState("");
  const [sleep, setSleep] = useState("");

  async function save() {
    const t = getToday();
    const ex = data.weightLog.find(w => w.date === t) || {};
    const entry = {
      date: t,
      weight: weight ? parseFloat(weight) : ex.weight || null,
      sleep: sleep ? parseFloat(sleep) : ex.sleep || null,
    };
    const updated = [...data.weightLog.filter(w => w.date !== t), entry].sort((a,b) => a.date.localeCompare(b.date));
    await updateData("weightLog", updated);
    onClose();
  }

  return (
    <Sheet onClose={onClose} title="LOG TODAY">
      <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:24 }}>
        <FInput label="Weight (lbs)" value={weight} onChange={setWeight} placeholder="175.8" color={C.lime} />
        <FInput label="Sleep (hours)" value={sleep} onChange={setSleep} placeholder="8" color={C.teal} />
      </div>
      <SaveBtn onClick={save} />
    </Sheet>
  );
}

// ── Meal Modal (with date picker for historical logging) ──────────
function MealModal({ data, updateData, onClose, initialDate }) {
  const [logDate, setLogDate] = useState(initialDate || getToday());
  const [cal, setCal] = useState("");
  const [prot, setProt] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [desc, setDesc] = useState("");
  const [slot, setSlot] = useState(() => inferMealSlot("", new Date()));
  const [textDesc, setTextDesc] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [itemized, setItemized] = useState(null); // [{name, calories, protein, carbs, fat}, ...] from AI
  const [editingEntryId, setEditingEntryId] = useState(null); // null = adding new; string = editing this entry
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [actionFlash, setActionFlash] = useState(""); // "" | "reset" | "converted"

  // Always read fresh from data (so deletes/edits update immediately)
  const dayData = data.meals[logDate] || { calories:0, protein:0, carbs:0, fat:0, items:[], entries:[] };
  const entries = dayData.entries || [];
  const isHistorical = logDate !== getToday();

  async function analyzePhoto(files) {
    // Accept either a single file (legacy) or an array of files. Empty -> bail.
    const fileArr = !files ? [] : (Array.isArray(files) ? files : [files]);
    if (fileArr.length === 0) return;
    setAnalyzing(true);
    setAiMsg(fileArr.length > 1 ? `Analyzing ${fileArr.length} photos…` : "Analyzing your food…");
    setItemized(null);
    try {
      // Build content blocks: every image first, then a text block with prompt (and user description if any)
      const contentBlocks = [];
      for (const file of fileArr) {
        const dataUrl = await processImageFile(file, 800, 0.82);
        const base64 = dataUrl.split(",")[1];
        if (!base64) throw new Error("image processing failed");
        contentBlocks.push({ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:base64 } });
      }
      const ctx = buildMealContext(data);
      // Combine user description with photos so they reinforce each other
      const userHint = (textDesc && textDesc.trim()) ? `User description: ${textDesc.trim()}` : null;
      contentBlocks.push({ type:"text", text: buildMacroPrompt(ctx, userHint) });
      if (!getApiKey()) throw new Error("No API key set. Add yours in the COACH tab under AI / API Key.");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1200,
          messages: [{
            role: "user",
            content: contentBlocks,
          }],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`API ${resp.status}: ${errText.slice(0, 80) || "request failed"}`);
      }
      const d = await resp.json();
      const text = (d.content || []).filter(x => x.type === "text").map(x => x.text).join("");
      if (!text) throw new Error("empty response");
      let parsed;
      try {
        parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      } catch {
        throw new Error(`unparseable: ${text.slice(0, 50)}`);
      }
      setCal(String(parsed.calories || ""));
      setProt(String(parsed.protein || ""));
      setCarb(String(parsed.carbs || ""));
      setFat(String(parsed.fat || ""));
      if (parsed.description) setDesc(parsed.description);
      if (Array.isArray(parsed.items) && parsed.items.length > 0) setItemized(parsed.items);
      if (parsed.slot) setSlot(parsed.slot); else if (parsed.description) setSlot(inferMealSlot(parsed.description, new Date()));
      setAiMsg(parsed.comment ? `✓ ${parsed.calories}kcal · ${parsed.protein}g protein — ${parsed.comment}` : `✓ AI: ${parsed.calories} kcal · ${parsed.protein}g protein — review and save`);
    } catch (e) {
      console.error("Food analysis error:", e);
      const msg = (e && e.message) ? String(e.message).slice(0, 80) : "unknown";
      setAiMsg(`✗ ${msg} — describe in text below or enter manually`);
    }
    setAnalyzing(false);
  }

  async function analyzeText() {
    if (!textDesc.trim()) return;
    setAnalyzing(true);
    setAiMsg("Estimating macros from description...");
    setItemized(null);
    try {
      const ctx = buildMealContext(data);
      if (!getApiKey()) throw new Error("No API key set. Add yours in the COACH tab under AI / API Key.");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          messages: [{
            role: "user",
            content: buildMacroPrompt(ctx, textDesc),
          }],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`API ${resp.status}: ${errText.slice(0, 80) || "request failed"}`);
      }
      const d = await resp.json();
      const text = (d.content || []).filter(x => x.type === "text").map(x => x.text).join("");
      if (!text) throw new Error("empty response");
      let parsed;
      try {
        parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      } catch {
        throw new Error(`unparseable: ${text.slice(0, 50)}`);
      }
      setCal(String(parsed.calories || ""));
      setProt(String(parsed.protein || ""));
      setCarb(String(parsed.carbs || ""));
      setFat(String(parsed.fat || ""));
      if (parsed.description) setDesc(parsed.description);
      if (Array.isArray(parsed.items) && parsed.items.length > 0) setItemized(parsed.items);
      if (parsed.slot) setSlot(parsed.slot); else if (parsed.description) setSlot(inferMealSlot(parsed.description, new Date()));
      setAiMsg(parsed.comment ? `✓ ${parsed.calories}kcal · ${parsed.protein}g protein — ${parsed.comment}` : `✓ AI: ${parsed.calories} kcal · ${parsed.protein}g protein — review and save`);
    } catch (e) {
      console.error("Text analysis error:", e);
      const msg = (e && e.message) ? String(e.message).slice(0, 80) : "unknown";
      setAiMsg(`✗ ${msg} — enter manually`);
    }
    setAnalyzing(false);
  }

  function clearForm() {
    setCal(""); setProt(""); setCarb(""); setFat(""); setDesc(""); setTextDesc(""); setAiMsg(""); setItemized(null); setEditingEntryId(null);
    setSlot(inferMealSlot("", new Date()));
  }

  function startEditEntry(entry) {
    setEditingEntryId(entry.id);
    setCal(String(entry.calories || ""));
    setProt(String(entry.protein || ""));
    setCarb(String(entry.carbs || ""));
    setFat(String(entry.fat || ""));
    setDesc(entry.description || "");
    setItemized(Array.isArray(entry.items) && entry.items.length > 0 ? entry.items : null);
    setSlot(entry.slot || inferMealSlot(entry.description || "", new Date()));
    setAiMsg("");
    setTextDesc("");
    // Scroll the form into view
    setTimeout(() => {
      const form = document.getElementById("meal-form-anchor");
      if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function cancelEdit() {
    clearForm();
  }

  async function saveEntry() {
    if (saving) return; // hard guard against double-click
    const calN = parseFloat(cal) || 0;
    const protN = parseFloat(prot) || 0;
    const carbN = parseFloat(carb) || 0;
    const fatN = parseFloat(fat) || 0;
    if (calN === 0 && protN === 0 && carbN === 0 && fatN === 0) {
      setAiMsg("Add at least one macro value before saving");
      return;
    }
    setSaving(true);
    try {
      const dayBefore = data.meals[logDate] || { entries: [] };
      const existingEntries = dayBefore.entries || [];
      let updatedEntries;
      if (editingEntryId) {
        // UPDATE existing entry — preserve id, time, and legacy flag
        const original = existingEntries.find(e => e.id === editingEntryId);
        const updated = {
          id: editingEntryId,
          time: original?.time || nowTime(),
          calories: calN,
          protein: protN,
          carbs: carbN,
          fat: fatN,
          description: desc.trim() || "Meal",
          items: itemized || null,
          slot: slot,
          ...(original?.legacy ? { legacy: true } : {}),
        };
        updatedEntries = existingEntries.map(e => e.id === editingEntryId ? updated : e);
      } else {
        // INSERT new entry
        const newEntry = {
          id: newEntryId(),
          time: nowTime(),
          calories: calN,
          protein: protN,
          carbs: carbN,
          fat: fatN,
          description: desc.trim() || "Meal",
          items: itemized || null,
          slot: slot,
        };
        updatedEntries = [...existingEntries, newEntry];
      }
      const updatedDay = recomputeMealDay({ ...dayBefore, entries: updatedEntries });
      await updateData("meals", { ...data.meals, [logDate]: updatedDay });
      // Show "saved" flash, then clear form for next entry
      setSavedFlash(true);
      clearForm();
      setTimeout(() => setSavedFlash(false), 1200);
    } catch (e) {
      setAiMsg("Save failed — try again");
    }
    setSaving(false);
  }

  async function deleteEntry(entryId) {
    if (deletingId) return; // already mid-delete, ignore additional taps
    setDeletingId(entryId);
    try {
      const dayBefore = data.meals[logDate];
      if (dayBefore) {
        const updatedDay = recomputeMealDay({
          ...dayBefore,
          entries: (dayBefore.entries || []).filter(e => e.id !== entryId),
        });
        await updateData("meals", { ...data.meals, [logDate]: updatedDay });
      }
    } catch {}
    setDeletingId(null);
  }

  async function convertOrphanToEntry() {
    const dayBefore = data.meals[logDate];
    if (!dayBefore) return;
    const totals = {
      calories: dayBefore.calories || 0,
      protein: dayBefore.protein || 0,
      carbs: dayBefore.carbs || 0,
      fat: dayBefore.fat || 0,
    };
    if (totals.calories + totals.protein + totals.carbs + totals.fat === 0) return;
    const description = (dayBefore.items && dayBefore.items.length > 0)
      ? dayBefore.items.join(", ")
      : "Imported entry";
    const recoveredEntry = {
      id: `recovered_${Date.now()}`,
      time: "00:00",
      ...totals,
      description,
      legacy: true,
    };
    await updateData("meals", { ...data.meals, [logDate]: { ...totals, items: dayBefore.items || [description], entries: [recoveredEntry] } });
    setActionFlash("converted");
    setTimeout(() => setActionFlash(""), 2500);
  }

  async function resetDay() {
    if (resetting) return;
    setResetting(true);
    try {
      await updateData("meals", { ...data.meals, [logDate]: { calories:0, protein:0, carbs:0, fat:0, items:[], entries:[] } });
      setResetConfirming(false);
      setActionFlash("reset");
      setTimeout(() => setActionFlash(""), 2500);
    } catch {}
    setResetting(false);
  }

  // Recovery state: day has macros but no entries (data got into half-migrated state)
  const hasOrphanMacros = entries.length === 0 && (dayData.calories > 0 || dayData.protein > 0);

  return (
    <Sheet onClose={onClose} title={isHistorical ? `LOG MEAL — ${logDate}` : "LOG MEAL"}>
      {/* Date picker */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Date</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
          {[0,1,2,3,4].map(daysAgo => {
            const d = new Date();
            d.setDate(d.getDate() - daysAgo);
            const ds = toLocalDateStr(d);
            const label = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : d.toLocaleDateString("en",{weekday:"short"});
            const isSelected = logDate === ds;
            return (
              <button key={ds} onClick={() => setLogDate(ds)} style={{ padding:"5px 12px", borderRadius:8, cursor:"pointer", fontFamily:F.mono, fontSize:10, background:isSelected?C.lime:"#1A1A22", border:`1px solid ${isSelected?C.lime:C.border}`, color:isSelected?C.dark:C.gray }}>
                {label}
              </button>
            );
          })}
          <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} max={getToday()}
            style={{ padding:"5px 10px", borderRadius:8, fontFamily:F.mono, fontSize:10, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer" }} />
        </div>
      </div>

      {/* Action success flash */}
      {actionFlash && (
        <div style={{ marginBottom:14, padding:"12px 14px", background:`${C.lime}15`, border:`1px solid ${C.lime}`, borderRadius:10, textAlign:"center" }}>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, letterSpacing:0.5, fontWeight:600 }}>
            {actionFlash === "reset" ? "✓ DAY RESET — log fresh below" : "✓ CONVERTED — entry now editable above"}
          </div>
        </div>
      )}

      {/* Orphan macros recovery (day has totals but no entries) */}
      {hasOrphanMacros && (
        <div style={{ marginBottom:16, background:`${C.amber}15`, border:`1px solid ${C.amber}`, borderRadius:10, padding:12 }}>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.amber, letterSpacing:1, marginBottom:6, fontWeight:600 }}>
            ⚠ ORPHAN MACROS DETECTED
          </div>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.grayLight, lineHeight:1.5, marginBottom:10 }}>
            {isHistorical ? logDate : "Today"} has {dayData.calories} kcal · {dayData.protein}g P · {dayData.carbs}g C · {dayData.fat}g F logged, but no individual entries to edit. Pick a fix:
          </div>

          {!resetConfirming ? (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <button onClick={convertOrphanToEntry}
                style={{ padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:C.amber, border:"none", color:C.dark, cursor:"pointer", fontWeight:700, letterSpacing:0.5 }}>
                CONVERT TO EDITABLE ENTRY
              </button>
              <button onClick={() => setResetConfirming(true)}
                style={{ padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:"transparent", border:`1px solid ${C.orange}80`, color:C.orange, cursor:"pointer", letterSpacing:0.5 }}>
                🗑 RESET DAY (zero everything)
              </button>
            </div>
          ) : (
            <div style={{ background:`${C.orange}15`, border:`1px solid ${C.orange}`, borderRadius:8, padding:10 }}>
              <div style={{ fontFamily:F.mono, fontSize:10, color:C.orange, marginBottom:8, textAlign:"center", lineHeight:1.4 }}>
                Zero all macros for {isHistorical ? logDate : "today"}? This can't be undone.
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setResetConfirming(false)} disabled={resetting}
                  style={{ flex:1, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:10, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer", letterSpacing:0.5 }}>
                  CANCEL
                </button>
                <button onClick={resetDay} disabled={resetting}
                  style={{ flex:2, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:C.orange, border:"none", color:C.white, cursor:"pointer", fontWeight:700, letterSpacing:0.5 }}>
                  {resetting ? "⏳ RESETTING..." : "YES, RESET"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state when day is truly empty (no macros, no entries) */}
      {!hasOrphanMacros && entries.length === 0 && !actionFlash && (
        <div style={{ marginBottom:16, padding:"14px", background:C.surfaceAlt, borderRadius:10, textAlign:"center" }}>
          <div style={{ fontSize:18, marginBottom:4 }}>🍽</div>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, lineHeight:1.5 }}>
            No meals logged for {isHistorical ? logDate : "today"} yet.<br/>Add one below.
          </div>
        </div>
      )}

      {/* Existing entries for this date */}
      {entries.length > 0 && (
        <div style={{ marginBottom:16, background:C.surfaceAlt, borderRadius:10, padding:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.teal, letterSpacing:1 }}>
              {isHistorical ? `MEALS ON ${logDate}` : "TODAY'S MEALS"} · {entries.length}
            </div>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.lime }}>
              {dayData.calories} kcal · {dayData.protein}g P
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {entries.map(e => {
              const isEditing = editingEntryId === e.id;
              return (
                <div key={e.id}
                  onClick={() => { if (!deletingId) startEditEntry(e); }}
                  style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"6px 10px",
                    background: isEditing ? `${C.lime}15` : "#1A1A22",
                    borderRadius:6,
                    border:`1px solid ${isEditing ? C.lime : (e.legacy ? C.amber+"40" : C.border)}`,
                    cursor: deletingId ? "default" : "pointer",
                    transition: "background 0.15s, border 0.15s",
                  }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:F.body, fontSize:12, color:C.white, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {isEditing && <span style={{ color:C.lime, fontFamily:F.mono, fontSize:9, marginRight:6 }}>EDITING</span>}
                      {e.legacy && !isEditing && <span style={{ color:C.amber, fontFamily:F.mono, fontSize:9, marginRight:6 }}>LEGACY</span>}
                      {(() => { const m = e.slot && MEAL_SLOTS.find(x => x.id === e.slot); return m ? <span style={{ color:C.teal, fontFamily:F.mono, fontSize:10, marginRight:6 }} title={m.label}>{m.emoji}</span> : null; })()}
                      {e.description}
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>
                      {e.time && e.time !== "00:00" ? `${e.time} · ` : ""}{Math.round(e.calories)}kcal · {Math.round(e.protein)}P · {Math.round(e.carbs)}C · {Math.round(e.fat)}F
                      {!isEditing && <span style={{ color:C.gray, marginLeft:6, opacity:0.6 }}>· tap to edit</span>}
                    </div>
                  </div>
                  <button onClick={(ev) => { ev.stopPropagation(); deleteEntry(e.id); }}
                    disabled={!!deletingId}
                    style={{ background:"none", border:"none", cursor: deletingId ? "default" : "pointer", padding:6, color: deletingId === e.id ? C.gray : C.orange, marginLeft:6, opacity: deletingId && deletingId !== e.id ? 0.4 : 1 }}
                    aria-label="Delete entry">
                    {deletingId === e.id ? "⏳" : <X size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
          {entries.some(e => e.legacy) && (
            <div style={{ fontFamily:F.mono, fontSize:9, color:C.amber, marginTop:8, lineHeight:1.4 }}>
              ⚠ Legacy entries are pre-update day-totals. Delete and re-log to track individual meals.
            </div>
          )}
        </div>
      )}

      {/* Section header for adding/editing */}
      <div id="meal-form-anchor" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, paddingTop:4, borderTop:`1px solid ${C.border}` }}>
        <div style={{ fontFamily:F.mono, fontSize:10, color: editingEntryId ? C.lime : C.lime, letterSpacing:1 }}>
          {editingEntryId ? "✎ EDITING MEAL" : "+ ADD A MEAL"}
        </div>
        {editingEntryId && (
          <button onClick={cancelEdit}
            style={{ fontFamily:F.mono, fontSize:9, color:C.gray, background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", cursor:"pointer", letterSpacing:1 }}>
            CANCEL EDIT
          </button>
        )}
      </div>

      {/* MEAL SLOT picker (auto-detected from time + description; tap to override) */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:1, marginBottom:5 }}>SLOT</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {MEAL_SLOTS.map(opt => {
            const active = slot === opt.id;
            return (
              <button key={opt.id} onClick={() => setSlot(opt.id)}
                style={{ padding:"6px 10px", borderRadius:14, fontFamily:F.mono, fontSize:10, letterSpacing:0.5, background: active ? C.teal : "transparent", color: active ? C.dark : C.grayLight, border:`1px solid ${active ? C.teal : C.border}`, cursor:"pointer" }}>
                {opt.emoji} {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Photo scanner */}
      <div style={{ display:"flex", gap:8, marginBottom:6 }}>
        <label htmlFor="meal-photo-camera" style={{ flex:1, cursor: analyzing ? "default" : "pointer" }}>
          <div style={{ background: analyzing ? "#1A1A22" : `${C.teal}15`, border:`1px solid ${analyzing ? C.border : C.teal}`, borderRadius:12, padding:"12px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <div style={{ fontSize:22 }}>{analyzing ? "⏳" : "📷"}</div>
            <div style={{ fontFamily:F.mono, fontSize:10, color: analyzing ? C.gray : C.teal, fontWeight:700, letterSpacing:0.5 }}>CAMERA</div>
          </div>
        </label>
        <label htmlFor="meal-photo-gallery" style={{ flex:1, cursor: analyzing ? "default" : "pointer" }}>
          <div style={{ background: analyzing ? "#1A1A22" : `${C.teal}15`, border:`1px solid ${analyzing ? C.border : C.teal}`, borderRadius:12, padding:"12px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <div style={{ fontSize:22 }}>{analyzing ? "⏳" : "🖼️"}</div>
            <div style={{ fontFamily:F.mono, fontSize:10, color: analyzing ? C.gray : C.teal, fontWeight:700, letterSpacing:0.5 }}>GALLERY · MULTI</div>
          </div>
        </label>
      </div>
      <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:14, textAlign:"center" }}>
        AI estimates macros · if you type a description below, it gets combined with the photo for better context
      </div>
      <input id="meal-photo-camera" type="file" accept="image/*" capture="environment" disabled={analyzing}
        onChange={e => { analyzePhoto(Array.from(e.target.files || [])); e.target.value=""; }}
        style={{ position:"absolute", opacity:0, width:1, height:1, pointerEvents:"none" }} />
      <input id="meal-photo-gallery" type="file" accept="image/*" multiple disabled={analyzing}
        onChange={e => { analyzePhoto(Array.from(e.target.files || [])); e.target.value=""; }}
        style={{ position:"absolute", opacity:0, width:1, height:1, pointerEvents:"none" }} />
      {aiMsg && (
        <div style={{ fontFamily:F.mono, fontSize:10, color:aiMsg.startsWith("✓")?C.lime:C.orange, marginBottom:14, padding:"6px 10px", background:"#1A1A22", borderRadius:8 }}>
          {aiMsg}
        </div>
      )}
      {/* Itemized breakdown from AI */}
      {itemized && itemized.length > 0 && (
        <div style={{ marginBottom:14, background:"#0E0E14", border:`1px solid ${C.purple}40`, borderRadius:10, padding:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.purple, letterSpacing:1 }}>
              ITEMIZED BREAKDOWN · {itemized.length}
            </div>
            <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>edit totals below if off</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {itemized.map((item, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"6px 8px", background:"#1A1A22", borderRadius:5, gap:8 }}>
                <div style={{ flex:1, minWidth:0, fontFamily:F.body, fontSize:11, color:C.white, lineHeight:1.3 }}>
                  {item.name}
                </div>
                <div style={{ fontFamily:F.mono, fontSize:9, color:C.grayLight, textAlign:"right", whiteSpace:"nowrap" }}>
                  {Math.round(item.calories || 0)}kc · {Math.round(item.protein || 0)}P<br/>
                  {Math.round(item.carbs || 0)}C · {Math.round(item.fat || 0)}F
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}`, fontFamily:F.mono, fontSize:10 }}>
            <div style={{ color:C.purple, letterSpacing:1 }}>TOTAL</div>
            <div style={{ color:C.lime }}>
              {itemized.reduce((s, i) => s + (parseFloat(i.calories) || 0), 0)}kc · {itemized.reduce((s, i) => s + (parseFloat(i.protein) || 0), 0)}P · {itemized.reduce((s, i) => s + (parseFloat(i.carbs) || 0), 0)}C · {itemized.reduce((s, i) => s + (parseFloat(i.fat) || 0), 0)}F
            </div>
          </div>
        </div>
      )}
      {/* Text → AI estimator (no photo needed) */}
      <div style={{ marginBottom:16, background:`${C.purple}10`, border:`1px solid ${C.purple}40`, borderRadius:12, padding:"12px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
          <div style={{ fontSize:16 }}>✨</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.purple, letterSpacing:1 }}>DESCRIBE FOOD → AI ESTIMATE</div>
        </div>
        <textarea
          value={textDesc}
          onChange={e => setTextDesc(e.target.value)}
          placeholder="e.g. 2 chicken thighs, 1 cup rice, half avocado, glass of milk"
          rows={2}
          style={{ width:"100%", boxSizing:"border-box", padding:"8px 10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.white, resize:"vertical", marginBottom:8 }}
        />
        <button
          onClick={analyzeText}
          disabled={analyzing || !textDesc.trim()}
          style={{ width:"100%", padding:"8px 12px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:analyzing||!textDesc.trim()?"#1A1A22":C.purple, color:analyzing||!textDesc.trim()?C.gray:C.white, border:"none", cursor:analyzing||!textDesc.trim()?"default":"pointer", fontWeight:600, letterSpacing:1 }}
        >
          {analyzing ? "⏳ ANALYZING..." : "ESTIMATE MACROS"}
        </button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <FInput label="Calories" value={cal} onChange={setCal} placeholder="600" color={C.lime} />
        <FInput label="Protein (g)" value={prot} onChange={setProt} placeholder="50" color={C.teal} />
        <FInput label="Carbs (g)" value={carb} onChange={setCarb} placeholder="60" color={C.orange} />
        <FInput label="Fat (g)" value={fat} onChange={setFat} placeholder="20" color={C.purple} />
      </div>
      <div style={{ marginBottom:18 }}>
        <FInput label="Description" value={desc} onChange={setDesc} placeholder="e.g. Chicken + rice bowl..." type="text" />
      </div>

      {/* Save button — locked during save, shows feedback */}
      <button
        onClick={saveEntry}
        disabled={saving}
        style={{
          width:"100%", padding:"14px", borderRadius:12,
          fontFamily:F.mono, fontSize:13, fontWeight:700, letterSpacing:1.5,
          background: savedFlash ? C.teal : saving ? "#1A1A22" : (editingEntryId ? C.purple : C.lime),
          color: savedFlash ? C.dark : saving ? C.gray : (editingEntryId ? C.white : C.dark),
          border:"none", cursor: saving ? "default" : "pointer",
          marginBottom: 8,
          transition: "background 0.2s",
        }}
      >
        {savedFlash
          ? (editingEntryId ? "✓ UPDATED" : "✓ ADDED")
          : saving
            ? "⏳ SAVING..."
            : (editingEntryId ? "✓ UPDATE MEAL" : `+ ADD MEAL TO ${isHistorical ? logDate : "TODAY"}`)
        }
      </button>
      <button onClick={onClose}
        style={{ width:"100%", padding:"10px", borderRadius:10, fontFamily:F.mono, fontSize:11, background:"transparent", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer", letterSpacing:1 }}>
        DONE
      </button>
    </Sheet>
  );
}

// ── Workout Modal (Hevy-style) ─────────────────────────────────────
function WorkoutModal({ data, updateData, onClose }) {
  const dayName = DAYS[new Date().getDay()];
  const [split, setSplit] = useState(SPLIT_MAP[dayName] || "Upper A");
  const [note, setNote] = useState("");
  const [startTime, setStartTime] = useState(Date.now());
  const [exercises, setExercises] = useState([]);
  const [exQuery, setExQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [restStartTime, setRestStartTime] = useState(null); // null = not resting; ms timestamp = resting since
  const [now, setNow] = useState(Date.now());
  const [hasRestored, setHasRestored] = useState(false); // gate autosave until initial load completes
  const [resumedAt, setResumedAt] = useState(null); // timestamp of restored session for banner
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tick clock for session/rest timers — uses Date.now() so survives backgrounding
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Restore in-progress session on mount ───────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await window.storage.get(ACTIVE_WORKOUT_KEY);
        if (raw && raw.value && !cancelled) {
          const parsed = JSON.parse(raw.value);
          if (parsed && parsed.ts && (Date.now() - parsed.ts < ACTIVE_WORKOUT_TTL_MS)) {
            if (parsed.split) setSplit(parsed.split);
            if (parsed.note) setNote(parsed.note);
            if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
              setExercises(parsed.exercises);
              setStartTime(parsed.startTime || parsed.ts);
              setResumedAt(parsed.ts);
            }
          } else {
            // stale, clean up
            try { await window.storage.delete(ACTIVE_WORKOUT_KEY); } catch {}
          }
        }
      } catch {}
      if (!cancelled) setHasRestored(true);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save on every change once any exercise exists ─────────
  useEffect(() => {
    if (!hasRestored) return;
    if (exercises.length === 0) return; // no real session yet
    const payload = { ts: Date.now(), startTime, split, note, exercises };
    window.storage.set(ACTIVE_WORKOUT_KEY, JSON.stringify(payload)).catch(() => {});
  }, [exercises, split, note, hasRestored, startTime]);

  const filteredEx = exQuery.length >= 1
    ? EXERCISE_LIST.filter(e => e.toLowerCase().includes(exQuery.toLowerCase())).slice(0, 6)
    : [];

  function addExercise(name) {
    setExercises(prev => [...prev, { id: Date.now(), name, sets: [{ weight:"", reps:"", done:false }] }]);
    setExQuery("");
    setShowSearch(false);
  }

  function addSet(exId) {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const lastWeight = ex.sets[ex.sets.length - 1]?.weight || "";
      return { ...ex, sets: [...ex.sets, { weight:lastWeight, reps:"", done:false }] };
    }));
  }

  function removeSet(exId) {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId || ex.sets.length <= 1) return ex;
      return { ...ex, sets: ex.sets.slice(0, -1) };
    }));
  }

  function updateSet(exId, idx, field, val) {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const sets = ex.sets.map((s, i) => i === idx ? { ...s, [field]: val } : s);
      return { ...ex, sets };
    }));
  }

  function toggleDone(exId, idx) {
    let nowDone = false;
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const sets = ex.sets.map((s, i) => {
        if (i !== idx) return s;
        nowDone = !s.done;
        return { ...s, done: nowDone };
      });
      return { ...ex, sets };
    }));
    // Only start rest timer when checking a set as DONE, not when un-checking
    if (nowDone) {
      setRestStartTime(Date.now());
    }
  }

  function stopRestTimer() {
    setRestStartTime(null);
  }

  function removeExercise(exId) {
    setExercises(prev => prev.filter(ex => ex.id !== exId));
  }

  async function save() {
    if (saving) return;
    const doneSets = exercises.flatMap(ex => ex.sets.filter(s => s.done));
    if (doneSets.length === 0) return; // guard against empty save
    setSaving(true);
    try {
      const dur = Math.round((Date.now() - startTime) / 60000);
      const totalVol = doneSets.reduce((acc, s) => acc + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0);
      const exLog = exercises.filter(ex => ex.sets.some(s => s.done)).map(ex => ({
        name: ex.name,
        sets: ex.sets.filter(s => s.done).map(s => `${s.weight}×${s.reps}`).join(", "),
      }));

      let prCount = 0;
      const updatedPRs = [...data.prs];
      exercises.forEach(ex => {
        ex.sets.filter(s => s.done && s.weight && s.reps).forEach(s => {
          const w = parseFloat(s.weight);
          const r = parseInt(s.reps);
          const new1 = calc1RM(w, r);
          const existIdx = updatedPRs.findIndex(p => p.exercise.toLowerCase() === ex.name.toLowerCase());
          if (existIdx >= 0) {
            const old1 = calc1RM(updatedPRs[existIdx].weight, updatedPRs[existIdx].reps);
            if (new1 > old1) { updatedPRs[existIdx] = { exercise:ex.name, weight:w, reps:r, date:getToday() }; prCount++; }
          } else {
            updatedPRs.push({ exercise:ex.name, weight:w, reps:r, date:getToday() });
            prCount++;
          }
        });
      });

      if (prCount > 0) await updateData("prs", updatedPRs);
      const newW = {
        id: `w${Date.now()}`, date:getToday(), name:split, split,
        note: note ? `"${note}"` : "",
        duration: dur, volume: Math.round(totalVol),
        sets: doneSets.length, prs: prCount,
        exercises: exLog,
      };
      await updateData("workouts", [newW, ...data.workouts]);
      // Clear active session storage now that workout is saved
      try { await window.storage.delete(ACTIVE_WORKOUT_KEY); } catch {}
      onClose();
    } catch (e) {
      console.error("Save workout failed:", e);
    }
    setSaving(false);
  }

  async function discardSession() {
    try { await window.storage.delete(ACTIVE_WORKOUT_KEY); } catch {}
    setShowCloseConfirm(false);
    setResumedAt(null);
    onClose();
  }

  function attemptClose() {
    // If there's any meaningful activity, ask first
    const hasActivity = exercises.some(ex => ex.sets.some(s => s.done || (s.weight && s.weight !== "") || (s.reps && s.reps !== "")));
    if (hasActivity) {
      setShowCloseConfirm(true);
    } else {
      // Nothing of value — wipe any orphan storage and close
      window.storage.delete(ACTIVE_WORKOUT_KEY).catch(() => {});
      onClose();
    }
  }

  const doneSets = exercises.reduce((acc, ex) => acc + ex.sets.filter(s => s.done).length, 0);
  const sessionSecs = Math.floor((now - startTime) / 1000);
  const restSecs = restStartTime ? Math.floor((now - restStartTime) / 1000) : 0;
  const fmt = secs => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const restColor = restSecs < 90 ? C.lime : restSecs < 120 ? C.amber : C.orange;

  return (
    <Sheet onClose={attemptClose} title="LOG SESSION">
      {/* Resumed-session banner */}
      {resumedAt && (
        <div style={{ background:`${C.amber}15`, border:`1px solid ${C.amber}40`, borderRadius:8, padding:"8px 12px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.amber, lineHeight:1.4 }}>
            ⟲ RESUMED · session from {fmtRelativeTime(resumedAt)}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={discardSession} title="Discard restored session and start fresh"
              style={{ fontFamily:F.mono, fontSize:9, color:C.gray, background:"transparent", border:`1px solid ${C.border}`, borderRadius:5, padding:"3px 8px", cursor:"pointer", letterSpacing:0.5 }}>
              ↻ FRESH
            </button>
            <button onClick={() => setResumedAt(null)} aria-label="Dismiss"
              style={{ background:"none", border:"none", color:C.gray, cursor:"pointer", padding:2, display:"flex", alignItems:"center" }}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Split */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
        {["Upper A","Lower A","Upper B","Lower B"].map(s => (
          <button
            key={s}
            onClick={() => setSplit(s)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: F.mono,
              fontSize: 11,
              background: split === s ? C.lime : "#1A1A22",
              border: `1px solid ${split === s ? C.lime : C.border}`,
              color: split === s ? C.dark : C.gray,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Timers */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
        <div style={{ background:"#1A1A22", borderRadius:10, padding:"8px 12px", textAlign:"center" }}>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:2 }}>SESSION</div>
          <div style={{ fontFamily:F.display, fontSize:22, color:C.white }}>{fmt(sessionSecs)}</div>
        </div>
        <div onClick={restStartTime ? stopRestTimer : undefined}
          style={{ background:"#1A1A22", borderRadius:10, padding:"8px 12px", textAlign:"center", cursor: restStartTime ? "pointer" : "default", border: restStartTime ? `1px solid ${restColor}40` : "1px solid transparent" }}>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:2 }}>REST{restStartTime ? " · TAP TO STOP" : ""}</div>
          <div style={{ fontFamily:F.display, fontSize:22, color:restStartTime ? restColor : C.gray }}>
            {restStartTime ? fmt(restSecs) : "--:--"}
          </div>
        </div>
      </div>

      {/* Exercises */}
      {exercises.map(ex => {
        const last = lookupLastPerformance(ex.name, data.workouts);
        return (
          <div key={ex.id} style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: last ? 4 : 10 }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.white, flex:1 }}>{ex.name}</div>
              <button onClick={() => removeExercise(ex.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:4, color:C.gray }}>
                <X size={14} />
              </button>
            </div>
            {last && (
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.grayLight, marginBottom:8, opacity:0.7, lineHeight:1.3 }}>
                Last {last.date}: {last.sets}
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"24px 1fr 1fr 36px", gap:6, marginBottom:6 }}>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>SET</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>LBS</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>REPS</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>✓</div>
            </div>
            {ex.sets.map((s, idx) => {
              const showPR = isPotentialPR(ex.name, s.weight, s.reps, data.prs);
              return (
                <div key={idx} style={{ position:"relative", display:"grid", gridTemplateColumns:"24px 1fr 1fr 36px", gap:6, marginBottom:6, alignItems:"center" }}>
                  {showPR && (
                    <div style={{ position:"absolute", left:24, top:-7, background:C.amber, color:C.dark, fontFamily:F.mono, fontSize:8, fontWeight:700, padding:"1px 5px", borderRadius:3, letterSpacing:0.5, zIndex:1, lineHeight:1.2 }}>
                      🔥 PR
                    </div>
                  )}
                  <div style={{ fontFamily:F.mono, fontSize:11, color:s.done ? C.lime : C.gray, textAlign:"center" }}>{idx + 1}</div>
                  <input
                    value={s.weight}
                    onChange={e => updateSet(ex.id, idx, "weight", e.target.value)}
                    placeholder="lbs"
                    type="number"
                    inputMode="decimal"
                    style={{ background:s.done?"#0A1A00":"#111116", border:`1px solid ${s.done?C.lime:C.border}`, borderRadius:8, padding:"8px 10px", color:s.done?C.lime:C.white, fontSize:14, fontFamily:F.mono, outline:"none", width:"100%", boxSizing:"border-box" }}
                  />
                  <input
                    value={s.reps}
                    onChange={e => updateSet(ex.id, idx, "reps", e.target.value)}
                    placeholder="reps"
                    type="number"
                    inputMode="numeric"
                    style={{ background:s.done?"#0A1A00":"#111116", border:`1px solid ${s.done?C.lime:C.border}`, borderRadius:8, padding:"8px 10px", color:s.done?C.lime:C.white, fontSize:14, fontFamily:F.mono, outline:"none", width:"100%", boxSizing:"border-box" }}
                  />
                  <button
                    onClick={() => toggleDone(ex.id, idx)}
                    style={{ width:36, height:36, borderRadius:8, border:`2px solid ${s.done?C.lime:C.border}`, background:s.done?`${C.lime}25`:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
                  >
                    {s.done && <Check size={16} color={C.lime} />}
                  </button>
                </div>
              );
            })}
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <button onClick={() => addSet(ex.id)} style={{ flex:1, padding:"7px", borderRadius:8, border:`1px dashed ${C.border}`, background:"none", fontFamily:F.mono, fontSize:10, color:C.gray, cursor:"pointer" }}>
                + ADD SET
              </button>
              {ex.sets.length > 1 && (
                <button onClick={() => removeSet(ex.id)} style={{ padding:"7px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:"none", fontFamily:F.mono, fontSize:10, color:C.gray, cursor:"pointer" }}>
                  −
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Add Exercise */}
      <div style={{ marginBottom:14 }}>
        {showSearch ? (
          <div>
            <input
              value={exQuery}
              onChange={e => setExQuery(e.target.value)}
              placeholder="Search exercise..."
              autoFocus
              style={{ width:"100%", background:"#1A1A22", border:`1px solid ${C.lime}`, borderRadius:10, padding:"11px 14px", color:C.white, fontSize:14, fontFamily:F.mono, outline:"none", boxSizing:"border-box", marginBottom:4 }}
            />
            {filteredEx.length > 0 && (
              <div style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
                {filteredEx.map((ex, i) => (
                  <div
                    key={ex}
                    onClick={() => addExercise(ex)}
                    style={{ padding:"10px 14px", fontSize:13, fontFamily:F.mono, color:C.grayLight, borderBottom:i < filteredEx.length-1 ? `1px solid ${C.border}` : "none", cursor:"pointer" }}
                  >
                    {ex}
                  </div>
                ))}
              </div>
            )}
            {exQuery && filteredEx.length === 0 && (
              <div
                onClick={() => addExercise(exQuery)}
                style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:F.mono, color:C.lime, cursor:"pointer" }}
              >
                Add "{exQuery}"
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            style={{ width:"100%", padding:"12px", borderRadius:12, border:`1px dashed ${C.lime}`, background:`${C.lime}08`, fontFamily:F.display, fontSize:18, color:C.lime, cursor:"pointer", letterSpacing:0.5 }}
          >
            + ADD EXERCISE
          </button>
        )}
      </div>

      <div style={{ marginBottom:16 }}>
        <FInput label="Session vibe / note" value={note} onChange={setNote} placeholder='"These legs are goofy"' type="text" />
      </div>

      {/* Sticky bottom bar — stats + finish button always reachable */}
      <div style={{
        position: "sticky",
        bottom: -40,
        marginLeft: -20,
        marginRight: -20,
        marginTop: 14,
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 12,
        paddingBottom: 44,
        background: "linear-gradient(to bottom, rgba(17,17,22,0) 0%, rgba(17,17,22,0.92) 22%, #111116 60%)",
        zIndex: 5,
      }}>
        <div style={{ background:"#1A1A22", borderRadius:10, padding:"8px 14px", marginBottom:10, display:"flex", gap:24, justifyContent:"space-around" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:F.mono, fontSize:16, color:C.lime, fontWeight:600 }}>{doneSets}</div>
            <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>SETS DONE</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:F.mono, fontSize:16, color:C.teal, fontWeight:600 }}>{exercises.length}</div>
            <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>EXERCISES</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:F.mono, fontSize:16, color:C.white, fontWeight:600 }}>{fmt(sessionSecs)}</div>
            <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>TIME</div>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving || doneSets === 0}
          style={{
            width: "100%",
            background: doneSets === 0 ? "#1A1A22" : (saving ? "#1A1A22" : C.lime),
            border: "none",
            borderRadius: 12,
            padding: 14,
            fontFamily: F.display,
            fontSize: 18,
            color: doneSets === 0 ? C.gray : (saving ? C.gray : C.dark),
            cursor: (saving || doneSets === 0) ? "default" : "pointer",
            letterSpacing: 1,
          }}
        >
          {saving
            ? "⏳ SAVING..."
            : doneSets === 0
              ? "✓ A SET TO ENABLE FINISH"
              : `FINISH SESSION (${doneSets} SET${doneSets === 1 ? "" : "S"})`}
        </button>
      </div>

      {/* Close-confirmation dialog */}
      {showCloseConfirm && (
        <div onClick={() => setShowCloseConfirm(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:14, padding:20, maxWidth:380, width:"100%" }}>
            <div style={{ fontFamily:F.display, fontSize:20, color:C.amber, marginBottom:6, letterSpacing:0.5 }}>
              ACTIVE SESSION
            </div>
            <div style={{ fontFamily:F.body, fontSize:13, color:C.grayLight, marginBottom:18, lineHeight:1.5 }}>
              You have unsaved sets. Your progress is auto-saved and will resume next time you open this — but you can also finish or discard now.
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {doneSets > 0 && (
                <button onClick={async () => { setShowCloseConfirm(false); await save(); }}
                  style={{ width:"100%", padding:"12px", borderRadius:10, fontFamily:F.mono, fontSize:12, fontWeight:700, background:C.lime, color:C.dark, border:"none", cursor:"pointer", letterSpacing:1 }}>
                  ✓ FINISH & SAVE ({doneSets} SETS)
                </button>
              )}
              <button onClick={() => setShowCloseConfirm(false)}
                style={{ width:"100%", padding:"12px", borderRadius:10, fontFamily:F.mono, fontSize:12, background:"#0E0E14", color:C.white, border:`1px solid ${C.border}`, cursor:"pointer", letterSpacing:1 }}>
                ← KEEP GOING
              </button>
              <button onClick={() => { setShowCloseConfirm(false); onClose(); }}
                style={{ width:"100%", padding:"12px", borderRadius:10, fontFamily:F.mono, fontSize:12, background:"transparent", color:C.gray, border:`1px solid ${C.border}`, cursor:"pointer", letterSpacing:1 }}>
                ⏸ EXIT (auto-save keeps your progress)
              </button>
              <button onClick={discardSession}
                style={{ width:"100%", padding:"12px", borderRadius:10, fontFamily:F.mono, fontSize:11, background:"transparent", color:C.orange, border:`1px solid ${C.orange}40`, cursor:"pointer", letterSpacing:1 }}>
                🗑 DISCARD SESSION
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ── PR Modal ──────────────────────────────────────────────────────
function PRModal({ data, updateData, onClose }) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [result, setResult] = useState(null);

  const filtered = query.length >= 1
    ? EXERCISE_LIST.filter(e => e.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  const existPR = sel ? data.prs.find(p => p.exercise.toLowerCase() === sel.toLowerCase()) : null;
  const new1RM = weight && reps ? calc1RM(parseFloat(weight), parseInt(reps)) : null;
  const old1RM = existPR ? calc1RM(existPR.weight, existPR.reps) : null;
  const isNew = new1RM && old1RM ? new1RM > old1RM : (!old1RM && !!new1RM);

  async function save() {
    if (!sel || !weight || !reps) return;
    if (isNew) {
      const updated = [
        ...data.prs.filter(p => p.exercise.toLowerCase() !== sel.toLowerCase()),
        { exercise:sel, weight:parseFloat(weight), reps:parseInt(reps), date:getToday() },
      ];
      await updateData("prs", updated);
    }
    setResult({ isNew, exercise:sel, newWeight:parseFloat(weight), newReps:parseInt(reps), oldWeight:existPR?.weight, oldReps:existPR?.reps });
  }

  if (result) {
    return (
      <Sheet onClose={onClose} title={result.isNew ? "NEW PR 🔥" : "LOGGED"}>
        <div style={{ textAlign:"center", padding:"20px 0 30px" }}>
          <div style={{ fontSize:52, marginBottom:16 }}>{result.isNew ? "🏆" : "💪"}</div>
          <div style={{ fontFamily:F.display, fontSize:28, color:result.isNew ? C.lime : C.white, marginBottom:8, letterSpacing:1 }}>
            {result.exercise}
          </div>
          <div style={{ fontFamily:F.mono, fontSize:22, color:C.white, marginBottom:6 }}>
            {result.newWeight} lbs × {result.newReps}
          </div>
          {result.isNew && result.oldWeight && (
            <div style={{ fontFamily:F.mono, fontSize:12, color:C.gray }}>
              Previous: {result.oldWeight} × {result.oldReps}
            </div>
          )}
          {result.isNew && (
            <div style={{ marginTop:16, background:C.limeGlow, border:`1px solid ${C.lime}`, borderRadius:12, padding:"10px 20px", fontFamily:F.mono, fontSize:12, color:C.lime }}>
              PR BOARD UPDATED ✓
            </div>
          )}
          {!result.isNew && (
            <div style={{ marginTop:16, fontFamily:F.mono, fontSize:11, color:C.gray }}>
              Didn't beat existing PR — keep grinding 💪
            </div>
          )}
        </div>
        <SaveBtn onClick={onClose} label="CLOSE" />
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} title="LOG PR">
      <div style={{ marginBottom:16 }}>
        <div style={{ fontFamily:F.mono, fontSize:10, color:C.lime, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>
          Exercise
        </div>
        <input
          value={query || sel}
          onChange={e => { setQuery(e.target.value); setSel(""); }}
          placeholder="Search exercise..."
          type="text"
          style={{ width:"100%", background:"#1A1A22", border:`1px solid ${sel ? C.lime : C.border}`, borderRadius:10, padding:"11px 14px", color:sel ? C.lime : C.white, fontSize:14, fontFamily:F.mono, outline:"none", boxSizing:"border-box" }}
        />
        {filtered.length > 0 && !sel && (
          <div style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, marginTop:4, overflow:"hidden" }}>
            {filtered.map((ex, i) => {
              const ep = data.prs.find(p => p.exercise === ex);
              return (
                <div
                  key={ex}
                  onClick={() => { setSel(ex); setQuery(""); }}
                  style={{ padding:"10px 14px", fontSize:13, fontFamily:F.mono, color:C.grayLight, borderBottom:i < filtered.length-1 ? `1px solid ${C.border}` : "none", cursor:"pointer", display:"flex", justifyContent:"space-between" }}
                >
                  <span>{ex}</span>
                  {ep && <span style={{ color:C.lime, fontSize:10 }}>{ep.weight}×{ep.reps}</span>}
                </div>
              );
            })}
          </div>
        )}
        {query && !sel && filtered.length === 0 && (
          <div
            onClick={() => { setSel(query); setQuery(""); }}
            style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, marginTop:4, padding:"10px 14px", fontSize:13, fontFamily:F.mono, color:C.lime, cursor:"pointer" }}
          >
            Use "{query}" (custom)
          </div>
        )}
      </div>
      {sel && existPR && (
        <div style={{ background:"#0A1A00", border:`1px solid ${C.lime}`, borderRadius:10, padding:"10px 14px", marginBottom:16, fontFamily:F.mono, fontSize:11 }}>
          <span style={{ color:C.gray }}>Current PR: </span>
          <span style={{ color:C.lime, fontWeight:600 }}>{existPR.weight} lbs × {existPR.reps}</span>
        </div>
      )}
      {sel && !existPR && (
        <div style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", marginBottom:16, fontFamily:F.mono, fontSize:11, color:C.gray }}>
          No existing PR — first log becomes the bar.
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        <FInput label="Weight (lbs)" value={weight} onChange={setWeight} placeholder="225" color={C.orange} />
        <FInput label="Reps" value={reps} onChange={setReps} placeholder="5" color={C.purple} />
      </div>
      {new1RM && old1RM && (
        <div style={{ background:isNew?"#0A1A00":"#1A0800", border:`1px solid ${isNew?C.lime:C.orange}`, borderRadius:10, padding:"10px 14px", marginBottom:16, fontFamily:F.mono, fontSize:11 }}>
          <div style={{ color:C.gray, marginBottom:4 }}>Est. 1RM comparison</div>
          <div style={{ display:"flex", gap:24 }}>
            <span><span style={{ color:C.gray }}>Current: </span><span>{old1RM} lbs</span></span>
            <span><span style={{ color:C.gray }}>This: </span><span style={{ color:isNew?C.lime:C.orange, fontWeight:600 }}>{new1RM} lbs {isNew?"↑ NEW PR":"↓"}</span></span>
          </div>
        </div>
      )}
      <SaveBtn onClick={save} label={isNew ? "LOG NEW PR 🏆" : "LOG SET"} />
    </Sheet>
  );
}

// ── Measurements Modal ─────────────────────────────────────────────
function MeasurementsModal({ data, updateData, onClose }) {
  const t = getToday();
  const prev = [...(data.measurements || [])].filter(m => m.date !== t).pop();
  const [vals, setVals] = useState(() => {
    const v = { note:"" };
    MEASURE_FIELDS.forEach(f => { v[f.key] = ""; });
    return v;
  });

  function setVal(k, v) { setVals(p => ({ ...p, [k]: v })); }

  async function save() {
    const entry = { date:t, note:vals.note };
    MEASURE_FIELDS.forEach(f => { entry[f.key] = vals[f.key] ? parseFloat(vals[f.key]) : null; });
    const updated = [...(data.measurements || []).filter(m => m.date !== t), entry].sort((a,b) => a.date.localeCompare(b.date));
    await updateData("measurements", updated);
    onClose();
  }

  return (
    <Sheet onClose={onClose} title="MEASUREMENTS">
      <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginBottom:16 }}>
        All in inches · Leave blank to skip
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        {MEASURE_FIELDS.filter(f => f.key !== "bodyFat").map(f => {
          const p = prev?.[f.key];
          return (
            <div key={f.key}>
              <div style={{ fontFamily:F.mono, fontSize:10, color:f.color, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>
                {f.label}{p && <span style={{ color:C.gray, marginLeft:6 }}>prev:{p}"</span>}
              </div>
              <input
                value={vals[f.key]}
                onChange={e => setVal(f.key, e.target.value)}
                placeholder={p ? `${p}` : "0.0"}
                type="number"
                step="0.25"
                style={{ width:"100%", background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", color:f.color, fontSize:15, fontFamily:F.mono, outline:"none", boxSizing:"border-box" }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ marginBottom:10 }}>
        <div style={{ fontFamily:F.mono, fontSize:10, color:C.orange, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>
          Body Fat %{prev?.bodyFat && <span style={{ color:C.gray, marginLeft:6 }}>prev:{prev.bodyFat}%</span>}
        </div>
        <input
          value={vals.bodyFat}
          onChange={e => setVal("bodyFat", e.target.value)}
          placeholder="15-17"
          type="number"
          step="0.5"
          style={{ width:"100%", background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", color:C.orange, fontSize:15, fontFamily:F.mono, outline:"none", boxSizing:"border-box" }}
        />
      </div>
      <div style={{ marginBottom:24 }}>
        <FInput label="Note (optional)" value={vals.note} onChange={v => setVal("note", v)} placeholder="Morning, fasted" type="text" />
      </div>
      <SaveBtn onClick={save} label="SAVE MEASUREMENTS" />
    </Sheet>
  );
}

// ── HOME Tab ──────────────────────────────────────────────────────
// ── Mobile App Webview Banner (top of app) ───────────────────────
// Detects when app is running inside claude.ai mobile app's restricted
// webview (where file pickers don't work) and points users to the browser.
function MobileWebViewBanner() {
  const [context, setContext] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setContext(detectMobileAppContext());
  }, []);

  if (!context || dismissed) return null;

  const isIOS = context === "ios-webview";

  return (
    <div style={{ background:`${C.amber}10`, borderBottom:`1px solid ${C.amber}50`, padding:"10px 14px" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <div style={{ fontSize:18, lineHeight:1, marginTop:1 }}>📱</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.amber, letterSpacing:0.5, marginBottom:3, fontWeight:600 }}>
            CLAUDE.AI MOBILE APP DETECTED
          </div>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.grayLight, lineHeight:1.5 }}>
            File uploads (food photos, progress pics) won't work here. Switch to your phone's browser to upload.
          </div>
          {!expanded ? (
            <button onClick={() => setExpanded(true)}
              style={{ marginTop:6, background:"none", border:"none", color:C.amber, fontFamily:F.mono, fontSize:10, padding:0, cursor:"pointer", textDecoration:"underline", letterSpacing:0.3 }}>
              Show me how →
            </button>
          ) : (
            <div style={{ marginTop:8, padding:"8px 10px", background:"#1A1A22", borderRadius:6 }}>
              <div style={{ fontFamily:F.mono, fontSize:10, color:C.white, lineHeight:1.6 }}>
                <div>1. Open <span style={{ color:C.amber, fontWeight:600 }}>{isIOS ? "Safari" : "Chrome"}</span> on your phone</div>
                <div>2. Type <span style={{ color:C.amber, fontWeight:600 }}>claude.ai</span> in the address bar</div>
                <div>3. Sign in (same account as the app)</div>
                <div>4. Open this conversation, then this artifact</div>
              </div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:8, lineHeight:1.4 }}>
                Your data is the same in both — same account, same storage. Don't use Publish/Share Link, that creates a separate public copy.
              </div>
              <button onClick={() => setExpanded(false)}
                style={{ marginTop:8, background:"none", border:"none", color:C.gray, fontFamily:F.mono, fontSize:9, padding:0, cursor:"pointer", textDecoration:"underline" }}>
                hide
              </button>
            </div>
          )}
        </div>
        <button onClick={() => setDismissed(true)}
          style={{ background:"none", border:"none", color:C.gray, cursor:"pointer", padding:4, marginLeft:4, alignSelf:"flex-start" }}
          aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Backup Nag Banner (top of HOME tab) ──────────────────────────
function BackupNagBanner() {
  const [lastDownload, setLastDownload] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [justDone, setJustDone] = useState(false);

  useEffect(() => {
    async function load() {
      const last = await getLastBackupInfo();
      setLastDownload(last);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded || dismissed) return null;

  const age = lastDownload ? daysSince(lastDownload.ts) : 999;
  if (age < BACKUP_NAG_DAYS) return null;

  async function handleBackup() {
    setDownloading(true);
    try {
      const ok = await downloadBackup();
      if (ok) {
        setJustDone(true);
        setTimeout(() => setDismissed(true), 1500);
      }
    } catch {}
    setDownloading(false);
  }

  return (
    <div style={{ background:`${C.orange}15`, border:`1px solid ${C.orange}`, borderRadius:12, padding:"12px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ fontSize:20 }}>{justDone ? "✓" : "⚠️"}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color: justDone ? C.lime : C.orange, marginBottom:2, letterSpacing:0.5 }}>
          {justDone ? "BACKUP DOWNLOADED" : "BACKUP IS STALE"}
        </div>
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.grayLight, lineHeight:1.4 }}>
          {justDone ? "Saved to Downloads. Move it to Drive/Files for safety." :
            lastDownload ? `Your data lives only on this phone. Last safety copy was ${age} days ago.` : `Your data lives only on this phone. Tap BACKUP to save a JSON copy you can restore from later.`}
        </div>
      </div>
      {!justDone && (
        <button
          onClick={handleBackup}
          disabled={downloading}
          style={{ padding:"6px 12px", borderRadius:8, fontFamily:F.mono, fontSize:10, background:C.orange, border:"none", color:C.white, cursor:"pointer", fontWeight:700, letterSpacing:0.5, whiteSpace:"nowrap" }}
        >
          {downloading ? "..." : "BACKUP"}
        </button>
      )}
      {!justDone && (
        <button
          onClick={() => setDismissed(true)}
          style={{ padding:4, background:"none", border:"none", color:C.gray, cursor:"pointer" }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function HomeTab({ data, onLogMeal, onLogWeight, onAction }) {
  const t = getToday();
  const todayMeals = data.meals[t] || { calories:0, protein:0, carbs:0, fat:0, items:[] };
  const lastWeight = [...data.weightLog].filter(w => w.weight).pop();
  const currentW = lastWeight?.weight || 175.8;
  const todayEntry = data.weightLog.find(w => w.date === t);
  const lastSleep = todayEntry?.sleep || [...data.weightLog].filter(w => w.sleep).pop()?.sleep;
  const dayName = DAYS[new Date().getDay()];
  const todayWo = SPLIT_MAP[dayName];
  const isRest = !todayWo;
  const calTarget = isRest ? data.profile.calorieTarget.rest : data.profile.calorieTarget.training;
  const macros = [
    { label:"kcal", val:todayMeals.calories, target:calTarget, color:C.lime },
    { label:"protein", val:todayMeals.protein, target:data.profile.proteinTarget, color:C.teal },
    { label:"carbs", val:todayMeals.carbs, target:data.profile.carbTarget, color:C.orange },
    { label:"fat", val:todayMeals.fat, target:data.profile.fatTarget, color:C.purple },
  ];
  const lastWo = data.workouts[0];
  const woColor = todayWo ? WORKOUTS[todayWo]?.color : C.gray;

  const checkItems = getCompletenessItems(data);
  const incomplete = checkItems.filter(i => !i.done);
  const score = Math.round(((checkItems.length - incomplete.length) / checkItems.length) * 100);
  const scoreColor = score >= 80 ? C.lime : score >= 50 ? C.amber : C.orange;
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? incomplete : incomplete.slice(0, 3);

  return (
    <div style={{ padding:"18px 16px" }}>

      {/* Backup Nag Banner */}
      <BackupNagBanner />

      {/* Daily Checklist Card — top of HOME */}
      {incomplete.length > 0 && (
        <div style={{ background:C.surface, border:`1px solid ${scoreColor}40`, borderRadius:16, padding:16, marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div>
                <div style={{ fontFamily:F.mono, fontSize:10, color:scoreColor, textTransform:"uppercase", letterSpacing:1.5 }}>Daily Checklist</div>
                <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>{incomplete.length} item{incomplete.length !== 1 ? "s" : ""} to fill in</div>
              </div>
            </div>
            {/* Mini ring */}
            <svg width={44} height={44} viewBox="0 0 44 44">
              <circle cx={22} cy={22} r={17} fill="none" stroke={C.border} strokeWidth={4}/>
              <circle cx={22} cy={22} r={17} fill="none" stroke={scoreColor} strokeWidth={4}
                strokeDasharray={`${2*Math.PI*17}`}
                strokeDashoffset={`${2*Math.PI*17*(1-score/100)}`}
                strokeLinecap="round" transform="rotate(-90 22 22)"/>
              <text x={22} y={26} textAnchor="middle" fill={scoreColor} style={{ fontFamily:"monospace", fontSize:9, fontWeight:700 }}>{score}%</text>
            </svg>
          </div>
          {displayItems.map((item, i) => (
            <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderTop:`1px solid ${C.border}` }}>
              <div style={{ width:18, height:18, borderRadius:5, border:`1.5px solid ${C.border}`, background:"transparent", flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, color:C.white }}>{item.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:1 }}>{item.hint}</div>
              </div>
              <button
                onClick={() => onAction && onAction(item.action)}
                style={{ background:`${C.lime}15`, border:`1px solid ${C.lime}40`, borderRadius:6, padding:"3px 9px", fontFamily:F.mono, fontSize:9, color:C.lime, cursor:"pointer", flexShrink:0 }}
              >
                + LOG
              </button>
            </div>
          ))}
          {incomplete.length > 3 && (
            <button onClick={() => setShowAll(s => !s)} style={{ width:"100%", marginTop:8, background:"none", border:"none", fontFamily:F.mono, fontSize:9, color:C.gray, cursor:"pointer", paddingTop:6, borderTop:`1px solid ${C.border}` }}>
              {showAll ? "SHOW LESS ↑" : `+ ${incomplete.length - 3} MORE ITEMS ↓`}
            </button>
          )}
        </div>
      )}

      {/* All good state */}
      {incomplete.length === 0 && (
        <div style={{ background:"#0A1A00", border:`1px solid ${C.lime}40`, borderRadius:16, padding:"12px 16px", marginBottom:12, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:24 }}>✅</div>
          <div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>All caught up — 100% complete</div>
            <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>Coach has everything it needs to track your progress</div>
          </div>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <Card style={{ cursor:"pointer" }} onClick={onLogWeight}>
          <SL>Weight</SL>
          <BigN unit="lbs">{currentW}</BigN>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:6 }}>Target → 185–195</div>
        </Card>
        <Card
          style={{
            background: lastSleep >= 8 ? "#0A1A00" : lastSleep >= 7 ? C.surface : "#1A0800",
            borderColor: lastSleep >= 8 ? C.lime : lastSleep >= 7 ? C.border : C.orange,
            cursor: "pointer",
          }}
          onClick={onLogWeight}
        >
          <SL>Sleep</SL>
          <BigN unit="hrs" color={lastSleep >= 8 ? C.lime : lastSleep >= 7 ? C.white : C.orange}>
            {lastSleep || "—"}
          </BigN>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:6 }}>Target → 8 hrs</div>
        </Card>
      </div>

      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <SL>Today's Fuel</SL>
          <SBtn onClick={onLogMeal}>+ ADD MEAL</SBtn>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
          {macros.map(m => (
            <div key={m.label} style={{ textAlign:"center" }}>
              <div style={{ fontFamily:F.mono, fontSize:16, fontWeight:600, color:(m.val / m.target) >= 0.9 ? m.color : C.white }}>{m.val}</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>{m.label}</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.borderHi, marginTop:1 }}>/{m.target}</div>
            </div>
          ))}
        </div>
        {macros.map(m => (
          <div key={m.label} style={{ marginBottom:6 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:3 }}>
              <span>{m.label}</span>
              <span>{Math.round((m.val / m.target) * 100)}%</span>
            </div>
            <MBar value={m.val} target={m.target} color={m.color} />
          </div>
        ))}
      </Card>

      <Card highlight={!!todayWo} style={{ background: todayWo ? "#080E1A" : C.surface }}>
        <SL>{todayWo ? "⚡ Today's Session" : "🧘 Today"}</SL>
        <BigN color={todayWo ? woColor : C.gray} size={36}>{todayWo || "REST DAY"}</BigN>
        {todayWo && (
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayMid, marginTop:6 }}>
            {WORKOUTS[todayWo]?.focus} · {WORKOUTS[todayWo]?.duration}
          </div>
        )}
        {isRest && (
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:6 }}>
            Next → {(() => {
              const dIdx = new Date().getDay();
              const up = [1,2,4,5].find(d => d > dIdx) || 1;
              return SPLIT_MAP[DAYS[up]] + " (" + DAYS[up] + ")";
            })()}
          </div>
        )}
      </Card>

      {lastWo && (
        <Card>
          <SL>Last Session — {lastWo.date}</SL>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:15, marginBottom:2 }}>{lastWo.name}</div>
              {lastWo.note && <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>{lastWo.note}</div>}
            </div>
            {lastWo.prs > 0 && <Tag>{lastWo.prs} PR{lastWo.prs !== 1 ? "s" : ""} 🏆</Tag>}
          </div>
          <div style={{ display:"flex", gap:20 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:F.mono, fontSize:17, fontWeight:600, color:C.teal }}>{lastWo.duration}m</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:4 }}>DURATION</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:F.mono, fontSize:17, fontWeight:600, color:C.white }}>{(lastWo.volume / 1000).toFixed(1)}k</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:4 }}>VOLUME</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:F.mono, fontSize:17, fontWeight:600, color:C.white }}>{lastWo.sets}</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:4 }}>SETS</div>
            </div>
          </div>
        </Card>
      )}

      <Card style={{ background:"#080E1A", borderColor:C.blue }}>
        <SL color={C.blue}>🔧 Phase 1: Foundation</SL>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontFamily:F.mono, fontSize:12, color:C.white }}>May – Aug 2026</div>
          <Tag color={C.blue}>ACTIVE</Tag>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, lineHeight:1.8 }}>
          175.8 → 182 lbs · Fix chest &amp; shoulders · Build consistency
        </div>
        <div style={{ marginTop:10, height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:"8%", background:C.blue, borderRadius:2 }} />
        </div>
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:4 }}>Week 1 of 16</div>
      </Card>
    </div>
  );
}

// ── Progressive Overload Engine ───────────────────────────────────
// Double progression: own all reps at top of range → add weight
// Returns { prescribedWeight, prescribedReps, lastWeight, lastReps, lastDate, status }
function getPrescription(exerciseName, workoutHistory, exerciseDef) {
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
  let lastSetCount = 0;
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
          lastSetCount = workingSets.length;
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


// ── Workout Preview (read-only, any day) ──────────────────────────
function WorkoutPreview({ wo, workoutHistory, isToday }) {
  const [expandedEx, setExpandedEx] = useState(null);

  return (
    <div>
      {/* Preview banner if not today */}
      {!isToday && (
        <div style={{ background:`${wo.color}12`, border:`1px solid ${wo.color}30`, borderRadius:10, padding:"8px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:14 }}>👁</div>
          <div style={{ fontFamily:F.mono, fontSize:10, color:wo.color }}>PREVIEW MODE — not today's session. Come back on {Object.entries(SPLIT_MAP).find(([k,v]) => v === wo.label.replace(" ", " "))?.[0] || "your scheduled day"} to log it live.</div>
        </div>
      )}

      {/* Coach note */}
      <div style={{ background:`${wo.color}10`, border:`1px solid ${wo.color}25`, borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
        <div style={{ fontFamily:F.mono, fontSize:10, color:wo.color, lineHeight:1.7 }}>💡 {wo.note}</div>
      </div>

      {/* Exercise cards */}
      {wo.exercises.map((ex, exIdx) => {
        const isOpen = expandedEx === exIdx;
        const rx = getPrescription(ex.name, workoutHistory, ex);
        const statusColor = rx.status === "progress" ? C.lime : rx.status === "build" ? C.teal : C.grayMid;

        return (
          <div
            key={exIdx}
            style={{ background:C.surface, border:`1px solid ${isOpen ? wo.color : C.border}`, borderRadius:14, marginBottom:10, overflow:"hidden" }}
          >
            <div onClick={() => setExpandedEx(isOpen ? null : exIdx)} style={{ padding:"13px 16px", cursor:"pointer" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:5 }}>{ex.name}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    <div style={{ background:`${wo.color}18`, border:`1px solid ${wo.color}50`, borderRadius:5, padding:"2px 8px", fontFamily:F.mono, fontSize:10, color:wo.color }}>
                      {ex.sets} × {ex.reps}
                    </div>
                    {rx.prescribedWeight && (
                      <div style={{ background:`${statusColor}18`, border:`1px solid ${statusColor}50`, borderRadius:5, padding:"2px 8px", fontFamily:F.mono, fontSize:10, color:statusColor, fontWeight:600 }}>
                        🎯 {rx.prescribedWeight} lbs
                      </div>
                    )}
                    {rx.status === "progress" && <div style={{ fontFamily:F.mono, fontSize:9, color:C.lime }}>↑ ADD WEIGHT</div>}
                    {rx.status === "build" && <div style={{ fontFamily:F.mono, fontSize:9, color:C.teal }}>BEAT THE REPS</div>}
                    {rx.status === "new" && <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>NEW — set baseline</div>}
                  </div>
                </div>
                <ChevronRight size={15} color={C.gray} style={{ transform:isOpen?"rotate(90deg)":"none", transition:"transform .2s", flexShrink:0 }} />
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop:`1px solid ${C.border}` }}>
                {/* Last session vs Target */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ padding:"10px 14px", borderRight:`1px solid ${C.border}` }}>
                    <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:5, letterSpacing:1 }}>LAST SESSION</div>
                    {rx.lastWeight ? (
                      <div>
                        <div style={{ fontFamily:F.display, fontSize:24, color:C.grayMid, lineHeight:1 }}>{rx.lastWeight}</div>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayMid, marginTop:2 }}>lbs × {rx.lastReps} reps</div>
                        {rx.lastDate && <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:3 }}>{rx.lastDate}</div>}
                      </div>
                    ) : (
                      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>No history yet</div>
                    )}
                  </div>
                  <div style={{ padding:"10px 14px", background:rx.status==="progress"?"#0A1A00":rx.status==="build"?"#040E0C":C.surfaceAlt }}>
                    <div style={{ fontFamily:F.mono, fontSize:9, color:statusColor, marginBottom:5, letterSpacing:1 }}>NEXT TARGET</div>
                    {rx.prescribedWeight ? (
                      <div>
                        <div style={{ fontFamily:F.display, fontSize:24, color:statusColor, lineHeight:1 }}>{rx.prescribedWeight}</div>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:statusColor, marginTop:2 }}>lbs × {rx.prescribedReps}</div>
                        <div style={{ fontFamily:F.mono, fontSize:9, color:statusColor, marginTop:3, opacity:.8 }}>
                          {rx.status==="progress" ? "↑ READY TO GO HEAVIER" : "SAME WEIGHT, BEAT THE REPS"}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>Set your baseline</div>
                    )}
                  </div>
                </div>

                {/* Set plan preview */}
                <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:8, letterSpacing:1 }}>SET PLAN</div>
                  {Array.from({ length: parseInt(ex.sets) || 3 }).map((_, setIdx) => {
                    const isLast = setIdx === (parseInt(ex.sets)||3) - 1;
                    return (
                      <div key={setIdx} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:5 }}>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:isLast?C.orange:C.gray, width:20 }}>
                          {isLast ? "🔥" : `S${setIdx+1}`}
                        </div>
                        <div style={{ fontFamily:F.mono, fontSize:13, color:rx.prescribedWeight ? wo.color : C.gray }}>
                          {rx.prescribedWeight ? `${rx.prescribedWeight} lbs` : ex.current || "—"}
                        </div>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayMid }}>× {rx.prescribedReps}</div>
                        {isLast && <div style={{ fontFamily:F.mono, fontSize:9, color:C.orange }}>push to failure</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Phase target + coaching note */}
                <div style={{ padding:"10px 14px" }}>
                  <div style={{ display:"flex", gap:14, marginBottom:8, flexWrap:"wrap" }}>
                    <div>
                      <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:2 }}>PHASE TARGET</div>
                      <div style={{ fontFamily:F.mono, fontSize:11, color:wo.color }}>{ex.target}</div>
                    </div>
                    {ex.pr && (
                      <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:14 }}>
                        <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:2 }}>ALL-TIME PR</div>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>{ex.pr}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ background:`${wo.color}10`, borderRadius:8, padding:"8px 12px" }}>
                    <div style={{ fontFamily:F.mono, fontSize:10, color:wo.color, lineHeight:1.7 }}>📋 {ex.note}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── TODAY Tab ─────────────────────────────────────────────────────
// ── Edit Session modal (date/name/duration/note + per-set editing) ──
function EditSessionModal({ session, onSave, onClose }) {
  const [date, setDate] = useState(session.date);
  const [name, setName] = useState(session.name);
  const [duration, setDuration] = useState(String(session.duration));
  const [note, setNote] = useState(session.note || "");
  const [exercises, setExercises] = useState(() =>
    (session.exercises || []).map(ex => ({
      name: ex.name,
      target: ex.target,
      setsData: Array.isArray(ex.setsData) ? ex.setsData.map(s => ({
        weight: s.weight != null ? String(s.weight) : "",
        reps: s.reps != null ? String(s.reps) : "",
        rir: s.rir || null,
      })) : [],
    }))
  );

  function updateSet(exIdx, setIdx, field, val) {
    if (val !== "" && val != null) {
      if (field === "weight") {
        const w = parseFloat(val);
        if (!isNaN(w) && w > 2000) val = "2000";
        else if (!isNaN(w) && w < 0) val = "0";
      } else if (field === "reps") {
        const r = parseInt(val);
        if (!isNaN(r) && r > 200) val = "200";
        else if (!isNaN(r) && r < 0) val = "0";
      }
    }
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex :
      { ...ex, setsData: ex.setsData.map((s, j) => j === setIdx ? { ...s, [field]: val } : s) }
    ));
  }
  function updateExName(exIdx, val) {
    setExercises(prev => prev.map((ex, i) => i === exIdx ? { ...ex, name: val } : ex));
  }
  function addSet(exIdx) {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex :
      { ...ex, setsData: [...ex.setsData, { weight: "", reps: "", rir: null }] }
    ));
  }
  function removeSet(exIdx, setIdx) {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex :
      { ...ex, setsData: ex.setsData.filter((_, j) => j !== setIdx) }
    ));
  }
  function removeExercise(exIdx) {
    setExercises(prev => prev.filter((_, i) => i !== exIdx));
  }

  function save() {
    const dur = Math.max(1, Math.min(600, parseInt(duration) || 1));
    const cleanExercises = exercises
      .filter(ex => ex.setsData.length > 0)
      .map(ex => {
        const cleanSets = ex.setsData
          .map(s => ({
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps) || 0,
            rir: s.rir || null,
          }))
          .filter(s => s.weight > 0 || s.reps > 0);
        return {
          name: ex.name.trim() || "Exercise",
          target: ex.target,
          setsData: cleanSets,
          sets: cleanSets.map(s => `${s.weight}×${s.reps}${s.rir ? ` (${s.rir.toUpperCase()})` : ""}`).join(", "),
        };
      })
      .filter(ex => ex.setsData.length > 0);
    const totalSets = cleanExercises.reduce((a, ex) => a + ex.setsData.length, 0);
    const totalVol = Math.round(cleanExercises.flatMap(ex => ex.setsData).reduce((a, s) => a + s.weight * s.reps, 0));
    onSave({
      ...session,
      date,
      name: name.trim() || session.name,
      duration: dur,
      note: note.trim(),
      exercises: cleanExercises,
      sets: totalSets,
      volume: totalVol,
    });
  }

  const inputStyle = { width:"100%", boxSizing:"border-box", padding:"9px 11px", background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:7, color:C.white, fontFamily:F.mono, fontSize:12 };
  const labelStyle = { fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:1, marginBottom:3 };
  const setInputStyle = { width:"100%", boxSizing:"border-box", padding:"6px 8px", background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:5, color:C.white, fontFamily:F.mono, fontSize:11, textAlign:"center" };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:14, overflowY:"auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.teal}60`, borderRadius:14, padding:16, maxWidth:420, width:"100%", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontFamily:F.display, fontSize:22, color:C.teal, marginBottom:12, letterSpacing:2 }}>EDIT SESSION</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div><div style={labelStyle}>DATE</div><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inputStyle} /></div>
          <div><div style={labelStyle}>NAME / SPLIT</div><input type="text" value={name} onChange={e=>setName(e.target.value)} style={inputStyle} /></div>
          <div><div style={labelStyle}>DURATION (MIN)</div><input type="number" min="1" max="600" value={duration} onChange={e=>setDuration(e.target.value)} style={inputStyle} /></div>
          <div><div style={labelStyle}>NOTE</div><input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="how it felt..." style={inputStyle} /></div>
        </div>

        <div style={{ marginTop:18, marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, letterSpacing:1 }}>EXERCISES · {exercises.length}</div>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>tap × to remove · totals recompute on save</div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {exercises.map((ex, exIdx) => (
            <div key={exIdx} style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
                <input type="text" value={ex.name} onChange={e=>updateExName(exIdx, e.target.value)} style={{ ...inputStyle, fontSize:11, padding:"6px 9px", flex:1 }} />
                <button onClick={() => removeExercise(exIdx)} aria-label="Remove exercise" style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.orange, width:28, height:28, borderRadius:6, cursor:"pointer", fontSize:14, lineHeight:1 }}>×</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"30px 1fr 1fr 30px", gap:6, alignItems:"center", fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:4 }}>
                <div style={{ textAlign:"center" }}>#</div>
                <div style={{ textAlign:"center" }}>LBS</div>
                <div style={{ textAlign:"center" }}>REPS</div>
                <div></div>
              </div>
              {ex.setsData.map((s, setIdx) => (
                <div key={setIdx} style={{ display:"grid", gridTemplateColumns:"30px 1fr 1fr 30px", gap:6, alignItems:"center", marginBottom:5 }}>
                  <div style={{ textAlign:"center", fontFamily:F.mono, fontSize:10, color:C.gray }}>{setIdx + 1}</div>
                  <input type="number" inputMode="decimal" value={s.weight} onChange={e=>updateSet(exIdx, setIdx, "weight", e.target.value)} style={setInputStyle} />
                  <input type="number" inputMode="numeric" value={s.reps} onChange={e=>updateSet(exIdx, setIdx, "reps", e.target.value)} style={setInputStyle} />
                  <button onClick={() => removeSet(exIdx, setIdx)} aria-label="Remove set" style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.gray, width:26, height:26, borderRadius:5, cursor:"pointer", fontSize:12, lineHeight:1 }}>×</button>
                </div>
              ))}
              <button onClick={() => addSet(exIdx)} style={{ width:"100%", marginTop:4, padding:"6px", background:"transparent", border:`1px dashed ${C.border}`, color:C.teal, borderRadius:6, fontFamily:F.mono, fontSize:10, letterSpacing:1, cursor:"pointer" }}>+ ADD SET</button>
            </div>
          ))}
        </div>

        <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:12, lineHeight:1.4 }}>
          Empty sets (no weight + no reps) are dropped on save. Volume + set count rebuild from what's left.
        </div>
        <div style={{ display:"flex", gap:8, marginTop:14, position:"sticky", bottom:0, background:C.surface, paddingTop:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", background:"transparent", border:`1px solid ${C.border}`, color:C.gray, borderRadius:8, fontFamily:F.mono, fontWeight:700, fontSize:12, letterSpacing:1, cursor:"pointer" }}>CANCEL</button>
          <button onClick={save} style={{ flex:1, padding:"10px", background:C.teal, border:"none", color:C.white, borderRadius:8, fontFamily:F.mono, fontWeight:700, fontSize:12, letterSpacing:1, cursor:"pointer" }}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

function TodayTab({ data, updateData, onLogMeal }) {
  const actualDayName = DAYS[new Date().getDay()];
  const actualSplit = SPLIT_MAP[actualDayName];
  const isActualRest = !actualSplit;

  // Default browse day: today's split if training, else next training day
  const getDefaultBrowseDay = () => {
    if (actualSplit) return actualSplit;
    const dIdx = new Date().getDay();
    const nextIdx = [1,2,4,5].find(d => d > dIdx) || 1;
    return SPLIT_MAP[DAYS[nextIdx]] || "Upper A";
  };

  const [browseDay, setBrowseDay] = useState(getDefaultBrowseDay);

  const isLiveDay = browseDay === actualSplit; // true when viewing today's actual training day
  const wo = WORKOUTS[browseDay];
  const t = getToday();
  const todayMeals = data.meals[t] || { calories:0, protein:0, carbs:0, fat:0, items:[] };
  const calTarget = isActualRest ? data.profile.calorieTarget.rest : data.profile.calorieTarget.training;

  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionStart, setSessionStart] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [restStartTime, setRestStartTime] = useState(null); // null = not resting; ms timestamp = resting since
  const [restType, setRestType] = useState("normal"); // "normal" | "superset" — drives rest thresholds
  const [sessionNote, setSessionNote] = useState("");
  const [finished, setFinished] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [swappedNames, setSwappedNames] = useState({}); // { [exIdx]: "Standing Calf Raise" } — per-session exercise substitutions
  const [endedExercises, setEndedExercises] = useState({}); // { [exIdx]: true } — user tapped "end early, fatigued"
  const [expandedEx, setExpandedEx] = useState(null);
  const [hasRestored, setHasRestored] = useState(false); // gate autosave until initial load completes
  const [resumedAt, setResumedAt] = useState(null); // timestamp of restored session, drives banner
  const [lastSaveAt, setLastSaveAt] = useState(null); // timestamp of last successful autosave for trust indicator

  const [liveSets, setLiveSets] = useState(() => {
    const init = {};
    Object.values(WORKOUTS).forEach(w => {
      w.exercises.forEach((ex, i) => {
        const key = `${w.label}_${i}`;
        const n = parseInt(ex.sets) || 3;
        init[key] = Array.from({ length: n }, () => ({ weight:"", reps:"", done:false, rir:null }));
      });
    });
    return init;
  });

  // Day tabs config
  const dayTabs = [
    { label:"MON", split:"Upper A", dayIdx:1 },
    { label:"TUE", split:"Lower A", dayIdx:2 },
    { label:"THU", split:"Upper B", dayIdx:4 },
    { label:"FRI", split:"Lower B", dayIdx:5 },
  ];


  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Restore in-progress session on mount ───────────────────────
  // CRITICAL: this code never deletes saved data — only skips restoration if it doesn't apply.
  // Deletion only happens explicitly (FINISH, DISCARD) so flaky state can't wipe a real session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await window.storage.get(LIVE_SESSION_KEY);
        if (raw && raw.value && !cancelled) {
          const parsed = JSON.parse(raw.value);
          const fresh = parsed && parsed.ts && (Date.now() - parsed.ts < LIVE_SESSION_TTL_MS);
          const matchesToday = parsed && parsed.sessionDay && parsed.sessionDay === actualSplit;
          if (fresh && matchesToday) {
            if (parsed.sessionStarted) setSessionStarted(true);
            if (parsed.sessionStart) setSessionStart(parsed.sessionStart);
            if (parsed.liveSets && typeof parsed.liveSets === "object") {
              // Merge restored data over the fresh init so any new exercises added later still exist
              setLiveSets(prev => ({ ...prev, ...parsed.liveSets }));
            }
            if (parsed.sessionNote) setSessionNote(parsed.sessionNote);
            if (parsed.restStartTime && (Date.now() - parsed.restStartTime < 30 * 60 * 1000)) {
              // Only restore rest timer if it was started in the last 30 min — otherwise stale
              setRestStartTime(parsed.restStartTime);
              if (parsed.restType === "superset" || parsed.restType === "normal") setRestType(parsed.restType);
            }
            if (typeof parsed.expandedEx === "number") setExpandedEx(parsed.expandedEx);
            if (parsed.swappedNames && typeof parsed.swappedNames === "object") setSwappedNames(parsed.swappedNames);
            if (parsed.endedExercises && typeof parsed.endedExercises === "object") setEndedExercises(parsed.endedExercises);
            setResumedAt(parsed.ts);
          }
          // INTENTIONALLY NO DELETION HERE.
          // - Stale data (>TTL) gets overwritten naturally on next save, or stays harmlessly until then
          // - Wrong-day data stays put — when the right day comes around, it will restore properly
          // - Only explicit FINISH or DISCARD ever deletes
        }
      } catch (e) {
        console.warn("Live session restore failed:", e);
      }
      if (!cancelled) setHasRestored(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualSplit]);

  // ── Auto-save on every meaningful change ───────────────────────
  useEffect(() => {
    if (!hasRestored) return;
    if (!actualSplit) return; // skip on rest days
    if (finished) return; // STOP saving after FINISH — prevents resurrected-session bug
    // Save if session is started OR if user has typed any values (defends against backgrounding before tapping START)
    const hasTypedValues = Object.values(liveSets).some(arr =>
      Array.isArray(arr) && arr.some(s => s.done || (s.weight && s.weight !== "") || (s.reps && s.reps !== "") || s.rir)
    );
    if (!sessionStarted && !hasTypedValues) return;
    const payload = {
      ts: Date.now(),
      sessionStart,
      sessionStarted,
      sessionDay: actualSplit,
      liveSets,
      sessionNote,
      restStartTime,
      restType,
      expandedEx,
      swappedNames,
      endedExercises,
    };
    window.storage.set(LIVE_SESSION_KEY, JSON.stringify(payload)).then(() => {
      setLastSaveAt(Date.now());
    }).catch(() => {});
  }, [sessionStarted, sessionStart, liveSets, sessionNote, restStartTime, restType, expandedEx, hasRestored, actualSplit, finished, swappedNames, endedExercises]);

  // ── Heartbeat save every 5s while session has activity ─────────
  // Defends against mobile browsers cancelling in-flight saves during backgrounding.
  // If a tap-triggered save was killed, the next heartbeat catches up.
  useEffect(() => {
    if (!hasRestored) return;
    if (!actualSplit) return;
    if (finished) return; // STOP heartbeat after FINISH
    const hasActivity = sessionStarted || Object.values(liveSets).some(arr =>
      Array.isArray(arr) && arr.some(s => s.done || s.weight || s.reps || s.rir)
    );
    if (!hasActivity) return;
    const id = setInterval(() => {
      const payload = {
        ts: Date.now(),
        sessionStart, sessionStarted, sessionDay: actualSplit,
        liveSets, sessionNote, restStartTime, restType, expandedEx,
      };
      window.storage.set(LIVE_SESSION_KEY, JSON.stringify(payload)).then(() => {
        setLastSaveAt(Date.now());
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [hasRestored, actualSplit, sessionStarted, sessionStart, liveSets, sessionNote, restStartTime, restType, expandedEx, finished]);

  // ── Force-save when tab hidden / backgrounded — mobile browsers can kill backgrounded tabs ─
  useEffect(() => {
    if (!hasRestored) return;
    if (!actualSplit) return;
    if (finished) return; // STOP force-save after FINISH
    function forceSave() {
      const hasTypedValues = Object.values(liveSets).some(arr =>
        Array.isArray(arr) && arr.some(s => s.done || (s.weight && s.weight !== "") || (s.reps && s.reps !== "") || s.rir)
      );
      if (!sessionStarted && !hasTypedValues) return;
      const payload = {
        ts: Date.now(),
        sessionStart,
        sessionStarted,
        sessionDay: actualSplit,
        liveSets,
        sessionNote,
        restStartTime,
        restType,
        expandedEx,
      };
      // Fire-and-forget; many mobile browsers will allow this to complete before backgrounding
      window.storage.set(LIVE_SESSION_KEY, JSON.stringify(payload)).catch(() => {});
    }
    function onVis() {
      if (document.visibilityState === "hidden") forceSave();
    }
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", forceSave);
    window.addEventListener("blur", forceSave);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", forceSave);
      window.removeEventListener("blur", forceSave);
    };
  }, [sessionStarted, sessionStart, liveSets, sessionNote, restStartTime, restType, expandedEx, hasRestored, actualSplit, finished]);

  function liveKey(exIdx) { return wo ? `${wo.label}_${exIdx}` : `_${exIdx}`; }

  function updateLiveSet(exIdx, setIdx, field, val) {
    // Clamp absurd inputs: max 2000 lbs / 200 reps. Empty string stays empty (clear).
    if (val !== "" && val != null) {
      if (field === "weight") {
        const w = parseFloat(val);
        if (!isNaN(w) && w > 2000) val = "2000";
        else if (!isNaN(w) && w < 0) val = "0";
      } else if (field === "reps") {
        const r = parseInt(val);
        if (!isNaN(r) && r > 200) val = "200";
        else if (!isNaN(r) && r < 0) val = "0";
      }
    }
    const key = liveKey(exIdx);
    setLiveSets(prev => ({ ...prev, [key]: (prev[key]||[]).map((s, i) => i === setIdx ? { ...s, [field]:val } : s) }));
  }

  function updateLiveSetRIR(exIdx, setIdx, rirValue) {
    const key = liveKey(exIdx);
    // Tap same chip to toggle off
    setLiveSets(prev => ({
      ...prev,
      [key]: (prev[key]||[]).map((s, i) => i === setIdx ? { ...s, rir: s.rir === rirValue ? null : rirValue } : s),
    }));
  }

  function toggleSetDone(exIdx, setIdx, fillWeight, fillReps) {
    const key = liveKey(exIdx);
    let nowDone = false;
    setLiveSets(prev => ({
      ...prev,
      [key]: (prev[key]||[]).map((s, i) => {
        if (i !== setIdx) return s;
        nowDone = !s.done;
        const updated = { ...s, done: nowDone };
        // AUTO-FILL: if checking DONE and weight/reps are empty, fill from prescription
        // (= "I hit exactly what was prescribed, no manual entry needed")
        if (nowDone) {
          if ((!s.weight || s.weight === "") && fillWeight != null && fillWeight !== "") {
            updated.weight = String(fillWeight);
          }
          if ((!s.reps || s.reps === "") && fillReps != null && fillReps !== "") {
            updated.reps = String(fillReps);
          }
        }
        return updated;
      }),
    }));
    if (nowDone) {
      const ex = wo?.exercises?.[exIdx];
      const isSuperset = !!ex?.supersetGroup;
      setRestStartTime(Date.now());
      setRestType(isSuperset ? "superset" : "normal");
    }
  }

  function addLiveSet(exIdx) {
    const key = liveKey(exIdx);
    setLiveSets(prev => {
      const arr = prev[key] || [];
      const last = arr[arr.length - 1];
      return { ...prev, [key]: [...arr, { weight:last?.weight||"", reps:"", done:false, rir:null }] };
    });
  }

  async function discardSession() {
    try { await window.storage.delete(LIVE_SESSION_KEY); } catch {}
    // Reset state to fresh
    setSessionStarted(false);
    setSessionStart(Date.now());
    setSessionNote("");
    setRestStartTime(null);
    setRestType("normal");
    setExpandedEx(null);
    setResumedAt(null);
    setSwappedNames({});
    setEndedExercises({});
    // Reset all sets for current workout
    if (wo) {
      setLiveSets(prev => {
        const next = { ...prev };
        wo.exercises.forEach((ex, i) => {
          const key = `${wo.label}_${i}`;
          const n = parseInt(ex.sets) || 3;
          next[key] = Array.from({ length: n }, () => ({ weight:"", reps:"", done:false, rir:null }));
        });
        return next;
      });
    }
  }

  const getSets = (exIdx) => liveSets[liveKey(exIdx)] || [];
  const totalDone = wo ? wo.exercises.reduce((acc, _, i) => acc + getSets(i).filter(s => s.done).length, 0) : 0;
  const totalEx = wo ? wo.exercises.length : 0;
  const doneEx = wo ? wo.exercises.filter((_, i) => getSets(i).some(s => s.done)).length : 0;
  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const sessionSecs = Math.floor((now - sessionStart) / 1000);

  // Derived rest values from real timestamp — survives backgrounding
  const restActive = restStartTime !== null;
  const restSecs = restActive ? Math.floor((now - restStartTime) / 1000) : 0;

  async function finishSession() {
    if (!wo) return;
    const dur = Math.max(Math.round((now - sessionStart) / 60000), 1);
    const allDone = wo.exercises.flatMap((ex, exIdx) => getSets(exIdx).filter(s => s.done).map(s => ({ ex, ...s })));
    const totalVol = allDone.reduce((acc, s) => acc + (parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0);
    let prCount = 0;
    const updatedPRs = [...data.prs];
    wo.exercises.forEach((ex, exIdx) => {
      getSets(exIdx).filter(s => s.done && s.weight && s.reps).forEach(s => {
        const w = parseFloat(s.weight), r = parseInt(s.reps);
        const new1 = calc1RM(w, r);
        const existIdx = updatedPRs.findIndex(p => p.exercise.toLowerCase().includes(ex.name.toLowerCase().slice(0,10)));
        if (existIdx >= 0) {
          if (new1 > calc1RM(updatedPRs[existIdx].weight, updatedPRs[existIdx].reps)) {
            updatedPRs[existIdx] = { exercise:ex.name, weight:w, reps:r, date:t };
            prCount++;
          }
        } else {
          updatedPRs.push({ exercise:ex.name, weight:w, reps:r, date:t });
          prCount++;
        }
      });
    });
    if (prCount > 0) await updateData("prs", updatedPRs);
    // Build rich exercise log including RIR per set
    const exLog = wo.exercises.map((ex, exIdx) => {
      const doneSets = getSets(exIdx).filter(s => s.done);
      if (doneSets.length === 0) return null;
      return {
        name: swappedNames[exIdx] || ex.name,
        originalName: swappedNames[exIdx] ? ex.name : undefined,
        endedEarly: endedExercises[exIdx] || undefined,
        // Compact text for display: "110×9 (HARD), 110×8 (HARD), 110×9 (FAIL)"
        sets: doneSets.map(s => `${s.weight}×${s.reps}${s.rir ? ` (${s.rir.toUpperCase()})` : ""}`).join(", "),
        // Structured data for AI/analytics consumption
        setsData: doneSets.map(s => ({
          weight: parseFloat(s.weight) || 0,
          reps: parseInt(s.reps) || 0,
          rir: s.rir || null,
        })),
        target: ex.reps,
        metric: ex.metric || "weight_reps",
        unilateral: ex.unilateral || undefined,
      };
    }).filter(Boolean);
    const newW = { id:`w${Date.now()}`, date:t, name:browseDay, split:browseDay, note:sessionNote?`"${sessionNote}"`:"", duration:dur, volume:Math.round(totalVol), sets:allDone.length, prs:prCount, exercises:exLog };
    await updateData("workouts", [newW, ...data.workouts]);
    // Clear saved active session — workout is now in history
    try { await window.storage.delete(LIVE_SESSION_KEY); } catch {}
    setFinished(true);
    setResumedAt(null);
  }

  const restColor = restType === "superset"
    ? (restSecs < 45 ? C.lime : restSecs < 75 ? C.amber : C.orange)
    : (restSecs < 90 ? C.lime : restSecs < 150 ? C.amber : C.orange);

  // Pre-compute superset groups so the live render can wrap consecutive grouped exercises in a shared container
  const exerciseGroups = (() => {
    if (!wo) return [];
    const groups = [];
    let current = null;
    wo.exercises.forEach((ex, i) => {
      const sg = ex.supersetGroup;
      if (sg && current && current.group === sg) {
        current.items.push({ ex, exIdx: i });
      } else {
        if (current) groups.push(current);
        current = { group: sg || null, items: [{ ex, exIdx: i }] };
      }
    });
    if (current) groups.push(current);
    return groups;
  })();

  // ── FINISHED ─────────────────────────────────────────────────────
  if (finished) {
    const allDone = wo ? wo.exercises.flatMap((_, i) => getSets(i).filter(s => s.done)) : [];
    const totalVol = allDone.reduce((acc,s) => acc+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0);
    return (
      <div style={{ padding:"18px 16px", textAlign:"center" }}>
        <Card style={{ padding:"36px 20px", background:"#0A1100", borderColor:C.lime }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🏆</div>
          <div style={{ fontFamily:F.display, fontSize:38, color:C.lime, letterSpacing:2, marginBottom:4 }}>SESSION DONE</div>
          <div style={{ fontFamily:F.mono, fontSize:12, color:C.gray, marginBottom:20 }}>{browseDay} · {fmt(sessionSecs)}</div>
          <div style={{ display:"flex", justifyContent:"center", gap:28 }}>
            <div><div style={{ fontFamily:F.mono, fontSize:20, color:C.lime, fontWeight:600 }}>{allDone.length}</div><div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:3 }}>SETS</div></div>
            <div><div style={{ fontFamily:F.mono, fontSize:20, color:C.teal, fontWeight:600 }}>{(totalVol/1000).toFixed(1)}k</div><div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:3 }}>LBS</div></div>
            <div><div style={{ fontFamily:F.mono, fontSize:20, color:C.white, fontWeight:600 }}>{doneEx}/{totalEx}</div><div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:3 }}>EXERCISES</div></div>
          </div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, marginTop:20, background:`${C.lime}12`, borderRadius:10, padding:"10px 16px" }}>
            Logged ✓ · PR board updated · Next session prescribed
          </div>
        </Card>
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <SL>Post-Workout Fuel</SL>
            <SBtn onClick={onLogMeal}>+ LOG MEAL</SBtn>
          </div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, marginBottom:10 }}>
            50g carbs + 40g protein within 60 min — do this now.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {[{label:"kcal",val:todayMeals.calories,target:calTarget,color:C.lime},{label:"protein",val:todayMeals.protein,target:data.profile.proteinTarget,color:C.teal},{label:"carbs",val:todayMeals.carbs,target:data.profile.carbTarget,color:C.orange},{label:"fat",val:todayMeals.fat,target:data.profile.fatTarget,color:C.purple}].map(m => (
              <div key={m.label} style={{ textAlign:"center" }}>
                <div style={{ fontFamily:F.mono, fontSize:14, fontWeight:600, color:(m.val/m.target)>=0.9?m.color:C.white }}>{m.val}</div>
                <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>{m.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:9, color:C.borderHi }}>/{m.target}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // ── MAIN RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom:20 }}>

      {/* Day selector tabs — always visible */}
      <div style={{ background:C.bg, borderBottom:`1px solid ${C.border}`, padding:"10px 16px 0" }}>
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:8, letterSpacing:1 }}>
          {isActualRest ? "REST DAY · BROWSE UPCOMING SESSIONS" : "SELECT WORKOUT"}
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {dayTabs.map(({ label, split: tabSplit }) => {
            const isActive = browseDay === tabSplit;
            const isToday = actualSplit === tabSplit;
            const tabWo = WORKOUTS[tabSplit];
            return (
              <button
                key={label}
                onClick={() => { setBrowseDay(tabSplit); setExpandedEx(null); }}
                style={{
                  flex:1, padding:"8px 4px 10px",
                  background: isActive ? `${tabWo.color}18` : "transparent",
                  border: `1px solid ${isActive ? tabWo.color : C.border}`,
                  borderBottom: `2px solid ${isActive ? tabWo.color : "transparent"}`,
                  borderRadius:"8px 8px 0 0",
                  fontFamily:F.mono, fontSize:9, cursor:"pointer",
                  color: isActive ? tabWo.color : C.gray,
                  position:"relative",
                }}
              >
                <div style={{ fontWeight:700 }}>{label}</div>
                <div style={{ fontSize:7, opacity:.7, marginTop:1 }}>{tabSplit.split(" ")[1]}</div>
                {isToday && (
                  <div style={{ position:"absolute", top:4, right:5, width:5, height:5, borderRadius:"50%", background:tabWo.color }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected workout header */}
      {wo && (
        <div style={{ background:wo.bg, borderBottom:`1px solid ${wo.color}22`, padding:"14px 16px 12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:wo.color, textTransform:"uppercase", letterSpacing:1.5, marginBottom:3 }}>
                {isLiveDay && !isActualRest ? getTodayLabel() : `${Object.entries(SPLIT_MAP).find(([k,v])=>v===browseDay)?.[0]||"UPCOMING"} · PREVIEW MODE`}
              </div>
              <div style={{ fontFamily:F.display, fontSize:28, color:wo.color, lineHeight:1, letterSpacing:1 }}>{browseDay}</div>
              <div style={{ fontFamily:F.display, fontSize:17, color:C.white }}>{wo.focus}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>est.</div>
              <div style={{ fontFamily:F.display, fontSize:20, color:wo.color }}>{wo.duration}</div>
              {sessionStarted && isLiveDay && !isActualRest && (
                <div style={{ marginTop:4 }}>
                  <div style={{ fontFamily:F.display, fontSize:22, color:C.white }}>{fmt(sessionSecs)}</div>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:C.lime }}>● LIVE</div>
                </div>
              )}
            </div>
          </div>

          {/* Rest timer */}
          {restActive && sessionStarted && isLiveDay && !isActualRest && (
            <div style={{ display:"flex", alignItems:"center", gap:12, background:`${restColor}12`, border:`1px solid ${restColor}30`, borderRadius:10, padding:"8px 14px", marginTop:8 }}>
              <div style={{ fontFamily:F.display, fontSize:26, color:restColor }}>{fmt(restSecs)}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.mono, fontSize:9, color:restColor }}>
                  {restType === "superset" ? "🔗 SUPERSET REST" : "REST TIMER"}
                </div>
                <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray }}>
                  {restType === "superset"
                    ? (restSecs < 45 ? "→ Move to next exercise..." : restSecs < 75 ? "Almost ready..." : "Ready to go ✓")
                    : (restSecs < 90 ? "Recovering..." : restSecs < 150 ? "Almost ready..." : "Ready to go ✓")}
                </div>
              </div>
              <button onClick={() => setRestStartTime(null)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", fontFamily:F.mono, fontSize:9, color:C.gray, cursor:"pointer" }}>SKIP</button>
            </div>
          )}

          {/* Session progress bar */}
          {sessionStarted && isLiveDay && !isActualRest && (
            <div style={{ marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:4 }}>
                <span>{totalDone} sets ✓</span>
                <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {(() => {
                    if (!lastSaveAt) return null;
                    const ageSecs = Math.floor((now - lastSaveAt) / 1000);
                    let label, color;
                    if (ageSecs < 3) { label = "💾 SAVED"; color = C.lime; }
                    else if (ageSecs < 15) { label = `💾 ${ageSecs}s ago`; color = C.lime; }
                    else if (ageSecs < 60) { label = `💾 ${ageSecs}s ago`; color = C.amber; }
                    else { label = `⚠ ${Math.floor(ageSecs/60)}m old`; color = C.orange; }
                    return (
                      <span style={{ color, fontSize:8, letterSpacing:0.5 }} title="Auto-save status — green = recent, amber = stale, orange = retry needed">
                        {label}
                      </span>
                    );
                  })()}
                  <span>{doneEx}/{totalEx} exercises</span>
                </span>
              </div>
              <div style={{ height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${totalEx>0?(doneEx/totalEx)*100:0}%`, background:wo.color, borderRadius:2, transition:"width .4s ease" }} />
              </div>
            </div>
          )}

          <div style={{ background:`${wo.color}10`, border:`1px solid ${wo.color}25`, borderRadius:8, padding:"8px 12px", marginTop:10 }}>
            <div style={{ fontFamily:F.mono, fontSize:10, color:wo.color, lineHeight:1.7 }}>💡 {wo.note}</div>
          </div>
        </div>
      )}

      <div style={{ padding:"14px 16px 0" }}>

        {/* ── PREVIEW MODE ────────────────────────────────────────── */}
        {(!isLiveDay || isActualRest) && wo && (
          <WorkoutPreview wo={wo} workoutHistory={data.workouts} isToday={false} />
        )}

        {/* ── LIVE SESSION MODE ────────────────────────────────────── */}
        {isLiveDay && !isActualRest && (
          <div>
            {/* Resume banner if session was restored from storage */}
            {resumedAt && (
              <div style={{ background:`${C.amber}15`, border:`1px solid ${C.amber}40`, borderRadius:10, padding:"10px 14px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:F.mono, fontSize:10, color:C.amber, lineHeight:1.4, letterSpacing:1 }}>
                    ⟲ RESUMED · session from {fmtRelativeTime(resumedAt)}
                  </div>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2, lineHeight:1.4 }}>
                    Your sets and timer were saved. Pick up where you left off.
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <button onClick={discardSession} title="Discard saved session and start fresh"
                    style={{ fontFamily:F.mono, fontSize:9, color:C.gray, background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 9px", cursor:"pointer", letterSpacing:0.5 }}>
                    ↻ FRESH
                  </button>
                  <button onClick={() => setResumedAt(null)} aria-label="Dismiss banner"
                    style={{ background:"none", border:"none", color:C.gray, cursor:"pointer", padding:2, display:"flex", alignItems:"center" }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}
            {!sessionStarted && (
              <button
                onClick={() => { setSessionStart(Date.now()); setSessionStarted(true); }}
                style={{ width:"100%", background:wo.color, border:"none", borderRadius:14, padding:"16px", fontFamily:F.display, fontSize:24, color:C.dark, cursor:"pointer", letterSpacing:1, marginBottom:14 }}
              >
                START SESSION
              </button>
            )}

            {exerciseGroups.map((group, gIdx) => {
              const isSuperset = !!group.group && group.items.length > 1;
              const cards = group.items.map(({ ex, exIdx }) => {
              const isInGroup = isSuperset;
              const isOpen = expandedEx === exIdx;
              const rx = getPrescription(ex.name, data.workouts, ex);
              const statusColor = rx.status === "progress" ? C.lime : rx.status === "build" ? C.teal : C.grayMid;
              const sets = getSets(exIdx);
              const exDoneSets = sets.filter(s => s.done).length;
              const exAllDone = exDoneSets > 0 && exDoneSets === sets.length;

              return (
                <div key={exIdx} style={{ background:exAllDone?"#0A1A00":C.surface, border:`1px solid ${exAllDone?C.lime:isOpen?wo.color:C.border}`, borderRadius:14, marginBottom: isInGroup ? 0 : 10, overflow:"hidden" }}>
                  <div onClick={() => setExpandedEx(isOpen ? null : exIdx)} style={{ padding:"13px 16px", cursor:"pointer" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                          {exAllDone && <span>✅</span>}
                          <div style={{ fontSize:14, fontWeight:600, color:exAllDone?C.lime:C.white }}>{ex.name}</div>
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                          <div style={{ background:`${wo.color}18`, border:`1px solid ${wo.color}50`, borderRadius:5, padding:"2px 8px", fontFamily:F.mono, fontSize:10, color:wo.color }}>
                            {ex.sets} × {ex.reps}
                          </div>
                          {rx.prescribedWeight && (
                            <div style={{ background:`${statusColor}18`, border:`1px solid ${statusColor}50`, borderRadius:5, padding:"2px 8px", fontFamily:F.mono, fontSize:10, color:statusColor, fontWeight:600 }}>
                              🎯 {rx.prescribedWeight} lbs
                            </div>
                          )}
                          {rx.status === "progress" && <div style={{ fontFamily:F.mono, fontSize:9, color:C.lime }}>↑ ADD WEIGHT</div>}
                          {rx.status === "build" && <div style={{ fontFamily:F.mono, fontSize:9, color:C.teal }}>BEAT THE REPS</div>}
                          {exDoneSets > 0 && <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>{exDoneSets}/{sets.length} ✓</div>}
                        </div>
                      </div>
                      <ChevronRight size={15} color={C.gray} style={{ transform:isOpen?"rotate(90deg)":"none", transition:"transform .2s", flexShrink:0 }} />
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop:`1px solid ${C.border}` }}>
                      {/* Last vs Target */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ padding:"10px 14px", borderRight:`1px solid ${C.border}` }}>
                          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:5, letterSpacing:1 }}>LAST SESSION</div>
                          {rx.lastWeight ? (
                            <div>
                              <div style={{ fontFamily:F.display, fontSize:24, color:C.grayMid, lineHeight:1 }}>{rx.lastWeight}</div>
                              <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayMid, marginTop:2 }}>lbs × {rx.lastReps}</div>
                              {rx.lastDate && <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:3 }}>{rx.lastDate}</div>}
                            </div>
                          ) : (
                            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>No history yet</div>
                          )}
                        </div>
                        <div style={{ padding:"10px 14px", background:rx.status==="progress"?"#0A1A00":rx.status==="build"?"#040E0C":C.surfaceAlt }}>
                          <div style={{ fontFamily:F.mono, fontSize:9, color:statusColor, marginBottom:5, letterSpacing:1 }}>TODAY'S TARGET</div>
                          {rx.prescribedWeight ? (
                            <div>
                              <div style={{ fontFamily:F.display, fontSize:24, color:statusColor, lineHeight:1 }}>{rx.prescribedWeight}</div>
                              <div style={{ fontFamily:F.mono, fontSize:11, color:statusColor, marginTop:2 }}>lbs × {rx.prescribedReps}</div>
                              <div style={{ fontFamily:F.mono, fontSize:9, color:statusColor, marginTop:3, opacity:.8 }}>
                                {rx.status==="progress" ? "↑ ADD WEIGHT" : "SAME WEIGHT, BEAT THE REPS"}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>Set your baseline</div>
                          )}
                        </div>
                      </div>

                      {/* Live set logging */}
                      <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:1 }}>LOG YOUR SETS{ex?.unilateral ? " · UNILATERAL" : ""}{ex?.metric === "time" ? " · TIME-BASED" : ""}</div>
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={() => setSwappingIdx(exIdx)} title="Swap this exercise" style={{ fontFamily:F.mono, fontSize:9, padding:"3px 8px", background:"transparent", border:`1px solid ${C.border}`, color:swappedNames[exIdx] ? C.amber : C.gray, borderRadius:5, cursor:"pointer", letterSpacing:0.5 }}>
                              ⇄ {swappedNames[exIdx] ? "SWAPPED" : "SWAP"}
                            </button>
                            <button onClick={() => {
                              setEndedExercises(prev => ({ ...prev, [exIdx]: !prev[exIdx] }));
                            }} title="Mark exercise ended early due to fatigue" style={{ fontFamily:F.mono, fontSize:9, padding:"3px 8px", background:"transparent", border:`1px solid ${endedExercises[exIdx] ? C.orange : C.border}`, color:endedExercises[exIdx] ? C.orange : C.gray, borderRadius:5, cursor:"pointer", letterSpacing:0.5 }}>
                              {endedExercises[exIdx] ? "🏳️ ENDED" : "🏳️ END"}
                            </button>
                          </div>
                        </div>
                        {swappedNames[exIdx] && (
                          <div style={{ fontFamily:F.mono, fontSize:10, color:C.amber, marginBottom:8, padding:"6px 10px", background:`${C.amber}15`, borderRadius:6 }}>
                            Logging as: <strong>{swappedNames[exIdx]}</strong> (was {ex.name}) — PRs track under the swapped name
                          </div>
                        )}
                        <div style={{ display:"grid", gridTemplateColumns:"22px 1fr 1fr 34px", gap:6, marginBottom:6 }}>
                          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>SET</div>
                          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>{ex?.metric === "time" ? "—" : "LBS"}</div>
                          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>{ex?.metric === "time" ? "TIME (s)" : (ex?.unilateral ? "REPS (total)" : "REPS")}</div>
                          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>✓</div>
                        </div>
                        {sets.map((s, setIdx) => {
                          const isLast = setIdx === sets.length - 1;
                          const isTime = ex?.metric === "time";
                          const rirOptions = [
                            { val:"easy", label:"EASY", color:C.blue, hint:"3+ reps left" },
                            { val:"good", label:"GOOD", color:C.lime, hint:"1-2 reps left" },
                            { val:"hard", label:"HARD", color:C.amber, hint:"0-1 reps left" },
                            { val:"fail", label:"FAIL", color:C.orange, hint:"failure" },
                          ];
                          return (
                            <div key={setIdx} style={{ marginBottom:8 }}>
                              <div style={{ display:"grid", gridTemplateColumns:"22px 1fr 1fr 34px", gap:6, alignItems:"center" }}>
                                <div style={{ fontFamily:F.mono, fontSize:11, color:s.done?C.lime:C.gray, textAlign:"center" }}>
                                  {isLast ? "🔥" : setIdx+1}
                                </div>
                                <input value={isTime ? "" : s.weight} onChange={e => { if (!isTime) updateLiveSet(exIdx, setIdx, "weight", e.target.value); }}
                                  placeholder={isTime ? "—" : (rx.prescribedWeight ? `${rx.prescribedWeight}` : "lbs")} type="number" inputMode="decimal"
                                  disabled={isTime}
                                  style={{ background: isTime ? "#0A0A0A" : (s.done?"#0A1A00":"#1A1A22"), border:`1px solid ${isTime ? "#222" : (s.done?C.lime:C.border)}`, borderRadius:8, padding:"8px 10px", color: isTime ? C.gray : (s.done?C.lime:C.white), fontSize:14, fontFamily:F.mono, outline:"none", width:"100%", boxSizing:"border-box", opacity: isTime ? 0.4 : 1 }} />
                                <input value={s.reps} onChange={e => updateLiveSet(exIdx, setIdx, "reps", e.target.value)}
                                  placeholder={isTime ? ((rx.prescribedReps || "").replace(/[^0-9-]/g,"") || "sec") : (isLast ? "fail→" : (rx.prescribedReps.split("–")[0]||"reps"))} type="number" inputMode="numeric"
                                  style={{ background:s.done?"#0A1A00":"#1A1A22", border:`1px solid ${s.done?C.lime:C.border}`, borderRadius:8, padding:"8px 10px", color:s.done?C.lime:C.white, fontSize:14, fontFamily:F.mono, outline:"none", width:"100%", boxSizing:"border-box" }} />
                                <button onClick={() => {
                                  if (!sessionStarted) return;
                                  // Top of rep range (e.g. "9-10" -> 10) for auto-fill if user hits checkbox blank
                                  const rxReps = String(rx.prescribedReps || "");
                                  const topMatch = rxReps.match(/(\d+)\s*$/);
                                  const topReps = topMatch ? topMatch[1] : (rxReps.match(/(\d+)/) || [])[1];
                                  toggleSetDone(exIdx, setIdx, rx.prescribedWeight, topReps);
                                }}
                                  style={{ width:34, height:34, borderRadius:8, border:`2px solid ${s.done?C.lime:sessionStarted?C.border:"#333"}`, background:s.done?`${C.lime}20`:"transparent", cursor:sessionStarted?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                  {s.done && <Check size={14} color={C.lime} />}
                                </button>
                              </div>
                              {/* RIR effort chips — always shown beneath each set row */}
                              <div style={{ display:"grid", gridTemplateColumns:"22px 1fr 1fr 34px", gap:6, marginTop:5 }}>
                                <div /> {/* spacer for set number column */}
                                <div style={{ gridColumn:"2 / 4", display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:4 }}>
                                  {rirOptions.map(opt => {
                                    const selected = s.rir === opt.val;
                                    return (
                                      <button
                                        key={opt.val}
                                        onClick={() => { if (sessionStarted) updateLiveSetRIR(exIdx, setIdx, opt.val); }}
                                        title={opt.hint}
                                        disabled={!sessionStarted}
                                        style={{
                                          padding:"6px 0",
                                          borderRadius:6,
                                          border:`1px solid ${selected ? opt.color : C.border}`,
                                          background: selected ? `${opt.color}25` : "transparent",
                                          color: selected ? opt.color : C.gray,
                                          fontFamily:F.mono, fontSize:9, fontWeight: selected ? 700 : 400, letterSpacing:0.5,
                                          cursor: sessionStarted ? "pointer" : "default",
                                          opacity: sessionStarted ? 1 : 0.45,
                                        }}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div /> {/* spacer for done button column */}
                              </div>
                              {isLast && !s.done && (
                                <div style={{ fontFamily:F.mono, fontSize:9, color:C.orange, marginTop:5, paddingLeft:28 }}>
                                  🔥 Push set — go to failure
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={() => addLiveSet(exIdx)} style={{ width:"100%", marginTop:8, padding:"6px", borderRadius:8, border:`1px dashed ${C.border}`, background:"none", fontFamily:F.mono, fontSize:10, color:C.gray, cursor:"pointer" }}>+ ADD SET</button>
                      </div>

                      {/* Phase target + note */}
                      <div style={{ padding:"10px 14px" }}>
                        <div style={{ display:"flex", gap:14, marginBottom:8, flexWrap:"wrap" }}>
                          <div><div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:2 }}>PHASE TARGET</div><div style={{ fontFamily:F.mono, fontSize:11, color:wo.color }}>{ex.target}</div></div>
                          {ex.pr && <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:14 }}><div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:2 }}>ALL-TIME PR</div><div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>{ex.pr}</div></div>}
                        </div>
                        <div style={{ background:`${wo.color}10`, borderRadius:8, padding:"8px 12px" }}>
                          <div style={{ fontFamily:F.mono, fontSize:10, color:wo.color, lineHeight:1.7 }}>📋 {ex.note}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
              });
              if (!isSuperset) {
                return <React.Fragment key={gIdx}>{cards}</React.Fragment>;
              }
              return (
                <div key={gIdx} style={{ background:`${wo.color}08`, border:`1px dashed ${wo.color}50`, borderRadius:14, padding:"10px 8px 8px", marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 6px 8px", borderBottom:`1px dashed ${wo.color}30`, marginBottom:8 }}>
                    <div style={{ fontFamily:F.mono, fontSize:10, color:wo.color, letterSpacing:1, fontWeight:600 }}>
                      🔄 SUPERSET {group.group}
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:0.5 }}>
                      alternate sets · ~60s rest
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {cards}
                  </div>
                </div>
              );
            })}

            {sessionStarted && (
              <div style={{ marginTop:4 }}>
                <input value={sessionNote} onChange={e => setSessionNote(e.target.value)} placeholder='Session vibe — e.g. "These legs are goofy"'
                  style={{ width:"100%", background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 14px", color:C.white, fontSize:14, fontFamily:F.mono, outline:"none", boxSizing:"border-box", marginBottom:10 }} />
                <button onClick={finishSession}
                  style={{ width:"100%", background:totalDone>0?C.lime:"#1A1A22", border:`1px solid ${totalDone>0?C.lime:C.border}`, borderRadius:14, padding:"15px", fontFamily:F.display, fontSize:22, color:totalDone>0?C.dark:C.gray, cursor:"pointer", letterSpacing:1 }}>
                  {totalDone > 0 ? `FINISH SESSION (${totalDone} SETS)` : "FINISH SESSION"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Fuel — always shown */}
        <div style={{ marginTop:14 }}>
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <SL>Today's Fuel</SL>
              <SBtn onClick={onLogMeal}>+ ADD MEAL</SBtn>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:10 }}>
              {[{label:"kcal",val:todayMeals.calories,target:calTarget,color:C.lime},{label:"protein",val:todayMeals.protein,target:data.profile.proteinTarget,color:C.teal},{label:"carbs",val:todayMeals.carbs,target:data.profile.carbTarget,color:C.orange},{label:"fat",val:todayMeals.fat,target:data.profile.fatTarget,color:C.purple}].map(m => (
                <div key={m.label} style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:F.mono, fontSize:14, fontWeight:600, color:(m.val/m.target)>=0.9?m.color:C.white }}>{m.val}</div>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>{m.label}</div>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:C.borderHi }}>/{m.target}</div>
                </div>
              ))}
            </div>
            {isLiveDay && !isActualRest && wo && (
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                {[
                  { time:"Pre-workout", tip:"Banana + shake — 40g carbs + 20g protein, 45 min out" },
                  { time:"Intra", tip:"Stay hydrated. Electrolytes if sweating heavy." },
                  { time:"Post-workout", tip:"50g carbs + 40g protein within 60 min of finishing" },
                ].map((item, i) => (
                  <div key={i} style={{ display:"flex", gap:8, marginBottom:5 }}>
                    <div style={{ fontFamily:F.mono, fontSize:10, color:wo.color, minWidth:82 }}>{item.time}</div>
                    <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, lineHeight:1.5 }}>{item.tip}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Session history — always visible at bottom of LIFTS */}
        <div style={{ marginTop:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, textTransform:"uppercase", letterSpacing:1.5 }}>Session History <span style={{ textTransform:"none", fontSize:9, color:C.gray, marginLeft:6 }}>· tap to edit · × to delete</span></div>
          </div>
          {data.workouts.length === 0 ? (
            <Card>
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textAlign:"center", padding:"16px 0" }}>No sessions logged yet — start your first session above</div>
            </Card>
          ) : (
            data.workouts.slice(0, 5).map(session => (
              <div key={session.id}
                onClick={() => setEditTarget(session)}
                style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:14, padding:14, marginBottom:10, cursor:"pointer", position:"relative" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8, gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{session.name}</div>
                    <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:2 }}>{session.date} · {session.split}</div>
                    {session.note && <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, marginTop:3 }}>{session.note}</div>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                    {session.prs > 0 && <Tag>{session.prs} PR{session.prs !== 1 ? "s" : ""} 🏆</Tag>}
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(session); }}
                      aria-label="Delete session"
                      style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.gray, fontSize:14, lineHeight:1, width:26, height:26, borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      ×
                    </button>
                  </div>
                </div>
                <div style={{ display:"flex", gap:20, marginBottom:session.exercises?.length ? 8 : 0 }}>
                  <div style={{ textAlign:"center" }}><div style={{ fontFamily:F.mono, fontSize:15, fontWeight:600, color:C.teal }}>{session.duration}m</div><div style={{ fontFamily:F.mono, fontSize:8, color:C.gray, marginTop:3 }}>DURATION</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontFamily:F.mono, fontSize:15, fontWeight:600 }}>{(session.volume/1000).toFixed(1)}k</div><div style={{ fontFamily:F.mono, fontSize:8, color:C.gray, marginTop:3 }}>LBS</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontFamily:F.mono, fontSize:15, fontWeight:600 }}>{session.sets}</div><div style={{ fontFamily:F.mono, fontSize:8, color:C.gray, marginTop:3 }}>SETS</div></div>
                </div>
                {session.exercises?.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                    {session.exercises.map((ex, j) => (
                      <div key={j} style={{ background:"#1A1A22", borderRadius:5, padding:"2px 8px", fontSize:9, color:C.grayMid, fontFamily:F.mono }}>{ex.name}</div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete-session confirmation modal */}
      {deleteTarget && (
        <div onClick={() => setDeleteTarget(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.orange}`, borderRadius:14, padding:18, maxWidth:380, width:"100%" }}>
            <div style={{ fontFamily:F.display, fontSize:22, color:C.orange, marginBottom:8, letterSpacing:2 }}>DELETE SESSION?</div>
            <div style={{ fontFamily:F.body, fontSize:13, color:C.white, lineHeight:1.5, marginBottom:14 }}>
              <strong>{deleteTarget.name}</strong> from {deleteTarget.date} · {deleteTarget.duration}m · {deleteTarget.sets} sets
              <div style={{ color:C.gray, fontSize:11, marginTop:6 }}>This can't be undone.</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex:1, padding:"10px", background:"transparent", border:`1px solid ${C.border}`, color:C.gray, borderRadius:8, fontFamily:F.mono, fontWeight:700, fontSize:12, letterSpacing:1, cursor:"pointer" }}>CANCEL</button>
              <button onClick={() => { updateData("workouts", data.workouts.filter(w => w.id !== deleteTarget.id)); setDeleteTarget(null); }} style={{ flex:1, padding:"10px", background:C.orange, border:"none", color:C.white, borderRadius:8, fontFamily:F.mono, fontWeight:700, fontSize:12, letterSpacing:1, cursor:"pointer" }}>DELETE</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit-session modal */}
      {editTarget && (
        <EditSessionModal
          session={editTarget}
          onSave={(updated) => {
            updateData("workouts", data.workouts.map(w => w.id === updated.id ? updated : w));
            setEditTarget(null);
          }}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}// ── PLAN Tab ──────────────────────────────────────────────────────
function PlanTab() {
  const [activePhase, setActivePhase] = useState(0);
  const [subTab, setSubTab] = useState("overview");
  const phase = PHASES[activePhase];

  const weekDays = [
    { day:"MON", split:"Upper A", focus:"Chest · Back · Shoulders", color:C.blue },
    { day:"TUE", split:"Lower A", focus:"Posterior Chain", color:C.teal },
    { day:"WED", split:"REST", focus:"Recovery", color:C.gray },
    { day:"THU", split:"Upper B", focus:"Chest Flies · Triceps", color:C.orange },
    { day:"FRI", split:"Lower B", focus:"Quads · Squat", color:C.purple },
    { day:"SAT", split:"REST", focus:"Recovery", color:C.gray },
    { day:"SUN", split:"REST", focus:"Recovery", color:C.gray },
  ];

  return (
    <div style={{ paddingBottom:20 }}>
      <div style={{ background:"linear-gradient(180deg,#0e0e18 0%,#070709 100%)", borderBottom:`1px solid ${C.border}`, padding:"20px 16px 0" }}>
        <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, letterSpacing:1.5, marginBottom:4 }}>12-MONTH ROADMAP</div>
        <div style={{ fontFamily:F.display, fontSize:36, color:C.lime, letterSpacing:2, lineHeight:1, marginBottom:4 }}>THE PLAN</div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:16 }}>175.8 lbs → 185–195 lbs @ 8–10% BF</div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:16 }}>
          {PHASES.map((p, i) => (
            <div key={i} onClick={() => { setActivePhase(i); setSubTab("overview"); }} style={{ cursor:"pointer" }}>
              <div style={{ height:3, background:i <= activePhase ? p.color : C.border, borderRadius:1, marginBottom:6 }} />
              <div style={{ fontFamily:F.mono, fontSize:9, color:i === activePhase ? p.color : C.gray, letterSpacing:"0.1em", fontWeight:700 }}>
                PH{p.id}
              </div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:i === activePhase ? C.white : C.gray }}>
                {p.months.split("–")[0].trim()}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:2 }}>
          {PHASES.map((p, i) => (
            <button
              key={i}
              onClick={() => { setActivePhase(i); setSubTab("overview"); }}
              style={{
                flexShrink:0, padding:"8px 14px", borderRadius:10, cursor:"pointer",
                background: i === activePhase ? `${p.color}18` : "transparent",
                border: `1px solid ${i === activePhase ? p.color : C.border}`,
                fontFamily:F.mono, fontSize:10,
                color: i === activePhase ? p.color : C.gray,
              }}
            >
              {p.emoji} {p.name}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", marginTop:10, borderBottom:`1px solid ${C.border}` }}>
          {["overview","training","nutrition","milestones"].map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              style={{
                flex:1, padding:"10px 0 12px", background:"none", border:"none",
                borderBottom: `2px solid ${subTab === t ? phase.color : "transparent"}`,
                color: subTab === t ? phase.color : C.gray,
                fontFamily:F.mono, fontSize:9, cursor:"pointer",
                textTransform:"uppercase", letterSpacing:0.8,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px 16px 0" }}>
        <Card style={{ background:phase.bg, borderColor:`${phase.color}40` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontFamily:F.mono, fontSize:10, color:phase.color, letterSpacing:1.5, marginBottom:4 }}>
                {phase.months} · {phase.duration}
              </div>
              <div style={{ fontFamily:F.display, fontSize:32, color:phase.color, letterSpacing:1, lineHeight:1 }}>
                {phase.emoji} {phase.name}
              </div>
              <div style={{ fontFamily:F.display, fontSize:16, color:C.grayLight, letterSpacing:0.5 }}>{phase.sub}</div>
            </div>
            <Tag color={phase.status === "active" ? C.lime : C.gray}>
              {phase.status === "active" ? "ACTIVE NOW" : "UPCOMING"}
            </Tag>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:14 }}>
            <div style={{ background:`${phase.color}10`, borderRadius:10, padding:"10px 12px" }}>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:3 }}>WEIGHT TARGET</div>
              <div style={{ fontFamily:F.mono, fontSize:14, color:phase.color, fontWeight:600 }}>{phase.weightRange}</div>
            </div>
            <div style={{ background:`${phase.color}10`, borderRadius:10, padding:"10px 12px" }}>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:3 }}>BODY FAT</div>
              <div style={{ fontFamily:F.mono, fontSize:14, color:phase.color, fontWeight:600 }}>{phase.bfRange}</div>
            </div>
          </div>
        </Card>

        {subTab === "overview" && (
          <div>
            <Card>
              <SL>Phase Goal</SL>
              <div style={{ fontFamily:F.mono, fontSize:12, color:C.grayLight, lineHeight:1.8 }}>{phase.goal}</div>
            </Card>
            <Card>
              <SL>Weekly Schedule</SL>
              {weekDays.map((d, i) => {
                const isR = d.split === "REST";
                const isToday = DAYS[new Date().getDay()].toUpperCase() === d.day;
                return (
                  <div key={d.day} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderBottom:i < 6 ? `1px solid ${C.border}` : "none", opacity:isR ? 0.4 : 1 }}>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:isToday ? d.color : C.gray, width:28, fontWeight:isToday ? 700 : 400 }}>{d.day}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:isR ? 400 : 600, color:isToday ? d.color : isR ? C.gray : C.white }}>{d.split}</div>
                      <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:1 }}>{d.focus}</div>
                    </div>
                    {isToday && <Tag color={d.color}>TODAY</Tag>}
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        {subTab === "training" && (
          <div>
            <Card>
              <SL>Key Lift Targets — End of Phase</SL>
              {phase.keyLifts.map((lift, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:i < phase.keyLifts.length-1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{lift.name}</div>
                  <div style={{ textAlign:"right" }}>
                    {lift.now && <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:2 }}>Now: {lift.now}</div>}
                    <div style={{ fontFamily:F.mono, fontSize:13, color:phase.color, fontWeight:600 }}>→ {lift.target}</div>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {subTab === "nutrition" && (
          <div>
            <Card>
              <SL>Daily Targets — {phase.name}</SL>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  { label:"Training Day Cal", val:phase.calTraining, color:C.lime },
                  { label:"Rest Day Cal", val:phase.calRest, color:C.lime },
                  { label:"Protein", val:phase.protein, color:C.teal },
                  { label:"Carbs", val:phase.carbs, color:C.orange },
                  { label:"Fat", val:phase.fat, color:C.purple },
                  { label:"Strategy", val:phase.surplus, color:C.grayMid },
                ].map(m => (
                  <div key={m.label} style={{ background:C.surfaceAlt, borderRadius:10, padding:"10px 12px" }}>
                    <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontFamily:F.mono, fontSize:12, color:m.color, fontWeight:600 }}>{m.val}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SL>Supplement Stack</SL>
              {phase.supplements.map((s, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:i < phase.supplements.length-1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:C.lime, flexShrink:0 }} />
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight }}>{s}</div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {subTab === "milestones" && (
          <Card>
            <SL>Phase {phase.id} Milestones</SL>
            {phase.milestones.map((m, i) => (
              <div key={i} style={{ display:"flex", gap:12, padding:"11px 0", borderBottom:i < phase.milestones.length-1 ? `1px solid ${C.border}` : "none", alignItems:"flex-start" }}>
                <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${phase.status === "active" ? phase.color : C.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                  {phase.status !== "active" && <Check size={12} color={C.gray} />}
                </div>
                <div style={{ fontFamily:F.mono, fontSize:12, color:C.grayLight, lineHeight:1.6 }}>{m}</div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── LIFTS Tab ─────────────────────────────────────────────────────
function LiftsTab({ data, onLogWorkout, onLogPR }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? data.workouts : data.workouts.slice(0, 5);

  return (
    <div style={{ padding:"18px 16px" }}>
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <SL>🏆 Personal Records</SL>
          <SBtn onClick={onLogPR}>+ LOG PR</SBtn>
        </div>
        {[...data.prs].sort((a,b) => a.exercise.localeCompare(b.exercise)).map((pr, i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:i < data.prs.length-1 ? `1px solid ${C.border}` : "none" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500 }}>{pr.exercise}</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>{pr.date}</div>
            </div>
            <div style={{ fontFamily:F.mono, fontSize:14, color:C.lime, fontWeight:600 }}>{pr.weight} × {pr.reps}</div>
          </div>
        ))}
      </Card>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, padding:"0 2px" }}>
        <SL>Session Log</SL>
        <SBtn onClick={onLogWorkout}>+ LOG SESSION</SBtn>
      </div>

      {visible.map(wo => (
        <div key={wo.id} style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:14, padding:14, marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>{wo.name}</div>
              <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:2 }}>{wo.date} · {wo.split}</div>
              {wo.note && <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, marginTop:3 }}>{wo.note}</div>}
            </div>
            {wo.prs > 0 && <Tag>{wo.prs} PR{wo.prs !== 1 ? "s" : ""} 🏆</Tag>}
          </div>
          <div style={{ display:"flex", gap:20, marginBottom:wo.exercises?.length ? 10 : 0 }}>
            <div style={{ textAlign:"center" }}><div style={{ fontFamily:F.mono, fontSize:17, fontWeight:600, color:C.teal }}>{wo.duration}m</div><div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:4 }}>DURATION</div></div>
            <div style={{ textAlign:"center" }}><div style={{ fontFamily:F.mono, fontSize:17, fontWeight:600 }}>{(wo.volume/1000).toFixed(1)}k</div><div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:4 }}>VOLUME</div></div>
            <div style={{ textAlign:"center" }}><div style={{ fontFamily:F.mono, fontSize:17, fontWeight:600 }}>{wo.sets}</div><div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:4 }}>SETS</div></div>
          </div>
          {wo.exercises?.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:8 }}>
              {wo.exercises.map((ex, j) => (
                <div key={j} style={{ background:"#1A1A22", borderRadius:5, padding:"3px 9px", fontSize:10, color:C.grayMid, fontFamily:F.mono }}>
                  {ex.name}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {data.workouts.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:10, padding:10, fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer" }}
        >
          {showAll ? "SHOW LESS ↑" : `SHOW ALL (${data.workouts.length}) ↓`}
        </button>
      )}
    </div>
  );
}

// ── GAINS Tab ─────────────────────────────────────────────────────
function GainsTab({ data, onLogMeasurements, onLogMeal, onLogPR, onEditDay }) {
  const t = getToday();
  const weightData = data.weightLog.filter(w => w.weight).map(w => ({ date:w.date.slice(5), weight:w.weight }));
  const currentW = weightData.length ? weightData[weightData.length - 1].weight : 175.8;
  const latestM = data.measurements?.length ? data.measurements[data.measurements.length - 1] : null;
  const prevM = data.measurements?.length > 1 ? data.measurements[data.measurements.length - 2] : null;
  const recentMeals = Object.keys(data.meals).sort((a,b) => b.localeCompare(a)).slice(0, 5);
  const isRest = !SPLIT_MAP[DAYS[new Date().getDay()]];
  const calTarget = isRest ? data.profile.calorieTarget.rest : data.profile.calorieTarget.training;

  function WeightTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background:"#111", border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px" }}>
        <div style={{ fontFamily:F.mono, fontSize:12, color:C.lime }}>{payload[0].value} lbs</div>
        <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray }}>{payload[0].payload.date}</div>
      </div>
    );
  }

  return (
    <div style={{ padding:"18px 16px" }}>
      <Card>
        <SL>Weight Journey</SL>
        <div style={{ display:"flex", gap:20, marginBottom:20, flexWrap:"wrap" }}>
          <div>
            <BigN>{currentW}</BigN>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:4 }}>Current lbs</div>
          </div>
          <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
            <BigN color={C.lime}>185–195</BigN>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:4 }}>Target lbs</div>
          </div>
          <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
            <BigN color={C.teal}>+{(185 - currentW).toFixed(1)}</BigN>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:4 }}>lbs to go</div>
          </div>
        </div>
        {weightData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={weightData}>
              <XAxis dataKey="date" tick={{ fill:C.gray, fontSize:10, fontFamily:"monospace" }} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 3","dataMax + 3"]} tick={{ fill:C.gray, fontSize:10, fontFamily:"monospace" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<WeightTooltip />} />
              <Line type="monotone" dataKey="weight" stroke={C.lime} strokeWidth={2} dot={{ fill:C.lime, r:4, strokeWidth:0 }} activeDot={{ r:6, fill:C.lime }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign:"center", color:C.border, fontFamily:F.mono, fontSize:11, padding:"24px 0" }}>
            Log more weigh-ins to see trend
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <SL>📏 Body Measurements</SL>
          <SBtn onClick={onLogMeasurements} color={C.teal}>+ LOG</SBtn>
        </div>
        {latestM ? (
          <div>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginBottom:12 }}>
              Latest: {latestM.date}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {MEASURE_FIELDS.map(f => {
                const val = latestM[f.key];
                const prev = prevM?.[f.key];
                const delta = val && prev ? (val - prev).toFixed(2) : null;
                const isInches = f.key !== "bodyFat";
                if (!val) return null;
                return (
                  <div key={f.key} style={{ background:C.surfaceAlt, borderRadius:10, padding:"10px 12px", border:`1px solid ${C.border}` }}>
                    <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{f.label}</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                      <div style={{ fontFamily:F.mono, fontSize:18, fontWeight:600, color:f.color }}>{val}</div>
                      <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray }}>{isInches ? '"' : "%"}</div>
                    </div>
                    {delta && (
                      <div style={{ fontFamily:F.mono, fontSize:10, color:parseFloat(delta) > 0 ? C.lime : C.orange, marginTop:3 }}>
                        {parseFloat(delta) > 0 ? "+" : ""}{delta}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:"24px 0" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:8 }}>No measurements logged yet</div>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.border }}>chest · shoulders · waist · arms · thighs · calves · body fat</div>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <SL>🥩 Nutrition History</SL>
          <SBtn onClick={onLogMeal}>+ ADD MEAL</SBtn>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:10 }}>tap any day to view & edit entries</div>
        {recentMeals.map(date => {
          const m = data.meals[date];
          if (!m) return null;
          const isToday = date === t;
          const entryCount = (m.entries || []).length;
          return (
            <button
              key={date}
              onClick={() => onEditDay && onEditDay(date)}
              style={{
                width:"100%", padding:"10px 8px", borderBottom:`1px solid ${C.border}`,
                background:"transparent", border:"none", borderBottom:`1px solid ${C.border}`,
                cursor:"pointer", textAlign:"left",
                display:"block",
              }}
            >
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:isToday ? C.lime : C.gray }}>
                    {isToday ? "TODAY" : date}
                  </div>
                  {entryCount > 0 && (
                    <div style={{ fontFamily:F.mono, fontSize:8, color:C.grayMid, background:"#1A1A22", padding:"1px 6px", borderRadius:4 }}>
                      {entryCount} {entryCount === 1 ? "entry" : "entries"}
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ fontFamily:F.mono, fontSize:12, color:C.white }}>
                    {m.calories} kcal · {m.protein}g prot
                  </div>
                  <ChevronRight size={12} color={C.gray} />
                </div>
              </div>
              <MBar value={m.protein} target={data.profile.proteinTarget} color={C.teal} />
            </button>
          );
        })}
      </Card>

      <Card>
        <SL>Sleep Log</SL>
        {[...data.weightLog].reverse().map((entry, i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i < data.weightLog.length-1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{entry.date}</div>
            <div style={{ display:"flex", gap:16 }}>
              {entry.weight && <div style={{ fontFamily:F.mono, fontSize:12 }}>{entry.weight} lbs</div>}
              {entry.sleep && (
                <div style={{ fontFamily:F.mono, fontSize:12, color:entry.sleep >= 8 ? C.lime : entry.sleep >= 7 ? C.white : C.orange }}>
                  {entry.sleep}h 💤
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>

      {/* PRs — moved from old Lifts tab */}
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <SL>🏆 Personal Records</SL>
          <SBtn onClick={onLogPR}>+ LOG PR</SBtn>
        </div>
        {[...data.prs].sort((a,b) => a.exercise.localeCompare(b.exercise)).map((pr, i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:i < data.prs.length-1 ? `1px solid ${C.border}` : "none" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500 }}>{pr.exercise}</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>{pr.date}</div>
            </div>
            <div style={{ fontFamily:F.mono, fontSize:14, color:C.lime, fontWeight:600 }}>{pr.weight} × {pr.reps}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}



// ── Data Completeness Score ───────────────────────────────────────
function getCompletenessItems(data) {
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

// ── Coach Context Builder ─────────────────────────────────────────
function buildCoachContext(data) {
  const currentW = [...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8;
  const latestSleep = [...data.weightLog].filter(w=>w.sleep).pop();
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
${recentWorkouts.map(w=>`- ${w.date} | ${w.name} | ${w.sets} sets | ${(w.volume/1000).toFixed(1)}k lbs volume | ${w.prs} PRs${w.note ? ` | note: ${w.note}` : ""}${w.exercises?.length ? " | exercises: "+w.exercises.map(e=>e.name+(e.sets?` (${e.sets})`:"")).join(", ") : ""}`).join("\n")}

RECENT NUTRITION (${recentMeals.length} days):
${recentMeals.map(([date,m])=>`- ${date}: ${m.calories} kcal | ${m.protein}g protein | ${m.carbs}g carbs | ${m.fat}g fat${m.items?.length ? " | foods: "+m.items.slice(0,3).join(", ") : ""}`).join("\n")}

WEIGHT & SLEEP LOG:
${data.weightLog.slice(-7).map(w=>`- ${w.date}: ${w.weight ? w.weight+" lbs" : "no weigh-in"} | ${w.sleep ? w.sleep+"h sleep" : "no sleep logged"}`).join("\n")}

BODY MEASUREMENTS:
${latestMeasure ? `Last measured ${latestMeasure.date}: ${Object.entries(latestMeasure).filter(([k,v])=>v&&k!=="date"&&k!=="note").map(([k,v])=>`${k}=${v}`).join(", ")}` : "No measurements logged yet"}

CURRENT PROGRAM PRESCRIPTIONS (based on logged history):
${splitPrescriptions}

PROGRESSIVE OVERLOAD SYSTEM: Double progression. Own all reps at top of range → add weight next session (Upper: +5 lbs, Lower: +10 lbs). Last set of each exercise = push set (failure).

When the athlete mentions deviations (skipped sets, went to failure early, injury, fatigue, time constraints), give specific adjustments to their prescriptions. When they ask questions, answer directly using their actual data. You can adjust their program, nutrition targets, recovery protocols, or anything else based on what they tell you.`;
}

// ── Next Session Prescriptions Card ──────────────────────────────
function NextSessionPrescriptions({ data }) {
  const [activeDay, setActiveDay] = useState(() => {
    const dIdx = new Date().getDay();
    // Default to next training day
    const upcoming = [1,2,4,5].find(d => d > dIdx) || 1;
    return SPLIT_MAP[DAYS[upcoming]] || "Upper A";
  });

  const dayTabs = [
    { label:"MON", split:"Upper A", color:C.blue },
    { label:"TUE", split:"Lower A", color:C.teal },
    { label:"THU", split:"Upper B", color:C.orange },
    { label:"FRI", split:"Lower B", color:C.purple },
  ];

  const wo = WORKOUTS[activeDay];
  const statusColor = (s) => s === "progress" ? C.lime : s === "build" ? C.teal : C.gray;
  const statusLabel = (s) => s === "progress" ? "↑ ADD WEIGHT" : s === "build" ? "BEAT REPS" : "NEW";

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <SL>⚡ Next Session Prescriptions</SL>
      <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginBottom:10, marginTop:-8 }}>
        Progressive overload engine — tap any day to see what's prescribed
      </div>

      {/* Day tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {dayTabs.map(({ label, split, color }) => {
          const isActive = activeDay === split;
          return (
            <button
              key={label}
              onClick={() => setActiveDay(split)}
              style={{
                flex:1, padding:"7px 4px",
                background: isActive ? `${color}18` : "transparent",
                border: `1px solid ${isActive ? color : C.border}`,
                borderRadius:8, cursor:"pointer",
                fontFamily:F.mono, fontSize:9, color: isActive ? color : C.gray,
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Exercise prescriptions */}
      {wo && wo.exercises.map((ex, i) => {
        const rx = getPrescription(ex.name, data.workouts, ex);
        const sc = statusColor(rx.status);
        const isLast = i === wo.exercises.length - 1;

        return (
          <div
            key={i}
            style={{
              padding:"10px 0",
              borderBottom: isLast ? "none" : `1px solid ${C.border}`,
            }}
          >
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1, marginRight:10 }}>
                <div style={{ fontSize:12, fontWeight:600, color:C.white, marginBottom:4 }}>{ex.name}</div>
                {/* Prescribed target */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                  <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray }}>{ex.sets} sets ×</div>
                  {rx.prescribedWeight ? (
                    <div style={{ fontFamily:F.mono, fontSize:11, color:sc, fontWeight:700 }}>
                      {rx.prescribedWeight} lbs × {rx.prescribedReps}
                    </div>
                  ) : (
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>set baseline</div>
                  )}
                </div>
              </div>
              {/* Status badge */}
              <div style={{
                background:`${sc}15`,
                border:`1px solid ${sc}40`,
                borderRadius:6,
                padding:"3px 8px",
                fontFamily:F.mono,
                fontSize:8,
                color:sc,
                flexShrink:0,
                alignSelf:"flex-start",
              }}>
                {statusLabel(rx.status)}
              </div>
            </div>

            {/* Last session vs target mini comparison */}
            {rx.lastWeight && (
              <div style={{ display:"flex", gap:16, marginTop:5 }}>
                <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>
                  Last: <span style={{ color:C.grayMid }}>{rx.lastWeight} × {rx.lastReps}</span>
                  {rx.lastDate && <span style={{ color:C.border }}> ({rx.lastDate})</span>}
                </div>
                {rx.prescribedWeight && rx.prescribedWeight !== rx.lastWeight && (
                  <div style={{ fontFamily:F.mono, fontSize:9, color:sc }}>
                    Next: {rx.prescribedWeight} (+{rx.prescribedWeight - rx.lastWeight} lbs)
                  </div>
                )}
                {rx.prescribedWeight && rx.prescribedWeight === rx.lastWeight && (
                  <div style={{ fontFamily:F.mono, fontSize:9, color:C.teal }}>
                    Same weight — aim for {rx.prescribedReps} reps
                  </div>
                )}
              </div>
            )}

            {/* Reasoning */}
            {rx.status === "progress" && (
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.lime, marginTop:3 }}>
                ✓ You hit the top rep range last session — time to go heavier
              </div>
            )}
            {rx.status === "build" && rx.lastReps && (
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.teal, marginTop:3 }}>
                Got {rx.lastReps} reps at {rx.lastWeight} lbs — own {ex.reps.split("-")[1] || ex.reps} reps before adding weight
              </div>
            )}
            {rx.status === "new" && (
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:3 }}>
                No history — start conservative, log it, engine calibrates from here
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontFamily:F.mono, fontSize:9, color:C.border, marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, lineHeight:1.6 }}>
        🧠 Prescriptions update automatically after every logged session · Double progression: own top rep range → +5 lbs upper / +10 lbs lower
      </div>
    </div>
  );
}

// ── Coach Chat ────────────────────────────────────────────────────
function CoachChat({ data }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = React.useRef(null);

  // Load chat history from storage
  useEffect(() => {
    async function load() {
      try {
        const hist = await window.storage.get("ft:chatHistory");
        if (hist) {
          const parsed = JSON.parse(hist.value);
          setMessages(parsed);
        } else {
          // Welcome message
          setMessages([{
            role:"assistant",
            content:`Hey — I'm your coach. I have full access to your training history, nutrition, PRs, and your 12-month roadmap.\n\nRight now you're ${[...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8} lbs, ${data.workouts.length} sessions logged, and Phase 1 is active. Your incline bench is stuck at 110 lbs — that's the number one thing we're fixing this phase.\n\nTell me anything: how a session felt, if you're sore, if you skipped something, if you want to adjust the plan. I'll adapt. What's on your mind?`,
            timestamp: getToday(),
          }]);
        }
      } catch {}
      setHistoryLoaded(true);
    }
    load();
  }, []);

  // Scroll the chat to the latest message — called EXPLICITLY after real user
  // actions (send / receive / error). Not driven by useEffect on [messages], because
  // that fires on hydration (welcome message + history load) and was yanking the page
  // on every COACH tab open. block:"nearest" keeps it minimal even for real scrolls.
  function scrollChatToEnd() {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior:"smooth", block:"nearest" });
      }
    }, 50);
  }

  async function saveHistory(msgs) {
    try {
      await window.storage.set("ft:chatHistory", JSON.stringify(msgs.slice(-40)));
    } catch {}
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = { role:"user", content:input.trim(), timestamp:getToday() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    scrollChatToEnd();
    setInput("");
    setLoading(true);

    try {
      const systemPrompt = buildCoachContext(data);

      // Build message history for API (exclude timestamps, last 20 messages)
      const apiMessages = newMessages.slice(-20).map(m => ({
        role: m.role,
        content: m.content,
      }));

      if (!getApiKey()) throw new Error("No API key set. Add yours in the COACH tab under AI / API Key.");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers: aiHeaders(),
        body:JSON.stringify({
          model:"claude-haiku-4-5-20251001",
          max_tokens:600,
          system: systemPrompt,
          messages: apiMessages,
        }),
      });

      const d = await resp.json();
      const text = (d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("");
      const assistantMsg = { role:"assistant", content:text, timestamp:getToday() };
      const updated = [...newMessages, assistantMsg];
      setMessages(updated);
      scrollChatToEnd();
      await saveHistory(updated);
    } catch (e) {
      const errMsg = { role:"assistant", content:"Connection error — check your network and try again.", timestamp:getToday() };
      const updated = [...newMessages, errMsg];
      setMessages(updated);
      scrollChatToEnd();
    }
    setLoading(false);
  }

  async function clearChat() {
    const fresh = [{
      role:"assistant",
      content:`Chat cleared. Still here — what do you need?`,
      timestamp: getToday(),
    }];
    setMessages(fresh);
    await saveHistory(fresh);
  }

  const quickPrompts = [
    "What should I focus on next session?",
    "I skipped sets today — adjust the plan",
    "My lower back is tight, modify Lower A",
    "Am I on pace for my goals?",
    "I went to failure on everything today",
    "How's my nutrition looking this week?",
  ];

  if (!historyLoaded) return null;

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden", marginBottom:12 }}>
      {/* Header */}
      <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontFamily:F.mono, fontSize:10, color:C.lime, textTransform:"uppercase", letterSpacing:1.5 }}>🧠 Coach Chat</div>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>
            Knows your full history · {messages.length - 1} messages
          </div>
        </div>
        <button
          onClick={clearChat}
          style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"3px 9px", fontFamily:F.mono, fontSize:9, color:C.gray, cursor:"pointer" }}
        >
          CLEAR
        </button>
      </div>

      {/* Messages */}
      <div style={{ height:340, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display:"flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div style={{
              maxWidth:"85%",
              background: msg.role === "user" ? `${C.lime}20` : C.surfaceAlt,
              border: `1px solid ${msg.role === "user" ? C.lime+"40" : C.border}`,
              borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              padding:"10px 12px",
            }}>
              <div style={{
                fontFamily:F.mono,
                fontSize:12,
                color: msg.role === "user" ? C.lime : C.grayLight,
                lineHeight:1.6,
                whiteSpace:"pre-wrap",
              }}>
                {msg.content}
              </div>
              <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray, marginTop:4, textAlign:msg.role==="user"?"right":"left" }}>
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:"14px 14px 14px 4px", padding:"10px 16px" }}>
              <div style={{ display:"flex", gap:4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.lime, opacity:0.6, animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 2 && (
        <div style={{ padding:"0 14px 10px" }}>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:6 }}>QUICK PROMPTS</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => setInput(p)}
                style={{ background:`${C.lime}10`, border:`1px solid ${C.lime}30`, borderRadius:20, padding:"4px 10px", fontFamily:F.mono, fontSize:9, color:C.lime, cursor:"pointer" }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ padding:"10px 14px 14px", borderTop:`1px solid ${C.border}`, display:"flex", gap:8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Tell your coach anything — deviations, injuries, questions..."
          style={{
            flex:1,
            background:"#1A1A22",
            border:`1px solid ${C.border}`,
            borderRadius:12,
            padding:"10px 14px",
            color:C.white,
            fontSize:13,
            fontFamily:F.mono,
            outline:"none",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            background: input.trim() && !loading ? C.lime : C.border,
            border:"none",
            borderRadius:12,
            width:44,
            height:44,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            cursor: input.trim() && !loading ? "pointer" : "default",
            flexShrink:0,
            fontSize:18,
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100%{opacity:0.3;transform:scale(0.8)}
          50%{opacity:1;transform:scale(1.1)}
        }
      `}</style>
    </div>
  );
}

// ── COACH Tab ─────────────────────────────────────────────────────
// ── Import Backup card (restore a downloaded backup JSON into this device) ──
function ImportBackupCard() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!window.confirm("Import this backup? It REPLACES the data currently on this device.")) {
      e.target.value = ""; return;
    }
    setBusy(true); setStatus("Reading file...");
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      setStatus("Writing data...");
      await importBackup(backup);
      setStatus("Imported — reloading...");
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setStatus("Import failed: " + ((err && err.message) || "unreadable file"));
      setBusy(false);
      e.target.value = "";
    }
  }
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.teal}40`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <div style={{ fontSize:18 }}>📤</div>
        <SL>Import Backup</SL>
      </div>
      <div style={{ fontFamily:F.mono, fontSize:9, color:C.grayLight, lineHeight:1.5, marginBottom:10 }}>
        Load a DIALLED IN backup .json (e.g. exported from the old artifact) onto this device. Replaces current data.
      </div>
      <label style={{ display:"block", width:"100%", boxSizing:"border-box", padding:"12px", borderRadius:10, textAlign:"center", fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1, background: busy ? "#1A1A22" : C.teal, color: busy ? C.gray : C.white, cursor: busy ? "default" : "pointer" }}>
        {busy ? "WORKING..." : "CHOOSE BACKUP FILE"}
        <input type="file" accept="application/json,.json" onChange={onFile} disabled={busy} style={{ display:"none" }} />
      </label>
      {status && <div style={{ fontFamily:F.mono, fontSize:10, color: status.indexOf("failed") >= 0 ? C.orange : C.lime, marginTop:10 }}>{status}</div>}
    </div>
  );
}

// ── API Key settings card (lives in COACH tab) ──
function ApiKeyCard() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(""); // "" | "ok" | "fail"
  const [testError, setTestError] = useState("");

  useEffect(() => {
    const k = getApiKey();
    setHasKey(!!k);
    setMaskedKey(k ? `${k.slice(0,7)}…${k.slice(-4)}` : "");
  }, []);

  function save() {
    setApiKey(key);
    const k = getApiKey();
    setHasKey(!!k);
    setMaskedKey(k ? `${k.slice(0,7)}…${k.slice(-4)}` : "");
    setKey("");
    setSaved(true);
    setTestResult(""); setTestError("");
    setTimeout(() => setSaved(false), 2500);
  }
  function clear() {
    setApiKey("");
    setHasKey(false);
    setMaskedKey("");
    setTestResult(""); setTestError("");
  }
  async function testKey() {
    if (!getApiKey()) return;
    setTesting(true); setTestResult(""); setTestError("");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (r.ok) { setTestResult("ok"); }
      else {
        const txt = await r.text().catch(() => "");
        setTestResult("fail");
        setTestError(`${r.status} ${(txt || r.statusText || "").slice(0, 120)}`);
      }
    } catch (e) {
      setTestResult("fail");
      setTestError((e && e.message) || "network error");
    }
    setTesting(false);
    setTimeout(() => { setTestResult(""); setTestError(""); }, 10000);
  }

  const canSave = !!key.trim();
  const onDevice = hasKey && !canSave && !saved;
  const btnBg = saved ? C.lime : onDevice ? "transparent" : (canSave ? C.teal : "#1A1A22");
  const btnColor = saved ? C.dark : onDevice ? C.lime : (canSave ? C.white : C.gray);
  const btnBorder = onDevice ? `1px solid ${C.lime}` : "none";
  const btnLabel = saved ? "✓ SAVED" : onDevice ? `✓ KEY ON DEVICE (${maskedKey})` : (hasKey ? "REPLACE KEY" : "SAVE KEY");

  return (
    <div style={{ background:C.surface, border:`1px solid ${hasKey ? C.lime+"40" : C.orange+"60"}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <div style={{ fontSize:18 }}>🔑</div>
        <SL>AI / API Key</SL>
      </div>
      <div style={{ fontFamily:F.mono, fontSize:10, color: hasKey ? C.lime : C.orange, marginBottom:10 }}>
        {hasKey ? "Key set — AI features active" : "No key set — meal scan & coach stay off until you add one"}
      </div>
      <input
        type="password"
        value={key}
        onChange={e => setKey(e.target.value)}
        placeholder={hasKey ? "paste a new key to replace" : "sk-ant-..."}
        style={{ width:"100%", boxSizing:"border-box", padding:"10px 12px", borderRadius:8, background:C.surfaceAlt, border:`1px solid ${C.border}`, color:C.white, fontFamily:F.mono, fontSize:12, marginBottom:10 }}
      />
      <div style={{ display:"flex", gap:8, marginBottom: hasKey ? 8 : 0 }}>
        <button onClick={save} disabled={!canSave} style={{ flex:1, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1, background: btnBg, color: btnColor, border: btnBorder, cursor: canSave?"pointer":"default" }}>
          {btnLabel}
        </button>
        {hasKey && (
          <button onClick={clear} style={{ padding:"10px 14px", borderRadius:8, fontFamily:F.mono, fontSize:11, letterSpacing:1, background:"transparent", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer" }}>
            CLEAR
          </button>
        )}
      </div>
      {hasKey && (
        <button onClick={testKey} disabled={testing} style={{ width:"100%", padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1, background: testResult==="ok" ? C.lime : testResult==="fail" ? C.orange : "transparent", color: testResult==="ok" ? C.dark : testResult==="fail" ? C.white : C.teal, border: testResult ? "none" : `1px solid ${C.teal}`, cursor: testing?"default":"pointer" }}>
          {testing ? "TESTING..." : testResult==="ok" ? "✓ KEY WORKS — AI READY" : testResult==="fail" ? "✗ KEY FAILED" : "TEST KEY (1 call, ~5 tokens)"}
        </button>
      )}
      {testError && (
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.orange, marginTop:6, lineHeight:1.4 }}>{testError}</div>
      )}
      <div style={{ fontFamily:F.mono, fontSize:9, color:C.grayLight, lineHeight:1.5, marginTop:10 }}>
        Your Anthropic API key is stored only on this device and sent directly to Anthropic. Get one at console.anthropic.com — usage is billed to your account.
      </div>
    </div>
  );
}

function CoachTab({ data, updateData, onAction }) {
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [expandedInsight, setExpandedInsight] = useState(null);

  const items = getCompletenessItems(data);
  const done = items.filter(i => i.done).length;
  const score = Math.round((done / items.length) * 100);
  const scoreColor = score >= 80 ? C.lime : score >= 50 ? C.amber : C.orange;

  useEffect(() => {
    async function loadCached() {
      try {
        const cached = await window.storage.get("ft:lastCoachAnalysis");
        if (cached) setLastAnalysis(JSON.parse(cached.value));
      } catch {}
    }
    loadCached();
  }, []);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      if (!getApiKey()) throw new Error("No API key set. Add yours in COACH → AI / API Key.");
      const prompt = buildCoachContext(data) + `\n\nProvide a comprehensive analysis of this athlete's current state. Return ONLY valid JSON (no markdown, no prose before or after the JSON):
{
  "overallStatus": "one sentence summary of where they are",
  "insights": [
    {
      "category": "Nutrition|Training|Recovery|Progress",
      "emoji": "🥩|💪|😴|📈",
      "title": "short title",
      "detail": "2-3 sentences of specific actionable advice using their actual numbers",
      "priority": "high|medium|low",
      "adjustment": "specific change to make or null"
    }
  ],
  "nextSessionFocus": "one specific thing to prioritize in the very next workout",
  "weeklyRating": 7
}`;
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers: aiHeaders(),
        body:JSON.stringify({
          model:"claude-haiku-4-5-20251001",
          max_tokens:2500,
          messages:[{ role:"user", content:prompt }],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`API ${resp.status}: ${(errText || resp.statusText || "").slice(0, 120)}`);
      }
      const d = await resp.json();
      const text = (d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("");
      if (!text) throw new Error("Empty response from API");
      // Robust JSON extraction: strip code fences, then carve from first { to last }
      let jsonStr = text.replace(/```json|```/g,"").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      let parsed;
      try { parsed = JSON.parse(jsonStr); }
      catch (pe) { throw new Error(`Parse error: ${(pe.message || "unknown").slice(0,60)} — raw start: ${jsonStr.slice(0,80)}`); }
      const withDate = { ...parsed, analyzedAt:getToday() };
      setAnalysis(withDate);
      setLastAnalysis(withDate);
      await window.storage.set("ft:lastCoachAnalysis", JSON.stringify(withDate));
    } catch (e) {
      setAnalysis({ error: `Analysis failed — ${(e && e.message) || "unknown"}`, insights:[] });
    }
    setAnalyzing(false);
  }

  const displayAnalysis = analysis || lastAnalysis;
  const priorityColor = (p) => p === "high" ? C.orange : p === "medium" ? C.amber : C.teal;

  return (
    <div style={{ padding:"18px 16px" }}>

      {/* Completeness Score */}
      <div style={{ background:C.surface, border:`1px solid ${scoreColor}40`, borderRadius:16, padding:16, marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
          <div>
            <SL>Data Completeness</SL>
            <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
              <div style={{ fontFamily:F.display, fontSize:48, color:scoreColor, lineHeight:1 }}>{score}</div>
              <div style={{ fontFamily:F.mono, fontSize:14, color:scoreColor }}>%</div>
            </div>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, marginTop:4 }}>{done}/{items.length} items complete</div>
          </div>
          <svg width={70} height={70} viewBox="0 0 70 70">
            <circle cx={35} cy={35} r={28} fill="none" stroke={C.border} strokeWidth={6}/>
            <circle cx={35} cy={35} r={28} fill="none" stroke={scoreColor} strokeWidth={6}
              strokeDasharray={`${2*Math.PI*28}`}
              strokeDashoffset={`${2*Math.PI*28*(1-score/100)}`}
              strokeLinecap="round" transform="rotate(-90 35 35)"
              style={{ transition:"stroke-dashoffset .8s ease" }}/>
            <text x={35} y={40} textAnchor="middle" fill={scoreColor} style={{ fontFamily:"monospace", fontSize:14, fontWeight:700 }}>{score}%</text>
          </svg>
        </div>
        {items.map((item, i) => (
          <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderTop:`1px solid ${C.border}` }}>
            <div style={{ width:20, height:20, borderRadius:6, border:`2px solid ${item.done?C.lime:C.border}`, background:item.done?`${C.lime}20`:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {item.done && <Check size={11} color={C.lime}/>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:item.done?C.gray:C.white, textDecoration:item.done?"line-through":"none" }}>{item.label}</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:1 }}>{item.hint}</div>
            </div>
            {!item.done && (
              <button onClick={() => onAction(item.action)}
                style={{ background:`${priorityColor(item.priority)}18`, border:`1px solid ${priorityColor(item.priority)}50`, borderRadius:6, padding:"3px 8px", fontFamily:F.mono, fontSize:9, color:priorityColor(item.priority), cursor:"pointer" }}>
                FIX
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Next Session Prescriptions */}
      <NextSessionPrescriptions data={data} />

      {/* AI Analysis */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div>
            <SL>🧠 Snapshot Analysis</SL>
            {displayAnalysis?.analyzedAt && (
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:-8, marginBottom:4 }}>Last: {displayAnalysis.analyzedAt}</div>
            )}
          </div>
          <button onClick={runAnalysis} disabled={analyzing}
            style={{ background:analyzing?C.border:C.lime, border:"none", borderRadius:10, padding:"8px 14px", fontFamily:F.display, fontSize:14, color:analyzing?C.gray:C.dark, cursor:analyzing?"wait":"pointer" }}>
            {analyzing ? "ANALYZING..." : "ANALYZE NOW"}
          </button>
        </div>

        {analyzing && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>Reading your sessions, meals, and progress...</div>
          </div>
        )}

        {!analyzing && displayAnalysis && !displayAnalysis.error && (
          <div>
            <div style={{ background:"#0A1100", border:`1px solid ${C.lime}30`, borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.6, flex:1 }}>{displayAnalysis.overallStatus}</div>
                {displayAnalysis.weeklyRating && (
                  <div style={{ textAlign:"center", marginLeft:12, flexShrink:0 }}>
                    <div style={{ fontFamily:F.display, fontSize:28, color:displayAnalysis.weeklyRating>=8?C.lime:displayAnalysis.weeklyRating>=6?C.amber:C.orange }}>{displayAnalysis.weeklyRating}</div>
                    <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>/ 10</div>
                  </div>
                )}
              </div>
            </div>
            {displayAnalysis.nextSessionFocus && (
              <div style={{ background:`${C.teal}10`, border:`1px solid ${C.teal}30`, borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
                <div style={{ fontFamily:F.mono, fontSize:9, color:C.teal, marginBottom:4, letterSpacing:1 }}>NEXT SESSION FOCUS</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.white }}>{displayAnalysis.nextSessionFocus}</div>
              </div>
            )}
            {(displayAnalysis.insights||[]).map((insight, i) => (
              <div key={i} style={{ background:C.surfaceAlt, border:`1px solid ${priorityColor(insight.priority)}30`, borderRadius:12, padding:"12px 14px", marginBottom:8 }}>
                <div onClick={() => setExpandedInsight(expandedInsight===i?null:i)} style={{ cursor:"pointer" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:16 }}>{insight.emoji}</span>
                        <div style={{ fontFamily:F.mono, fontSize:9, color:priorityColor(insight.priority), textTransform:"uppercase", letterSpacing:1 }}>{insight.category}</div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{insight.title}</div>
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:9, color:priorityColor(insight.priority), background:`${priorityColor(insight.priority)}18`, borderRadius:5, padding:"2px 7px", flexShrink:0 }}>
                      {insight.priority}
                    </div>
                  </div>
                </div>
                {expandedInsight === i && (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.7, marginBottom:insight.adjustment?10:0 }}>{insight.detail}</div>
                    {insight.adjustment && (
                      <div style={{ background:`${C.lime}10`, border:`1px solid ${C.lime}30`, borderRadius:8, padding:"6px 10px" }}>
                        <div style={{ fontFamily:F.mono, fontSize:9, color:C.lime, marginBottom:2 }}>RECOMMENDED ADJUSTMENT</div>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:C.white }}>{insight.adjustment}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!analyzing && !displayAnalysis && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>Tap "Analyze Now" for a full coaching snapshot</div>
          </div>
        )}
        {!analyzing && displayAnalysis?.error && (
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, padding:"12px 0" }}>{displayAnalysis.error}</div>
        )}
      </div>

      {/* Backup & Restore */}
      <ApiKeyCard />
      <BackupCard />
      <ImportBackupCard />

      {/* Export to Claude */}
      <ExportToClaudeCard data={data} />

      {/* Persistent Chat */}
      <CoachChat data={data} />

    </div>
  );
}

// ── Backup & Restore Card ────────────────────────────────────────
function BackupCard() {
  const [snapshots, setSnapshots] = useState([]);
  const [lastDownload, setLastDownload] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadOk, setDownloadOk] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);

  async function refresh() {
    const idx = await getSnapshotIndex();
    setSnapshots(idx);
    const last = await getLastBackupInfo();
    setLastDownload(last);
  }

  useEffect(() => { refresh(); }, []);

  async function handleDownload() {
    setDownloading(true);
    setDownloadOk(false);
    try {
      const ok = await downloadBackup();
      setDownloadOk(ok);
      await refresh();
      if (ok) setTimeout(() => setDownloadOk(false), 3000);
    } catch (e) {
      alert("Backup failed: " + (e.message || "unknown error"));
    }
    setDownloading(false);
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreFromSnapshot(restoreTarget);
      // Force reload so the app re-reads from storage
      window.location.reload();
    } catch (e) {
      alert("Restore failed: " + (e.message || "unknown error"));
      setRestoring(false);
      setRestoreTarget(null);
    }
  }

  const lastDownloadAge = lastDownload ? daysSince(lastDownload.ts) : null;
  const isStale = lastDownloadAge === null || lastDownloadAge >= BACKUP_NAG_DAYS;

  return (
    <div style={{ background:C.surface, border:`1px solid ${isStale ? C.orange+"60" : C.lime+"40"}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:18 }}>💾</div>
          <SL>Backup & Restore</SL>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>auto-saves daily</div>
      </div>

      {/* Last backup status */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", background:C.surfaceAlt, borderRadius:8, marginBottom:10 }}>
        <div>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:1 }}>LAST DOWNLOAD</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color: isStale ? C.orange : C.lime, marginTop:2 }}>
            {!lastDownload ? "Never" :
              lastDownloadAge === 0 ? "Today" :
              lastDownloadAge === 1 ? "Yesterday" :
              `${lastDownloadAge} days ago`}
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:1 }}>SNAPSHOTS</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal, marginTop:2 }}>{snapshots.length} saved</div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        style={{
          width:"100%", padding:"12px", borderRadius:10,
          fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1,
          background: downloadOk ? C.lime : downloading ? "#1A1A22" : (isStale ? C.orange : C.teal),
          color: downloadOk ? C.dark : downloading ? C.gray : C.white,
          border:"none", cursor: downloading ? "default" : "pointer",
          marginBottom:10,
        }}
      >
        {downloadOk ? "✓ DOWNLOADED" : downloading ? "⏳ PREPARING..." : "📥 DOWNLOAD BACKUP NOW"}
      </button>

      <div style={{ fontFamily:F.mono, fontSize:9, color:C.grayLight, lineHeight:1.5, marginBottom:10 }}>
        Saves a JSON file (everything: profile, meals, weights, workouts, PRs, measurements, photos) to your phone's Downloads folder. Save it to Drive/Files for off-device safety.
      </div>

      {/* Snapshots toggle */}
      <button
        onClick={() => setShowSnapshots(!showSnapshots)}
        style={{
          width:"100%", padding:"10px", borderRadius:8,
          fontFamily:F.mono, fontSize:10, letterSpacing:1,
          background:"transparent", border:`1px solid ${C.border}`,
          color:C.gray, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center",
        }}
      >
        <span>⏮ RESTORE FROM SNAPSHOT ({snapshots.length})</span>
        <ChevronRight size={14} style={{ transform: showSnapshots ? "rotate(90deg)" : "none", transition:"transform 0.2s" }} />
      </button>

      {showSnapshots && (
        <div style={{ marginTop:10, padding:10, background:C.surfaceAlt, borderRadius:10 }}>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:8, lineHeight:1.5 }}>
            Tap a snapshot to roll back your data to that day. Photos are not affected.
          </div>
          {snapshots.length === 0 ? (
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray, textAlign:"center", padding:"12px 0" }}>No snapshots yet</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {snapshots.map((s, i) => {
                const age = daysSince(s.ts);
                const ageLabel = age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age}d ago`;
                const isLatest = i === 0;
                return (
                  <button
                    key={s.date}
                    onClick={() => setRestoreTarget(s.date)}
                    disabled={isLatest}
                    style={{
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                      padding:"8px 12px", borderRadius:6,
                      background: isLatest ? C.surface : "#1A1A22",
                      border:`1px solid ${C.border}`,
                      fontFamily:F.mono, fontSize:10,
                      cursor: isLatest ? "default" : "pointer",
                      color: isLatest ? C.gray : C.white,
                    }}
                  >
                    <span>{s.date} <span style={{ color:C.gray }}>· {ageLabel}</span></span>
                    <span style={{ color: isLatest ? C.gray : C.teal, fontSize:9, letterSpacing:1 }}>
                      {isLatest ? "CURRENT" : "RESTORE →"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Restore confirmation modal */}
      {restoreTarget && (
        <div onClick={() => !restoring && setRestoreTarget(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.orange}`, borderRadius:14, padding:18, maxWidth:380, width:"100%" }}>
            <div style={{ fontFamily:F.display, fontSize:22, color:C.orange, marginBottom:8, letterSpacing:2 }}>RESTORE CONFIRM</div>
            <div style={{ fontFamily:F.body, fontSize:13, color:C.white, lineHeight:1.5, marginBottom:14 }}>
              This will replace your current data with the snapshot from <span style={{ color:C.orange, fontWeight:600 }}>{restoreTarget}</span>.
            </div>
            <div style={{ fontFamily:F.mono, fontSize:10, color:C.grayLight, lineHeight:1.5, marginBottom:14, padding:"8px 10px", background:"#1A1A22", borderRadius:6 }}>
              Replaces: meals, weights, workouts, PRs, measurements, sleep, profile.<br/>
              Keeps: photos, chat history, snapshots.<br/>
              The app will reload after restore.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setRestoreTarget(null)} disabled={restoring}
                style={{ flex:1, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer", letterSpacing:1 }}>
                CANCEL
              </button>
              <button onClick={handleRestore} disabled={restoring}
                style={{ flex:2, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:C.orange, border:"none", color:C.white, cursor:"pointer", fontWeight:700, letterSpacing:1 }}>
                {restoring ? "⏳ RESTORING..." : "RESTORE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export to Claude Card ────────────────────────────────────────
function ExportToClaudeCard({ data }) {
  const [range, setRange] = useState("7"); // "1" | "7" | "30" | "all"
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [photoCounts, setPhotoCounts] = useState({ progress: 0, goal: 0 });

  // Get photo counts from index keys (we don't load actual images for export)
  useEffect(() => {
    async function loadCounts() {
      try {
        const p = JSON.parse((await window.storage.get("ft:photoProgressIndex")).value);
        const g = JSON.parse((await window.storage.get("ft:photoGoalIndex")).value);
        setPhotoCounts({ progress: p?.length || 0, goal: g?.length || 0 });
      } catch {
        setPhotoCounts({ progress: 0, goal: 0 });
      }
    }
    loadCounts();
  }, []);

  async function loadPhotoMetadata() {
    // Returns light metadata only (no image data) for export
    try {
      const idx = JSON.parse((await window.storage.get("ft:photoProgressIndex")).value);
      const photos = await Promise.all((idx || []).map(async meta => {
        try {
          const r = await window.storage.get(`ft:photo:progress:${meta.id}`);
          const p = JSON.parse(r.value);
          return { date: p.date, caption: p.caption, weight: p.weight, bodyFat: p.bodyFat };
        } catch { return null; }
      }));
      return photos.filter(Boolean);
    } catch { return []; }
  }

  function inRange(dateStr) {
    if (range === "all") return true;
    const days = parseInt(range);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    return new Date(dateStr) >= cutoff;
  }

  async function generate() {
    const photos = await loadPhotoMetadata();
    const photosInRange = photos.filter(p => inRange(p.date));
    const out = buildExportText(data, range, photosInRange, photoCounts);
    setOutput(out);
    setCopied(false);
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select-all-able textarea is below, user can copy manually
    }
  }

  const rangeOptions = [
    { id:"1", label:"TODAY", days:"24h" },
    { id:"7", label:"7 DAYS", days:"week" },
    { id:"30", label:"30 DAYS", days:"month" },
    { id:"all", label:"ALL TIME", days:"all" },
  ];

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.purple}40`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <div style={{ fontSize:18 }}>📋</div>
        <SL>Export to Claude</SL>
      </div>
      <div style={{ fontFamily:F.mono, fontSize:10, color:C.grayLight, lineHeight:1.5, marginBottom:12 }}>
        Generate a text snapshot of your data to paste into chat with Claude for coaching review. Photos are referenced by date/caption only (images stay in the app).
      </div>

      {/* Range picker */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:6, marginBottom:12 }}>
        {rangeOptions.map(opt => (
          <button
            key={opt.id}
            onClick={() => { setRange(opt.id); setOutput(""); }}
            style={{
              padding:"8px 4px", borderRadius:8,
              fontFamily:F.mono, fontSize:9, letterSpacing:0.5,
              background: range === opt.id ? C.purple : "#1A1A22",
              border: `1px solid ${range === opt.id ? C.purple : C.border}`,
              color: range === opt.id ? C.white : C.gray,
              cursor: "pointer", fontWeight:600,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!output ? (
        <button
          onClick={generate}
          style={{ width:"100%", padding:"12px", borderRadius:10, fontFamily:F.mono, fontSize:11, background:C.purple, border:"none", color:C.white, cursor:"pointer", fontWeight:700, letterSpacing:1 }}
        >
          GENERATE EXPORT
        </button>
      ) : (
        <>
          <textarea
            value={output}
            readOnly
            rows={10}
            onClick={(e) => e.target.select()}
            style={{ width:"100%", boxSizing:"border-box", padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:10, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.grayLight, resize:"vertical", marginBottom:8, lineHeight:1.5 }}
          />
          <div style={{ display:"flex", gap:8 }}>
            <button
              onClick={() => setOutput("")}
              style={{ flex:1, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:10, background:C.surface, border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer" }}
            >
              REGENERATE
            </button>
            <button
              onClick={copyToClipboard}
              style={{ flex:2, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background: copied ? C.lime : C.purple, border:"none", color: copied ? C.dark : C.white, cursor:"pointer", fontWeight:700, letterSpacing:1 }}
            >
              {copied ? "✓ COPIED" : "📋 COPY ALL"}
            </button>
          </div>
          <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:8, textAlign:"center" }}>
            {output.length.toLocaleString()} chars · paste into Claude chat
          </div>
        </>
      )}
    </div>
  );
}

// ── Build the export text content ───────────────────────────────
function buildExportText(data, range, photos, photoCounts) {
  const today = getToday();
  const rangeLabel = range === "1" ? "Last 24 hours" : range === "7" ? "Last 7 days" : range === "30" ? "Last 30 days" : "All time";

  const inRange = (dateStr) => {
    if (range === "all") return true;
    const days = parseInt(range);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    return new Date(dateStr) >= cutoff;
  };

  const currentW = [...data.weightLog].filter(w=>w.weight).pop();
  const latestM = data.measurements?.length ? data.measurements[data.measurements.length-1] : null;

  // Filter data by range
  const meals = Object.entries(data.meals)
    .filter(([d]) => inRange(d))
    .sort((a,b) => b[0].localeCompare(a[0]));
  const workouts = data.workouts.filter(w => inRange(w.date));
  const weightEntries = data.weightLog.filter(w => inRange(w.date));
  const prs = data.prs.filter(p => inRange(p.date));
  const measurements = (data.measurements || []).filter(m => inRange(m.date));

  let out = "";
  out += `========================================\n`;
  out += `DIALLED IN — DATA EXPORT\n`;
  out += `Generated: ${today}\n`;
  out += `Range: ${rangeLabel}\n`;
  out += `========================================\n\n`;

  // Profile
  out += `PROFILE\n`;
  out += `- 6'1", 34M, lean bulk goal: 185-195 lbs @ 8-10% BF\n`;
  out += `- Current weight: ${currentW ? `${currentW.weight} lbs (${currentW.date})` : "no weigh-in logged"}\n`;
  if (latestM) {
    const m = Object.entries(latestM).filter(([k,v]) => v && k!=="date" && k!=="note").map(([k,v]) => `${k}=${v}`).join(", ");
    out += `- Latest measurements (${latestM.date}): ${m || "none"}\n`;
  }
  out += `- Calorie target: ${data.profile.calorieTarget.training} kcal training / ${data.profile.calorieTarget.rest} kcal rest\n`;
  out += `- Protein target: ${data.profile.proteinTarget}g\n`;
  out += `- Training: 4x/week Upper/Lower (Mon Upper A, Tue Lower A, Thu Upper B, Fri Lower B)\n\n`;

  // Workouts
  out += `WORKOUTS (${workouts.length} sessions in range)\n`;
  if (workouts.length === 0) {
    out += `- (none)\n`;
  } else {
    workouts.forEach(w => {
      out += `\n[${w.date}] ${w.name} · ${w.duration || "?"}min · ${w.sets || 0} sets · ${(w.volume/1000).toFixed(1)}k lbs vol · ${w.prs || 0} PRs\n`;
      if (w.note) out += `  note: ${w.note}\n`;
      if (w.exercises?.length) {
        w.exercises.forEach(ex => {
          const sets = Array.isArray(ex.sets) ? ex.sets.map(s => `${s.weight}x${s.reps}${s.pr ? "★" : ""}`).join(", ") : ex.sets;
          out += `  - ${ex.name}: ${sets}\n`;
        });
      }
    });
  }
  out += `\n`;

  // Nutrition
  out += `NUTRITION (${meals.length} days logged in range)\n`;
  if (meals.length === 0) {
    out += `- (none)\n`;
  } else {
    meals.forEach(([date, m]) => {
      out += `[${date}] ${m.calories} kcal · ${m.protein}g P · ${m.carbs}g C · ${m.fat}g F`;
      if (m.items?.length) out += ` | ${m.items.join(", ")}`;
      out += `\n`;
    });
  }
  out += `\n`;

  // Weight & Sleep
  out += `WEIGHT & SLEEP LOG (${weightEntries.length} entries)\n`;
  if (weightEntries.length === 0) {
    out += `- (none)\n`;
  } else {
    weightEntries.forEach(w => {
      out += `[${w.date}] ${w.weight ? w.weight+" lbs" : "no weigh-in"}${w.sleep ? ` · ${w.sleep}h sleep` : ""}${w.note ? ` · ${w.note}` : ""}\n`;
    });
  }
  out += `\n`;

  // PRs
  out += `PRs IN RANGE (${prs.length})\n`;
  if (prs.length === 0) {
    out += `- (none)\n`;
  } else {
    prs.forEach(p => {
      out += `- ${p.date}: ${p.exercise} — ${p.weight} lbs × ${p.reps} reps\n`;
    });
  }
  out += `\n`;

  // ALL-TIME PRs (for context, even if filtering by range)
  if (range !== "all" && data.prs.length > 0) {
    out += `ALL-TIME PRs (for context)\n`;
    data.prs.forEach(p => {
      out += `- ${p.exercise}: ${p.weight} lbs × ${p.reps} reps (${p.date})\n`;
    });
    out += `\n`;
  }

  // Measurements
  out += `BODY MEASUREMENTS (${measurements.length} in range)\n`;
  if (measurements.length === 0) {
    out += `- (none)\n`;
  } else {
    measurements.forEach(m => {
      const fields = Object.entries(m).filter(([k,v]) => v && k!=="date" && k!=="note").map(([k,v]) => `${k}=${v}`).join(", ");
      out += `[${m.date}] ${fields}${m.note ? ` | ${m.note}` : ""}\n`;
    });
  }
  out += `\n`;

  // Photos
  out += `PHOTOS\n`;
  out += `- Total in app: ${photoCounts.progress} progress, ${photoCounts.goal} goal\n`;
  if (photos.length > 0) {
    out += `- Progress photos in range:\n`;
    photos.forEach(p => {
      const tags = [];
      if (p.weight) tags.push(`${p.weight}lb`);
      if (p.bodyFat) tags.push(`${p.bodyFat}% BF`);
      out += `  [${p.date}] ${tags.join(" · ") || "no stats"}${p.caption ? ` — "${p.caption}"` : ""}\n`;
    });
  }
  out += `\n`;

  out += `========================================\n`;
  out += `End of export. Paste into Claude chat for coaching review.\n`;
  out += `========================================\n`;

  return out;
}

// ── Vision Board (added to GAINS Tab) ─────────────────────────────
function VisionBoard({ data }) {
  const currentW = [...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8;
  const goalW = 190; // midpoint of 185-195
  const startW = 175.8;
  const weightProgress = Math.max(0, Math.min(1, (currentW - startW) / (goalW - startW)));

  const latestM = data.measurements?.length ? data.measurements[data.measurements.length-1] : null;
  const currentBF = latestM?.bodyFat || 16;
  const goalBF = 9;
  const bfProgress = Math.max(0, Math.min(1, (currentBF - goalBF) / (16 - goalBF)));

  // Key lift progress toward Phase 4 targets
  const liftTargets = [
    { name:"Incline Bench", current:110, goal:180, pr:data.prs.find(p=>p.exercise.includes("Incline"))?.weight||110 },
    { name:"Squat", current:205, goal:315, pr:data.prs.find(p=>p.exercise.includes("Squat"))?.weight||205 },
    { name:"RDL", current:315, goal:425, pr:data.prs.find(p=>p.exercise.includes("RDL"))?.weight||315 },
    { name:"Shoulder Press", current:55, goal:100, pr:data.prs.find(p=>p.exercise.includes("Shoulder"))?.weight||55 },
  ];

  // Milestone definitions for silhouette fill
  const milestones = [
    { label:"Started the journey", done:true },
    { label:"Weight ≥ 178 lbs", done:currentW >= 178 },
    { label:"Incline bench > 125 lbs", done:(data.prs.find(p=>p.exercise.includes("Incline"))?.weight||0) > 125 },
    { label:"Weight ≥ 182 lbs", done:currentW >= 182 },
    { label:"Squat ≥ 225 lbs", done:(data.prs.find(p=>p.exercise.includes("Squat"))?.weight||0) >= 225 },
    { label:"Weight ≥ 185 lbs", done:currentW >= 185 },
    { label:"Body fat < 14%", done:currentBF < 14 },
    { label:"Goal physique achieved", done:currentW >= 185 && currentBF <= 10 },
  ];
  const milestonePct = milestones.filter(m=>m.done).length / milestones.length;

  // Simple body silhouette SVG that fills based on milestones
  const fillHeight = Math.round(200 * milestonePct);

  return (
    <div>
      {/* NOW vs GOAL cards */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
        <SL>📊 NOW vs GOAL</SL>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          {/* NOW */}
          <div style={{ background:C.surfaceAlt, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:8, letterSpacing:1 }}>NOW</div>
            {[
              { label:"Weight", val:`${currentW} lbs`, color:C.white },
              { label:"Est. BF%", val:`~${currentBF}%`, color:C.orange },
              { label:"Bench PR", val:`${data.prs.find(p=>p.exercise.includes("Incline"))?.weight||110} lbs`, color:C.white },
              { label:"Squat PR", val:`${data.prs.find(p=>p.exercise.includes("Squat"))?.weight||205} lbs`, color:C.white },
              { label:"RDL PR", val:`${data.prs.find(p=>p.exercise.includes("RDL"))?.weight||315} lbs`, color:C.white },
            ].map((item, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray }}>{item.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:10, color:item.color, fontWeight:600 }}>{item.val}</div>
              </div>
            ))}
          </div>
          {/* GOAL */}
          <div style={{ background:"#0A1100", border:`1px solid ${C.lime}30`, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontFamily:F.mono, fontSize:9, color:C.lime, marginBottom:8, letterSpacing:1 }}>GOAL 🏆</div>
            {[
              { label:"Weight", val:"185-195 lbs", color:C.lime },
              { label:"BF%", val:"8-10%", color:C.lime },
              { label:"Bench", val:"175-185 lbs", color:C.lime },
              { label:"Squat", val:"315 lbs", color:C.lime },
              { label:"RDL", val:"425+ lbs", color:C.lime },
            ].map((item, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontFamily:F.mono, fontSize:10, color:C.gray }}>{item.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:10, color:item.color, fontWeight:600 }}>{item.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Progress rings + silhouette */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
        <SL>Progress Rings</SL>
        <div style={{ display:"flex", justifyContent:"space-around", alignItems:"center", marginBottom:16 }}>
          {[
            { label:"Weight", pct:weightProgress, color:C.lime, sub:`${currentW} → ${goalW}` },
            { label:"Body Fat", pct:1-bfProgress, color:C.teal, sub:`${currentBF}% → 9%` },
            { label:"Milestones", pct:milestonePct, color:C.purple, sub:`${milestones.filter(m=>m.done).length}/${milestones.length}` },
          ].map(ring => {
            const r = 32, circ = 2*Math.PI*r;
            return (
              <div key={ring.label} style={{ textAlign:"center" }}>
                <svg width={80} height={80} viewBox="0 0 80 80">
                  <circle cx={40} cy={40} r={r} fill="none" stroke={C.border} strokeWidth={7}/>
                  <circle cx={40} cy={40} r={r} fill="none" stroke={ring.color} strokeWidth={7}
                    strokeDasharray={circ}
                    strokeDashoffset={circ*(1-ring.pct)}
                    strokeLinecap="round"
                    transform="rotate(-90 40 40)"
                    style={{ transition:"stroke-dashoffset 1s ease" }}/>
                  <text x={40} y={36} textAnchor="middle" fill={ring.color} style={{ fontFamily:"monospace", fontSize:11, fontWeight:700 }}>
                    {Math.round(ring.pct*100)}%
                  </text>
                  <text x={40} y={50} textAnchor="middle" fill={C.gray} style={{ fontFamily:"monospace", fontSize:8 }}>
                    {ring.label}
                  </text>
                </svg>
                <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginTop:2 }}>{ring.sub}</div>
              </div>
            );
          })}
        </div>

        {/* Lift progress bars */}
        <SL>Strength Progress</SL>
        {liftTargets.map(lift => {
          const pct = Math.min((lift.pr - lift.current) / (lift.goal - lift.current) + (lift.current - lift.current)/(lift.goal - lift.current) + (lift.pr - lift.current)/(lift.goal - lift.current), 1);
          const barPct = Math.max(0, Math.min(1, (lift.pr - 100) / (lift.goal - 100)));
          return (
            <div key={lift.name} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontFamily:F.mono, fontSize:10, marginBottom:4 }}>
                <span style={{ color:C.white }}>{lift.name}</span>
                <span style={{ color:C.lime }}>{lift.pr} lbs <span style={{ color:C.gray }}>/ {lift.goal} goal</span></span>
              </div>
              <div style={{ height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${barPct*100}%`, background:`linear-gradient(90deg, ${C.teal}, ${C.lime})`, borderRadius:3, transition:"width 1s ease" }}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Milestone tracker with silhouette */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
        <SL>Milestone Tracker</SL>
        <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
          {/* Body silhouette SVG — V-taper athletic figure */}
          <div style={{ flexShrink:0 }}>
            <svg width={70} height={210} viewBox="0 0 70 210" style={{ filter:`drop-shadow(0 0 8px ${C.lime}40)` }}>
              <defs>
                {/* Clip path = the body shape (head + neck + torso + arms + legs) */}
                <clipPath id="bodyClip">
                  <circle cx={35} cy={18} r={11}/>
                  <rect x={31} y={27} width={8} height={6}/>
                  <path d="M 16 35 L 54 35 L 50 102 L 20 102 Z"/>
                  <rect x={5} y={37} width={11} height={64} rx={5}/>
                  <rect x={54} y={37} width={11} height={64} rx={5}/>
                  <path d="M 21 100 L 33 100 L 33 196 Q 33 198 31 198 L 23 198 Q 21 198 21 196 Z"/>
                  <path d="M 37 100 L 49 100 L 49 196 Q 49 198 47 198 L 39 198 Q 37 198 37 196 Z"/>
                </clipPath>
              </defs>
              {/* Resting body (unfilled state) */}
              <g fill={C.borderHi}>
                <circle cx={35} cy={18} r={11}/>
                <rect x={31} y={27} width={8} height={6}/>
                <path d="M 16 35 L 54 35 L 50 102 L 20 102 Z"/>
                <rect x={5} y={37} width={11} height={64} rx={5}/>
                <rect x={54} y={37} width={11} height={64} rx={5}/>
                <path d="M 21 100 L 33 100 L 33 196 Q 33 198 31 198 L 23 198 Q 21 198 21 196 Z"/>
                <path d="M 37 100 L 49 100 L 49 196 Q 49 198 47 198 L 39 198 Q 37 198 37 196 Z"/>
              </g>
              {/* Achievement fill — fills from feet up as milestones complete */}
              <rect x={0} y={200 - fillHeight} width={70} height={fillHeight} fill={C.lime} opacity={0.55} clipPath="url(#bodyClip)" style={{ transition:"y 1s ease, height 1s ease" }}/>
              {/* Subtle highlight outline once you're past halfway */}
              {milestonePct > 0.5 && (
                <g fill="none" stroke={C.lime} strokeWidth={0.8} opacity={0.7}>
                  <circle cx={35} cy={18} r={11}/>
                  <path d="M 16 35 L 54 35 L 50 102 L 20 102 Z"/>
                  <rect x={5} y={37} width={11} height={64} rx={5}/>
                  <rect x={54} y={37} width={11} height={64} rx={5}/>
                  <path d="M 21 100 L 33 100 L 33 196 Q 33 198 31 198 L 23 198 Q 21 198 21 196 Z"/>
                  <path d="M 37 100 L 49 100 L 49 196 Q 49 198 47 198 L 39 198 Q 37 198 37 196 Z"/>
                </g>
              )}
              <text x={35} y={208} textAnchor="middle" fill={C.lime} style={{ fontFamily:"monospace", fontSize:9, fontWeight:700 }}>{Math.round(milestonePct*100)}%</text>
            </svg>
          </div>
          {/* Milestone list */}
          <div style={{ flex:1 }}>
            {milestones.map((m, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${m.done?C.lime:C.border}`, background:m.done?C.lime:"transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {m.done && <Check size={9} color={C.dark}/>}
                </div>
                <div style={{ fontFamily:F.mono, fontSize:10, color:m.done?C.lime:C.gray }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Photo Comparison */}
      <PhotoComparison data={data} />
    </div>
  );
}

// ── Photo Comparison Component (gallery + timeline) ──────────────
function PhotoComparison({ data }) {
  const [progressPhotos, setProgressPhotos] = useState([]);
  const [goalPhotos, setGoalPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null); // 'progress' | 'goal' | null
  const [viewer, setViewer] = useState(null); // { photo, type } | null
  const [error, setError] = useState("");

  // Load photos via index keys
  useEffect(() => {
    async function load() {
      try {
        let progressIdx = [];
        let goalIdx = [];
        try { progressIdx = JSON.parse((await window.storage.get("ft:photoProgressIndex")).value); } catch {}
        try { goalIdx = JSON.parse((await window.storage.get("ft:photoGoalIndex")).value); } catch {}

        const progress = await Promise.all(progressIdx.map(async meta => {
          try {
            const r = await window.storage.get(`ft:photo:progress:${meta.id}`);
            return JSON.parse(r.value);
          } catch { return null; }
        }));
        const goals = await Promise.all(goalIdx.map(async meta => {
          try {
            const r = await window.storage.get(`ft:photo:goal:${meta.id}`);
            return JSON.parse(r.value);
          } catch { return null; }
        }));

        setProgressPhotos(progress.filter(Boolean));
        setGoalPhotos(goals.filter(Boolean));
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  async function handleUpload(files, type) {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    setError("");
    let successes = 0;
    const failures = [];

    // Per-photo try/catch — one failure should NOT kill the whole batch
    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      if (!file) continue;

      // Update progress label: "uploading" for single, "uploading 2 of 5" for batch
      setUploading(fileArr.length > 1 ? `${type}:${i + 1}/${fileArr.length}` : type);

      try {
        // Slightly more aggressive compression for batches to keep storage stable
        const maxDim = fileArr.length > 3 ? 900 : 1000;
        const quality = fileArr.length > 3 ? 0.8 : 0.85;
        const src = await processImageFile(file, maxDim, quality);

        // Stagger IDs by index to guarantee uniqueness even within the same millisecond
        const id = `${Date.now()}_${i}_${Math.random().toString(36).slice(2,6)}`;
        const today = getToday();
        const latestW = type === "progress" ? ([...data.weightLog].filter(w=>w.weight).pop()?.weight || null) : null;
        const latestM = type === "progress" && data.measurements?.length ? data.measurements[data.measurements.length-1] : null;
        const latestBF = latestM?.bodyFat || null;

        const photoData = { id, date: today, src, caption: "", weight: latestW, bodyFat: latestBF };

        // Save individual photo first
        await window.storage.set(`ft:photo:${type}:${id}`, JSON.stringify(photoData));

        // Update index (newest first) — re-read each iteration so concurrent saves stay consistent
        const indexKey = type === "progress" ? "ft:photoProgressIndex" : "ft:photoGoalIndex";
        let idx = [];
        try { idx = JSON.parse((await window.storage.get(indexKey)).value); } catch {}
        idx.unshift({ id, date: today });
        await window.storage.set(indexKey, JSON.stringify(idx));

        // Update state immediately so user sees progress
        if (type === "progress") setProgressPhotos(prev => [photoData, ...prev]);
        else setGoalPhotos(prev => [photoData, ...prev]);
        successes++;

        // Tiny breath between uploads — gives storage a moment so we don't hammer rate limits on big batches
        if (fileArr.length > 1 && i < fileArr.length - 1) {
          await new Promise(r => setTimeout(r, 150));
        }
      } catch (e) {
        console.error(`Photo ${i + 1} of ${fileArr.length} failed:`, e);
        failures.push({ index: i + 1, name: file.name || `photo ${i + 1}`, reason: e?.message || "unknown" });
      }
    }

    // Surface what happened
    if (failures.length === 0 && successes > 0) {
      // Clean success — no error to show. Brief flash via setError? Keep it silent for clean UX.
      setError("");
    } else if (successes > 0 && failures.length > 0) {
      // Partial success
      setError(`${successes} uploaded, ${failures.length} failed. Failed photos may be too large or in an unsupported format — try one at a time.`);
    } else {
      // All failed
      setError(`Upload failed for all ${failures.length} photo${failures.length === 1 ? "" : "s"}. Try smaller images or one at a time.`);
    }
    setUploading(null);
  }

  async function deletePhoto(id, type) {
    try { await window.storage.delete(`ft:photo:${type}:${id}`); } catch {}
    const indexKey = type === "progress" ? "ft:photoProgressIndex" : "ft:photoGoalIndex";
    let idx = [];
    try { idx = JSON.parse((await window.storage.get(indexKey)).value); } catch {}
    idx = idx.filter(p => p.id !== id);
    await window.storage.set(indexKey, JSON.stringify(idx));

    if (type === "progress") setProgressPhotos(prev => prev.filter(p => p.id !== id));
    else setGoalPhotos(prev => prev.filter(p => p.id !== id));
    setViewer(null);
  }

  async function updatePhoto(id, type, patch) {
    const arr = type === "progress" ? progressPhotos : goalPhotos;
    const photo = arr.find(p => p.id === id);
    if (!photo) return;
    const updated = { ...photo, ...patch };
    await window.storage.set(`ft:photo:${type}:${id}`, JSON.stringify(updated));
    if (type === "progress") setProgressPhotos(prev => prev.map(p => p.id === id ? updated : p));
    else setGoalPhotos(prev => prev.map(p => p.id === id ? updated : p));
    if (viewer?.photo?.id === id) setViewer({ ...viewer, photo: updated });
  }

  if (loading) return null;

  const primaryNow = progressPhotos[0];
  const primaryGoal = goalPhotos[0];

  // ── Sub: primary slot (top side-by-side) ──
  const PrimarySlot = ({ label, photo, color, inputId, isUploading, uploadProgress, hint }) => (
    <div>
      <div style={{ fontFamily:F.mono, fontSize:9, color, marginBottom:6, letterSpacing:1 }}>{label}</div>
      <label htmlFor={inputId} style={{ display:"block", cursor:"pointer" }}>
        <div
          style={{
            height:180, borderRadius:12,
            border:`2px dashed ${photo ? color : C.border}`,
            background:C.surfaceAlt,
            display:"flex", alignItems:"center", justifyContent:"center",
            overflow:"hidden", position:"relative",
          }}
        >
          {isUploading ? (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:24, marginBottom:6 }}>⏳</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>
                {uploadProgress ? `Processing ${uploadProgress}...` : "Processing..."}
              </div>
            </div>
          ) : photo ? (
            <>
              <img src={photo.src} alt={label} style={{ width:"100%", height:"100%", objectFit:"cover", pointerEvents:"none" }} />
              <div style={{ position:"absolute", bottom:6, left:6, background:"rgba(0,0,0,0.75)", borderRadius:5, padding:"2px 7px", fontFamily:F.mono, fontSize:8, color, pointerEvents:"none" }}>
                {photo.date}{photo.weight ? ` · ${photo.weight}lb` : ""}
              </div>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:12, pointerEvents:"none" }}>
              <div style={{ fontSize:24, marginBottom:6 }}>📷</div>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray }}>{hint}</div>
            </div>
          )}
        </div>
      </label>
      <label htmlFor={inputId} style={{ display:"block", cursor:"pointer", marginTop:6, textAlign:"center", fontFamily:F.mono, fontSize:9, color, padding:"4px" }}>
        {photo ? "+ Add more (multi-select)" : "+ Add photos (multi-select)"}
      </label>
    </div>
  );

  // ── Sub: thumbnail (in scrolling strip) ──
  const Thumb = ({ photo, onClick, color }) => (
    <div onClick={onClick} style={{ flexShrink:0, cursor:"pointer", position:"relative" }}>
      <img src={photo.src} alt="" style={{ width:64, height:80, objectFit:"cover", borderRadius:8, border:`1px solid ${C.border}`, display:"block" }} />
      <div style={{ position:"absolute", bottom:2, left:2, right:2, background:"rgba(0,0,0,0.75)", borderRadius:3, padding:"1px 4px", fontFamily:F.mono, fontSize:7, color, textAlign:"center" }}>
        {photo.date.slice(5)}
      </div>
    </div>
  );

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <SL>📸 Photo Comparison</SL>

      {/* Primary side-by-side */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <PrimarySlot
          label="NOW"
          photo={primaryNow}
          color={C.teal}
          inputId="photo-progress-input"
          isUploading={uploading === "progress" || (uploading || "").startsWith("progress:")}
          uploadProgress={(uploading || "").startsWith("progress:") ? uploading.split(":")[1] : null}
          hint="Upload progress photo"
        />
        <PrimarySlot
          label="GOAL 🏆"
          photo={primaryGoal}
          color={C.lime}
          inputId="photo-goal-input"
          isUploading={uploading === "goal" || (uploading || "").startsWith("goal:")}
          uploadProgress={(uploading || "").startsWith("goal:") ? uploading.split(":")[1] : null}
          hint="Upload inspo photo"
        />
      </div>

      {/* Hidden file inputs (visually-hidden but rendered for label htmlFor) */}
      <input id="photo-progress-input" type="file" accept="image/*" multiple
        onChange={e => { handleUpload(e.target.files, "progress"); e.target.value=""; }}
        style={{ position:"absolute", opacity:0, width:1, height:1, pointerEvents:"none" }} />
      <input id="photo-goal-input" type="file" accept="image/*" multiple
        onChange={e => { handleUpload(e.target.files, "goal"); e.target.value=""; }}
        style={{ position:"absolute", opacity:0, width:1, height:1, pointerEvents:"none" }} />

      {error && (
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.orange, marginBottom:10, padding:"6px 10px", background:`${C.orange}15`, borderRadius:6 }}>
          {error}
        </div>
      )}

      {/* Progress timeline strip */}
      {progressPhotos.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:9, color:C.teal, letterSpacing:1 }}>PROGRESS TIMELINE · {progressPhotos.length}</div>
            <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>tap to view</div>
          </div>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, WebkitOverflowScrolling:"touch" }}>
            {progressPhotos.map(p => (
              <Thumb key={p.id} photo={p} color={C.teal} onClick={() => setViewer({ photo:p, type:"progress" })} />
            ))}
          </div>
        </div>
      )}

      {/* Goal board strip */}
      {goalPhotos.length > 0 && (
        <div style={{ marginBottom:4 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:9, color:C.lime, letterSpacing:1 }}>GOAL BOARD · {goalPhotos.length}</div>
            <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>your inspo</div>
          </div>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, WebkitOverflowScrolling:"touch" }}>
            {goalPhotos.map(p => (
              <Thumb key={p.id} photo={p} color={C.lime} onClick={() => setViewer({ photo:p, type:"goal" })} />
            ))}
          </div>
        </div>
      )}

      {!primaryNow && !primaryGoal && (
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, textAlign:"center", marginTop:6 }}>
          Add your first photos to start tracking visual progress
        </div>
      )}

      {/* Photo viewer modal */}
      {viewer && (
        <PhotoViewerModal
          photo={viewer.photo}
          type={viewer.type}
          onClose={() => setViewer(null)}
          onDelete={() => deletePhoto(viewer.photo.id, viewer.type)}
          onUpdate={(patch) => updatePhoto(viewer.photo.id, viewer.type, patch)}
        />
      )}
    </div>
  );
}

// ── Photo Viewer Modal (full size, edit caption, delete) ──────────
function PhotoViewerModal({ photo, type, onClose, onDelete, onUpdate }) {
  const [caption, setCaption] = useState(photo.caption || "");
  const [weight, setWeight] = useState(photo.weight ? String(photo.weight) : "");
  const [bodyFat, setBodyFat] = useState(photo.bodyFat ? String(photo.bodyFat) : "");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const accent = type === "progress" ? C.teal : C.lime;

  function save() {
    onUpdate({
      caption: caption.trim(),
      weight: weight ? parseFloat(weight) : null,
      bodyFat: bodyFat ? parseFloat(bodyFat) : null,
    });
    setEditing(false);
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:200, display:"flex", flexDirection:"column", padding:16, overflowY:"auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth:480, margin:"0 auto", width:"100%" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontFamily:F.mono, fontSize:11, color:accent, letterSpacing:1 }}>
            {type === "progress" ? "PROGRESS PHOTO" : "GOAL INSPO"} · {photo.date}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.white, cursor:"pointer", padding:4 }}>
            <X size={22} />
          </button>
        </div>

        <img src={photo.src} alt="" style={{ width:"100%", borderRadius:12, marginBottom:14 }} />

        {!editing ? (
          <>
            {(photo.caption || photo.weight || photo.bodyFat) && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:12, marginBottom:12 }}>
                {photo.caption && (
                  <div style={{ fontFamily:F.body, fontSize:13, color:C.white, marginBottom:8, lineHeight:1.4 }}>
                    "{photo.caption}"
                  </div>
                )}
                <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                  {photo.weight && (
                    <div style={{ fontFamily:F.mono, fontSize:11, color:accent }}>
                      <span style={{ color:C.gray }}>WEIGHT: </span>{photo.weight} lbs
                    </div>
                  )}
                  {photo.bodyFat && (
                    <div style={{ fontFamily:F.mono, fontSize:11, color:accent }}>
                      <span style={{ color:C.gray }}>BF: </span>{photo.bodyFat}%
                    </div>
                  )}
                </div>
              </div>
            )}

            <button onClick={() => setEditing(true)} style={{ width:"100%", padding:"10px 14px", borderRadius:10, fontFamily:F.mono, fontSize:11, background:C.surface, border:`1px solid ${C.border}`, color:C.white, cursor:"pointer", letterSpacing:1, marginBottom:8 }}>
              EDIT CAPTION & STATS
            </button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} style={{ width:"100%", padding:"10px 14px", borderRadius:10, fontFamily:F.mono, fontSize:11, background:"transparent", border:`1px solid ${C.orange}50`, color:C.orange, cursor:"pointer", letterSpacing:1 }}>
                🗑 DELETE PHOTO
              </button>
            ) : (
              <div style={{ background:`${C.orange}15`, border:`1px solid ${C.orange}`, borderRadius:10, padding:10 }}>
                <div style={{ fontFamily:F.mono, fontSize:10, color:C.orange, marginBottom:8, textAlign:"center" }}>Delete this photo permanently?</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex:1, padding:"8px", borderRadius:8, fontFamily:F.mono, fontSize:10, background:C.surface, border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer" }}>CANCEL</button>
                  <button onClick={onDelete} style={{ flex:1, padding:"8px", borderRadius:8, fontFamily:F.mono, fontSize:10, background:C.orange, border:"none", color:C.white, cursor:"pointer", fontWeight:600 }}>DELETE</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:1, marginBottom:4 }}>CAPTION</div>
              <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2}
                placeholder="e.g. post-workout, good lighting"
                style={{ width:"100%", boxSizing:"border-box", padding:"8px 10px", borderRadius:8, fontFamily:F.body, fontSize:12, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.white, resize:"vertical" }} />
            </div>
            {type === "progress" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                <div>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:1, marginBottom:4 }}>WEIGHT (lbs)</div>
                  <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="175.8"
                    style={{ width:"100%", boxSizing:"border-box", padding:"8px 10px", borderRadius:8, fontFamily:F.mono, fontSize:12, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.white }} />
                </div>
                <div>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, letterSpacing:1, marginBottom:4 }}>BODY FAT %</div>
                  <input type="number" step="0.1" value={bodyFat} onChange={e => setBodyFat(e.target.value)} placeholder="15"
                    style={{ width:"100%", boxSizing:"border-box", padding:"8px 10px", borderRadius:8, fontFamily:F.mono, fontSize:12, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.white }} />
                </div>
              </div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setEditing(false)} style={{ flex:1, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:C.surface, border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer" }}>CANCEL</button>
              <button onClick={save} style={{ flex:2, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:accent, border:"none", color:C.dark, cursor:"pointer", fontWeight:700, letterSpacing:1 }}>SAVE</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("lifts");
  const [appData, setAppData] = useState(null);
  const [modal, setModal] = useState(null);
  const [mealEditDate, setMealEditDate] = useState(null);

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

  function fabAction() {
    // FAB defaults to MEAL LOG everywhere — that's what you do most often.
    // Workout logging lives on LIFTS as "Start Session"; weight stays on COACH completeness.
    return setModal("meal");
  }

  const navItems = [
    { id:"home", label:"HOME", Icon:Home },
    { id:"lifts", label:"LIFTS", Icon:Dumbbell },
    { id:"plan", label:"PLAN", Icon:Map },
    { id:"coach", label:"COACH", Icon:Zap },
    { id:"gains", label:"GAINS", Icon:TrendingUp },
  ];

  function handleCoachAction(action) {
    if (action === "meal") setModal("meal");
    else if (action === "meal_hist") setModal("meal_hist");
    else if (action === "weight") setModal("weight");
    else if (action === "workout") setTab("lifts");
    else if (action === "measurements") setModal("measurements");
    else if (action === "pr") setModal("pr");
  }

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:F.body, color:C.white, maxWidth:480, margin:"0 auto", paddingBottom:72, overflowX:"hidden" }}>

      {/* Sticky header */}
      <div style={{ padding:"14px 16px 0", background:C.bg, position:"sticky", top:0, zIndex:100, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <div style={{ fontFamily:F.display, fontSize:26, color:C.lime, letterSpacing:2 }}>DIALLED IN</div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {/* Coach score badge */}
            <div style={{ background:`${coachColor}18`, border:`1px solid ${coachColor}50`, borderRadius:20, padding:"3px 9px", fontFamily:F.mono, fontSize:9, color:coachColor, cursor:"pointer" }}
              onClick={() => setTab("coach")}>
              📊 {coachScore}%
            </div>
            {todayWo && (
              <div style={{ background:`${woColor}18`, border:`1px solid ${woColor}`, borderRadius:20, padding:"3px 9px", fontFamily:F.mono, fontSize:9, color:woColor }}>
                <Zap size={8} style={{ display:"inline", marginRight:3 }} />{todayWo}
              </div>
            )}
            <div style={{ background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:20, padding:"3px 10px", fontFamily:F.mono, fontSize:12, color:C.white }}>
              {currentW} lbs
            </div>
          </div>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:9, color:C.gray, marginBottom:10 }}>
          {getTodayLabel()} · {todayWo || "REST DAY"}
        </div>
        <div style={{ display:"flex" }}>
          {navItems.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  flex:1, padding:"8px 0 10px", background:"none", border:"none",
                  borderBottom: `2px solid ${active ? C.lime : "transparent"}`,
                  color: active ? C.lime : C.gray,
                  fontFamily: F.mono, fontSize:7, cursor:"pointer",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                  position:"relative",
                }}
              >
                <Icon size={13} />
                {label}
                {id === "coach" && coachScore < 80 && !active && (
                  <div style={{ position:"absolute", top:4, right:"25%", width:6, height:6, borderRadius:"50%", background:coachColor }} />
                )}
                {id === "home" && coachScore < 80 && !active && (
                  <div style={{ position:"absolute", top:4, right:"25%", width:6, height:6, borderRadius:"50%", background:coachColor }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile app webview warning (shows above any tab content) */}
      <MobileWebViewBanner />

      {tab === "home" && <HomeTab data={appData} onLogMeal={() => setModal("meal")} onLogWeight={() => setModal("weight")} onAction={handleCoachAction} />}
      {tab === "lifts" && <TodayTab data={appData} updateData={updateData} onLogMeal={() => setModal("meal")} />}
      {tab === "plan" && <PlanTab />}
      {tab === "coach" && <CoachTab data={appData} updateData={updateData} onAction={handleCoachAction} />}
      {tab === "gains" && (
        <div style={{ padding:"18px 16px" }}>
          <VisionBoard data={appData} />
          <GainsTab data={appData} onLogMeasurements={() => setModal("measurements")} onLogMeal={() => setModal("meal")} onLogPR={() => setModal("pr")} onEditDay={(date) => { setMealEditDate(date); setModal("meal"); }} />
        </div>
      )}

      {/* FAB */}
      <button
        onClick={fabAction}
        style={{ position:"fixed", bottom:76, right:"max(16px, calc(50% - 228px))", width:48, height:48, background:C.lime, borderRadius:"50%", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(200,255,0,0.2)", zIndex:100 }}
      >
        <Plus size={22} color={C.dark} strokeWidth={2.5} />
      </button>

      {/* Bottom nav */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:C.bg, borderTop:`1px solid ${C.border}`, display:"flex", zIndex:100 }}>
        {navItems.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex:1, padding:"9px 0 13px", background:"none", border:"none",
                color: active ? C.lime : C.gray,
                fontFamily: F.mono, fontSize:7, cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                position:"relative",
              }}
            >
              <Icon size={15} />
              {label}
              {id === "coach" && coachScore < 80 && !active && (
                <div style={{ position:"absolute", top:6, right:"22%", width:5, height:5, borderRadius:"50%", background:coachColor }} />
              )}
              {id === "home" && coachScore < 80 && !active && (
                <div style={{ position:"absolute", top:6, right:"22%", width:5, height:5, borderRadius:"50%", background:coachColor }} />
              )}
            </button>
          );
        })}
      </div>

      {modal === "weight" && <WeightModal data={appData} updateData={updateData} onClose={() => setModal(null)} />}
      {modal === "meal" && <MealModal data={appData} updateData={updateData} onClose={() => { setModal(null); setMealEditDate(null); }} initialDate={mealEditDate || undefined} />}
      {modal === "meal_hist" && <MealModal data={appData} updateData={updateData} onClose={() => setModal(null)} initialDate={(() => { const d = new Date(); d.setDate(d.getDate()-1); return toLocalDateStr(d); })()} />}
      {modal === "pr" && <PRModal data={appData} updateData={updateData} onClose={() => setModal(null)} />}
      {modal === "measurements" && <MeasurementsModal data={appData} updateData={updateData} onClose={() => setModal(null)} />}
    </div>
  );
}
