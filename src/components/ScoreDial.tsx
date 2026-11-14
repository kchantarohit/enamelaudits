export function scoreColor(score: number) {
  return score >= 80 ? "#166534" : score >= 60 ? "#b45309" : "#991b1b";
}

export function ScoreDial({ score, grade, size = 150 }: { score: number; grade: string; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`Score ${score} out of 100, grade ${grade}`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
      <circle
        cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" textAnchor="middle" fontSize="30" fontWeight="800" fill="#16212e">{score}</text>
      <text x="60" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>Grade {grade}</text>
    </svg>
  );
}

export function CategoryBars({ scores }: { scores: { label: string; score: number }[] }) {
  return (
    <ul className="space-y-2" aria-label="Category scores">
      {scores.map((s) => (
        <li key={s.label} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate">{s.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-200">
            <span className="block h-full rounded-full" style={{ width: `${s.score}%`, background: scoreColor(s.score) }} />
          </span>
          <span className="text-right font-bold tabular-nums">{s.score}</span>
        </li>
      ))}
    </ul>
  );
}
