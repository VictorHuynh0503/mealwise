"use client";
import { useEffect, useState } from "react";
import { api, type Profile, type Targets } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

export default function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useLocale();
  const [p, setP] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.profile().then((r) => { setP(r.profile); setTargets(r.targets); }).catch((e) => setErr((e as Error).message));
  }, []);

  if (!p) return <div className="card">{err ? <div className="error">{err}</div> : t.loading}</div>;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });
  const num = (k: "age" | "height_cm" | "weight_kg") => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value));

  const save = async () => {
    setErr(""); setMsg("");
    try {
      const r = await api.saveProfile(p);
      setP(r.profile); setTargets(r.targets); setMsg(t.saved);
      onSaved();
    } catch (e) {
      setErr((e as Error).message.includes("Request failed") ? t.profileInvalid : (e as Error).message);
    }
  };

  return (
    <div className="grid">
      <div className="card">
        <h2>{t.aboutYou}</h2>
        {err && <div className="error">{err}</div>}
        <div className="fields">
          <label className="field">{t.sex}
            <select value={p.sex} onChange={(e) => set("sex", e.target.value as Profile["sex"])}>
              <option value="male">{t.male}</option><option value="female">{t.female}</option>
            </select>
          </label>
          <label className="field">{t.age}<input type="number" value={p.age} onChange={num("age")} /></label>
          <label className="field">{t.height}<input type="number" value={p.height_cm} onChange={num("height_cm")} /></label>
          <label className="field">{t.weight}<input type="number" value={p.weight_kg} onChange={num("weight_kg")} /></label>
          <label className="field">{t.activity}
            <select value={p.activity} onChange={(e) => set("activity", e.target.value as Profile["activity"])}>
              <option value="sedentary">{t.sedentary}</option><option value="light">{t.light}</option>
              <option value="moderate">{t.moderate}</option><option value="active">{t.active}</option>
              <option value="very_active">{t.veryActive}</option>
            </select>
          </label>
          <label className="field">{t.goal}
            <select value={p.goal} onChange={(e) => set("goal", e.target.value as Profile["goal"])}>
              <option value="lose">{t.lose}</option><option value="maintain">{t.maintain}</option><option value="gain">{t.gain}</option>
            </select>
          </label>
          <label className="field">{t.diet}
            <select value={p.diet} onChange={(e) => set("diet", e.target.value as Profile["diet"])}>
              <option value="none">{t.noRestriction}</option><option value="pescatarian">{t.pescatarian}</option>
              <option value="vegetarian">{t.vegetarian}</option><option value="vegan">{t.vegan}</option>
            </select>
          </label>
          <label className="field">{t.exclude}
            <input value={p.exclusions} placeholder={t.excludePh} onChange={(e) => set("exclusions", e.target.value)} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={save}>{t.saveProfile}</button>
          {msg && <span className="pill">{msg}</span>}
        </div>
      </div>

      {targets && (
        <div className="card">
          <h2>{t.dailyTargets}</h2>
          <div className="calc" style={{ fontSize: 20 }}>{targets.kcal} kcal</div>
          <div className="list" style={{ marginTop: 10 }}>
            <div className="item"><span>{t.protein}</span><b>{targets.protein} g</b></div>
            <div className="item"><span>{t.carbs}</span><b>{targets.carbs} g</b></div>
            <div className="item"><span>{t.fat}</span><b>{targets.fat} g</b></div>
            <div className="item"><span className="sub">{t.bmr}</span><span className="sub">{targets.bmr} kcal</span></div>
            <div className="item"><span className="sub">{t.tdee}</span><span className="sub">{targets.tdee} kcal</span></div>
          </div>
          <div className="reason" style={{ marginTop: 8 }}>{t.estimateNote}</div>
        </div>
      )}
    </div>
  );
}
