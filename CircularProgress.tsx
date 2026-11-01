interface CircularProgressProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  size?: number;
}

export default function CircularProgress({ value, max, label, sublabel, size = 120 }: CircularProgressProps) {
  const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            style={{ stroke: 'rgb(var(--dark-300))' }}
            strokeWidth="8"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ stroke: 'rgb(var(--gold-300))', transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold gold-text">{Math.round(percentage)}%</span>
          {sublabel && <span className="text-xs text-gray-400">{sublabel}</span>}
        </div>
      </div>
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  );
}
