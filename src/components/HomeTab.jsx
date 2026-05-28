import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { C, F, DAYS, SPLIT_MAP, WORKOUTS } from "../constants";
import { getToday, toLocalDateStr, getCompletenessItems, calc1RM } from "../utils";
import { computeTodayScore, calcProteinConsistency } from "../lib/scoring";

import { QuadrantRings } from "./QuadrantRings";
import { shouldAutoBackup, pushBackupToGit, getLastBackupInfo, daysSince, downloadBackup, detectMobileAppContext, BACKUP_NAG_DAYS } from "../lib/storage";
import { ScoreTrendChart } from "./ScoreTrendChart";
import { PillarInfoDrawer } from "./PillarInfoDrawer";

// ── UI Primitives ─────────────────────────────────────────────────
export function Card({ children, style, highlight, ...rest }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${highlight ? C.lime : C.border}`,
      borderRadius: 16,
      padding: 18,
      marginBottom: 12,
      ...style,
    }} {...rest}>
      {children}
    </div>
  );
}

export function SL({ children, color }) {
  return (
    <div style={{
      fontFamily: F.mono,
      fontSize: 11,
      color: color || C.gray,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

export function BigN({ children, unit, color, size }) {
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

export function MBar({ value, target, color }) {
  const pct = Math.min((value / target) * 100, 100);
  return (
    <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .6s ease" }} />
    </div>
  );
}

export function Tag({ children, color }) {
  const c = color || C.lime;
  return (
    <div style={{
      background: `${c}18`,
      border: `1px solid ${c}`,
      borderRadius: 6,
      padding: "2px 8px",
      fontFamily: F.mono,
      fontSize: 11,
      color: c,
      display: "inline-flex",
      alignItems: "center",
    }}>
      {children}
    </div>
  );
}

export function SBtn({ onClick, children, color }) {
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
        fontSize: 11,
        color: c,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}



export function MobileWebViewBanner() {
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
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.amber, letterSpacing:0.5, marginBottom:3, fontWeight:600 }}>
            CLAUDE.AI MOBILE APP DETECTED
          </div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.5 }}>
            File uploads (food photos, progress pics) won{"'"} work here. Switch to your phone{"'"} browser to upload.
          </div>
          {!expanded ? (
            <button onClick={() => setExpanded(true)}
              style={{ marginTop:6, background:"none", border:"none", color:C.amber, fontFamily:F.mono, fontSize:11, padding:0, cursor:"pointer", textDecoration:"underline", letterSpacing:0.3 }}>
              Show me how →
            </button>
          ) : (
            <div style={{ marginTop:8, padding:"8px 10px", background:"#1A1A22", borderRadius:6 }}>
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.white, lineHeight:1.6 }}>
                <div>1. Open <span style={{ color:C.amber, fontWeight:600 }}>{isIOS ? "Safari" : "Chrome"}</span> on your phone</div>
                <div>2. Type <span style={{ color:C.amber, fontWeight:600 }}>claude.ai</span> in the address bar</div>
                <div>3. Sign in (same account as the app)</div>
                <div>4. Open this conversation, then this artifact</div>
              </div>
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:8, lineHeight:1.4 }}>
                Your data is the same in both — same account, same storage. Don{"'"} use Publish/Share Link, that creates a separate public copy.
              </div>
              <button onClick={() => setExpanded(false)}
                style={{ marginTop:8, background:"none", border:"none", color:C.gray, fontFamily:F.mono, fontSize:11, padding:0, cursor:"pointer", textDecoration:"underline" }}>
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
export function BackupNagBanner() {
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
    } catch (_e) { /* best-effort */ }
    setDownloading(false);
  }

  return (
    <div style={{ background:`${C.orange}15`, border:`1px solid ${C.orange}`, borderRadius:12, padding:"12px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ fontSize:20 }}>{justDone ? "✓" : "⚠️"}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color: justDone ? C.lime : C.orange, marginBottom:2, letterSpacing:0.5 }}>
          {justDone ? "BACKUP DOWNLOADED" : "BACKUP IS STALE"}
        </div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.4 }}>
          {justDone ? "Saved to Downloads. Move it to Drive/Files for safety." :
            lastDownload ? `Your data lives only on this phone. Last safety copy was ${age} days ago.` : `Your data lives only on this phone. Tap BACKUP to save a JSON copy you can restore from later.`}
        </div>
      </div>
      {!justDone && (
        <button
          onClick={handleBackup}
          disabled={downloading}
          style={{ padding:"6px 12px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:C.orange, border:"none", color:C.white, cursor:"pointer", fontWeight:700, letterSpacing:0.5, whiteSpace:"nowrap" }}
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
export function TodayScoreCard({ data, onAction }) {
  const score = computeTodayScore(data);
  const summary = generateDailySummary(data);
  const oneAction = todayOneAction(data);
  const [_scoreHistory, setScoreHistory] = useState({});
  const [trend, setTrend] = useState(null);
  const [activePillar, setActivePillar] = useState(null);

  const today = getToday();

  // Detect if any meaningful data has been logged today (morning framing)
  const todayMeals = data.meals[today];
  const hasMeals = !!(todayMeals && todayMeals.calories > 0);
  const todayEntry = (data.weightLog || []).find(w => w.date === today);
  const hasSleep = !!(todayEntry && todayEntry.sleep);
  const hasWorkout = (data.workouts || []).some(w => w.date === today);
  const hasAnyData = hasMeals || hasSleep || hasWorkout;

  // Persist today's score + compute trend vs 7d rolling avg
  useEffect(() => {
    let cancelled = false;
    async function go() {
      try {
        let history = {};
        try {
          const r = await window.storage.get("ft:dailyScores");
          if (r && r.value) history = JSON.parse(r.value) || {};
        } catch (_e) { /* best-effort */ }
        history[today] = { composite: score.composite, pillars: score.pillars, ts: Date.now() };
        const cutoff = (() => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - 30); return toLocalDateStr(d); })();
        for (const k of Object.keys(history)) if (k < cutoff) delete history[k];
        await window.storage.set("ft:dailyScores", JSON.stringify(history));
        if (!cancelled) setScoreHistory({ ...history });
        const prevDates = Object.keys(history).filter(d => d < today).sort().slice(-7);
        if (prevDates.length === 0) { if (!cancelled) setTrend(null); return; }
        const avg = Math.round(prevDates.reduce((a, d) => a + (history[d].composite || 0), 0) / prevDates.length);
        const delta = Math.round(score.composite - avg);
        const dir = delta > 4 ? "up" : delta < -4 ? "down" : "flat";
        const ydDate = (() => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - 1); return toLocalDateStr(d); })();
        const ydScore = history[ydDate]?.composite ?? null;
        if (!cancelled) setTrend({ dir, delta, n: prevDates.length, avg, ydScore });
      } catch (_e) { /* best-effort */ }
    }
    go();
    return () => { cancelled = true; };
  }, [score.composite, score.pillars, today]);

  // Morning framing: suppress "SLIPPING" before any data is logged
  const rawLabelColor = score.composite >= 85 ? C.lime
                      : score.composite >= 70 ? C.teal
                      : score.composite >= 55 ? C.amber : C.orange;
  const labelColor = !hasAnyData ? C.teal : rawLabelColor;
  const displayLabel = !hasAnyData ? "TODAY · BUILDING" : score.label;
  const trendIcon = trend ? (trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "▬") : "";
  const trendColor = trend ? (trend.dir === "up" ? C.lime : trend.dir === "down" ? C.orange : C.grayMid) : C.gray;

  return (
    <div style={{ background:C.surface, border:`1px solid ${labelColor}80`, borderRadius:16, padding:16, marginBottom:14 }}>
      {/* Header: label + 7d trend */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5 }}>TODAY SCORE</div>
        {trend && (
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayMid, letterSpacing:0.4 }}>
            7D AVG <span style={{ color:C.grayLight }}>{trend.avg}</span>
            <span style={{ color:trendColor, marginLeft:6 }}>{trendIcon} {trend.delta > 0 ? "+" : ""}{trend.delta}</span>
          </div>
        )}
      </div>
      {/* Big score headline — tap rings below for detail */}
      <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:12 }}>
        <div style={{ fontFamily:F.display, fontSize:54, color:labelColor, lineHeight:1, letterSpacing:2 }}>{score.composite}</div>
        <div style={{ fontFamily:F.display, fontSize:18, color:labelColor, letterSpacing:3, opacity:0.8 }}>{displayLabel}</div>
      </div>
      {/* Rings — full-width hero, tap any ring for detail */}
      <QuadrantRings pillars={score.pillars} composite={score.composite} color={labelColor} onRingTap={setActivePillar} />
      {/* Tap hint */}
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textAlign:"center", marginTop:6, letterSpacing:0.8, opacity:0.6 }}>TAP A RING FOR DETAIL</div>
      {/* Takeaway blurb */}
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.65, margin:"10px 0 12px", padding:"10px 12px", background:"rgba(255,255,255,0.03)", borderRadius:8, borderLeft:`2px solid ${labelColor}40` }}>{summary}</div>
      {oneAction.action && onAction && (
        <button onClick={() => onAction(oneAction.action)} style={{ width:"100%", padding:"11px", background:`${labelColor}18`, border:`1px solid ${labelColor}`, borderRadius:10, color:labelColor, fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>
          → {oneAction.label.toUpperCase()}
        </button>
      )}
      {activePillar && <PillarInfoDrawer pillar={activePillar} score={score} data={data} onClose={() => setActivePillar(null)} />}
    </div>
  );
}


export function HomeTab({ data, onLogMeal, onLogWeight, onAction }) {
  const t = getToday();
  // V2.0 — auto-trigger git backup once per session if enabled + >20h elapsed
  useEffect(() => {
    if (shouldAutoBackup()) {
      pushBackupToGit().catch(() => {}); // silent failure; user can see status in COACH card
    }
  }, []);
  const lastWeight = [...data.weightLog].filter(w => w.weight).pop();
  const currentW = lastWeight?.weight || 175.8;
  const todayEntry = data.weightLog.find(w => w.date === t);
  const lastSleep = todayEntry?.sleep || [...data.weightLog].filter(w => w.sleep).pop()?.sleep;
  const dayName = DAYS[new Date().getDay()];
  const todayWo = SPLIT_MAP[dayName];
  const isRest = !todayWo;

  const lastWo = data.workouts[0];
  const woColor = todayWo ? WORKOUTS[todayWo]?.color : C.gray;

  const checkItems = getCompletenessItems(data);
  const incomplete = checkItems.filter(i => !i.done);
  const score = Math.round(((checkItems.length - incomplete.length) / checkItems.length) * 100);
  const scoreColor = score >= 80 ? C.lime : score >= 50 ? C.amber : C.orange;
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? incomplete : incomplete.slice(0, 3);
  const todayScore = useMemo(
    () => computeTodayScore(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.workouts, data.meals, data.weightLog, data.profile]
  );

  return (
    <div style={{ padding:"18px 16px" }}>

      {/* V2.1 — Today Score (QuadrantRings + morning framing) */}
      <TodayScoreCard data={data} onAction={(act) => {
        if (act === "weight") onLogWeight && onLogWeight();
        else if (act === "meal") onLogMeal && onLogMeal();
        else if (act === "lifts") onAction && onAction("lifts_tab");
      }} />

      {/* V2.1 — 7-day score sparkline (tap to expand 30-day) */}
      <ScoreTrendChart data={data} todayScoreProp={todayScore} />

      {/* B3 — Weekly protein consistency */}
      {(() => {
        const hits = calcProteinConsistency(data);
        return (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 16px",
            background:"#111", borderRadius:12, margin:"0 0 8px" }}>
            <span style={{ fontSize:20 }}>🥩</span>
            <div>
              <div style={{ fontSize:13, color:"#888", fontFamily:"monospace" }}>PROTEIN CONSISTENCY</div>
              <div style={{ fontSize:22, fontWeight:700, color: hits >= 5 ? "#c6f135" : hits >= 3 ? "#FFB800" : "#ff4444" }}>
                {hits}/7 days
              </div>
            </div>
            <div style={{ marginLeft:"auto", fontSize:11, color:"#555" }}>
              ≥90% of target
            </div>
          </div>
        );
      })()}

      {/* V2.0 — Adaptive coach nudges (rule-based MVP) */}
      {(() => {
        const nudges = computeAdaptiveNudges(data);
        if (nudges.length === 0) return null;
        return (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:6, padding:"0 2px" }}>🧠 COACH SAYS</div>
            {nudges.map((n, i) => {
              const accent = n.priority === "high" ? C.orange : n.priority === "medium" ? C.amber : C.teal;
              return (
                <div key={i} style={{ background:C.surface, border:`1px solid ${accent}60`, borderLeft:`3px solid ${accent}`, borderRadius:10, padding:"12px 14px", marginBottom:8, display:"flex", gap:10 }}>
                  <div style={{ fontSize:18, lineHeight:1.2 }}>{n.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:F.mono, fontSize:13, color:accent, fontWeight:700, letterSpacing:0.3, marginBottom:4 }}>{n.title}</div>
                    <div style={{ fontFamily:F.mono, fontSize:12, color:C.grayLight, lineHeight:1.5 }}>{n.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Backup Nag Banner */}
      <BackupNagBanner />

      {/* Daily Checklist Card — top of HOME */}
      {incomplete.length > 0 && (
        <div style={{ background:C.surface, border:`1px solid ${scoreColor}40`, borderRadius:16, padding:16, marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:scoreColor, textTransform:"uppercase", letterSpacing:1.5 }}>Daily Checklist</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{incomplete.length} item{incomplete.length !== 1 ? "s" : ""} to fill in</div>
              </div>
            </div>
            {/* Mini ring */}
            <svg width={44} height={44} viewBox="0 0 44 44">
              <circle cx={22} cy={22} r={17} fill="none" stroke={C.border} strokeWidth={4}/>
              <circle cx={22} cy={22} r={17} fill="none" stroke={scoreColor} strokeWidth={4}
                strokeDasharray={`${2*Math.PI*17}`}
                strokeDashoffset={`${2*Math.PI*17*(1-score/100)}`}
                strokeLinecap="round" transform="rotate(-90 22 22)"/>
              <text x={22} y={26} textAnchor="middle" fill={scoreColor} style={{ fontFamily:"monospace", fontSize:11, fontWeight:700 }}>{score}%</text>
            </svg>
          </div>
          {displayItems.map((item, _i) => (
            <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderTop:`1px solid ${C.border}` }}>
              <div style={{ width:18, height:18, borderRadius:5, border:`1.5px solid ${C.border}`, background:"transparent", flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, color:C.white }}>{item.label}</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>{item.hint}</div>
              </div>
              <button
                onClick={() => onAction && onAction(item.action)}
                style={{ background:`${C.lime}15`, border:`1px solid ${C.lime}40`, borderRadius:6, padding:"3px 9px", fontFamily:F.mono, fontSize:11, color:C.lime, cursor:"pointer", flexShrink:0 }}
              >
                + LOG
              </button>
            </div>
          ))}
          {incomplete.length > 3 && (
            <button onClick={() => setShowAll(s => !s)} style={{ width:"100%", marginTop:8, background:"none", border:"none", fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer", paddingTop:6, borderTop:`1px solid ${C.border}` }}>
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
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>Coach has everything it needs to track your progress</div>
          </div>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <Card style={{ cursor:"pointer" }} onClick={onLogWeight}>
          <SL>Weight</SL>
          <BigN unit="lbs">{currentW}</BigN>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:6 }}>Target → 185–195</div>
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
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:6 }}>Target → 8 hrs</div>
        </Card>
      </div>

      <Card highlight={!!todayWo} style={{ background: todayWo ? "#080E1A" : C.surface }}>
        <SL>{todayWo ? "⚡ Today's Session" : "🧘 Today"}</SL>
        <BigN color={todayWo ? woColor : C.gray} size={36}>{todayWo || "REST DAY"}</BigN>
        {todayWo && (
          <div style={{ fontFamily:F.mono, fontSize:12, color:C.grayMid, marginTop:6 }}>
            {WORKOUTS[todayWo]?.focus} · {WORKOUTS[todayWo]?.duration}
          </div>
        )}
        {isRest && (
          <div style={{ fontFamily:F.mono, fontSize:12, color:C.gray, marginTop:6 }}>
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
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:4 }}>DURATION</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:F.mono, fontSize:17, fontWeight:600, color:C.white }}>{(lastWo.volume / 1000).toFixed(1)}k</div>
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:4 }}>VOLUME</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:F.mono, fontSize:17, fontWeight:600, color:C.white }}>{lastWo.sets}</div>
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:4 }}>SETS</div>
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
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, lineHeight:1.8 }}>
          175.8 → 182 lbs · Fix chest &amp; shoulders · Build consistency
        </div>
        <div style={{ marginTop:10, height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:"8%", background:C.blue, borderRadius:2 }} />
        </div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:4 }}>Week 1 of 16</div>
      </Card>
    </div>
  );
}

// ── Progressive Overload Engine ───────────────────────────────────
// Double progression: own all reps at top of range → add weight
// Returns { prescribedWeight, prescribedReps, lastWeight, lastReps, lastDate, status }


// ── TODAY Tab ─────────────────────────────────────────────────────
// ── Edit Session modal (date/name/duration/note + per-set editing) ──


// ── Helper functions used by HomeTab ────────────────────────────
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

function generateDailySummary(data) {
  const today = getToday();
  const dayName = DAYS[new Date().getDay()];
  const todayWo = SPLIT_MAP[dayName];
  const todayMeals = data.meals[today] || { calories:0, protein:0 };
  const isRest = !todayWo;
  const calTarget = isRest ? (data.profile?.calorieTarget?.rest||2800) : (data.profile?.calorieTarget?.training||3200);
  const proteinTarget = data.profile?.proteinTarget || 240;
  const calRem   = Math.max(0, calTarget - todayMeals.calories);
  const protRem  = Math.max(0, proteinTarget - todayMeals.protein);
  const todayEntry = (data.weightLog || []).find(w => w.date === today);
  const lastSleep  = todayEntry?.sleep || 0;
  const hasWorkout = (data.workouts || []).some(w => w.date === today);
  function nextSession() {
    const dow = new Date().getDay();
    for (let i = 1; i <= 7; i++) {
      const nd = (dow + i) % 7;
      if (SPLIT_MAP[DAYS[nd]]) return DAYS[nd] + " " + SPLIT_MAP[DAYS[nd]];
    }
    return null;
  }
  // ── Rest day ──
  if (isRest) {
    const next = nextSession();
    if (lastSleep === 0 && protRem > 80)
      return `Rest day. Log sleep and hit ${proteinTarget}g protein — recovery is your workout today.${next?" Next: "+next+".":""}`;
    if (lastSleep > 0 && lastSleep < 7)
      return `Sleep was ${lastSleep}h — keep intensity low, eat well. ${protRem > 40 ? protRem+"g protein still left." : "Protein on track."}`;
    if (protRem > 80)
      return `Rest day — ${protRem}g protein still to go. Hit it before bed to protect your gains.${next?" Next: "+next+".":""}`;
    if (calRem > 500)
      return `Rest day — ${calRem} kcal left to fill. Under-fuelling slows recovery.`;
    return `Rest day dialled.${next?" Next: "+next+".":""} Recovery and fuel on track.`;
  }
  // ── Training day ──
  if (!hasWorkout && todayMeals.calories < 300)
    return `${todayWo} day. Nothing logged yet — fuel up and get the session done.`;
  if (!hasWorkout)
    return `${todayWo} still to do. ${protRem > 0 ? protRem+"g protein left." : "Protein hit."} Get the session in.`;
  if (protRem > 80)
    return `${todayWo} done. Recovery window open — ${protRem}g more protein before bed.`;
  if (calRem > 800)
    return `${todayWo} logged. ${calRem} kcal left to hit your surplus — keep eating.`;
  if (calRem <= 0 && protRem <= 20)
    return `${todayWo} logged and fully fuelled. Dialled.`;
  return `${todayWo} done. ${protRem > 0 ? protRem+"g protein left." : "Protein on target."} ${calRem > 0 ? calRem+" kcal to fill." : ""}`.trim();
}

// ── Adaptive nudges (V2.0 MVP coach engine) ──────────────────────
// Three rule-based signals; surface up to 3 as actionable cards on HOME.
// These are the first crumbs of the long-term adaptive trainer engine.

function computeAdaptiveNudges(data) {
  const out = [];
  const today = getToday();

  // Rule 1 — weight trend out of ideal lean-bulk pace (0.3-0.6 lb/wk)
  const weights = (data.weightLog || []).filter(w => w.weight).slice(-14);
  if (weights.length >= 5) {
    const first = weights[0], last = weights[weights.length - 1];
    const days = (new Date(last.date) - new Date(first.date)) / 86400000;
    if (days >= 7) {
      const lbPerWk = (last.weight - first.weight) / days * 7;
      if (lbPerWk > 0.7) out.push({ priority:"high", icon:"⚖️", title:"Bulking too fast", text:`Gaining ${lbPerWk.toFixed(2)} lb/wk — outside the 0.3-0.6 lb/wk ideal. Consider trimming ~200 kcal off the training-day target to keep the gain leaner.` });
      else if (lbPerWk >= 0 && lbPerWk < 0.15) out.push({ priority:"medium", icon:"⚖️", title:"Weight stalled", text:`Trend is ${lbPerWk.toFixed(2)} lb/wk over the last ${weights.length} weigh-ins — bulk has stalled. Add ~150 kcal to push it forward.` });
      else if (lbPerWk < 0) out.push({ priority:"high", icon:"⚖️", title:"Losing weight on a bulk", text:`Weight is trending down (${lbPerWk.toFixed(2)} lb/wk) on what's supposed to be a lean bulk. Add 200-250 kcal — protein priority.` });
    }
  }

  // Rule 2 — PR stall on key lifts (estimated 1RM not improving over last 3 sessions)
  const keyLifts = ["Incline Bench", "Romanian Deadlift", "Shoulder Press"];
  for (const name of keyLifts) {
    const prog = progressionFor(data.workouts, name);
    if (prog.length >= 3) {
      const last3 = prog.slice(-3);
      const gain = last3[2].oneRM - last3[0].oneRM;
      if (gain <= 0) {
        out.push({ priority:"high", icon:"🏋️", title:`${name} stalled`, text:`Estimated 1RM hasn't moved across the last 3 sessions. Consider a deload week — reduce volume 30%, then build back. Or check sleep/fuel — recovery often gates strength.` });
        break; // surface only one PR-stall at a time to avoid noise
      }
    }
  }

  // Rule 3 — missed sessions this week
  const todayDate = new Date(today + "T12:00:00");
  const dow = todayDate.getDay();
  const startOfWeek = new Date(todayDate);
  startOfWeek.setDate(todayDate.getDate() - ((dow + 6) % 7));
  const startStr = toLocalDateStr(startOfWeek);
  const thisWeekWorkouts = (data.workouts || []).filter(w => w.date >= startStr && w.date <= today);
  let daysDuePassed = 0;
  for (let i = 0; i <= ((dow + 6) % 7); i++) {
    const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i);
    if (SPLIT_MAP[DAYS[d.getDay()]]) daysDuePassed++;
  }
  const missed = daysDuePassed - thisWeekWorkouts.length;
  if (missed >= 2) out.push({ priority:"medium", icon:"📅", title:"Sessions missed this week", text:`${missed} prescribed training days haven't been logged this week. Is life getting in the way, or is the program off? Worth a moment of honest reflection.` });

  return out;
}

