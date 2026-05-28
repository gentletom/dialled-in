import { X } from "lucide-react";
import { C, F } from "../../constants";

export function Sheet({ onClose, title, children }) {
  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300 }}
      onClick={onClose}
    >
      <div
        style={{ background:"#111116", borderRadius:"20px 20px 0 0", padding:"24px 20px 40px", width:"100%", maxWidth:480, border:`1px solid ${C.border}`, borderBottom:"none", maxHeight:"90vh", overflowY:"auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontFamily:F.display, fontSize:24, color:C.lime, letterSpacing:1 }}>{title}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", padding:4 }}>
            <X size={18} color={C.gray} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

