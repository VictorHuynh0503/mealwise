"use client";
import { useEffect, useState } from "react";
import { api, type Plan } from "@/lib/api";
import { mealLabel, useLocale } from "@/lib/i18n";

export default function MealPlan({ day, onLogged }: { day: string; onLogged: () => void }) {
  const { locale, t } = useLocale();
  const [variation, setVariation] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setErr("");
    api.plan(day, variation).then(setPlan).catch((e) => setErr((e as Error).message));
  }, [day, variation, locale]);

  const logSlot = async (idx: number) => {
    if (!plan) return;
    const s = plan.slots[idx];
    setBusy(true);
    try {
      for (const it of s.items) {
        await api.addLog({ day, meal: s.meal, food_id: it.food_id, grams: it.grams, source: "plan" });
      }
      onLogged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="row spread">
          <div>
            <h2 style={{ margin: 0 }}>{t.mealPlanTitle}</h2>
            {plan && (
              <div className="sub" style={{ marginTop: 4 }}>
                {t.plannedLine(Math.round(plan.totals.kcal), plan.target.kcal, Math.round(plan.totals.protein))}
              </div>
            )}
          </div>
          <button className="btn ghost" onClick={() => setVariation((v) => v + 1)}>{t.shuffle}</button>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="slot-grid">
        {plan?.slots.map((s, i) => (
          <div className="card" key={s.meal}>
            <div className="meal-head" style={{ marginTop: 0 }}>
              <span>{mealLabel(t, s.meal)}</span><span>{Math.round(s.totals.kcal)} kcal</span>
            </div>
            <div className="list">
              {s.items.map((it) => (
                <div className="item" key={it.food_id}>
                  <div>
                    <div className="name">{it.name}</div>
                    <div className="sub">{it.grams} g · {t.protein[0]} {it.protein} g</div>
                  </div>
                  <span className="pill">{it.kcal}</span>
                </div>
              ))}
              {s.items.length === 0 && <div className="empty">{t.noMatchingDiet}</div>}
            </div>
            <button className="btn ghost small" style={{ marginTop: 10 }} disabled={busy || s.items.length === 0} onClick={() => logSlot(i)}>
              {t.logThisMeal}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
