import { C, F } from "../../constants";

export function FInput({ label, value, onChange, placeholder, type, color }) {
  return (
    <div>
      <div style={{
        fontFamily: F.mono,
        fontSize: 11,
        color: color || C.white,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 6,
      }}>
        {label}
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        type={type || "number"}
        style={{
          width: "100%",
          background: "#1A1A22",
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "11px 14px",
          color: color || C.white,
          fontSize: 15,
          fontFamily: F.mono,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

