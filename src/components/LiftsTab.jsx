import React, { useState, useEffect } from "react";
import { X, Plus, Check, ChevronRight } from "lucide-react";
import { C, F, DAYS, SPLIT_MAP, WORKOUTS, FREESTYLE_WO, LIVE_SESSION_KEY, LIVE_SESSION_TTL_MS, CUSTOM_ROUTINES_KEY, EXERCISE_CATALOGUE, EXERCISE_LIST } from "../constants";
import { getToday, calc1RM, fmtRelativeTime, isPotentialPR, getTodayLabel } from "../utils";
import { Card, SL, SBtn , Tag } from "./shared/primitives";

import { getPrescription } from "../lib/coaching";

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
  const labelStyle = { fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:3 };
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
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1 }}>EXERCISES · {exercises.length}</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>tap × to remove · totals recompute on save</div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {exercises.map((ex, exIdx) => (
            <div key={exIdx} style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
                <input type="text" value={ex.name} onChange={e=>updateExName(exIdx, e.target.value)} style={{ ...inputStyle, fontSize:11, padding:"6px 9px", flex:1 }} />
                <button onClick={() => removeExercise(exIdx)} aria-label="Remove exercise" style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.orange, width:28, height:28, borderRadius:6, cursor:"pointer", fontSize:14, lineHeight:1 }}>×</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"30px 1fr 1fr 30px", gap:6, alignItems:"center", fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:4 }}>
                <div style={{ textAlign:"center" }}>#</div>
                <div style={{ textAlign:"center" }}>LBS</div>
                <div style={{ textAlign:"center" }}>REPS</div>
                <div></div>
              </div>
              {ex.setsData.map((s, setIdx) => (
                <div key={setIdx} style={{ display:"grid", gridTemplateColumns:"30px 1fr 1fr 30px", gap:6, alignItems:"center", marginBottom:5 }}>
                  <div style={{ textAlign:"center", fontFamily:F.mono, fontSize:11, color:C.gray }}>{setIdx + 1}</div>
                  <input type="number" inputMode="decimal" value={s.weight} onChange={e=>updateSet(exIdx, setIdx, "weight", e.target.value)} style={setInputStyle} />
                  <input type="number" inputMode="numeric" value={s.reps} onChange={e=>updateSet(exIdx, setIdx, "reps", e.target.value)} style={setInputStyle} />
                  <button onClick={() => removeSet(exIdx, setIdx)} aria-label="Remove set" style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.gray, width:26, height:26, borderRadius:5, cursor:"pointer", fontSize:12, lineHeight:1 }}>×</button>
                </div>
              ))}
              <button onClick={() => addSet(exIdx)} style={{ width:"100%", marginTop:4, padding:"6px", background:"transparent", border:`1px dashed ${C.border}`, color:C.teal, borderRadius:6, fontFamily:F.mono, fontSize:11, letterSpacing:1, cursor:"pointer" }}>+ ADD SET</button>
            </div>
          ))}
        </div>

        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:12, lineHeight:1.4 }}>
          Empty sets (no weight + no reps) are dropped on save. Volume + set count rebuild from what{"'"} left.
        </div>
        <div style={{ display:"flex", gap:8, marginTop:14, position:"sticky", bottom:0, background:C.surface, paddingTop:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", background:"transparent", border:`1px solid ${C.border}`, color:C.gray, borderRadius:8, fontFamily:F.mono, fontWeight:700, fontSize:12, letterSpacing:1, cursor:"pointer" }}>CANCEL</button>
          <button onClick={save} style={{ flex:1, padding:"10px", background:C.teal, border:"none", color:C.white, borderRadius:8, fontFamily:F.mono, fontWeight:700, fontSize:12, letterSpacing:1, cursor:"pointer" }}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

// ── Exercise picker modal — muscle-filtered catalogue + custom name (V2.1 Chunk 6) ──
const MUSCLE_GROUPS = ["All","Chest","Back","Shoulders","Biceps","Triceps","Quads","Hamstrings","Glutes","Calves","Core","Cardio"];
const MUSCLE_COLORS = { Chest:C.orange, Back:C.teal, Shoulders:C.purple, Biceps:C.lime, Triceps:C.amber, Quads:C.blue, Hamstrings:"#FF7043", Glutes:"#EC407A", Calves:"#26C6DA", Core:C.lime, Cardio:C.gray };

function ExercisePickerModal({ current, originalName, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("All");
  const q = query.trim().toLowerCase();

  const matches = EXERCISE_CATALOGUE.filter(ex => {
    const nameOk = q ? ex.name.toLowerCase().includes(q) : true;
    const muscleOk = muscleFilter === "All" ? true : ex.muscle === muscleFilter;
    return nameOk && muscleOk;
  });

  const canCustom = q.length > 0 && !matches.some(m => m.name.toLowerCase() === q);

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:0 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.teal}60`, borderTopLeftRadius:16, borderTopRightRadius:16, padding:16, width:"100%", maxWidth:480, maxHeight:"88vh", display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ fontFamily:F.display, fontSize:20, color:C.teal, letterSpacing:2 }}>SWAP EXERCISE</div>
          <button onClick={onClose} aria-label="Close" style={{ background:"transparent", border:"none", color:C.gray, fontSize:22, cursor:"pointer", lineHeight:1, padding:"2px 8px" }}>×</button>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:10 }}>
          Current: <span style={{ color:C.white }}>{current}</span>{current !== originalName ? ` (originally ${originalName})` : ""}
        </div>

        {/* Search */}
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search or type a custom name…"
          style={{ width:"100%", boxSizing:"border-box", padding:"10px 12px", background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:8, color:C.white, fontFamily:F.mono, fontSize:13, marginBottom:8, outline:"none" }}
        />

        {/* Muscle group filter chips */}
        <div style={{ display:"flex", gap:5, overflowX:"auto", paddingBottom:8, marginBottom:8, scrollbarWidth:"none" }}>
          {MUSCLE_GROUPS.map(mg => (
            <button key={mg} onClick={() => setMuscleFilter(mg)}
              style={{
                flexShrink:0, padding:"4px 10px", borderRadius:20,
                fontFamily:F.mono, fontSize:11, letterSpacing:0.5, cursor:"pointer",
                background: muscleFilter === mg ? `${MUSCLE_COLORS[mg] || C.teal}25` : "transparent",
                border:`1px solid ${muscleFilter === mg ? (MUSCLE_COLORS[mg] || C.teal) : C.border}`,
                color: muscleFilter === mg ? (MUSCLE_COLORS[mg] || C.teal) : C.gray,
              }}>
              {mg.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={{ flex:1, overflowY:"auto", marginBottom:8 }}>
          {canCustom && (
            <button onClick={() => onPick(query.trim())} style={{ display:"block", width:"100%", textAlign:"left", padding:"10px 12px", background:`${C.amber}15`, border:`1px solid ${C.amber}60`, borderRadius:8, color:C.amber, fontFamily:F.mono, fontSize:12, cursor:"pointer", marginBottom:6 }}>
              ✏️ Use custom name: <strong>{query.trim()}</strong>
            </button>
          )}
          {matches.length === 0 && !canCustom && (
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textAlign:"center", padding:"20px 0" }}>No matches. Type a custom name to use it.</div>
          )}
          {matches.map(ex => {
            const mColor = MUSCLE_COLORS[ex.muscle] || C.gray;
            return (
              <button key={ex.name} onClick={() => onPick(ex.name)}
                style={{ display:"flex", width:"100%", textAlign:"left", alignItems:"center", justifyContent:"space-between",
                  padding:"9px 12px",
                  background: ex.name === current ? `${C.teal}15` : "transparent",
                  border:`1px solid ${ex.name === current ? C.teal : C.border}`,
                  borderRadius:8,
                  color: ex.name === current ? C.teal : C.white,
                  fontFamily:F.mono, fontSize:12, cursor:"pointer", marginBottom:4 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12 }}>{ex.name}</div>
                  <div style={{ fontSize:8, color:C.gray, marginTop:1 }}>{ex.equipment}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                  <span style={{ fontSize:11, color:mColor, letterSpacing:0.5 }}>{ex.muscle.toUpperCase()}</span>
                  {ex.name === originalName && <span style={{ fontSize:11, color:C.gray, letterSpacing:1 }}>ORIG</span>}
                  {ex.name === current && ex.name !== originalName && <span style={{ fontSize:11, color:C.teal, letterSpacing:1 }}>CURR</span>}
                </div>
              </button>
            );
          })}
        </div>

        {current !== originalName && (
          <button onClick={() => onPick(originalName)} style={{ width:"100%", padding:"10px", background:"transparent", border:`1px solid ${C.border}`, color:C.gray, borderRadius:8, fontFamily:F.mono, fontSize:11, letterSpacing:1, cursor:"pointer" }}>
            ↺ REVERT TO ORIGINAL ({originalName})
          </button>
        )}
      </div>
    </div>
  );
}


// ── Plate Calculator Sheet (V2.1 Chunk 5) ────────────────────────────────────
function PlateCalculatorSheet({ open, onClose }) {
  const [targetStr, setTargetStr] = React.useState("");
  const [barWeight, setBarWeight] = React.useState(45);
  const PLATES = [45, 35, 25, 10, 5, 2.5];

  const calcPlates = (total, bar) => {
    let rem = (total - bar) / 2;
    const result = [];
    for (const p of PLATES) {
      const n = Math.floor(rem / p + 0.0001);
      if (n > 0) { result.push({ plate:p, count:n }); rem -= n * p; }
    }
    return { breakdown:result, remainder: Math.round(rem * 100) / 100 };
  };

  const target = parseFloat(targetStr);
  const valid = !isNaN(target) && target > barWeight;
  const { breakdown, remainder } = valid ? calcPlates(target, barWeight) : { breakdown:[], remainder:0 };
  const totalPerSide = valid ? (target - barWeight) / 2 : 0;

  const PLATE_COLORS = { 45:"#8B0000", 35:"#00008B", 25:"#DAA520", 10:"#228B22", 5:"#666", 2.5:"#444" };

  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:300 }} />
      <div style={{
        position:"fixed", left:"50%", transform:"translateX(-50%)",
        bottom:0, width:"100%", maxWidth:480,
        background:"#0E0E18", borderRadius:"20px 20px 0 0",
        padding:"20px 20px 48px", zIndex:301,
      }}>
        <div style={{ width:36, height:4, borderRadius:2, background:"#2A2A3A", margin:"0 auto 20px" }} />
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:16 }}>🏋️ PLATE CALCULATOR</div>

        <div style={{ marginBottom:14 }}>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:6 }}>TARGET WEIGHT (lbs)</div>
          <input
            type="number" value={targetStr}
            onChange={e => setTargetStr(e.target.value)}
            placeholder="e.g. 225"
            style={{
              width:"100%", padding:"12px 14px", background:C.surface,
              border:`1px solid ${C.border}`, borderRadius:10,
              fontFamily:F.mono, fontSize:20, color:C.white, outline:"none",
              boxSizing:"border-box",
            }}
          />
        </div>

        <div style={{ display:"flex", gap:8, marginBottom:18 }}>
          {[45, 35].map(b => (
            <button key={b} onClick={() => setBarWeight(b)}
              style={{
                flex:1, padding:"8px 0",
                background: barWeight === b ? `${C.lime}18` : C.surface,
                border:`1px solid ${barWeight === b ? C.lime : C.border}`,
                borderRadius:8, fontFamily:F.mono, fontSize:11,
                color: barWeight === b ? C.lime : C.gray, cursor:"pointer",
              }}>
              {b} lb bar
            </button>
          ))}
        </div>

        {valid ? (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:10 }}>
              PER SIDE — {totalPerSide} lbs
            </div>
            {breakdown.length === 0 && (
              <div style={{ fontFamily:F.mono, fontSize:12, color:C.gray }}>No plates needed</div>
            )}
            {breakdown.map(({plate, count}) => (
              <div key={plate} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  {Array.from({length:Math.min(count, 5)}).map((_,i) => (
                    <div key={i} style={{
                      width: plate >= 45 ? 24 : plate >= 25 ? 20 : plate >= 10 ? 17 : 13,
                      height:36, borderRadius:3,
                      background: PLATE_COLORS[plate] || "#555",
                      border:"1px solid #ffffff18",
                      flexShrink:0,
                    }} />
                  ))}
                  {count > 5 && <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginLeft:2 }}>+{count-5}</div>}
                </div>
                <div style={{ fontFamily:F.mono, fontSize:15, fontWeight:600, color:C.white }}>{count}× {plate} lb</div>
              </div>
            ))}
            {remainder > 0.05 && (
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, marginTop:8 }}>
                ⚠ {remainder} lb remainder — not exact with standard plates
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign:"center", fontFamily:F.mono, fontSize:11, color:C.gray, padding:24 }}>
            Enter a weight above {barWeight} lbs to see plate breakdown
          </div>
        )}

        <button onClick={onClose} style={{ width:"100%", marginTop:18, padding:"11px", background:"none", border:`1px solid ${C.border}`, borderRadius:10, fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer" }}>
          CLOSE
        </button>
      </div>
    </>
  );
}

// ── Custom Routine Builder Sheet (V2.1 Chunk 5) ───────────────────────────────
function CustomRoutineBuilderSheet({ open, onClose, onSave }) {
  const [name, setName] = React.useState("");
  const [exercises, setExercises] = React.useState([{ name:"", sets:"3", reps:"10-12" }]);
  const [exQuery, setExQuery] = React.useState("");
  const [focusIdx, setFocusIdx] = React.useState(null);

  const addExercise = () => setExercises(ex => [...ex, { name:"", sets:"3", reps:"10-12" }]);
  const removeEx = (i) => setExercises(ex => ex.filter((_,idx) => idx !== i));
  const updateEx = (i, field, val) => setExercises(ex => ex.map((e, idx) => idx === i ? {...e, [field]:val} : e));

  const suggestions = exQuery.trim().length > 1
    ? EXERCISE_LIST.filter(e => e.name.toLowerCase().includes(exQuery.toLowerCase())).slice(0, 5)
    : [];

  const canSave = name.trim().length > 0 && exercises.some(e => e.name.trim().length > 0);

  const handleSave = () => {
    const routine = {
      id:`r_${Date.now()}`,
      name: name.trim(),
      exercises: exercises.filter(e => e.name.trim()).map(e => ({
        name:e.name.trim(), sets:e.sets, reps:e.reps,
        current:"", target:"", pr:null, note:"",
      })),
    };
    onSave(routine);
    setName(""); setExercises([{ name:"", sets:"3", reps:"10-12" }]);
    onClose();
  };

  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:302 }} />
      <div style={{
        position:"fixed", left:"50%", transform:"translateX(-50%)",
        bottom:0, width:"100%", maxWidth:480,
        background:"#0E0E18", borderRadius:"20px 20px 0 0",
        padding:"20px 16px 48px", zIndex:303,
        maxHeight:"90vh", overflowY:"auto",
      }}>
        <div style={{ width:36, height:4, borderRadius:2, background:"#2A2A3A", margin:"0 auto 18px" }} />
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:14 }}>NEW ROUTINE</div>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Routine name (e.g. Push Day)"
          style={{
            width:"100%", padding:"12px 14px", background:C.surface,
            border:`1px solid ${C.border}`, borderRadius:10,
            fontFamily:F.mono, fontSize:14, color:C.white, outline:"none",
            boxSizing:"border-box", marginBottom:16,
          }}
        />

        {exercises.map((ex, i) => (
          <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px", marginBottom:8 }}>
            <div style={{ position:"relative" }}>
              <input
                value={ex.name}
                onChange={e => { updateEx(i, "name", e.target.value); setExQuery(e.target.value); setFocusIdx(i); }}
                onBlur={() => setTimeout(() => { setExQuery(""); setFocusIdx(null); }, 160)}
                onFocus={() => setFocusIdx(i)}
                placeholder={`Exercise ${i + 1}`}
                style={{
                  width:"100%", padding:"8px 10px", background:"#1A1A22",
                  border:`1px solid ${C.border}`, borderRadius:7,
                  fontFamily:F.mono, fontSize:13, color:C.white, outline:"none",
                  boxSizing:"border-box",
                }}
              />
              {focusIdx === i && suggestions.length > 0 && (
                <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#1A1A2E", border:`1px solid ${C.border}`, borderRadius:8, zIndex:10, overflow:"hidden" }}>
                  {suggestions.map((s,j) => (
                    <div key={j}
                      onMouseDown={() => { updateEx(i, "name", s.name); setExQuery(""); setFocusIdx(null); }}
                      style={{ padding:"9px 12px", fontFamily:F.mono, fontSize:12, color:C.white, cursor:"pointer", borderBottom:`1px solid ${C.border}` }}>
                      {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"flex-end" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray, marginBottom:3 }}>SETS</div>
                <input value={ex.sets} onChange={e => updateEx(i,"sets",e.target.value)}
                  style={{ width:"100%", padding:"7px 8px", background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:6, fontFamily:F.mono, fontSize:13, color:C.white, outline:"none", boxSizing:"border-box" }} />
              </div>
              <div style={{ flex:2 }}>
                <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray, marginBottom:3 }}>REPS</div>
                <input value={ex.reps} onChange={e => updateEx(i,"reps",e.target.value)}
                  style={{ width:"100%", padding:"7px 8px", background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:6, fontFamily:F.mono, fontSize:13, color:C.white, outline:"none", boxSizing:"border-box" }} />
              </div>
              {exercises.length > 1 && (
                <button onClick={() => removeEx(i)}
                  style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 10px", fontFamily:F.mono, fontSize:11, color:C.orange, cursor:"pointer" }}>✕</button>
              )}
            </div>
          </div>
        ))}

        <button onClick={addExercise}
          style={{ width:"100%", padding:10, background:"none", border:`1px dashed ${C.border}`, borderRadius:10, fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer", marginBottom:16 }}>
          + ADD EXERCISE
        </button>

        <button onClick={handleSave} disabled={!canSave}
          style={{
            width:"100%", padding:"12px", borderRadius:10, fontFamily:F.mono, fontSize:12, letterSpacing:1,
            background: canSave ? C.lime : "#1A1A22", color: canSave ? C.dark : C.gray,
            border:"none", cursor: canSave ? "pointer" : "default", fontWeight:700,
          }}>
          SAVE ROUTINE
        </button>
      </div>
    </>
  );
}

// ── WorkoutPickerSheet — bottom-drawer workout selector (V2.1 Chunk 4) ──
function WorkoutPickerSheet({ open, onClose, onPick, onPickCustom, onBuildRoutine, todayScheduled, customRoutines }) {
  const allWorkouts = Object.values(WORKOUTS);
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:200 }} />
      <div style={{
        position:"fixed", left:"50%", transform:"translateX(-50%)",
        bottom:0, width:"100%", maxWidth:480,
        background:"#0E0E18", borderRadius:"20px 20px 0 0",
        padding:"16px 16px 40px", zIndex:201,
        maxHeight:"82vh", overflowY:"auto",
      }}>
        <div style={{ width:36, height:4, borderRadius:2, background:"#2A2A3A", margin:"0 auto 18px" }} />
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:16 }}>SELECT WORKOUT</div>

        {/* Prescribed — today's highlighted */}
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:8 }}>PRESCRIBED</div>
        {allWorkouts.map(wo => {
          const isToday = todayScheduled === wo.label;
          return (
            <button key={wo.label} onClick={() => { onPick(wo.label); onClose(); }}
              style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                width:"100%", padding:"12px 14px", marginBottom:6,
                background: isToday ? `${wo.color}18` : C.surface,
                border: `1px solid ${isToday ? wo.color : C.border}`,
                borderRadius:12, cursor:"pointer", textAlign:"left",
              }}>
              <div>
                <div style={{ fontFamily:F.display, fontSize:17, color:wo.color, letterSpacing:1 }}>{wo.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{wo.focus} · {wo.duration}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                {isToday && (
                  <div style={{ background:wo.color, color:C.dark, fontFamily:F.mono, fontSize:8, fontWeight:700, letterSpacing:1, padding:"2px 7px", borderRadius:6 }}>TODAY</div>
                )}
                <ChevronRight size={14} color={C.gray} />
              </div>
            </button>
          );
        })}

        {/* Freestyle */}
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginTop:14, marginBottom:8 }}>FREESTYLE</div>
        <button onClick={() => { onPick("freestyle"); onClose(); }}
          style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            width:"100%", padding:"12px 14px",
            background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:12, cursor:"pointer", textAlign:"left",
          }}>
          <div>
            <div style={{ fontFamily:F.display, fontSize:17, color:C.lime, letterSpacing:1 }}>FREESTYLE</div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>Open session · add any exercise as you go</div>
          </div>
          <Plus size={14} color={C.gray} />
        </button>

        {/* Custom saved routines */}
        {customRoutines && customRoutines.length > 0 && (<>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginTop:18, marginBottom:8 }}>CUSTOM</div>
          {customRoutines.map(r => (
            <button key={r.id} onClick={() => { onPickCustom && onPickCustom(r); onClose(); }}
              style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                width:"100%", padding:"12px 14px", marginBottom:6,
                background:C.surface, border:`1px solid ${C.border}`,
                borderRadius:12, cursor:"pointer", textAlign:"left",
              }}>
              <div>
                <div style={{ fontFamily:F.display, fontSize:17, color:C.purple, letterSpacing:1 }}>{r.name.toUpperCase()}</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{r.exercises.length} exercises · custom</div>
              </div>
              <ChevronRight size={14} color={C.gray} />
            </button>
          ))}
        </>)}

        <button onClick={() => { onBuildRoutine && onBuildRoutine(); onClose(); }}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            width:"100%", padding:"11px 14px", marginTop:14,
            background:"none", border:`1px dashed ${C.border}`,
            borderRadius:12, cursor:"pointer",
          }}>
          <Plus size={12} color={C.gray} />
          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1 }}>BUILD NEW ROUTINE</span>
        </button>
      </div>
    </>
  );
}

export function LiftsTab({ data, updateData, onLogMeal }) {
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadedRoutine, setLoadedRoutine] = useState(null); // {id,name,exercises} when custom routine loaded
  const [customRoutines, setCustomRoutines] = useState([]);
  const [routineBuilderOpen, setRoutineBuilderOpen] = useState(false);
  const [plateCalcOpen, setPlateCalcOpen] = useState(false);

  // Load custom routines from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await window.storage.get(CUSTOM_ROUTINES_KEY);
        if (raw && raw.value) setCustomRoutines(JSON.parse(raw.value));
      } catch (_e) { /* best-effort */ }
    })();
  }, []);

  // browseDay can be a WORKOUTS key or "freestyle" — wo resolves accordingly
  const wo = loadedRoutine
    ? { ...FREESTYLE_WO, label:loadedRoutine.name.toUpperCase(), focus:`Custom · ${loadedRoutine.exercises.length} exercises`, color:C.purple, bg:"#0C0818", exercises:loadedRoutine.exercises }
    : browseDay === "freestyle" ? FREESTYLE_WO : WORKOUTS[browseDay];
  const t = getToday();
  const todayMeals = data.meals[t] || { calories:0, protein:0, carbs:0, fat:0, items:[] };
  const calTarget = isActualRest ? data.profile.calorieTarget.rest : data.profile.calorieTarget.training;

  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionStart, setSessionStart] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [restStartTime, setRestStartTime] = useState(null); // null = not resting; ms timestamp = resting since
  const [restTargetSecs, setRestTargetSecs] = useState(90); // configurable rest duration target
  const [restAlertFired, setRestAlertFired] = useState(false); // prevents vibration repeating
  const [restType, setRestType] = useState("normal"); // "normal" | "superset" — drives rest thresholds
  const [sessionNote, setSessionNote] = useState("");
  const [finished, setFinished] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [swappedNames, setSwappedNames] = useState({}); // { [exIdx]: "Standing Calf Raise" } — per-session exercise substitutions
  const [endedExercises, setEndedExercises] = useState({}); // { [exIdx]: true } — user tapped "end early, fatigued"
  const [swappingIdx, setSwappingIdx] = useState(null); // exIdx currently being swapped via the picker modal
  const [prCelebration, setPrCelebration] = useState(null); // { exName, weight, reps, ts } when a logged set crosses an existing PR
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
        sessionStart, sessionStarted, sessionDay: browseDay,
        liveSets, sessionNote, restStartTime, restType, expandedEx,
      };
      window.storage.set(LIVE_SESSION_KEY, JSON.stringify(payload)).then(() => {
        setLastSaveAt(Date.now());
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [hasRestored, actualSplit, sessionStarted, sessionStart, liveSets, sessionNote, restStartTime, restType, expandedEx, finished, browseDay]);

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
    let finalWeight = "", finalReps = "";
    setLiveSets(prev => ({
      ...prev,
      [key]: (prev[key]||[]).map((s, i) => {
        if (i !== setIdx) return s;
        nowDone = !s.done;
        const updated = { ...s, done: nowDone };
        if (nowDone) {
          if ((!s.weight || s.weight === "") && fillWeight != null && fillWeight !== "") {
            updated.weight = String(fillWeight);
          }
          if ((!s.reps || s.reps === "") && fillReps != null && fillReps !== "") {
            updated.reps = String(fillReps);
          }
        }
        finalWeight = updated.weight;
        finalReps = updated.reps;
        return updated;
      }),
    }));
    if (nowDone) {
      const ex = wo?.exercises?.[exIdx];
      const isSuperset = !!ex?.supersetGroup;
      setRestStartTime(Date.now());
      setRestType(isSuperset ? "superset" : "normal");
      // PR celebration: if checking a set that beats existing PR, surface a toast
      const isTime = ex?.metric === "time";
      if (!isTime) {
        const exName = swappedNames[exIdx] || ex?.name;
        if (exName && isPotentialPR(exName, finalWeight, finalReps, data.prs)) {
          const celebTs = Date.now();
          setPrCelebration({ exName, weight: finalWeight, reps: finalReps, ts: celebTs });
          setTimeout(() => setPrCelebration(c => (c && c.ts === celebTs) ? null : c), 4500);
        }
      }
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
    try { await window.storage.delete(LIVE_SESSION_KEY); } catch (_e) { /* best-effort */ }
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
  const restTarget = restType === "superset" ? 60 : restTargetSecs;
  const restRemaining = Math.max(0, restTarget - restSecs);
  const restDone = restActive && restSecs >= restTarget;

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
    try { await window.storage.delete(LIVE_SESSION_KEY); } catch (_e) { /* best-effort */ }
    setFinished(true);
    setResumedAt(null);
  }

  const restColor = restDone ? C.lime
    : restRemaining > 20 ? C.lime
    : restRemaining > 8 ? C.amber
    : C.orange;

  // Save a new custom routine to IndexedDB and update state
  const saveCustomRoutine = async (routine) => {
    const updated = [...customRoutines, routine];
    setCustomRoutines(updated);
    try { await window.storage.set(CUSTOM_ROUTINES_KEY, JSON.stringify(updated)); } catch (_e) { /* best-effort */ }
  };

  // Vibrate when rest timer completes (fires once per rest period)
  useEffect(() => {
    if (restDone && restActive && !restAlertFired) {
      setRestAlertFired(true);
      try { navigator.vibrate && navigator.vibrate([150, 80, 150, 80, 150]); } catch (_e) { /* best-effort */ }
    }
    if (!restActive) setRestAlertFired(false); // reset for next set
  // intentional: restAlertFired excluded — adding it causes the condition to re-evaluate after setRestAlertFired(true), breaking the one-shot pattern
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restDone, restActive]);

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
            <div><div style={{ fontFamily:F.mono, fontSize:20, color:C.lime, fontWeight:600 }}>{allDone.length}</div><div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:3 }}>SETS</div></div>
            <div><div style={{ fontFamily:F.mono, fontSize:20, color:C.teal, fontWeight:600 }}>{(totalVol/1000).toFixed(1)}k</div><div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:3 }}>LBS</div></div>
            <div><div style={{ fontFamily:F.mono, fontSize:20, color:C.white, fontWeight:600 }}>{doneEx}/{totalEx}</div><div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:3 }}>EXERCISES</div></div>
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
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{m.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.borderHi }}>/{m.target}</div>
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

      {/* V2.1 — Workout selector header (replaces locked day tabs) */}
      <div style={{ background:C.bg, borderBottom:`1px solid ${C.border}`, padding:"12px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:3 }}>
              {actualSplit ? `SCHEDULED: ${actualSplit}` : "REST DAY — PICK ANY WORKOUT"}
            </div>
            <div style={{ fontFamily:F.display, fontSize:20, color: wo ? wo.color : C.gray, letterSpacing:1 }}>
              {wo ? wo.label : "NO WORKOUT SELECTED"}
            </div>
            {wo && <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayMid, marginTop:1 }}>{wo.focus}</div>}
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            style={{
              padding:"10px 16px", background:C.surface,
              border:`1px solid ${wo ? wo.color : C.border}`,
              borderRadius:10, fontFamily:F.mono, fontSize:11,
              color: wo ? wo.color : C.gray, cursor:"pointer",
              display:"flex", alignItems:"center", gap:6,
            }}
          >
            <ChevronRight size={12} />
            {sessionStarted ? "CHANGE" : "PICK"}
          </button>
        </div>
      </div>
      <WorkoutPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(label) => { setBrowseDay(label); setLoadedRoutine(null); setExpandedEx(null); }}
        onPickCustom={(r) => { setLoadedRoutine(r); setBrowseDay(r.name); setExpandedEx(null); }}
        onBuildRoutine={() => setRoutineBuilderOpen(true)}
        todayScheduled={actualSplit}
        customRoutines={customRoutines}
      />
      <CustomRoutineBuilderSheet
        open={routineBuilderOpen}
        onClose={() => setRoutineBuilderOpen(false)}
        onSave={saveCustomRoutine}
      />
      <PlateCalculatorSheet
        open={plateCalcOpen}
        onClose={() => setPlateCalcOpen(false)}
      />

      {/* Selected workout header */}
      {wo && (
        <div style={{ background:wo.bg, borderBottom:`1px solid ${wo.color}22`, padding:"14px 16px 12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontFamily:F.mono, fontSize:11, color:wo.color, textTransform:"uppercase", letterSpacing:1.5, marginBottom:3 }}>
                {actualSplit === browseDay ? getTodayLabel() : browseDay === "freestyle" ? "FREESTYLE SESSION" : `${browseDay} · SELECTED`}
              </div>
              <div style={{ fontFamily:F.display, fontSize:28, color:wo.color, lineHeight:1, letterSpacing:1 }}>{browseDay}</div>
              <div style={{ fontFamily:F.display, fontSize:17, color:C.white }}>{wo.focus}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>est.</div>
              <div style={{ fontFamily:F.display, fontSize:20, color:wo.color }}>{wo.duration}</div>
              {sessionStarted && (
                <div style={{ marginTop:4 }}>
                  <div style={{ fontFamily:F.display, fontSize:22, color:C.white }}>{fmt(sessionSecs)}</div>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>● LIVE</div>
                </div>
              )}
              <button
                onClick={() => setPlateCalcOpen(true)}
                style={{ marginTop:6, background:"none", border:`1px solid ${C.border}`, borderRadius:7, padding:"4px 9px", fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer" }}
                title="Open plate calculator"
              >🏋️ PLATES</button>
            </div>
          </div>

          {/* Rest timer — countdown with progress bar + vibrate on complete (V2.1 Chunk 5) */}
          {restActive && sessionStarted && (() => {
            const pct = Math.min(100, (restSecs / restTarget) * 100);
            return (
              <div style={{ background:`${restColor}10`, border:`1px solid ${restColor}30`, borderRadius:10, padding:"10px 14px", marginTop:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <div style={{ fontFamily:F.display, fontSize:28, color:restColor, minWidth:76 }}>
                    {restDone ? "GO ✓" : fmt(restRemaining)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:restColor, marginBottom:2 }}>
                      {restType === "superset" ? "🔗 SUPERSET · 60s" : `REST · ${restTarget}s`}
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>
                      {restDone ? "Ready to go ✓" : restRemaining > 20 ? "Recovering..." : restRemaining > 8 ? "Almost ready..." : "Go soon!"}
                    </div>
                  </div>
                  {restType !== "superset" && (
                    <button
                      onClick={() => setRestTargetSecs(t => t === 60 ? 90 : t === 90 ? 120 : t === 120 ? 180 : 60)}
                      style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"3px 8px", fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer" }}
                      title="Tap to cycle rest target"
                    >{restTargetSecs}s</button>
                  )}
                  <button onClick={() => { setRestStartTime(null); setRestAlertFired(false); }}
                    style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer", minHeight:44, minWidth:44 }}>SKIP</button>
                </div>
                <div style={{ height:3, background:"#1A1A24", borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:restColor, borderRadius:2, transition:"width 0.9s linear" }} />
                </div>
              </div>
            );
          })()}

          {/* Session progress bar */}
          {sessionStarted && (
            <div style={{ marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:4 }}>
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
            <div style={{ fontFamily:F.mono, fontSize:11, color:wo.color, lineHeight:1.7 }}>💡 {wo.note}</div>
          </div>
        </div>
      )}

      <div style={{ padding:"14px 16px 0" }}>

        {/* ── LIVE SESSION MODE (V2.1: any workout startable any day) ── */}
        {!!wo && (
          <div>
            {/* Resume banner if session was restored from storage */}
            {resumedAt && (
              <div style={{ background:`${C.amber}15`, border:`1px solid ${C.amber}40`, borderRadius:10, padding:"10px 14px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.amber, lineHeight:1.4, letterSpacing:1 }}>
                    ⟲ RESUMED · session from {fmtRelativeTime(resumedAt)}
                  </div>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2, lineHeight:1.4 }}>
                    Your sets and timer were saved. Pick up where you left off.
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <button onClick={discardSession} title="Discard saved session and start fresh"
                    style={{ fontFamily:F.mono, fontSize:11, color:C.gray, background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 9px", cursor:"pointer", letterSpacing:0.5 }}>
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
                          <div style={{ background:`${wo.color}18`, border:`1px solid ${wo.color}50`, borderRadius:5, padding:"2px 8px", fontFamily:F.mono, fontSize:11, color:wo.color }}>
                            {ex.sets} × {ex.reps}
                          </div>
                          {rx.prescribedWeight && (
                            <div style={{ background:`${statusColor}18`, border:`1px solid ${statusColor}50`, borderRadius:5, padding:"2px 8px", fontFamily:F.mono, fontSize:11, color:statusColor, fontWeight:600 }}>
                              🎯 {rx.prescribedWeight} lbs
                            </div>
                          )}
                          {rx.status === "progress" && <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>↑ ADD WEIGHT</div>}
                          {rx.status === "build" && <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal }}>BEAT THE REPS</div>}
                          {exDoneSets > 0 && <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{exDoneSets}/{sets.length} ✓</div>}
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
                          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:5, letterSpacing:1 }}>LAST SESSION</div>
                          {rx.lastWeight ? (
                            <div>
                              <div style={{ fontFamily:F.display, fontSize:24, color:C.grayMid, lineHeight:1 }}>{rx.lastWeight}</div>
                              <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayMid, marginTop:2 }}>lbs × {rx.lastReps}</div>
                              {rx.lastDate && <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:3 }}>{rx.lastDate}</div>}
                            </div>
                          ) : (
                            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>No history yet</div>
                          )}
                        </div>
                        <div style={{ padding:"10px 14px", background:rx.status==="progress"?"#0A1A00":rx.status==="build"?"#040E0C":C.surfaceAlt }}>
                          <div style={{ fontFamily:F.mono, fontSize:11, color:statusColor, marginBottom:5, letterSpacing:1 }}>TODAY{"'"} TARGET</div>
                          {rx.prescribedWeight ? (
                            <div>
                              <div style={{ fontFamily:F.display, fontSize:24, color:statusColor, lineHeight:1 }}>{rx.prescribedWeight}</div>
                              <div style={{ fontFamily:F.mono, fontSize:11, color:statusColor, marginTop:2 }}>lbs × {rx.prescribedReps}</div>
                              <div style={{ fontFamily:F.mono, fontSize:11, color:statusColor, marginTop:3, opacity:.8 }}>
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
                          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1 }}>LOG YOUR SETS{ex?.unilateral ? " · UNILATERAL" : ""}{ex?.metric === "time" ? " · TIME-BASED" : ""}</div>
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={() => setSwappingIdx(exIdx)} title="Swap this exercise" style={{ fontFamily:F.mono, fontSize:11, padding:"3px 8px", background:"transparent", border:`1px solid ${C.border}`, color:swappedNames[exIdx] ? C.amber : C.gray, borderRadius:5, cursor:"pointer", letterSpacing:0.5 }}>
                              ⇄ {swappedNames[exIdx] ? "SWAPPED" : "SWAP"}
                            </button>
                            <button onClick={() => {
                              setEndedExercises(prev => ({ ...prev, [exIdx]: !prev[exIdx] }));
                            }} title="Mark exercise ended early due to fatigue" style={{ fontFamily:F.mono, fontSize:11, padding:"3px 8px", background:"transparent", border:`1px solid ${endedExercises[exIdx] ? C.orange : C.border}`, color:endedExercises[exIdx] ? C.orange : C.gray, borderRadius:5, cursor:"pointer", letterSpacing:0.5 }}>
                              {endedExercises[exIdx] ? "🏳️ ENDED" : "🏳️ END"}
                            </button>
                          </div>
                        </div>
                        {swappedNames[exIdx] && (
                          <div style={{ fontFamily:F.mono, fontSize:11, color:C.amber, marginBottom:8, padding:"6px 10px", background:`${C.amber}15`, borderRadius:6 }}>
                            Logging as: <strong>{swappedNames[exIdx]}</strong> (was {ex.name}) — PRs track under the swapped name
                          </div>
                        )}
                        <div style={{ display:"grid", gridTemplateColumns:"22px 1fr 1fr 34px", gap:6, marginBottom:6 }}>
                          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>SET</div>
                          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{ex?.metric === "time" ? "—" : "LBS"}</div>
                          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{ex?.metric === "time" ? "TIME (s)" : (ex?.unilateral ? "REPS (total)" : "REPS")}</div>
                          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>✓</div>
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
                          const exNameForPR = swappedNames[exIdx] || ex?.name;
                          const isPRRow = !isTime && exNameForPR && isPotentialPR(exNameForPR, s.weight, s.reps, data.prs);
                          return (
                            <div key={setIdx} style={{ marginBottom:8 }}>
                              <div style={{ display:"grid", gridTemplateColumns:"22px 1fr 1fr 34px", gap:6, alignItems:"center", position:"relative" }}>
                                {isPRRow && (
                                  <div style={{ position:"absolute", left:24, top:-7, background:C.amber, color:C.dark, fontFamily:F.mono, fontSize:8, fontWeight:700, padding:"1px 5px", borderRadius:3, letterSpacing:0.5, zIndex:1, lineHeight:1.2 }}>
                                    🔥 PR
                                  </div>
                                )}
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
                                          fontFamily:F.mono, fontSize:11, fontWeight: selected ? 700 : 400, letterSpacing:0.5,
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
                                <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, marginTop:5, paddingLeft:28 }}>
                                  🔥 Push set — go to failure
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={() => addLiveSet(exIdx)} style={{ width:"100%", marginTop:8, padding:"6px", borderRadius:8, border:`1px dashed ${C.border}`, background:"none", fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer" }}>+ ADD SET</button>
                      </div>

                      {/* Phase target + note */}
                      <div style={{ padding:"10px 14px" }}>
                        <div style={{ display:"flex", gap:14, marginBottom:8, flexWrap:"wrap" }}>
                          <div><div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:2 }}>PHASE TARGET</div><div style={{ fontFamily:F.mono, fontSize:11, color:wo.color }}>{ex.target}</div></div>
                          {ex.pr && <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:14 }}><div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:2 }}>ALL-TIME PR</div><div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>{ex.pr}</div></div>}
                        </div>
                        <div style={{ background:`${wo.color}10`, borderRadius:8, padding:"8px 12px" }}>
                          <div style={{ fontFamily:F.mono, fontSize:11, color:wo.color, lineHeight:1.7 }}>📋 {ex.note}</div>
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
                    <div style={{ fontFamily:F.mono, fontSize:11, color:wo.color, letterSpacing:1, fontWeight:600 }}>
                      🔄 SUPERSET {group.group}
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:0.5 }}>
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
              <SL>Today{"'"} Fuel</SL>
              <SBtn onClick={onLogMeal}>+ ADD MEAL</SBtn>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:10 }}>
              {[{label:"kcal",val:todayMeals.calories,target:calTarget,color:C.lime},{label:"protein",val:todayMeals.protein,target:data.profile.proteinTarget,color:C.teal},{label:"carbs",val:todayMeals.carbs,target:data.profile.carbTarget,color:C.orange},{label:"fat",val:todayMeals.fat,target:data.profile.fatTarget,color:C.purple}].map(m => (
                <div key={m.label} style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:F.mono, fontSize:14, fontWeight:600, color:(m.val/m.target)>=0.9?m.color:C.white }}>{m.val}</div>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{m.label}</div>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.borderHi }}>/{m.target}</div>
                </div>
              ))}
            </div>
            {wo && (
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                {[
                  { time:"Pre-workout", tip:"Banana + shake — 40g carbs + 20g protein, 45 min out" },
                  { time:"Intra", tip:"Stay hydrated. Electrolytes if sweating heavy." },
                  { time:"Post-workout", tip:"50g carbs + 40g protein within 60 min of finishing" },
                ].map((item, i) => (
                  <div key={i} style={{ display:"flex", gap:8, marginBottom:5 }}>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:wo.color, minWidth:82 }}>{item.time}</div>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, lineHeight:1.5 }}>{item.tip}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Session history — always visible at bottom of LIFTS */}
        <div style={{ marginTop:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textTransform:"uppercase", letterSpacing:1.5 }}>Session History <span style={{ textTransform:"none", fontSize:11, color:C.gray, marginLeft:6 }}>· tap to edit · × to delete</span></div>
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
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{session.date} · {session.split}</div>
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
                      <div key={j} style={{ background:"#1A1A22", borderRadius:5, padding:"2px 8px", fontSize:11, color:C.grayMid, fontFamily:F.mono }}>{ex.name}</div>
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
              <div style={{ color:C.gray, fontSize:11, marginTop:6 }}>This can{"'"} be undone.</div>
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

      {/* Exercise picker (swap) modal */}
      {swappingIdx !== null && wo?.exercises?.[swappingIdx] && (
        <ExercisePickerModal
          current={swappedNames[swappingIdx] || wo.exercises[swappingIdx].name}
          originalName={wo.exercises[swappingIdx].name}
          onPick={(name) => {
            setSwappedNames(prev => {
              const n = { ...prev };
              if (name && name !== wo.exercises[swappingIdx].name) n[swappingIdx] = name;
              else delete n[swappingIdx];
              return n;
            });
            setSwappingIdx(null);
          }}
          onClose={() => setSwappingIdx(null)}
        />
      )}

      {/* PR Celebration toast — bottom-of-screen when a checked set beats existing PR */}
      {prCelebration && (
        <div style={{ position:"fixed", left:0, right:0, bottom:80, display:"flex", justifyContent:"center", zIndex:150, pointerEvents:"none", padding:"0 12px" }}>
          <div style={{ background:C.lime, color:C.dark, padding:"10px 16px", borderRadius:14, fontFamily:F.display, letterSpacing:1.5, fontSize:14, boxShadow:"0 8px 24px rgba(0,0,0,0.5)", display:"flex", alignItems:"center", gap:10, maxWidth:"100%" }}>
            <span style={{ fontSize:22 }}>🏆</span>
            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>NEW PR — {prCelebration.exName} · {prCelebration.weight} × {prCelebration.reps}</span>
          </div>
        </div>
      )}
    </div>
  );
}// ── PLAN Tab ──────────────────────────────────────────────────────

