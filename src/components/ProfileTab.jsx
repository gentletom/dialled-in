import React, { useState, useEffect } from "react";
import { X, ChevronRight, Check, Settings } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Bar } from "recharts";
import { C, F, DAYS, SPLIT_MAP, PHASES, PLAN_CUSTOM_KEY, MEASURE_FIELDS } from "../constants";
import { getToday, toLocalDateStr, calc1RM } from "../utils";


import { Card, Tag, SL, SBtn, BigN, MBar } from "./shared/primitives";
import { processImageFile } from "../lib/storage";
import { NextSessionPrescriptions } from "./CoachDrawer";

export function PlanTab({ data }) {
  const [activePhase, setActivePhase] = useState(0);
  const [subTab, setSubTab] = useState("overview");
  const phase = PHASES[activePhase];

  // ── Editable plan customizations (V2.1 Chunk 7) ──────────────────────────
  const [planCustom, setPlanCustom] = useState({ baseMilestoneDone:{}, customMilestones:[], phaseNotes:{} });
  const [newMilestone, setNewMilestone] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await window.storage.get(PLAN_CUSTOM_KEY);
        if (raw && raw.value) setPlanCustom(JSON.parse(raw.value));
      } catch (_e) { /* best-effort */ }
    })();
  }, []);

  const savePlanCustom = async (updated) => {
    setPlanCustom(updated);
    try { await window.storage.set(PLAN_CUSTOM_KEY, JSON.stringify(updated)); } catch (_e) { /* best-effort */ }
  };

  const toggleBaseMilestone = (phaseId, idx) => {
    const key = `${phaseId}:${idx}`;
    const updated = { ...planCustom, baseMilestoneDone: { ...planCustom.baseMilestoneDone, [key]: !planCustom.baseMilestoneDone[key] } };
    savePlanCustom(updated);
  };

  const addCustomMilestone = () => {
    if (!newMilestone.trim()) return;
    const m = { id:`m_${Date.now()}`, phaseId: phase.id, text: newMilestone.trim(), done: false };
    const updated = { ...planCustom, customMilestones: [...(planCustom.customMilestones || []), m] };
    savePlanCustom(updated);
    setNewMilestone(""); setAddingMilestone(false);
  };

  const toggleCustomMilestone = (id) => {
    const updated = { ...planCustom, customMilestones: planCustom.customMilestones.map(m => m.id === id ? {...m, done:!m.done} : m) };
    savePlanCustom(updated);
  };

  const deleteCustomMilestone = (id) => {
    const updated = { ...planCustom, customMilestones: planCustom.customMilestones.filter(m => m.id !== id) };
    savePlanCustom(updated);
  };

  const savePhaseNotes = (notes) => {
    const updated = { ...planCustom, phaseNotes: { ...(planCustom.phaseNotes || {}), [phase.id]: notes } };
    savePlanCustom(updated);
  };

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
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:4 }}>12-MONTH ROADMAP</div>
        <div style={{ fontFamily:F.display, fontSize:36, color:C.lime, letterSpacing:2, lineHeight:1, marginBottom:4 }}>THE PLAN</div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:16 }}>175.8 lbs → 185–195 lbs @ 8–10% BF</div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:16 }}>
          {PHASES.map((p, i) => (
            <div key={i} onClick={() => { setActivePhase(i); setSubTab("overview"); }} style={{ cursor:"pointer" }}>
              <div style={{ height:3, background:i <= activePhase ? p.color : C.border, borderRadius:1, marginBottom:6 }} />
              <div style={{ fontFamily:F.mono, fontSize:11, color:i === activePhase ? p.color : C.gray, letterSpacing:"0.1em", fontWeight:700 }}>
                PH{p.id}
              </div>
              <div style={{ fontFamily:F.mono, fontSize:11, color:i === activePhase ? C.white : C.gray }}>
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
                fontFamily:F.mono, fontSize:11,
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
                fontFamily:F.mono, fontSize:11, cursor:"pointer",
                textTransform:"uppercase", letterSpacing:0.8,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* V2.1 — Now vs Goal + Prescriptions moved from COACH/GAINS */}
      {data && <NowVsGoalSection data={data} />}
      {data && <NextSessionPrescriptions data={data} />}

      <div style={{ padding:"16px 16px 0" }}>
        <Card style={{ background:phase.bg, borderColor:`${phase.color}40` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontFamily:F.mono, fontSize:11, color:phase.color, letterSpacing:1.5, marginBottom:4 }}>
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
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:3 }}>WEIGHT TARGET</div>
              <div style={{ fontFamily:F.mono, fontSize:14, color:phase.color, fontWeight:600 }}>{phase.weightRange}</div>
            </div>
            <div style={{ background:`${phase.color}10`, borderRadius:10, padding:"10px 12px" }}>
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:3 }}>BODY FAT</div>
              <div style={{ fontFamily:F.mono, fontSize:14, color:phase.color, fontWeight:600 }}>{phase.bfRange}</div>
            </div>
          </div>
        </Card>

        {subTab === "overview" && (
          <div>
            {/* Phase notes — editable */}
            <Card style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: editingNotes ? 8 : 4 }}>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5 }}>MY NOTES FOR THIS PHASE</div>
                <button onClick={() => setEditingNotes(e => !e)}
                  style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"3px 9px", fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer" }}>
                  {editingNotes ? "DONE" : "EDIT"}
                </button>
              </div>
              {editingNotes ? (
                <textarea
                  autoFocus
                  value={planCustom.phaseNotes?.[phase.id] || ""}
                  onChange={e => savePhaseNotes(e.target.value)}
                  placeholder="Add your own goals, notes, or reminders for this phase…"
                  style={{ width:"100%", minHeight:80, padding:"10px", background:"#1A1A22", border:`1px solid ${phase.color}60`, borderRadius:8, fontFamily:F.mono, fontSize:12, color:C.white, outline:"none", resize:"vertical", boxSizing:"border-box" }}
                />
              ) : planCustom.phaseNotes?.[phase.id] ? (
                <div style={{ fontFamily:F.mono, fontSize:12, color:C.grayLight, lineHeight:1.7, whiteSpace:"pre-wrap" }}>
                  {planCustom.phaseNotes[phase.id]}
                </div>
              ) : (
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, fontStyle:"italic" }}>
                  No notes yet — tap EDIT to add your goals for this phase.
                </div>
              )}
            </Card>
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
                      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:1 }}>{d.focus}</div>
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
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:4 }}>{m.label}</div>
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
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <SL>Phase {phase.id} Milestones</SL>
              <SBtn onClick={() => setAddingMilestone(a => !a)}>+ ADD</SBtn>
            </div>

            {/* Base milestones — checkboxes toggle done state */}
            {phase.milestones.map((m, i) => {
              const key = `${phase.id}:${i}`;
              const done = planCustom.baseMilestoneDone?.[key] || false;
              return (
                <div key={i} onClick={() => toggleBaseMilestone(phase.id, i)}
                  style={{ display:"flex", gap:12, padding:"11px 0", borderBottom:`1px solid ${C.border}`, alignItems:"flex-start", cursor:"pointer" }}>
                  <div style={{ width:22, height:22, borderRadius:6, flexShrink:0, marginTop:1, display:"flex", alignItems:"center", justifyContent:"center",
                    background: done ? `${phase.color}25` : "transparent",
                    border:`2px solid ${done ? phase.color : C.border}`,
                  }}>
                    {done && <Check size={12} color={phase.color} />}
                  </div>
                  <div style={{ fontFamily:F.mono, fontSize:12, color: done ? C.gray : C.grayLight, lineHeight:1.6, textDecoration: done ? "line-through" : "none" }}>{m}</div>
                </div>
              );
            })}

            {/* Custom milestones */}
            {(planCustom.customMilestones || []).filter(m => m.phaseId === phase.id).map(m => (
              <div key={m.id} style={{ display:"flex", gap:12, padding:"11px 0", borderBottom:`1px solid ${C.border}`, alignItems:"flex-start" }}>
                <div onClick={() => toggleCustomMilestone(m.id)}
                  style={{ width:22, height:22, borderRadius:6, flexShrink:0, marginTop:1, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
                    background: m.done ? `${phase.color}25` : "transparent",
                    border:`2px solid ${m.done ? phase.color : C.border}`,
                  }}>
                  {m.done && <Check size={12} color={phase.color} />}
                </div>
                <div style={{ flex:1, fontFamily:F.mono, fontSize:12, color: m.done ? C.gray : C.lime, lineHeight:1.6, textDecoration: m.done ? "line-through" : "none" }}>
                  {m.text}
                  <span style={{ fontFamily:F.mono, fontSize:8, color:C.gray, marginLeft:6 }}>CUSTOM</span>
                </div>
                <button onClick={() => deleteCustomMilestone(m.id)}
                  style={{ background:"none", border:"none", color:C.gray, cursor:"pointer", fontSize:14, padding:"0 4px", flexShrink:0 }}>×</button>
              </div>
            ))}

            {/* Add milestone inline form */}
            {addingMilestone && (
              <div style={{ marginTop:12, display:"flex", gap:8, alignItems:"flex-start" }}>
                <input
                  autoFocus
                  value={newMilestone}
                  onChange={e => setNewMilestone(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addCustomMilestone(); if (e.key === "Escape") { setAddingMilestone(false); setNewMilestone(""); } }}
                  placeholder="New milestone…"
                  style={{ flex:1, padding:"8px 10px", background:"#1A1A22", border:`1px solid ${phase.color}60`, borderRadius:8, fontFamily:F.mono, fontSize:12, color:C.white, outline:"none" }}
                />
                <button onClick={addCustomMilestone}
                  style={{ padding:"8px 12px", background:`${phase.color}20`, border:`1px solid ${phase.color}`, borderRadius:8, fontFamily:F.mono, fontSize:11, color:phase.color, cursor:"pointer" }}>
                  ADD
                </button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── LIFTS Tab ─────────────────────────────────────────────────────

// ── GAINS Tab ─────────────────────────────────────────────────────
// ── GAINS sparkline helpers (V2.0) ──
function bestSetOneRM(workout, exerciseNameSubstr) {
  if (!workout || !Array.isArray(workout.exercises)) return null;
  const ex = workout.exercises.find(e => (e.name || "").toLowerCase().includes(exerciseNameSubstr.toLowerCase()));
  if (!ex || !Array.isArray(ex.setsData)) return null;
  let best = null;
  ex.setsData.forEach(s => {
    const w = parseFloat(s.weight) || 0, r = parseInt(s.reps) || 0;
    if (w <= 0 || r <= 0) return;
    const oneRM = calc1RM(w, r);
    if (!best || oneRM > best.oneRM) best = { oneRM, weight: w, reps: r };
  });
  return best;
}

function progressionFor(workouts, exerciseNameSubstr) {
  return (workouts || [])
    .slice()
    .reverse() // oldest first for chart
    .map(w => ({ date: w.date, best: bestSetOneRM(w, exerciseNameSubstr) }))
    .filter(p => p.best && p.best.oneRM > 0)
    .map(p => ({ date: p.date.slice(5), oneRM: p.best.oneRM, weight: p.best.weight, reps: p.best.reps }));
}

function last14DaysFuel(meals, today) {
  const out = [];
  const d0 = new Date(today + "T12:00:00");
  for (let i = 13; i >= 0; i--) {
    const d = new Date(d0); d.setDate(d0.getDate() - i);
    const dateStr = toLocalDateStr(d);
    const m = (meals || {})[dateStr] || { calories: 0, protein: 0 };
    out.push({ date: dateStr.slice(5), kcal: Math.round(m.calories || 0), protein: Math.round(m.protein || 0) });
  }
  return out;
}

function weightMovingAvg(weightData, windowSize) {
  return weightData.map((point, idx) => {
    const start = Math.max(0, idx - windowSize + 1);
    const slice = weightData.slice(start, idx + 1);
    const avg = slice.reduce((a, p) => a + p.weight, 0) / slice.length;
    return { ...point, ma: Math.round(avg * 10) / 10 };
  });
}

export function GainsTab({ data, onLogMeasurements, onLogMeal, onLogPR, onEditDay }) {
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
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{payload[0].payload.date}</div>
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
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:4 }}>Current lbs</div>
          </div>
          <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
            <BigN color={C.lime}>185–195</BigN>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:4 }}>Target lbs</div>
          </div>
          <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
            <BigN color={C.teal}>+{(185 - currentW).toFixed(1)}</BigN>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:4 }}>lbs to go</div>
          </div>
        </div>
        {weightData.length >= 2 ? (
          <>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={weightMovingAvg(weightData, 7)}>
                <XAxis dataKey="date" tick={{ fill:C.gray, fontSize:11, fontFamily:"monospace" }} axisLine={false} tickLine={false} />
                <YAxis domain={["dataMin - 2","dataMax + 2"]} tick={{ fill:C.gray, fontSize:11, fontFamily:"monospace" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<WeightTooltip />} />
                <Line type="monotone" dataKey="weight" stroke={C.lime} strokeWidth={1.5} dot={{ fill:C.lime, r:3, strokeWidth:0 }} activeDot={{ r:6, fill:C.lime }} isAnimationActive={false} />
                <Line type="monotone" dataKey="ma" stroke={C.teal} strokeWidth={2.5} dot={false} strokeOpacity={0.85} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", justifyContent:"center", gap:14, fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:4 }}>
              <span><span style={{ color:C.lime }}>━</span> daily</span>
              <span><span style={{ color:C.teal }}>━</span> 7-day trend</span>
            </div>
          </>
        ) : (
          <div style={{ textAlign:"center", color:C.border, fontFamily:F.mono, fontSize:11, padding:"24px 0" }}>
            Log more weigh-ins to see trend
          </div>
        )}
      </Card>

      {/* V2.0 — PR Progression card (key lifts trajectory) */}
      {(() => {
        const keyLifts = [
          { label:"Incline Bench", substr:"Incline Bench", color:"#4488FF" },
          { label:"RDL",            substr:"Romanian Deadlift", color:"#00E5CC" },
          { label:"Shoulder Press", substr:"Shoulder Press", color:"#9D7FFF" },
        ];
        const tracks = keyLifts.map(k => ({ ...k, data: progressionFor(data.workouts, k.substr) }));
        const anyData = tracks.some(t => t.data.length >= 2);
        if (!anyData) return null;
        return (
          <Card>
            <SL>📈 PR Trajectory</SL>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:10 }}>estimated 1RM from best set per session</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {tracks.map(t => (
                <div key={t.label}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:t.color, letterSpacing:0.5 }}>{t.label}</div>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>
                      {t.data.length >= 2 ? `${t.data[0].oneRM} → ${t.data[t.data.length-1].oneRM} est 1RM` : t.data.length === 1 ? `${t.data[0].oneRM} est 1RM (1 session)` : "no data yet"}
                    </div>
                  </div>
                  {t.data.length >= 2 ? (
                    <ResponsiveContainer width="100%" height={50}>
                      <LineChart data={t.data} margin={{ top:4, right:6, bottom:0, left:6 }}>
                        <Line type="monotone" dataKey="oneRM" stroke={t.color} strokeWidth={2} dot={{ fill:t.color, r:2.5, strokeWidth:0 }} isAnimationActive={false} />
                        <Tooltip contentStyle={{ background:"#111", border:`1px solid ${C.border}`, borderRadius:8, fontSize:11 }} labelStyle={{ color:C.gray, fontFamily:"monospace" }} formatter={(v, n, p) => [`${v} est 1RM · ${p.payload.weight}×${p.payload.reps}`, ""]} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, padding:"6px 0" }}>Log {t.label} at least twice to see trajectory</div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* V2.0 — 14-Day Fuel Pacing card (kcal + protein vs target) */}
      {(() => {
        const fuel = last14DaysFuel(data.meals, t);
        const hasAny = fuel.some(d => d.kcal > 0);
        if (!hasAny) return null;
        return (
          <Card>
            <SL>🍽️ 14-Day Fuel</SL>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:8 }}>daily kcal · target line at training-day goal</div>
            <ResponsiveContainer width="100%" height={120}>
              <ComposedChart data={fuel} margin={{ top:8, right:6, bottom:0, left:6 }}>
                <XAxis dataKey="date" tick={{ fill:C.gray, fontSize:11, fontFamily:"monospace" }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fill:C.gray, fontSize:11, fontFamily:"monospace" }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ background:"#111", border:`1px solid ${C.border}`, borderRadius:8, fontSize:11 }} labelStyle={{ color:C.gray, fontFamily:"monospace" }} />
                <ReferenceLine y={calTarget} stroke={C.lime} strokeDasharray="3 3" strokeOpacity={0.6} />
                <Bar dataKey="kcal" fill={C.lime} fillOpacity={0.7} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontFamily:F.mono, fontSize:11 }}>
              <span style={{ color:C.gray }}>14d avg kcal: <span style={{ color:C.lime }}>{Math.round(fuel.reduce((a,d)=>a+d.kcal,0)/14)}</span></span>
              <span style={{ color:C.gray }}>14d avg protein: <span style={{ color:C.teal }}>{Math.round(fuel.reduce((a,d)=>a+d.protein,0)/14)}g</span></span>
            </div>
          </Card>
        );
      })()}

      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <SL>📏 Body Measurements</SL>
          <SBtn onClick={onLogMeasurements} color={C.teal}>+ LOG</SBtn>
        </div>
        {latestM ? (
          <div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:12 }}>
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
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{f.label}</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                      <div style={{ fontFamily:F.mono, fontSize:18, fontWeight:600, color:f.color }}>{val}</div>
                      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{isInches ? '"' : "%"}</div>
                    </div>
                    {delta && (
                      <div style={{ fontFamily:F.mono, fontSize:11, color:parseFloat(delta) > 0 ? C.lime : C.orange, marginTop:3 }}>
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
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.border }}>chest · shoulders · waist · arms · thighs · calves · body fat</div>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <SL>🥩 Nutrition History</SL>
          <SBtn onClick={onLogMeal}>+ ADD MEAL</SBtn>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:10 }}>tap any day to view & edit entries</div>
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
                width:"100%", padding:"10px 8px",
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
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{pr.date}</div>
            </div>
            <div style={{ fontFamily:F.mono, fontSize:14, color:C.lime, fontWeight:600 }}>{pr.weight} × {pr.reps}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}



