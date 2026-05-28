import { useState } from "react";
import { X } from "lucide-react";
import { C, F, MEAL_SLOTS } from "../constants";
import { getToday, toLocalDateStr } from "../utils";
import { getApiKey, aiHeaders, processImageFile } from "../lib/storage";
import { buildMealContext, buildMacroPrompt } from "../lib/nutrition";
import { FInput } from "./shared/FInput";
import { Sheet } from "./shared/Sheet";

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

export function MealModal({ data, updateData, onClose, initialDate }) {
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
