import { useState } from "react";
import { C } from "../constants";
import { getToday } from "../utils";
import { Sheet } from "./shared/Sheet";
import { FInput } from "./shared/FInput";
import { SaveBtn } from "./shared/SaveBtn";

export function WeightModal({ data, updateData, onClose }) {
  const [weight, setWeight] = useState("");
  const [sleep, setSleep] = useState("");
  const [steps, setSteps] = useState("");
  const [readiness, setReadiness] = useState(null);
  const [soreness, setSoreness] = useState(null);

  async function save() {
    const t = getToday();
    const ex = data.weightLog.find(w => w.date === t) || {};
    const entry = {
      date: t,
      weight: weight ? parseFloat(weight) : ex.weight || null,
      sleep: sleep ? parseFloat(sleep) : ex.sleep || null,
      steps: steps ? parseInt(steps) : ex.steps || null,
      readiness: readiness ?? ex.readiness ?? null,
      soreness: soreness ?? ex.soreness ?? null,
    };
    const updated = [...data.weightLog.filter(w => w.date !== t), entry].sort((a,b) => a.date.localeCompare(b.date));
    await updateData("weightLog", updated);
    onClose();
  }

  return (
    <Sheet onClose={onClose} title="LOG TODAY">
      <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:24 }}>
        <FInput label="Weight (lbs)" value={weight} onChange={setWeight} placeholder="175.8" color={C.lime} />
        <FInput label="Sleep (hours)" value={sleep} onChange={setSleep} placeholder="8" color={C.teal} />
        <FInput label="Steps (optional)" value={steps} onChange={setSteps} placeholder="8000" color={"#9D7FFF"} />

        {/* Readiness */}
        <div>
          <div style={{ fontSize:11, color:"#888", fontFamily:"monospace", marginBottom:6, letterSpacing:1 }}>
            READINESS
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {[
              { v:1, emoji:"💀", label:"Wrecked" },
              { v:2, emoji:"😴", label:"Tired" },
              { v:3, emoji:"😐", label:"Average" },
              { v:4, emoji:"💪", label:"Good" },
              { v:5, emoji:"🔥", label:"Dialled" },
            ].map(opt => (
              <button key={opt.v} onClick={() => setReadiness(opt.v)}
                style={{
                  flex:1, padding:"8px 4px", borderRadius:10, border:"1px solid",
                  borderColor: readiness === opt.v ? "#c6f135" : "#333",
                  background: readiness === opt.v ? "#1a2200" : "#111",
                  color: readiness === opt.v ? "#c6f135" : "#666",
                  fontSize:18, cursor:"pointer", display:"flex",
                  flexDirection:"column", alignItems:"center", gap:2,
                  touchAction: "manipulation",
                }}
              >
                <span>{opt.emoji}</span>
                <span style={{ fontSize:8 }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Soreness */}
        <div>
          <div style={{ fontSize:11, color:"#888", fontFamily:"monospace", marginBottom:6, letterSpacing:1 }}>
            MUSCLE SORENESS
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {["None","Mild","Moderate","Severe"].map(opt => (
              <button key={opt} onClick={() => setSoreness(opt.toLowerCase())}
                style={{
                  flex:1, padding:"9px 4px", borderRadius:8, border:"1px solid",
                  borderColor: soreness === opt.toLowerCase() ? "#4488FF" : "#333",
                  background: soreness === opt.toLowerCase() ? "#001133" : "#111",
                  color: soreness === opt.toLowerCase() ? "#4488FF" : "#666",
                  fontSize:11, cursor:"pointer", fontFamily:"monospace",
                  touchAction: "manipulation",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
      <SaveBtn onClick={save} />
    </Sheet>
  );
}

