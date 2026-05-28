import React, { useState } from "react";

import { XAxis, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from "recharts";
import { C, F } from "../constants";
import { getToday, toLocalDateStr } from "../utils";

function MacroRow({ label, val, target, color, unit }) {
  const pct = Math.min(100, Math.round((val / target) * 100));
  const over = val > target;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1 }}>{label}</span>
          <span style={{ fontFamily:F.display, fontSize:22, color: over ? C.orange : color }}>{Math.round(val)}</span>
          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{unit || "g"}</span>
        </div>
        <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
          <span style={{ fontFamily:F.mono, fontSize:11, color:over?C.orange:color, fontWeight:700 }}>{pct}%</span>
          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>/ {target}{unit||"g"}</span>
        </div>
      </div>
      <div style={{ height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", width:pct+"%", background: over ? C.orange : color, borderRadius:3, transition:"width .5s ease" }} />
      </div>
    </div>
  );
}

// ── today view ────────────────────────────────────────────────────
function TodayView({ todayMeals, calTarget, protTarget, carbTarget, fatTarget, microExpanded, setMicroExpanded, todayItems, onLogMeal, t, setEditingItem, deleteMealItem }) {
  return (
    <div>
      {/* Macro summary */}
      <div style={{ background:C.surface, border:"1px solid "+C.border, borderRadius:16, padding:18, marginBottom:12 }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:14 }}>TODAY{"'"} MACROS</div>
        <MacroRow label="KCAL"    val={todayMeals.calories} target={calTarget}  color={C.lime}   unit="kcal" />
        <MacroRow label="PROTEIN" val={todayMeals.protein}  target={protTarget} color={C.teal}   />
        <MacroRow label="CARBS"   val={todayMeals.carbs}    target={carbTarget} color={C.orange} />
        <MacroRow label="FAT"     val={todayMeals.fat}      target={fatTarget}  color={C.purple} />
      </div>

      {/* Micro breakdown — expandable */}
      <div style={{ background:C.surface, border:"1px solid "+C.border, borderRadius:14, marginBottom:12, overflow:"hidden" }}>
        <button onClick={() => setMicroExpanded(e => !e)}
          style={{ width:"100%", padding:"13px 16px", background:"none", border:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5 }}>MICROS</span>
          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{microExpanded ? "▲" : "▼"}</span>
        </button>
        {microExpanded && (
          <div style={{ padding:"0 16px 14px" }}>
            {(() => {
              // Sum micros from entries[].items[] — todayItems (strings) don't carry micros
              const totals = { fiber:0, sugar:0, sodium:0, potassium:0, vitaminD:0, calcium:0, iron:0, zinc:0 };
              let hasMicros = false;
              const entryItems = (todayMeals.entries || []).flatMap(function(e) { return e.items || []; });
              entryItems.forEach(function(item) {
                if (item && item.micros) {
                  hasMicros = true;
                  Object.keys(totals).forEach(function(k) { totals[k] += (item.micros[k] || 0); });
                }
              });
              if (!hasMicros) return (
                <div style={{ textAlign:"center", padding:"12px 0 4px" }}>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:4 }}>No micro data yet</div>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, opacity:0.6, lineHeight:1.5 }}>
                    Use the AI meal scan or photo log to<br/>auto-populate fiber, sodium, vitamins &amp; more
                  </div>
                </div>
              );
              const rows = [
                { label:"Fiber",    val:totals.fiber,     unit:"g",  dv:28,   color:C.teal },
                { label:"Sugar",    val:totals.sugar,     unit:"g",  dv:50,   color:C.amber },
                { label:"Sodium",   val:totals.sodium,    unit:"mg", dv:2300, color:C.orange },
                { label:"Potassium",val:totals.potassium, unit:"mg", dv:3500, color:C.lime },
                { label:"Vit D",    val:totals.vitaminD,  unit:"IU", dv:600,  color:C.teal },
                { label:"Calcium",  val:totals.calcium,   unit:"mg", dv:1000, color:C.white },
                { label:"Iron",     val:totals.iron,      unit:"mg", dv:8,    color:C.orange },
                { label:"Zinc",     val:totals.zinc,      unit:"mg", dv:11,   color:C.purple },
              ];
              return (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px" }}>
                  {rows.map(function(r) {
                    const pct = Math.min(100, Math.round((r.val / r.dv) * 100));
                    return (
                      <div key={r.label}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{r.label}</span>
                          <span style={{ fontFamily:F.mono, fontSize:11, color:r.color }}>{Math.round(r.val)}{r.unit}</span>
                        </div>
                        <div style={{ height:3, background:C.border, borderRadius:2, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:pct+"%", background:r.color, borderRadius:2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Log meal CTA */}
      <button onClick={onLogMeal} style={{ width:"100%", padding:"15px", background:"rgba(200,255,0,0.08)", border:"1px solid rgba(200,255,0,0.4)", borderRadius:12, fontFamily:F.mono, fontSize:13, color:C.lime, cursor:"pointer", letterSpacing:1, fontWeight:700, marginBottom:12 }}>
        + LOG MEAL
      </button>

      {/* Today's meal items */}
      <div style={{ background:C.surface, border:"1px solid "+C.border, borderRadius:14, overflow:"hidden" }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, padding:"12px 16px 10px" }}>
          {"TODAY'S MEALS"}
          {todayItems.length > 0 && (
            <span style={{ color:C.border, marginLeft:6 }}>— {todayItems.length} item{todayItems.length!==1?"s":""}</span>
          )}
        </div>
        {todayItems.length === 0 ? (
          <div style={{ padding:"20px 16px", textAlign:"center" }}>
            <div style={{ fontSize:28, marginBottom:6 }}>{"🍽️"}</div>
            <div style={{ fontFamily:F.mono, fontSize:12, color:C.gray }}>Nothing logged yet today</div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, opacity:0.6, marginTop:3 }}>Tap + LOG MEAL to start</div>
          </div>
        ) : (
          todayItems.map(function(item, i) {
            const name = typeof item === "string" ? item : (item.description || item.name || "Meal");
            const kcal = typeof item === "object" ? Math.round(item.calories||0) : null;
            const prot = typeof item === "object" ? Math.round(item.protein||0) : null;
            const carb = typeof item === "object" ? Math.round(item.carbs||0)   : null;
            const fat  = typeof item === "object" ? Math.round(item.fat||0)     : null;
            return (
              <div key={i} style={{ borderTop:"1px solid "+C.border, padding:"11px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, color:C.white, marginBottom:kcal!=null?3:0, fontWeight:500 }}>{name}</div>
                    {kcal != null && (
                      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>
                        <span style={{ color:C.lime, fontWeight:700 }}>{kcal} kcal</span>
                        {prot!=null && <span>{"  "}{prot}P · {carb}C · {fat}F</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    {typeof item === "object" && item.id && (
                      <button onClick={() => setEditingItem({ date:t, entryId:item.id, item })}
                        style={{ background:C.surfaceAlt, border:"1px solid "+C.border, borderRadius:6, padding:"4px 8px", cursor:"pointer", fontFamily:F.mono, fontSize:11, color:C.gray }}>
                        ✏️
                      </button>
                    )}
                    {/* Delete: use stable entry.id; index fallback only for legacy string items */}
                    <button onClick={() => item.id ? deleteMealItem(t, item.id) : deleteMealItem(t, String(i))}
                      style={{ background:"rgba(255,90,0,0.1)", border:"1px solid rgba(255,90,0,0.3)", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontFamily:F.mono, fontSize:11, color:C.orange }}>
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── RangeToggle — extracted from HistoryView to avoid component-in-render violation ──
function RangeToggle({ histRange, setHistRange }) {
  return (
    <div style={{ display:"flex", gap:6, marginBottom:14 }}>
      {[7,30].map(function(n) {
        const active = histRange === n;
        return (
          <button key={n} onClick={() => setHistRange(n)}
            style={{ flex:1, padding:"9px 0", background:active?"rgba(200,255,0,0.08)":"none", border:"1px solid "+(active?C.lime:C.border), borderRadius:8, fontFamily:F.mono, fontSize:11, color:active?C.lime:C.gray, cursor:"pointer" }}>
            {n === 7 ? "7 DAYS" : "30 DAYS"}
          </button>
        );
      })}
    </div>
  );
}

// ── history view ──────────────────────────────────────────────────
function HistoryView({ histRange, setHistRange, data, t, calTarget, protTarget, carbTarget, fatTarget, chartMacro, setChartMacro, histView, setHistView, lastNDays, expandedDay, setExpandedDay, deleteMealItem, setEditingItem }) {
  const days = lastNDays(histRange);
  const chartData = days.slice().reverse().map(function(date) {
    const d = data.meals[date];
    const label = date.slice(5);
    return { date, label, kcal: d ? Math.round(d.calories) : 0, protein: d ? Math.round(d.protein) : 0, carbs: d ? Math.round(d.carbs) : 0, fat: d ? Math.round(d.fat) : 0 };
  });
  const macroTargets = { kcal: calTarget, protein: protTarget, carbs: carbTarget, fat: fatTarget };
  const macroColors  = { kcal: C.lime, protein: "#9D7FFF", carbs: C.amber, fat: C.orange };
  const macroLabels  = { kcal: "KCAL", protein: "PROTEIN g", carbs: "CARBS g", fat: "FAT g" };
  const activeTarget = macroTargets[chartMacro];
  const activeColor  = macroColors[chartMacro];

  // ── Micro averages across selected range ──
  const microKeys = ["fiber","sugar","sodium","potassium","vitaminD","calcium","iron","zinc"];
  const microMeta = [
    { key:"fiber",     label:"Fiber",     unit:"g",  dv:28,   color:C.teal },
    { key:"sugar",     label:"Sugar",     unit:"g",  dv:50,   color:C.amber },
    { key:"sodium",    label:"Sodium",    unit:"mg", dv:2300, color:C.orange },
    { key:"potassium", label:"Potassium", unit:"mg", dv:3500, color:C.lime },
    { key:"vitaminD",  label:"Vit D",     unit:"IU", dv:600,  color:C.teal },
    { key:"calcium",   label:"Calcium",   unit:"mg", dv:1000, color:C.white },
    { key:"iron",      label:"Iron",      unit:"mg", dv:8,    color:C.orange },
    { key:"zinc",      label:"Zinc",      unit:"mg", dv:11,   color:"#9D7FFF" },
  ];
  const microTotals = {};
  microKeys.forEach(function(k) { microTotals[k] = 0; });
  let microDaysWithData = 0;
  days.forEach(function(date) {
    const d = data.meals[date];
    if (!d) return;
    const items = (d.entries || []).flatMap(function(e) { return e.items || []; });
    let dayHas = false;
    items.forEach(function(item) {
      if (item && item.micros) {
        dayHas = true;
        microKeys.forEach(function(k) { microTotals[k] += (item.micros[k] || 0); });
      }
    });
    if (dayHas) microDaysWithData++;
  });
  const microAvgs = {};
  microKeys.forEach(function(k) { microAvgs[k] = microDaysWithData > 0 ? Math.round(microTotals[k] / microDaysWithData) : 0; });

  // ── range + view toggles ── (RangeToggle defined at module scope above)

  return (
    <div>
      {/* MACROS / MICROS toggle */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {["macros","micros"].map(function(v) {
          const active = histView === v;
          return (
            <button key={v} onClick={() => setHistView(v)}
              style={{ flex:1, padding:"9px 0", background:active?"rgba(200,255,0,0.08)":"none", border:"1px solid "+(active?C.lime:C.border), borderRadius:8, fontFamily:F.mono, fontSize:11, color:active?C.lime:C.gray, cursor:"pointer", letterSpacing:1, textTransform:"uppercase" }}>
              {v}
            </button>
          );
        })}
      </div>

      {/* ═══ MACROS VIEW ═══ */}
      {histView === "macros" && (
        <div>
          <RangeToggle histRange={histRange} setHistRange={setHistRange} />
          {/* Macro chart */}
          <div style={{ background:C.surface, border:"1px solid "+C.border, borderRadius:14, padding:"14px 10px 10px", marginBottom:12 }}>
            <div style={{ display:"flex", gap:5, marginBottom:12, paddingLeft:4, paddingRight:4 }}>
              {["kcal","protein","carbs","fat"].map(function(m) {
                const active = chartMacro === m;
                const clr = macroColors[m];
                return (
                  <button key={m} onClick={() => setChartMacro(m)}
                    style={{ flex:1, padding:"7px 0", background:active?clr+"22":"none", border:"1px solid "+(active?clr:C.border), borderRadius:7, fontFamily:F.mono, fontSize:11, color:active?clr:C.gray, cursor:"pointer", letterSpacing:0.5 }}>
                    {macroLabels[m]}
                  </button>
                );
              })}
            </div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:0.8, marginBottom:8, paddingLeft:4 }}>
              <span style={{ color:activeColor }}>{macroLabels[chartMacro]}</span>
              <span style={{ color:C.border, marginLeft:8 }}>— — target {activeTarget}{chartMacro==="kcal"?" kcal":" g"}</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} barCategoryGap="20%">
                <XAxis dataKey="label" tick={{ fontFamily:"monospace", fontSize:11, fill:C.gray }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background:C.bg, border:"1px solid "+C.border, borderRadius:8, fontFamily:"monospace", fontSize:11 }}
                  formatter={function(val) { return [val+(chartMacro==="kcal"?" kcal":" g"), macroLabels[chartMacro]]; }}
                  labelStyle={{ color:C.gray }}
                />
                <ReferenceLine y={activeTarget} stroke={activeColor} strokeDasharray="4 4" strokeWidth={1} />
                <Bar dataKey={chartMacro} fill={activeColor} radius={[3,3,0,0]}
                  cell={chartData.map(function(d, i) {
                    const val = d[chartMacro];
                    return React.createElement("cell", { key: i, fill: val >= activeTarget ? activeColor : val >= activeTarget*0.8 ? activeColor+"99" : C.border });
                  })}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Daily log */}
          <div style={{ background:C.surface, border:"1px solid "+C.border, borderRadius:14, overflow:"hidden" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, padding:"12px 16px 10px" }}>DAILY LOG</div>
            {days.map(function(date) {
              const d = data.meals[date];
              const kcal    = d ? Math.round(d.calories) : 0;
              const protein = d ? Math.round(d.protein)  : 0;
              const items   = d ? (d.entries && d.entries.length > 0 ? d.entries : (d.items || [])) : [];
              const isToday = date === t;
              const isYest  = (() => { const y = new Date(); y.setDate(y.getDate()-1); return date === toLocalDateStr(y); })();
              const label   = isToday ? "TODAY" : isYest ? "YESTERDAY" : date.slice(5);
              const pct     = Math.min(100, Math.round((kcal / calTarget) * 100));
              const expanded = expandedDay === date;
              // micros for this day (from entries)
              const dayMicros = { fiber:0, sugar:0, sodium:0, potassium:0, vitaminD:0, calcium:0, iron:0, zinc:0 };
              let dayHasMicros = false;
              if (d) {
                (d.entries || []).flatMap(function(e) { return e.items || []; }).forEach(function(item) {
                  if (item && item.micros) {
                    dayHasMicros = true;
                    Object.keys(dayMicros).forEach(function(k) { dayMicros[k] += (item.micros[k] || 0); });
                  }
                });
              }
              return (
                <div key={date} style={{ borderTop:"1px solid "+C.border }}>
                  <button onClick={() => setExpandedDay(expanded ? null : date)}
                    style={{ width:"100%", padding:"11px 14px", background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:10, textAlign:"left" }}>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:isToday?C.lime:C.gray, width:80, flexShrink:0 }}>{label}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ height:4, background:C.border, borderRadius:2, overflow:"hidden", marginBottom:3 }}>
                        <div style={{ height:"100%", width:pct+"%", background:kcal>=calTarget?C.lime:C.teal, borderRadius:2 }} />
                      </div>
                      <div style={{ fontFamily:F.mono, fontSize:11, color:C.white }}>
                        <span style={{ color:kcal>=calTarget?C.lime:C.white, fontWeight:kcal>0?700:400 }}>{kcal > 0 ? kcal+" kcal" : "—"}</span>
                        {protein > 0 && <span style={{ color:C.gray, marginLeft:8 }}>· {protein}g P</span>}
                        {dayHasMicros && <span style={{ color:C.teal, marginLeft:8, fontSize:11 }}>· micros</span>}
                      </div>
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{expanded?"▲":"▼"}</div>
                  </button>
                  {expanded && (
                    <div style={{ padding:"0 14px 12px" }}>
                      {items.length === 0 ? (
                        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, padding:"6px 0" }}>No items logged</div>
                      ) : (
                        items.map(function(item, i) {
                          const nm  = typeof item === "string" ? item : (item.description || item.name || "Meal");
                          const kc  = typeof item === "object" ? Math.round(item.calories||0) : null;
                          const pr  = typeof item === "object" ? Math.round(item.protein||0)  : null;
                          const cr  = typeof item === "object" ? Math.round(item.carbs||0)    : null;
                          const fa  = typeof item === "object" ? Math.round(item.fat||0)      : null;
                          return (
                            <div key={i} style={{ padding:"8px 0", borderTop:i===0?"none":"1px solid "+C.border, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, color:C.white, marginBottom:kc!=null?2:0 }}>{nm}</div>
                                {kc != null && (
                                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>
                                    <span style={{ color:C.lime }}>{kc} kcal</span>
                                    {pr!=null && <span>{"  "}{pr}P · {cr}C · {fa}F</span>}
                                  </div>
                                )}
                              </div>
                              <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                                {typeof item === "object" && item.id && (
                                  <button onClick={() => setEditingItem({ date, entryId:item.id, item })}
                                    style={{ background:C.surfaceAlt, border:"1px solid "+C.border, borderRadius:5, padding:"3px 7px", cursor:"pointer", fontFamily:F.mono, fontSize:11, color:C.gray }}>✏️</button>
                                )}
                                <button onClick={() => item.id ? deleteMealItem(date, item.id) : deleteMealItem(date, String(i))}
                                  style={{ background:"rgba(255,90,0,0.1)", border:"1px solid rgba(255,90,0,0.3)", borderRadius:5, padding:"3px 7px", cursor:"pointer", fontFamily:F.mono, fontSize:11, color:C.orange }}>🗑</button>
                              </div>
                            </div>
                          );
                        })
                      )}
                      {/* Expandable micro section for this day */}
                      {dayHasMicros && (
                        <div style={{ marginTop:8, borderTop:"1px solid "+C.border, paddingTop:8 }}>
                          <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal, letterSpacing:1, marginBottom:8 }}>MICROS</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 14px" }}>
                            {microMeta.map(function(m) {
                              const val = Math.round(dayMicros[m.key]);
                              if (val === 0) return null;
                              const pct2 = Math.min(100, Math.round((val / m.dv) * 100));
                              return (
                                <div key={m.key}>
                                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                                    <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{m.label}</span>
                                    <span style={{ fontFamily:F.mono, fontSize:11, color:m.color }}>{val}{m.unit}</span>
                                  </div>
                                  <div style={{ height:2, background:C.border, borderRadius:2, overflow:"hidden" }}>
                                    <div style={{ height:"100%", width:pct2+"%", background:m.color, borderRadius:2 }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ MICROS VIEW ═══ */}
      {histView === "micros" && (
        <div>
          <RangeToggle histRange={histRange} setHistRange={setHistRange} />
          <div style={{ background:C.surface, border:"1px solid "+C.border, borderRadius:14, padding:"16px 16px 14px", marginBottom:12 }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:4 }}>AVG / DAY</div>
            {microDaysWithData === 0 ? (
              <div style={{ textAlign:"center", padding:"20px 0" }}>
                <div style={{ fontFamily:F.mono, fontSize:12, color:C.gray }}>No micro data yet in this range</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, opacity:0.6, marginTop:4, lineHeight:1.5 }}>Use AI meal scan or photo log<br/>to auto-populate micros going forward</div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:14, opacity:0.7 }}>Based on {microDaysWithData} day{microDaysWithData!==1?"s":""} with micro data</div>
                {microMeta.map(function(m) {
                  const avg = microAvgs[m.key];
                  const pct2 = Math.min(100, Math.round((avg / m.dv) * 100));
                  return (
                    <div key={m.key} style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
                        <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1 }}>{m.label}</span>
                          <span style={{ fontFamily:F.display, fontSize:20, color:m.color }}>{avg}</span>
                          <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{m.unit}</span>
                        </div>
                        <span style={{ fontFamily:F.mono, fontSize:11, color:pct2>=80?m.color:C.gray, fontWeight:700 }}>{pct2}%</span>
                      </div>
                      <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:pct2+"%", background:m.color, borderRadius:3 }} />
                      </div>
                      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2, opacity:0.6 }}>DV: {m.dv}{m.unit}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Per-day micro log */}
          <div style={{ background:C.surface, border:"1px solid "+C.border, borderRadius:14, overflow:"hidden" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, padding:"12px 16px 10px" }}>DAILY MICRO LOG</div>
            {days.map(function(date) {
              const d = data.meals[date];
              const isToday = date === t;
              const isYest  = (() => { const y = new Date(); y.setDate(y.getDate()-1); return date === toLocalDateStr(y); })();
              const label   = isToday ? "TODAY" : isYest ? "YESTERDAY" : date.slice(5);
              const dayMicro = { fiber:0, sugar:0, sodium:0, potassium:0, vitaminD:0, calcium:0, iron:0, zinc:0 };
              let hasMicro = false;
              if (d) {
                (d.entries || []).flatMap(function(e) { return e.items || []; }).forEach(function(item) {
                  if (item && item.micros) {
                    hasMicro = true;
                    Object.keys(dayMicro).forEach(function(k) { dayMicro[k] += (item.micros[k] || 0); });
                  }
                });
              }
              const expanded = expandedDay === date;
              return (
                <div key={date} style={{ borderTop:"1px solid "+C.border }}>
                  <button onClick={() => setExpandedDay(expanded ? null : date)}
                    style={{ width:"100%", padding:"11px 14px", background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:10, textAlign:"left" }}>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:isToday?C.lime:C.gray, width:80, flexShrink:0 }}>{label}</div>
                    <div style={{ flex:1, fontFamily:F.mono, fontSize:11, color:hasMicro?C.white:C.gray }}>
                      {hasMicro ? `${Math.round(dayMicro.fiber)}g fiber · ${Math.round(dayMicro.sodium)}mg Na · ${Math.round(dayMicro.potassium)}mg K` : "—"}
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{expanded?"▲":"▼"}</div>
                  </button>
                  {expanded && hasMicro && (
                    <div style={{ padding:"0 14px 14px" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px" }}>
                        {microMeta.map(function(m) {
                          const val = Math.round(dayMicro[m.key]);
                          const pct2 = Math.min(100, Math.round((val / m.dv) * 100));
                          return (
                            <div key={m.key}>
                              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                                <span style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{m.label}</span>
                                <span style={{ fontFamily:F.mono, fontSize:11, color:m.color }}>{val}{m.unit}</span>
                              </div>
                              <div style={{ height:3, background:C.border, borderRadius:2, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:pct2+"%", background:m.color, borderRadius:2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ── ItemEditSheet — hoisted out of FuelTab to prevent re-mount on every render ──
// Must be top-level so React can reconcile it across FuelTab re-renders.
function ItemEditSheet({ editingItem, onClose, onSave }) {
  const orig = editingItem.item;
  const [kcal, setKcal] = useState(String(Math.round(orig.calories||0)));
  const [prot, setProt] = useState(String(Math.round(orig.protein||0)));
  const [carb, setCarb] = useState(String(Math.round(orig.carbs||0)));
  const [fat,  setFat]  = useState(String(Math.round(orig.fat||0)));
  const inputStyle = { background:"#1A1A22", border:"1px solid "+C.border, borderRadius:8, padding:"10px 12px", fontFamily:F.mono, fontSize:15, color:C.white, width:"100%", boxSizing:"border-box", outline:"none", textAlign:"right" };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:600, display:"flex", flexDirection:"column" }}>
      <div onClick={onClose} style={{ flex:1, background:"rgba(0,0,0,0.72)" }} />
      <div style={{ background:C.bg, borderTop:"2px solid "+C.border, borderRadius:"18px 18px 0 0", padding:"18px 16px 30px", maxWidth:480, width:"100%", margin:"0 auto" }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:4 }}>EDIT MEAL ITEM</div>
        <div style={{ fontSize:14, color:C.white, marginBottom:16, fontWeight:500 }}>{orig.description || orig.name || "Meal"}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          {[["KCAL", kcal, setKcal], ["PROTEIN g", prot, setProt], ["CARBS g", carb, setCarb], ["FAT g", fat, setFat]].map(function(row) {
            return (
              <div key={row[0]}>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:5 }}>{row[0]}</div>
                <input type="number" value={row[1]} onChange={function(e) { row[2](e.target.value); }}
                  style={inputStyle} />
              </div>
            );
          })}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:"12px", background:C.surface, border:"1px solid "+C.border, borderRadius:10, fontFamily:F.mono, fontSize:12, color:C.gray, cursor:"pointer" }}>CANCEL</button>
          <button onClick={() => onSave(editingItem.date, editingItem.entryId, { calories:parseFloat(kcal)||0, protein:parseFloat(prot)||0, carbs:parseFloat(carb)||0, fat:parseFloat(fat)||0 })}
            style={{ flex:2, padding:"12px", background:C.lime, border:"none", borderRadius:10, fontFamily:F.mono, fontSize:12, color:C.dark, cursor:"pointer", fontWeight:700, letterSpacing:1 }}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

// ── FuelTab (V2.2 Chunk B — full nutrition hub) ─────────────────────────────
export function FuelTab({ data, updateData, onLogMeal }) {
  const [view, setView]               = useState("today");   // "today" | "history"
  const [histRange, setHistRange]     = useState(7);          // 7 | 30
  const [microExpanded, setMicroExpanded] = useState(false);
  const [editingItem, setEditingItem] = useState(null);       // {date, idx, item}
  const [expandedDay, setExpandedDay] = useState(null);       // date string in history
  const [chartMacro, setChartMacro]   = useState("kcal");     // "kcal"|"protein"|"carbs"|"fat"
  const [histView,   setHistView]     = useState("macros");   // "macros"|"micros"

  const t = getToday();
  const todayMeals = data.meals[t] || { calories:0, protein:0, carbs:0, fat:0, items:[] };
  // FIX 1: derive display items from V2 entries[] shape; fall back to legacy .items
  // Display entries themselves (each entry = one logged meal); sub-items shown inside entry
  const todayItems = (todayMeals.entries && todayMeals.entries.length > 0)
    ? todayMeals.entries
    : (todayMeals.items || []);

  const calTarget  = data.profile?.calorieTarget?.training || 3200;
  const protTarget = data.profile?.proteinTarget            || 240;
  const carbTarget = data.profile?.carbTarget               || 320;
  const fatTarget  = data.profile?.fatTarget                ||  85;

  // ── helpers ──────────────────────────────────────────────────────
  async function deleteMealItem(date, entryId) {
    const day = data.meals[date] || { calories:0, protein:0, carbs:0, fat:0, entries:[] };
    const updated = {
      ...day,
      entries: (day.entries || []).filter(e => e.id !== entryId),
    };
    // Recompute day-level totals from remaining entries
    const allItems = updated.entries.flatMap(e => e.items || []);
    const hasMacroItems = allItems.some(i => typeof i === "object" && (i.calories || i.protein));
    if (hasMacroItems) {
      updated.calories = allItems.reduce((s, i) => s + (i.calories || 0), 0);
      updated.protein  = allItems.reduce((s, i) => s + (i.protein  || 0), 0);
      updated.carbs    = allItems.reduce((s, i) => s + (i.carbs    || 0), 0);
      updated.fat      = allItems.reduce((s, i) => s + (i.fat      || 0), 0);
    } else {
      // Re-sum from entries directly (each entry has its own macro totals)
      updated.calories = updated.entries.reduce((s, e) => s + (e.calories || 0), 0);
      updated.protein  = updated.entries.reduce((s, e) => s + (e.protein  || 0), 0);
      updated.carbs    = updated.entries.reduce((s, e) => s + (e.carbs    || 0), 0);
      updated.fat      = updated.entries.reduce((s, e) => s + (e.fat      || 0), 0);
    }
    await updateData("meals", { ...data.meals, [date]: updated });
  }

  async function saveItemEdit(date, entryId, patch) {
    const day = data.meals[date] || { calories:0, protein:0, carbs:0, fat:0, entries:[] };
    const entries = day.entries || [];
    const entryIdx = entries.findIndex(e => e.id === entryId);
    if (entryIdx === -1) { setEditingItem(null); return; } // entry not found, bail
    const updatedEntries = entries.map((e, i) =>
      i === entryIdx ? { ...e, ...patch } : e
    );
    // Recompute day-level totals from entries
    const tot = updatedEntries.reduce((s, e) => ({
      calories: s.calories + (e.calories || 0),
      protein:  s.protein  + (e.protein  || 0),
      carbs:    s.carbs    + (e.carbs    || 0),
      fat:      s.fat      + (e.fat      || 0),
    }), { calories:0, protein:0, carbs:0, fat:0 });
    await updateData("meals", { ...data.meals, [date]: { ...day, ...tot, entries: updatedEntries } });
    setEditingItem(null);
  }

  // ── last N days ──────────────────────────────────────────────────
  function lastNDays(n) {
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return toLocalDateStr(d);
    });
  }

  // ItemEditSheet is defined as a top-level component above FuelTab

  // ── render ────────────────────────────────────────────────────────
  return (
    <div style={{ padding:"18px 16px" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16 }}>
        <div>
          <div style={{ fontFamily:F.display, fontSize:24, color:C.lime, letterSpacing:2 }}>FUEL</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>nutrition · macros · history</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {["today","history"].map(function(v) {
            const active = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                style={{ padding:"7px 14px", background:active?"rgba(200,255,0,0.1)":"none", border:"1px solid "+(active?C.lime:C.border), borderRadius:8, fontFamily:F.mono, fontSize:11, color:active?C.lime:C.gray, cursor:"pointer", textTransform:"uppercase", letterSpacing:0.5 }}>
                {v}
              </button>
            );
          })}
        </div>
      </div>

      {view === "today" && <TodayView
        todayMeals={todayMeals}
        calTarget={calTarget}
        protTarget={protTarget}
        carbTarget={carbTarget}
        fatTarget={fatTarget}
        microExpanded={microExpanded}
        setMicroExpanded={setMicroExpanded}
        todayItems={todayItems}
        onLogMeal={onLogMeal}
        t={t}
        setEditingItem={setEditingItem}
        deleteMealItem={deleteMealItem}
      />}
      {view === "history" && <HistoryView
        histRange={histRange}
        setHistRange={setHistRange}
        data={data}
        t={t}
        calTarget={calTarget}
        protTarget={protTarget}
        carbTarget={carbTarget}
        fatTarget={fatTarget}
        chartMacro={chartMacro}
        setChartMacro={setChartMacro}
        histView={histView}
        setHistView={setHistView}
        lastNDays={lastNDays}
        expandedDay={expandedDay}
        setExpandedDay={setExpandedDay}
        deleteMealItem={deleteMealItem}
        setEditingItem={setEditingItem}
      />}
      {editingItem && <ItemEditSheet editingItem={editingItem} onClose={() => setEditingItem(null)} onSave={saveItemEdit} />}
    </div>
  );
}

// ── ProfileTab (V2.2 Chunk A — nested sub-tabs: OVERVIEW / PLAN / STATS) ──

