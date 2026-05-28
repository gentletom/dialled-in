import { useState } from "react";
import { C, F, EXERCISE_LIST } from "../constants";
import { getToday, calc1RM } from "../utils";
import { FInput } from "./shared/FInput";
import { SaveBtn } from "./shared/SaveBtn";
import { Sheet } from "./shared/Sheet";

export function PRModal({ data, updateData, onClose }) {
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
