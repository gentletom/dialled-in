import { useState, useEffect, memo } from "react";

export const QuadrantRings = memo(function QuadrantRings({ pillars, _composite, _color, onRingTap }) {
  const [anim, setAnim] = useState(0);
  useEffect(() => {
    let rafId;
    const start = performance.now();
    const duration = 700;
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      setAnim(1 - Math.pow(1 - t, 3));
      if (t < 1) rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId); // cleanup on unmount
  }, []);

  const rings = [
    { cx:70,  cy:70,  pct: Math.min(100, pillars.activity || 0) * anim, clr:"#9D7FFF", label:"ACT"   },
    { cx:210, cy:70,  pct: Math.min(100, pillars.fuel     || 0) * anim, clr:"#FFB800", label:"FUEL"  },
    { cx:70,  cy:210, pct: Math.min(100, pillars.recovery || 0) * anim, clr:"#4488FF", label:"RECOV" },
    { cx:210, cy:210, pct: Math.min(100, pillars.progress || 0) * anim, clr:"#00E5CC", label:"PROG"  },
  ];
  const R = 52, CIRC = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 280 280" style={{ width:"100%", height:"auto", display:"block" }}>
      {rings.map(({ cx, cy, pct, clr, label }) => {
        const offset = CIRC * (1 - Math.max(0, pct) / 100);
        return (
          <g key={label} onClick={() => onRingTap && onRingTap(label)}
             style={{ cursor: onRingTap ? "pointer" : "default" }}>
            {/* wider invisible tap target */}
            <circle cx={cx} cy={cy} r={R+14} fill="transparent" />
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="#18182A" strokeWidth={10} />
            <circle cx={cx} cy={cy} r={R} fill="none" stroke={clr} strokeWidth={10}
              strokeDasharray={CIRC} strokeDashoffset={offset}
              strokeLinecap="round" transform={`rotate(-90,${cx},${cy})`} />
            <text x={cx} y={cy + 10} textAnchor="middle"
              fontFamily="'Bebas Neue',sans-serif" fontSize="28" fill={clr}>{Math.round(pct)}</text>
            <text x={cx} y={cy + 28} textAnchor="middle"
              fontFamily="monospace" fontSize="11" fill="#556" letterSpacing="1">{label}</text>
          </g>
        );
      })}
      {/* center — decorative only, no number */}
      {/* center ring removed */}
    </svg>
  );
});

