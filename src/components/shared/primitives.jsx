import { C, F } from "../../constants";

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
