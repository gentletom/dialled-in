
import { memo } from "react";
import { C, F, PILLAR_INFO, DAYS, SPLIT_MAP } from "../constants";

export const PillarInfoDrawer = memo(function PillarInfoDrawer({ pillar, score, _data, onClose }) {
  const info = PILLAR_INFO[pillar];
  if (!info) return null;
  const dayName = DAYS[new Date().getDay()];
  const isRest  = !SPLIT_MAP[dayName];
  const pts = pillar === "ACT"   ? score.pillars.activity
            : pillar === "FUEL"  ? score.pillars.fuel
            : pillar === "RECOV" ? score.pillars.recovery
            : score.pillars.progress;
  const pct = pts; // each pillar is already 0-100
  const showRestNote = pillar === "ACT" && isRest && info.restNote;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:950, display:"flex", flexDirection:"column" }} onClick={onClose}>
      <div style={{ flex:1 }} />
      <div style={{ background:C.bg, borderTop:`2px solid ${info.clr}40`, borderRadius:"18px 18px 0 0", padding:"20px 18px 36px", maxWidth:500, width:"100%", margin:"0 auto" }}
        onClick={function(e) { e.stopPropagation(); }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div>
            <div style={{ fontFamily:F.display, fontSize:24, color:info.clr, letterSpacing:2 }}>{info.title}</div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginTop:2 }}>{info.subtitle}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:F.display, fontSize:40, color:info.clr, lineHeight:1 }}>{pct}</div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>out of 100</div>
          </div>
        </div>
        {/* Score bar */}
        <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden", marginBottom:14 }}>
          <div style={{ height:"100%", width:pct+"%", background:info.clr, borderRadius:3, transition:"width .4s" }} />
        </div>
        {/* What it tracks */}
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.65, marginBottom:14 }}>{info.what}</div>
        {/* Rest-day note OR tips */}
        {showRestNote ? (
          <div style={{ background:info.clr+"18", border:`1px solid ${info.clr}40`, borderRadius:8, padding:"10px 14px", fontFamily:F.mono, fontSize:11, color:info.clr, lineHeight:1.6 }}>{info.restNote}</div>
        ) : (
          <div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1.5, marginBottom:8 }}>HOW TO IMPROVE</div>
            {info.tips.map(function(tip, i) {
              return (
                <div key={i} style={{ display:"flex", gap:8, marginBottom:7, alignItems:"flex-start" }}>
                  <span style={{ color:info.clr, fontFamily:F.mono, fontSize:11, marginTop:1, flexShrink:0 }}>→</span>
                  <span style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.55 }}>{tip}</span>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onClose} style={{ width:"100%", marginTop:18, padding:"13px", background:C.surface, border:`1px solid ${info.clr}60`, borderRadius:10, fontFamily:F.mono, fontSize:11, color:info.clr, cursor:"pointer", letterSpacing:1 }}>CLOSE</button>
      </div>
    </div>
  );
});