function todayOneAction(data) {
  const today = getToday();
  const dayName = DAYS[new Date().getDay()];
  const todayWo = SPLIT_MAP[dayName];
  const todayMeals = data.meals[today] || { calories:0, protein:0 };
  const isRest = !todayWo;
  const calTarget = isRest ? data.profile.calorieTarget.rest : data.profile.calorieTarget.training;
  const proteinTarget = data.profile.proteinTarget;
  const todayEntry = (data.weightLog || []).find(w => w.date === today);
  const sleepLogged = !!todayEntry?.sleep;
  const trainingDoneIfDue = !todayWo || (data.workouts || []).some(w => w.date === today);
  const calBehind = calTarget - todayMeals.calories;
  const protBehind = proteinTarget - todayMeals.protein;
  if (!sleepLogged) return { label: "Log last night's sleep", action: "weight" };
  if (todayWo && !trainingDoneIfDue) return { label: `Start ${todayWo} on LIFTS`, action: "lifts" };
  if (protBehind > 30) return { label: `Hit ${protBehind}g more protein at the next meal`, action: "meal" };
  if (calBehind > 500) return { label: `${calBehind} more kcal today — log your next meal`, action: "meal" };
  return { label: "Stay the course — you're on it", action: null };
}

// ── Meal slot model (used by MealModal + meal entry list) ──

