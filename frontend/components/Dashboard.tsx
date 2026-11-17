"use client";
import type { Macros, Targets } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

export function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const { t } = useLocale();
  const r = 62;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const over = consumed > target;
  const left = Math.round(target - consumed);
  return (
    <svg className="ring" viewBox="0 0 160 160" role="img" aria-label={`${Math.round(consumed)} of ${target} kcal`}>
      <circle className="ring-bg" cx="80" cy="80" r={r} />
      <circle
        className={`ring-fg ${over ? "over" : ""}`}
        cx="80" cy="80" r={r}
        strokeDasharray={`${pct * circ} ${circ}`}
        transform="rotate(-90 80 80)"
      />
      <text className="ring-num" x="80" y="82">{Math.round(consumed)}</text>
      <text className="ring-sub" x="80" y="100">{left >= 0 ? t.kcalLeft(left) : t.kcalOver(-left)}</text>
    </svg>
  );
}

function MacroBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  return (
    <div>
      <div className="macro-top">
        <span>{label}</span>
        <span className="sub">{Math.round(value)} / {goal} g</span>
      </div>
      <div className={`bar ${value > goal ? "over" : ""}`}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function MacroBars({ consumed, target }: { consumed: Macros; target: Targets }) {
  const { t } = useLocale();
  return (
    <div className="macros">
      <MacroBar label={t.protein} value={consumed.protein} goal={target.protein} />
      <MacroBar label={t.carbs} value={consumed.carbs} goal={target.carbs} />
      <MacroBar label={t.fat} value={consumed.fat} goal={target.fat} />
    </div>
  );
}
