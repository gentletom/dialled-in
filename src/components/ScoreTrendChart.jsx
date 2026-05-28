import { useState, useEffect } from "react";

import { C, F } from "../constants";
import { getToday, toLocalDateStr } from "../utils";
import { computeTodayScore } from "../lib/scoring";

export function ScoreTrendChart({ data, todayScoreProp }) {
  const [history, setHistory] = useState({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await window.storage.get("ft:dailyScores");
        if (r && r.value && !cancelled) setHistory(JSON.parse(r.value) || {});
      } catch (_e) { /* best-effort */ }
    }
    load();
  }, []);

  const today = getToday();
  const dayCount = expanded ? 30 : 7;
  const dates = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - i);
    dates.push(toLocalDateStr(d));
  }

  // Use live score for today so the bar updates as you log meals/sleep
  const liveToday = todayScoreProp ? todayScoreProp.composite : (data ? computeTodayScore(data).composite : null);

  const points = dates.map((d, i) => {
    const score = d === today
      ? (liveToday ?? history[d]?.composite ?? null)
      : (history[d]?.composite ?? null);
    return { date:d, score, idx:i, isToday: d === today };
  });

  const validPts = points.filter(p => p.score !== null);
  if (validPts.length === 0) return null;

  const avg = Math.round(validPts.reduce((s, p) => s + p.score, 0) / validPts.length);
  const todayScore = points.find(p => p.isToday)?.score;
  const delta = (todayScore !== null && todayScore !== undefined) ? todayScore - avg : null;

  const scoreClr = s => s >= 85 ? C.lime : s >= 70 ? C.teal : s >= 55 ? C.amber : C.orange;

  // SVG bar chart
  const W = 340, H = 120, PL = 6, PR = 6, PT = 16, PB = 22;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const gap = plotW / dayCount;
  const barW = Math.max(8, gap * 0.62);
  const xOf = i => PL + gap * i + gap / 2;
  const avgY = PT + plotH - (avg / 100) * plotH;

  const dayLabel = (date, isToday) => {
    if (isToday) return "NOW";
    const d = new Date(date + "T12:00:00");
    if (expanded) {
      const dom = d.getDate();
      return dom === 1 || dom % 7 === 0 ? `${d.getMonth()+1}/${dom}` : null;
    }
    return ["Su","Mo","Tu","We","Th","Fr","Sa"][d.getDay()];
  };

  return (
    <div style={{ background:C.surface, borderRadius:14, padding:"12px 14px 6px", marginBottom:14 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5 }}>
          {expanded ? "30-DAY TREND" : "7-DAY TREND"}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {delta !== null && (
            <div style={{ fontFamily:F.mono, fontSize:11, color: delta >= 0 ? C.lime : C.orange }}>
              {delta >= 0 ? "↑" : "↓"}{Math.abs(delta)} vs {avg} avg
            </div>
          )}
          <div onClick={() => setExpanded(e => !e)}
            style={{ fontFamily:F.mono, fontSize:11, color:C.grayMid, cursor:"pointer", padding:"2px 8px", border:`1px solid ${C.border}`, borderRadius:4 }}>
            {expanded ? "◂" : "▸ 30D"}
          </div>
        </div>
      </div>
      {/* Bar chart */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height: expanded ? 130 : 120, display:"block" }}>
        {/* Avg line */}
        <line x1={PL} y1={avgY} x2={W-PR} y2={avgY}
          stroke={C.grayMid} strokeWidth={0.8} strokeDasharray="3,5" opacity={0.6} />
        <text x={W-PR} y={avgY-3} textAnchor="end" fontFamily="monospace" fontSize="7" fill={C.grayMid} opacity={0.7}>
          AVG {avg}
        </text>
        {/* Bars */}
        {points.map((p, i) => {
          const x = xOf(i);
          const clr = p.isToday ? C.lime : (p.score !== null ? scoreClr(p.score) : "#1a1a2a");
          const barH = p.score !== null ? Math.max(4, (p.score / 100) * plotH) : 4;
          const bW = p.isToday ? barW * 1.25 : barW;
          const opacity = p.isToday ? 1 : (p.score !== null ? 0.6 : 1);
          return (
            <g key={i}>
              <rect x={x - bW/2} y={PT + plotH - barH} width={bW} height={barH}
                fill={clr} opacity={opacity} rx={3} />
              {/* Score label above bar */}
              {p.score !== null && (
                <text x={x} y={PT + plotH - barH - 3}
                  textAnchor="middle" fontFamily="monospace"
                  fontSize={p.isToday ? "9.5" : "7"}
                  fontWeight={p.isToday ? "bold" : "normal"}
                  fill={p.isToday ? C.lime : C.grayMid}>
                  {p.score}
                </text>
              )}
            </g>
          );
        })}
        {/* Day labels */}
        {points.map((p, i) => {
          const label = dayLabel(p.date, p.isToday);
          if (!label) return null;
          return (
            <text key={i} x={xOf(i)} y={H - 4}
              textAnchor="middle" fontFamily="monospace"
              fontSize={p.isToday ? "8.5" : "7"}
              fontWeight={p.isToday ? "bold" : "normal"}
              fill={p.isToday ? C.lime : "#444"}>
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

