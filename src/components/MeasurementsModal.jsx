import { useState } from "react";
import { C, F, MEASURE_FIELDS } from "../constants";
import { getToday } from "../utils";
import { FInput } from "./shared/FInput";
import { SaveBtn } from "./shared/SaveBtn";
import { Sheet } from "./shared/Sheet";

export function MeasurementsModal({ data, updateData, onClose }) {
  const t = getToday();
  const prev = [...(data.measurements || [])].filter(m => m.date !== t).pop();
  const [vals, setVals] = useState(() => {
    const v = { note:"" };
    MEASURE_FIELDS.forEach(f => { v[f.key] = ""; });
    return v;
  });

  function setVal(k, v) { setVals(p => ({ ...p, [k]: v })); }

  async function save() {
    const entry = { date:t, note:vals.note };
    MEASURE_FIELDS.forEach(f => { entry[f.key] = vals[f.key] ? parseFloat(vals[f.key]) : null; });
    const updated = [...(data.measurements || []).filter(m => m.date !== t), entry].sort((a,b) => a.date.localeCompare(b.date));
    await updateData("measurements", updated);
    onClose();
  }

  return (
    <Sheet onClose={onClose} title="MEASUREMENTS">
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:16 }}>
        All in inches · Leave blank to skip
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        {MEASURE_FIELDS.filter(f => f.key !== "bodyFat").map(f => {
          const p = prev?.[f.key];
          return (
            <div key={f.key}>
              <div style={{ fontFamily:F.mono, fontSize:11, color:f.color, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>
                {f.label}{p && <span style={{ color:C.gray, marginLeft:6 }}>prev:{p}&quot;</span>}
              </div>
              <input
                value={vals[f.key]}
                onChange={e => setVal(f.key, e.target.value)}
                placeholder={p ? `${p}` : "0.0"}
                type="number"
                step="0.25"
                style={{ width:"100%", background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", color:f.color, fontSize:15, fontFamily:F.mono, outline:"none", boxSizing:"border-box" }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ marginBottom:10 }}>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>
          Body Fat %{prev?.bodyFat && <span style={{ color:C.gray, marginLeft:6 }}>prev:{prev.bodyFat}%</span>}
        </div>
        <input
          value={vals.bodyFat}
          onChange={e => setVal("bodyFat", e.target.value)}
          placeholder="15-17"
          type="number"
          step="0.5"
          style={{ width:"100%", background:"#1A1A22", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", color:C.orange, fontSize:15, fontFamily:F.mono, outline:"none", boxSizing:"border-box" }}
        />
      </div>
      <div style={{ marginBottom:24 }}>
        <FInput label="Note (optional)" value={vals.note} onChange={v => setVal("note", v)} placeholder="Morning, fasted" type="text" />
      </div>
      <SaveBtn onClick={save} label="SAVE MEASUREMENTS" />
    </Sheet>
  );
}
