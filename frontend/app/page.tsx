"use client";
import { useCallback, useEffect, useState } from "react";
import { api, defaultMeal, setApiLocale, type LogEntry, type Meal, MEALS, type Summary, todayStr } from "@/lib/api";
import { CalorieRing, MacroBars } from "@/components/Dashboard";
import ManualEntry from "@/components/ManualEntry";
import PhotoCapture from "@/components/PhotoCapture";
import Recommendations from "@/components/Recommendations";
import MealPlan from "@/components/MealPlan";
import ProfileForm from "@/components/ProfileForm";
import { mealLabel, useLocale, type Locale } from "@/lib/i18n";

type Tab = "today" | "plan" | "profile";

export default function Page() {
  const { locale, setLocale, t } = useLocale();
  const [tab, setTab] = useState<Tab>("today");
  const [day] = useState(todayStr);
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState("");

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  useEffect(() => {
    setApiLocale(locale);
    refresh();
  }, [locale, refresh]);

  useEffect(() => {
    Promise.all([api.summary(day), api.log(day)])
      .then(([s, l]) => { setSummary(s); setLog(l); setErr(""); })
      .catch(() => setErr(t.backendDown));
  }, [day, tick, t.backendDown]);

  const remove = async (id: number) => { await api.deleteLog(id); refresh(); };

  const switchLocale = (l: Locale) => {
    setApiLocale(l);
    setLocale(l);
  };

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><span className="brand-dot" />Mealwise</div>
        <div className="row" style={{ gap: 12 }}>
          <div className="lang" role="group" aria-label="Language">
            <button className={`lang-btn ${locale === "en" ? "on" : ""}`} onClick={() => switchLocale("en")}>{t.langEn}</button>
            <button className={`lang-btn ${locale === "vi" ? "on" : ""}`} onClick={() => switchLocale("vi")}>{t.langVi}</button>
          </div>
          <nav className="tabs">
            {(["today", "plan", "profile"] as Tab[]).map((tabKey) => (
              <button key={tabKey} className={`tab ${tab === tabKey ? "on" : ""}`} onClick={() => setTab(tabKey)}>
                {tabKey === "today" ? t.today : tabKey === "plan" ? t.plan : t.profile}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {err && <div className="error">{err}</div>}

      {tab === "today" && (
        <div className="grid">
          <div className="stack">
            <div className="card">
              <h2>{t.today}</h2>
              {summary ? (
                <div className="hero">
                  <CalorieRing consumed={summary.consumed.kcal} target={summary.target.kcal} />
                  <MacroBars consumed={summary.consumed} target={summary.target} />
                </div>
              ) : <div className="empty">{t.loading}</div>}
              {summary && (
                <div className="sub" style={{ marginTop: 14 }}>
                  {t.goalLine(summary.target.kcal, Math.round(summary.consumed.kcal), Math.round(summary.remaining.kcal))}
                </div>
              )}
            </div>

            <div className="card">
              <h2>{t.foodLog}</h2>
              {log.length === 0 && <div className="empty">{t.emptyLog}</div>}
              {MEALS.map((m) => {
                const rows = log.filter((l) => l.meal === m);
                if (rows.length === 0) return null;
                return (
                  <div key={m}>
                    <div className="meal-head"><span>{mealLabel(t, m)}</span><span>{summary?.by_meal[m] ?? 0} kcal</span></div>
                    <div className="list">
                      {rows.map((l) => (
                        <div className="item" key={l.id}>
                          <div>
                            <div className="name">{l.name}</div>
                            <div className="sub">{Math.round(l.grams)} g · {t.protein[0]} {l.protein} · {t.carbs[0]} {l.carbs} · {t.fat[0]} {l.fat}</div>
                          </div>
                          <div className="row">
                            <span className="pill">{Math.round(l.kcal)}</span>
                            <button className="icon-btn" onClick={() => remove(l.id)} aria-label={`${t.remove} ${l.name}`}>×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="stack">
            <PhotoCapture day={day} meal={meal} setMeal={setMeal} onLogged={refresh} />
            <ManualEntry day={day} meal={meal} setMeal={setMeal} onLogged={refresh} />
            <Recommendations day={day} meal={meal} refreshKey={tick} onLogged={refresh} />
          </div>
        </div>
      )}

      {tab === "plan" && <MealPlan day={day} onLogged={() => { refresh(); setTab("today"); }} />}
      {tab === "profile" && <ProfileForm onSaved={refresh} />}
    </div>
  );
}
