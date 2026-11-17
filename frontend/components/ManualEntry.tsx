"use client";
import { useEffect, useState } from "react";
import { api, type Food, type Meal, MEALS } from "@/lib/api";
import { mealLabel, useLocale } from "@/lib/i18n";

type Props = { day: string; meal: Meal; setMeal: (m: Meal) => void; onLogged: () => void };

/** Manual entry: search the database, set grams, see live calories; or add a new food. */
export default function ManualEntry({ day, meal, setMeal, onLogged }: Props) {
  const { locale, t } = useLocale();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [food, setFood] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);
  const [custom, setCustom] = useState(false);
  const [nf, setNf] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFood(null);
    setQ("");
    setResults([]);
  }, [locale]);

  useEffect(() => {
    if (food && q === food.name) return;
    const timer = setTimeout(() => api.foods(q).then(setResults).catch(() => setResults([])), 180);
    return () => clearTimeout(timer);
  }, [q, food, locale]);

  const k = grams / 100;
  const kcal = food ? Math.round(food.kcal * k) : 0;

  const pick = (f: Food) => {
    setFood(f);
    setQ(f.name);
    setGrams(Math.round(f.serving_g));
    setErr("");
  };

  const add = async () => {
    if (!food) return;
    setBusy(true);
    setErr("");
    try {
      await api.addLog({ day, meal, food_id: food.id, grams, source: "manual" });
      setFood(null);
      setQ("");
      onLogged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createFood = async () => {
    const n = (v: string) => Number(v) || 0;
    if (!nf.name.trim() || n(nf.kcal) <= 0) return setErr(t.needNameKcal);
    setBusy(true);
    setErr("");
    try {
      const f = await api.addFood({
        name: nf.name, kcal: n(nf.kcal), protein: n(nf.protein), carbs: n(nf.carbs), fat: n(nf.fat), serving_g: 100, locale,
      });
      setCustom(false);
      setNf({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
      pick(f);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="row spread">
        <h2>{t.addManually}</h2>
        <div className="chips">
          {MEALS.map((m) => (
            <button key={m} className={`chip ${m === meal ? "on" : ""}`} onClick={() => setMeal(m)}>{mealLabel(t, m)}</button>
          ))}
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {!custom ? (
        <>
          <input
            style={{ width: "100%" }}
            placeholder={t.searchPlaceholder}
            value={q}
            onChange={(e) => { setQ(e.target.value); setFood(null); }}
          />
          {!food && (
            <div className="list" style={{ marginTop: 8, maxHeight: 220, overflow: "auto" }}>
              {results.map((f) => (
                <div className="item" key={f.id}>
                  <div>
                    <div className="name">{f.name}</div>
                    <div className="sub">{Math.round(f.kcal)} kcal / 100 g · {t.protein[0]} {f.protein} · {t.carbs[0]} {f.carbs} · {t.fat[0]} {f.fat}</div>
                  </div>
                  <button className="btn ghost small" onClick={() => pick(f)}>{t.select}</button>
                </div>
              ))}
              {results.length === 0 && <div className="empty">{t.noMatch}</div>}
            </div>
          )}
          {food && (
            <div className="row" style={{ marginTop: 12 }}>
              <label className="field">{t.amountG}
                <input className="grams" type="number" min={1} value={grams} onChange={(e) => setGrams(Number(e.target.value))} />
              </label>
              <div className="calc">{kcal} kcal · {t.protein[0]} {(food.protein * k).toFixed(1)} · {t.carbs[0]} {(food.carbs * k).toFixed(1)} · {t.fat[0]} {(food.fat * k).toFixed(1)}</div>
              <button className="btn" disabled={busy || grams <= 0} onClick={add}>{t.addTo(mealLabel(t, meal))}</button>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button className="btn plain small" onClick={() => setCustom(true)}>{t.customFood}</button>
          </div>
        </>
      ) : (
        <>
          <div className="sub" style={{ marginBottom: 10 }}>{t.nutritionPer100}</div>
          <div className="fields">
            <label className="field">{t.name}<input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></label>
            <label className="field">kcal<input type="number" value={nf.kcal} onChange={(e) => setNf({ ...nf, kcal: e.target.value })} /></label>
            <label className="field">{t.protein} g<input type="number" value={nf.protein} onChange={(e) => setNf({ ...nf, protein: e.target.value })} /></label>
            <label className="field">{t.carbs} g<input type="number" value={nf.carbs} onChange={(e) => setNf({ ...nf, carbs: e.target.value })} /></label>
            <label className="field">{t.fat} g<input type="number" value={nf.fat} onChange={(e) => setNf({ ...nf, fat: e.target.value })} /></label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={createFood}>{t.saveFood}</button>
            <button className="btn plain" onClick={() => setCustom(false)}>{t.cancel}</button>
          </div>
        </>
      )}
    </div>
  );
}
