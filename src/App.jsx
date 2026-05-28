import { useState, useEffect } from "react";
import { Home, X, Zap, Brain, Dumbbell, Utensils, User } from "lucide-react";
import { C, F, DAYS, SPLIT_MAP, WORKOUTS, EXERCISE_LIST, MEASURE_FIELDS } from "./constants";
import { getToday, toLocalDateStr, getTodayLabel, calc1RM, getCompletenessItems } from "./utils";
import { sGet, sSet, getApiKey, aiHeaders, takeSnapshotIfNeeded, processImageFile } from "./lib/storage";
import { buildMealContext, buildMacroPrompt } from "./lib/nutrition";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FInput } from "./components/shared/FInput";
import { SaveBtn } from "./components/shared/SaveBtn";
import { Sheet } from "./components/shared/Sheet";
import { WeightModal } from "./components/WeightModal";



import { WeeklyCheckinModal } from "./components/WeeklyCheckinModal";
import { HomeTab, MobileWebViewBanner } from "./components/HomeTab";
import { LiftsTab } from "./components/LiftsTab";
import { FuelTab } from "./components/FuelTab";
import { ProfileTab } from "./components/ProfileTab";
import { CoachDrawer, SettingsDrawer } from "./components/CoachDrawer";

// ── Storage helpers ───────────────────────────────────────────────
// ── Anthropic API key — entered on-device, stored locally, never in the repo ──


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
      const controller1 = new AbortController();
      const timeoutId1 = setTimeout(() => controller1.abort(), 30000);
      let resp;
      try {
        resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: aiHeaders(),
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1600,
            messages: [{
              role: "user",
              content: contentBlocks,
            }],
          }),
          signal: controller1.signal,
        });
      } finally {
        clearTimeout(timeoutId1);
      }
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`API ${resp.status}: ${errText.slice(0, 80) || "request failed"}`);
      }
      const d = await resp.json();
      const text = (d.content || []).filter(x => x.type === "text").map(x => x.text).join("");
      if (!text) throw new Error("empty response");
      let parsed;
      try {
        parsed = (() => {
          // Robust JSON extract: strip code fences, then find the outermost { } block
          let s = text.replace(/```json[\s]*/gi, "").replace(/```/g, "").trim();
          if (!s.startsWith("{") && !s.startsWith("[")) {
            const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (m) s = m[0];
          }
          return JSON.parse(s);
        })();
      } catch (_e) {
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
      const isAbort = e && e.name === "AbortError";
      const msg = isAbort ? "Request timed out — check your connection and try again" : ((e && e.message) ? String(e.message).slice(0, 80) : "unknown");
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
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 30000);
      let resp;
      try {
        resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: aiHeaders(),
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1800,
            messages: [{
              role: "user",
              content: buildMacroPrompt(ctx, textDesc),
            }],
          }),
          signal: controller2.signal,
        });
      } finally {
        clearTimeout(timeoutId2);
      }
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`API ${resp.status}: ${errText.slice(0, 80) || "request failed"}`);
      }
      const d = await resp.json();
      const text = (d.content || []).filter(x => x.type === "text").map(x => x.text).join("");
      if (!text) throw new Error("empty response");
      let parsed;
      try {
        parsed = (() => {
          // Robust JSON extract: strip code fences, then find the outermost { } block
          let s = text.replace(/```json[\s]*/gi, "").replace(/```/g, "").trim();
          if (!s.startsWith("{") && !s.startsWith("[")) {
            const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (m) s = m[0];
          }
          return JSON.parse(s);
        })();
      } catch (_e) {
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
      const isAbort = e && e.name === "AbortError";
      const msg = isAbort ? "Request timed out — check your connection and try again" : ((e && e.message) ? String(e.message).slice(0, 80) : "unknown");
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
      // Transform AI-returned items: nest flat micro fields under item.micros
      const microFields = ["fiber","sugar","sodium","potassium","vitaminD","calcium","iron","zinc"];
      function nestItemMicros(item) {
        if (!item) return item;
        const micros = {};
        let hasMicros = false;
        microFields.forEach(function(k) {
          if (item[k] !== undefined && item[k] !== null) { micros[k] = item[k]; hasMicros = true; }
        });
        if (!hasMicros) return item;
        const clean = Object.assign({}, item);
        microFields.forEach(function(k) { delete clean[k]; });
        return Object.assign(clean, { micros });
      }
      const nestedItems = itemized ? itemized.map(nestItemMicros) : null;
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
          items: nestedItems,
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
          items: nestedItems,
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
    } catch (_e) {
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
    } catch (_e) { /* best-effort */ }
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
    } catch (_e) { /* best-effort */ }
    setResetting(false);
  }

  // Recovery state: day has macros but no entries (data got into half-migrated state)
  const hasOrphanMacros = entries.length === 0 && (dayData.calories > 0 || dayData.protein > 0);

  return (
    <Sheet onClose={onClose} title={isHistorical ? `LOG MEAL — ${logDate}` : "LOG MEAL"}>
      {/* Date picker */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Date</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
          {[0,1,2,3,4].map(daysAgo => {
            const d = new Date();
            d.setDate(d.getDate() - daysAgo);
            const ds = toLocalDateStr(d);
            const label = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : d.toLocaleDateString("en",{weekday:"short"});
            const isSelected = logDate === ds;
            return (
              <button key={ds} onClick={() => setLogDate(ds)} style={{ padding:"5px 12px", borderRadius:8, cursor:"pointer", fontFamily:F.mono, fontSize:11, background:isSelected?C.lime:"#1A1A22", border:`1px solid ${isSelected?C.lime:C.border}`, color:isSelected?C.dark:C.gray }}>
                {label}
              </button>
            );
          })}
          <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} max={getToday()}
            style={{ padding:"5px 10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer" }} />
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
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.amber, letterSpacing:1, marginBottom:6, fontWeight:600 }}>
            ⚠ ORPHAN MACROS DETECTED
          </div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.5, marginBottom:10 }}>
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
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, marginBottom:8, textAlign:"center", lineHeight:1.4 }}>
                Zero all macros for {isHistorical ? logDate : "today"}? This can{"'"} be undone.
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setResetConfirming(false)} disabled={resetting}
                  style={{ flex:1, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer", letterSpacing:0.5 }}>
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
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, lineHeight:1.5 }}>
            No meals logged for {isHistorical ? logDate : "today"} yet.<br/>Add one below.
          </div>
        </div>
      )}

      {/* Existing entries for this date */}
      {entries.length > 0 && (
        <div style={{ marginBottom:16, background:C.surfaceAlt, borderRadius:10, padding:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal, letterSpacing:1 }}>
              {isHistorical ? `MEALS ON ${logDate}` : "TODAY'S MEALS"} · {entries.length}
            </div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>
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
                      {isEditing && <span style={{ color:C.lime, fontFamily:F.mono, fontSize:11, marginRight:6 }}>EDITING</span>}
                      {e.legacy && !isEditing && <span style={{ color:C.amber, fontFamily:F.mono, fontSize:11, marginRight:6 }}>LEGACY</span>}
                      {(() => { const m = e.slot && MEAL_SLOTS.find(x => x.id === e.slot); return m ? <span style={{ color:C.teal, fontFamily:F.mono, fontSize:11, marginRight:6 }} title={m.label}>{m.emoji}</span> : null; })()}
                      {e.description}
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>
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
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.amber, marginTop:8, lineHeight:1.4 }}>
              ⚠ Legacy entries are pre-update day-totals. Delete and re-log to track individual meals.
            </div>
          )}
        </div>
      )}

      {/* Section header for adding/editing */}
      <div id="meal-form-anchor" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, paddingTop:4, borderTop:`1px solid ${C.border}` }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color: editingEntryId ? C.lime : C.lime, letterSpacing:1 }}>
          {editingEntryId ? "✎ EDITING MEAL" : "+ ADD A MEAL"}
        </div>
        {editingEntryId && (
          <button onClick={cancelEdit}
            style={{ fontFamily:F.mono, fontSize:11, color:C.gray, background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", cursor:"pointer", letterSpacing:1 }}>
            CANCEL EDIT
          </button>
        )}
      </div>

      {/* MEAL SLOT picker (auto-detected from time + description; tap to override) */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:5 }}>SLOT</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {MEAL_SLOTS.map(opt => {
            const active = slot === opt.id;
            return (
              <button key={opt.id} onClick={() => setSlot(opt.id)}
                style={{ padding:"6px 10px", borderRadius:14, fontFamily:F.mono, fontSize:11, letterSpacing:0.5, background: active ? C.teal : "transparent", color: active ? C.dark : C.grayLight, border:`1px solid ${active ? C.teal : C.border}`, cursor:"pointer" }}>
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
            <div style={{ fontFamily:F.mono, fontSize:11, color: analyzing ? C.gray : C.teal, fontWeight:700, letterSpacing:0.5 }}>CAMERA</div>
          </div>
        </label>
        <label htmlFor="meal-photo-gallery" style={{ flex:1, cursor: analyzing ? "default" : "pointer" }}>
          <div style={{ background: analyzing ? "#1A1A22" : `${C.teal}15`, border:`1px solid ${analyzing ? C.border : C.teal}`, borderRadius:12, padding:"12px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <div style={{ fontSize:22 }}>{analyzing ? "⏳" : "🖼️"}</div>
            <div style={{ fontFamily:F.mono, fontSize:11, color: analyzing ? C.gray : C.teal, fontWeight:700, letterSpacing:0.5 }}>GALLERY · MULTI</div>
          </div>
        </label>
      </div>
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:14, textAlign:"center" }}>
        AI estimates macros · if you type a description below, it gets combined with the photo for better context
      </div>
      <input id="meal-photo-camera" type="file" accept="image/*" capture="environment" disabled={analyzing}
        onChange={e => { analyzePhoto(Array.from(e.target.files || [])); e.target.value=""; }}
        style={{ position:"absolute", opacity:0, width:1, height:1, pointerEvents:"none" }} />
      <input id="meal-photo-gallery" type="file" accept="image/*" multiple disabled={analyzing}
        onChange={e => { analyzePhoto(Array.from(e.target.files || [])); e.target.value=""; }}
        style={{ position:"absolute", opacity:0, width:1, height:1, pointerEvents:"none" }} />
      {aiMsg && (
        <div style={{ fontFamily:F.mono, fontSize:11, color:aiMsg.startsWith("✓")?C.lime:C.orange, marginBottom:14, padding:"6px 10px", background:"#1A1A22", borderRadius:8 }}>
          {aiMsg}
        </div>
      )}
      {/* Itemized breakdown from AI */}
      {itemized && itemized.length > 0 && (
        <div style={{ marginBottom:14, background:"#0E0E14", border:`1px solid ${C.purple}40`, borderRadius:10, padding:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.purple, letterSpacing:1 }}>
              ITEMIZED BREAKDOWN · {itemized.length}
            </div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>edit totals below if off</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {itemized.map((item, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"6px 8px", background:"#1A1A22", borderRadius:5, gap:8 }}>
                <div style={{ flex:1, minWidth:0, fontFamily:F.body, fontSize:11, color:C.white, lineHeight:1.3 }}>
                  {item.name}
                </div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, textAlign:"right", whiteSpace:"nowrap" }}>
                  {Math.round(item.calories || 0)}kc · {Math.round(item.protein || 0)}P<br/>
                  {Math.round(item.carbs || 0)}C · {Math.round(item.fat || 0)}F
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}`, fontFamily:F.mono, fontSize:11 }}>
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

// ── PR Modal ──────────────────────────────────────────────────────
function PRModal({ data, updateData, onClose }) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [result, setResult] = useState(null);

  const filtered = query.length >= 1
    ? EXERCISE_LIST.filter(e => e.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
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
              Didn{"'"} beat existing PR — keep grinding 💪
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
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>
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
              const ep = data.prs.find(p => p.exercise === ex.name);
              return (
                <div
                  key={ex.name}
                  onClick={() => { setSel(ex.name); setQuery(""); }}
                  style={{ padding:"10px 14px", fontSize:13, fontFamily:F.mono, color:C.grayLight, borderBottom:i < filtered.length-1 ? `1px solid ${C.border}` : "none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}
                >
                  <div>
                    <span>{ex.name}</span>
                    <div style={{ fontSize:11, color:C.gray, marginTop:1 }}>{ex.muscle} · {ex.equipment}</div>
                  </div>
                  {ep && <span style={{ color:C.lime, fontSize:11, flexShrink:0 }}>{ep.weight}×{ep.reps}</span>}
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
            Use &quot;{query}&quot; (custom)
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
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:16 }}>
        All in inches · Leave blank to skip
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        {MEASURE_FIELDS.filter(f => f.key !== "bodyFat").map(f => {
          const p = prev?.[f.key];
          return (
            <div key={f.key}>
              <div style={{ fontFamily:F.mono, fontSize:11, color:f.color, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>
                {f.label}{p && <span style={{ color:C.gray, marginLeft:6 }}>prev:{p}&quot;</span>}
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
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>
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
        {tab === "fuel"    && <FuelTab data={appData} updateData={updateData} onLogMeal={() => setModal("meal")} />}
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
