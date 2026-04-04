"use client";

export function MetricRing({
  value,
  label,
  sub,
  size = 72,
  color = "accent",
}: {
  value: number;
  label: string;
  sub?: string;
  size?: number;
  color?: "accent" | "success" | "warning" | "muted";
}) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const strokeColors: Record<string, string> = {
    accent: "var(--accent)",
    success: "var(--success)",
    warning: "var(--warning)",
    muted: "var(--text-disabled)",
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColors[color]}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[15px] font-mono text-text-display font-light tabular-nums">{value}%</span>
        </div>
      </div>
      <span className="nd-label text-center">{label}</span>
      {sub && <span className="text-[10px] text-text-muted font-mono">{sub}</span>}
    </div>
  );
}
