"use client";
import { useEffect, useState } from "react";
import { api, type Meal, MEALS, type RecommendationResponse } from "@/lib/api";
import { mealLabel, useLocale } from "@/lib/i18n";

type Props = { day: string; meal: Meal; refreshKey: number; onLogged: () => void };

export default function Recommendations({ day, meal, refreshKey, onLogged }: Props) {
  const { locale, t } = useLocale();
  const [filter, setFilter] = useState<Meal>(meal);
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => setFilter(meal), [meal]);
  useEffect(() => {
    api.recommend(day, filter).then(setData).catch((e) => setErr((e as Error).message));
  }, [day, filter, refreshKey, locale]);

  const add = async (food_id: number, grams: number) => {
    try {
      await api.addLog({ day, meal: filter, food_id, grams, source: "recommendation" });
      onLogged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="card">
      <div className="row spread">
        <h2>{t.suggested}</h2>
        <div className="chips">
          {MEALS.map((m) => (
            <button key={m} className={`chip ${m === filter ? "on" : ""}`} onClick={() => setFilter(m)}>{mealLabel(t, m)}</button>
          ))}
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      {data?.remaining && (
        <div className="sub" style={{ marginBottom: 6 }}>
          {t.leftToday(data.remaining.kcal, data.remaining.protein)}
        </div>
      )}
      <div className="list">
        {data?.items.map((r) => (
          <div className="item" key={r.food_id}>
            <div>
              <div className="name">{r.name} <span className="sub">· {r.serving_g} g</span></div>
              <div className="reason">{r.reasons.join(" · ")}</div>
            </div>
            <div className="row">
              <span className="pill">{r.kcal} kcal</span>
              <button className="btn ghost small" onClick={() => add(r.food_id, r.serving_g)}>{t.add}</button>
            </div>
          </div>
        ))}
        {data && data.items.length === 0 && <div className="empty">{data.message ?? t.nothingFits}</div>}
      </div>
    </div>
  );
}