// ── Data Completeness Score ───────────────────────────────────────

function NowVsGoalSection({ data }) {
  const currentW = [...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8;
  const goalW = 190;
  const startW = 175.8;
  const weightProgress = Math.max(0, Math.min(1, (currentW - startW) / (goalW - startW)));
  const latestM = data.measurements?.length ? data.measurements[data.measurements.length-1] : null;
  const currentBF = latestM?.bodyFat || 16;
  const goalBF = 9;
  const bfProgress = Math.max(0, Math.min(1, (currentBF - goalBF) / (16 - goalBF)));
  const liftTargets = [
    { name:"Incline Bench", current:110, goal:180, pr:data.prs.find(p=>p.exercise.includes("Incline"))?.weight||110 },
    { name:"Squat",         current:205, goal:315, pr:data.prs.find(p=>p.exercise.includes("Squat"))?.weight||205 },
    { name:"RDL",           current:315, goal:425, pr:data.prs.find(p=>p.exercise.includes("RDL"))?.weight||315 },
    { name:"Shoulder Press",current:55,  goal:100, pr:data.prs.find(p=>p.exercise.includes("Shoulder"))?.weight||55 },
  ];
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

  return (
    <div>
      {/* NOW vs GOAL cards */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
        <SL>📊 NOW vs GOAL</SL>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          <div style={{ background:C.surfaceAlt, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:8, letterSpacing:1 }}>NOW</div>
            {[
              { label:"Weight", val:`${currentW} lbs`, color:C.white },
              { label:"Est. BF%", val:`~${currentBF}%`, color:C.orange },
              { label:"Bench PR", val:`${data.prs.find(p=>p.exercise.includes("Incline"))?.weight||110} lbs`, color:C.white },
              { label:"Squat PR", val:`${data.prs.find(p=>p.exercise.includes("Squat"))?.weight||205} lbs`, color:C.white },
              { label:"RDL PR",   val:`${data.prs.find(p=>p.exercise.includes("RDL"))?.weight||315} lbs`, color:C.white },
            ].map((item, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{item.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:item.color, fontWeight:600 }}>{item.val}</div>
              </div>
            ))}
          </div>
          <div style={{ background:"#0A1100", border:`1px solid ${C.lime}30`, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, marginBottom:8, letterSpacing:1 }}>GOAL 🏆</div>
            {[
              { label:"Weight", val:"185-195 lbs", color:C.lime },
              { label:"BF%",    val:"8-10%",       color:C.lime },
              { label:"Bench",  val:"175-185 lbs", color:C.lime },
              { label:"Squat",  val:"315 lbs",     color:C.lime },
              { label:"RDL",    val:"425+ lbs",    color:C.lime },
            ].map((item, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{item.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:item.color, fontWeight:600 }}>{item.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Progress rings + Strength Progress */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
        <SL>Progress Rings</SL>
        <div style={{ display:"flex", justifyContent:"space-around", alignItems:"center", marginBottom:16 }}>
          {[
            { label:"Weight",     pct:weightProgress,  color:C.lime,   sub:`${currentW} → ${goalW}` },
            { label:"Body Fat",   pct:1-bfProgress,    color:C.teal,   sub:`${currentBF}% → 9%` },
            { label:"Milestones", pct:milestonePct,    color:C.purple, sub:`${milestones.filter(m=>m.done).length}/${milestones.length}` },
          ].map(ring => {
            const r = 32, circ = 2*Math.PI*r;
            return (
              <div key={ring.label} style={{ textAlign:"center" }}>
                <svg width={80} height={80} viewBox="0 0 80 80">
                  <circle cx={40} cy={40} r={r} fill="none" stroke={C.border} strokeWidth={7}/>
                  <circle cx={40} cy={40} r={r} fill="none" stroke={ring.color} strokeWidth={7}
                    strokeDasharray={circ} strokeDashoffset={circ*(1-ring.pct)}
                    strokeLinecap="round" transform="rotate(-90 40 40)"
                    style={{ transition:"stroke-dashoffset 1s ease" }}/>
                  <text x={40} y={36} textAnchor="middle" fill={ring.color} style={{ fontFamily:"monospace", fontSize:11, fontWeight:700 }}>
                    {Math.round(ring.pct*100)}%
                  </text>
                  <text x={40} y={50} textAnchor="middle" fill={C.gray} style={{ fontFamily:"monospace", fontSize:8 }}>
                    {ring.label}
                  </text>
                </svg>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{ring.sub}</div>
              </div>
            );
          })}
        </div>
        <SL>Strength Progress</SL>
        {liftTargets.map(lift => {
          const barPct = Math.max(0, Math.min(1, (lift.pr - 100) / (lift.goal - 100)));
          return (
            <div key={lift.name} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontFamily:F.mono, fontSize:11, marginBottom:4 }}>
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
    </div>
  );
}

// ── Vision Board (added to GAINS Tab) ─────────────────────────────
function VisionBoard({ data }) {
  const currentW = [...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8;
  const latestM = data.measurements?.length ? data.measurements[data.measurements.length-1] : null;
  const currentBF = latestM?.bodyFat || 16;

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
              <text x={35} y={208} textAnchor="middle" fill={C.lime} style={{ fontFamily:"monospace", fontSize:11, fontWeight:700 }}>{Math.round(milestonePct*100)}%</text>
            </svg>
          </div>
          {/* Milestone list */}
          <div style={{ flex:1 }}>
            {milestones.map((m, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${m.done?C.lime:C.border}`, background:m.done?C.lime:"transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {m.done && <Check size={9} color={C.dark}/>}
                </div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:m.done?C.lime:C.gray }}>{m.label}</div>
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
// ── PrimarySlot — extracted from PhotoComparison to avoid component-in-render violation ──
function PrimarySlot({ label, photo, color, inputId, isUploading, uploadProgress, hint }) {
  return (
    <div>
      <div style={{ fontFamily:F.mono, fontSize:11, color, marginBottom:6, letterSpacing:1 }}>{label}</div>
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
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>
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
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{hint}</div>
            </div>
          )}
        </div>
      </label>
      <label htmlFor={inputId} style={{ display:"block", cursor:"pointer", marginTop:6, textAlign:"center", fontFamily:F.mono, fontSize:11, color, padding:"4px" }}>
        {photo ? "+ Add more (multi-select)" : "+ Add photos (multi-select)"}
      </label>
    </div>
  );
}

// ── Thumb — extracted from PhotoComparison to avoid component-in-render violation ──
function Thumb({ photo, onClick, color }) {
  return (
    <div onClick={onClick} style={{ flexShrink:0, cursor:"pointer", position:"relative" }}>
      <img src={photo.src} alt="" style={{ width:64, height:80, objectFit:"cover", borderRadius:8, border:`1px solid ${C.border}`, display:"block" }} />
      <div style={{ position:"absolute", bottom:2, left:2, right:2, background:"rgba(0,0,0,0.75)", borderRadius:3, padding:"1px 4px", fontFamily:F.mono, fontSize:7, color, textAlign:"center" }}>
        {photo.date.slice(5)}
      </div>
    </div>
  );
}

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
        try { progressIdx = JSON.parse((await window.storage.get("ft:photoProgressIndex")).value); } catch (_e) { /* best-effort */ }
        try { goalIdx = JSON.parse((await window.storage.get("ft:photoGoalIndex")).value); } catch (_e) { /* best-effort */ }

        const progress = await Promise.all(progressIdx.map(async meta => {
          try {
            const r = await window.storage.get(`ft:photo:progress:${meta.id}`);
            return JSON.parse(r.value);
          } catch (_e) { return null; }
        }));
        const goals = await Promise.all(goalIdx.map(async meta => {
          try {
            const r = await window.storage.get(`ft:photo:goal:${meta.id}`);
            return JSON.parse(r.value);
          } catch (_e) { return null; }
        }));

        setProgressPhotos(progress.filter(Boolean));
        setGoalPhotos(goals.filter(Boolean));
      } catch (_e) { /* best-effort */ }
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
        try { idx = JSON.parse((await window.storage.get(indexKey)).value); } catch (_e) { /* best-effort */ }
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
    try { await window.storage.delete(`ft:photo:${type}:${id}`); } catch (_e) { /* best-effort */ }
    const indexKey = type === "progress" ? "ft:photoProgressIndex" : "ft:photoGoalIndex";
    let idx = [];
    try { idx = JSON.parse((await window.storage.get(indexKey)).value); } catch (_e) { /* best-effort */ }
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

  // ── Sub-components PrimarySlot and Thumb defined at module scope above ──

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
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, marginBottom:10, padding:"6px 10px", background:`${C.orange}15`, borderRadius:6 }}>
          {error}
        </div>
      )}

      {/* Progress timeline strip */}
      {progressPhotos.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal, letterSpacing:1 }}>PROGRESS TIMELINE · {progressPhotos.length}</div>
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
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, letterSpacing:1 }}>GOAL BOARD · {goalPhotos.length}</div>
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
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textAlign:"center", marginTop:6 }}>
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
                    &quot;{photo.caption}&quot;
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
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, marginBottom:8, textAlign:"center" }}>Delete this photo permanently?</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex:1, padding:"8px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:C.surface, border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer" }}>CANCEL</button>
                  <button onClick={onDelete} style={{ flex:1, padding:"8px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:C.orange, border:"none", color:C.white, cursor:"pointer", fontWeight:600 }}>DELETE</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:4 }}>CAPTION</div>
              <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2}
                placeholder="e.g. post-workout, good lighting"
                style={{ width:"100%", boxSizing:"border-box", padding:"8px 10px", borderRadius:8, fontFamily:F.body, fontSize:12, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.white, resize:"vertical" }} />
            </div>
            {type === "progress" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                <div>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:4 }}>WEIGHT (lbs)</div>
                  <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="175.8"
                    style={{ width:"100%", boxSizing:"border-box", padding:"8px 10px", borderRadius:8, fontFamily:F.mono, fontSize:12, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.white }} />
                </div>
                <div>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:4 }}>BODY FAT %</div>
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



// ── ProfileTab (V2.2 Chunk A — nested sub-tabs: OVERVIEW / PLAN / STATS) ──
export function ProfileTab({ data, _updateData, onLogMeasurements, onLogMeal, onLogPR, onEditDay, onOpenSettings }) {
  const [subTab, setSubTab] = React.useState("overview");
  const subTabs = [
    { id:"overview", label:"OVERVIEW" },
    { id:"plan",     label:"PLAN"     },
    { id:"stats",    label:"STATS"    },
  ];
  return (
    <div>
      {/* Profile header with gear */}
      <div style={{ padding:"18px 16px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontFamily:F.display, fontSize:22, color:C.lime, letterSpacing:2 }}>PROFILE</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>progress · plan · stats</div>
        </div>
        <button onClick={onOpenSettings}
          style={{ background:C.surface, border:"1px solid "+C.border, borderRadius:10, padding:"8px 11px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, marginTop:2 }}>
          <Settings size={13} color={C.gray} />
          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>SETTINGS</span>
        </button>
      </div>

      {/* Sub-tab pills */}
      <div style={{ display:"flex", padding:"12px 16px 0", gap:6 }}>
        {subTabs.map(function(st) {
          const active = subTab === st.id;
          return (
            <button key={st.id} onClick={() => setSubTab(st.id)}
              style={{ flex:1, padding:"9px 0", background:active?"rgba(200,255,0,0.08)":"none", border:"1px solid "+(active?C.lime:C.border), borderRadius:8, fontFamily:F.mono, fontSize:11, color:active?C.lime:C.gray, cursor:"pointer", letterSpacing:0.5 }}>
              {st.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {subTab === "overview" && (
        <div style={{ padding:"14px 16px" }}>
          <VisionBoard data={data} />
        </div>
      )}
      {subTab === "plan" && <PlanTab data={data} />}
      {subTab === "stats" && (
        <div style={{ padding:"14px 16px" }}>
          <GainsTab data={data}
            onLogMeasurements={onLogMeasurements}
            onLogMeal={onLogMeal}
            onLogPR={onLogPR}
            onEditDay={onEditDay}
          />
        </div>
      )}
    </div>
  );
}

// ── CoachDrawer (V2.2 Chunk A — full-screen bottom-sheet overlay) ──────────

