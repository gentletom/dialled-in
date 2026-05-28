import { useState } from "react";
import { getToday } from "../utils";
import { Sheet } from "./shared/Sheet";
import { SaveBtn } from "./shared/SaveBtn";

export function WeeklyCheckinModal({ data, updateData, onClose }) {
  const [weightTrend, setWeightTrend] = useState(null);
  const [sessionsHit, setSessionsHit] = useState(null);
  const [proteinDays, setProteinDays] = useState(null);
  const [note, setNote] = useState("");

  async function save() {
    const today = getToday();
    const checkin = { date: today, weightTrend, sessionsHit, proteinDays, note };
    const prev = data.profile?.checkins || [];
    await updateData("profile", {
      ...data.profile,
      lastCheckinDate: today,
      checkins: [checkin, ...prev].slice(0, 12),
    });
    onClose();
  }

  return (
    <Sheet onClose={onClose} title="WEEKLY CHECK-IN">
      <div style={{ color:"#888", fontSize:13, marginBottom:20, lineHeight:1.5 }}>
        Quick sync with your coach — 60 seconds, weekly ritual.
      </div>

      {/* Weight trend */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, color:"#888", fontFamily:"monospace", marginBottom:8, letterSpacing:1 }}>HOW{"'"} YOUR WEIGHT TRENDING?</div>
        <div style={{ display:"flex", gap:8 }}>
          {[{v:"down",l:"↓ Dropping"},{v:"stable",l:"→ Stable"},{v:"up",l:"↑ Rising"}].map(o => (
            <button key={o.v} onClick={() => setWeightTrend(o.v)}
              style={{ flex:1, padding:"10px 4px", borderRadius:10, border:"1px solid",
                borderColor: weightTrend===o.v?"#c6f135":"#333",
                background: weightTrend===o.v?"#1a2200":"#111",
                color: weightTrend===o.v?"#c6f135":"#666",
                fontSize:12, cursor:"pointer", touchAction:"manipulation" }}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions hit */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, color:"#888", fontFamily:"monospace", marginBottom:8, letterSpacing:1 }}>SESSIONS COMPLETED THIS WEEK</div>
        <div style={{ display:"flex", gap:6 }}>
          {[0,1,2,3,4,5,6,7].map(n => (
            <button key={n} onClick={() => setSessionsHit(n)}
              style={{ flex:1, padding:"8px 2px", borderRadius:8, border:"1px solid",
                borderColor: sessionsHit===n?"#9D7FFF":"#333",
                background: sessionsHit===n?"#0d0022":"#111",
                color: sessionsHit===n?"#9D7FFF":"#666",
                fontSize:13, cursor:"pointer", fontWeight: sessionsHit===n?700:400,
                touchAction:"manipulation" }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Protein days */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, color:"#888", fontFamily:"monospace", marginBottom:8, letterSpacing:1 }}>PROTEIN TARGET HIT HOW MANY DAYS?</div>
        <div style={{ display:"flex", gap:6 }}>
          {[0,1,2,3,4,5,6,7].map(n => (
            <button key={n} onClick={() => setProteinDays(n)}
              style={{ flex:1, padding:"8px 2px", borderRadius:8, border:"1px solid",
                borderColor: proteinDays===n?"#FFB800":"#333",
                background: proteinDays===n?"#1a1200":"#111",
                color: proteinDays===n?"#FFB800":"#666",
                fontSize:13, cursor:"pointer", fontWeight: proteinDays===n?700:400,
                touchAction:"manipulation" }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Coach note */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, color:"#888", fontFamily:"monospace", marginBottom:8, letterSpacing:1 }}>ANYTHING TO TELL YOUR COACH?</div>
        <textarea
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. left shoulder is tight, skipped Wednesday due to travel..."
          rows={3}
          style={{ width:"100%", padding:12, borderRadius:10, border:"1px solid #333",
            background:"#111", color:"#fff", fontSize:14, resize:"none",
            fontFamily:"system-ui", boxSizing:"border-box" }}
        />
      </div>

      <SaveBtn onClick={save} disabled={weightTrend===null || sessionsHit===null || proteinDays===null} />
    </Sheet>
  );
}

