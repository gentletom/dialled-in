import { C, F } from "../../constants";

export function SaveBtn({ onClick, label, disabled = false }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: "100%",
        background: C.lime,
        border: "none",
        borderRadius: 12,
        padding: 14,
        fontFamily: F.display,
        fontSize: 20,
        color: C.dark,
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: 1,
        marginTop: 4,
        opacity: disabled ? 0.4 : 1,
        touchAction: "manipulation",
      }}
    >
      {label || "SAVE"}
    </button>
  );
}

