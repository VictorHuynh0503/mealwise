"use client";
import { useEffect, useRef, useState } from "react";
import { api, type DetectedItem, type Meal, MEALS } from "@/lib/api";
import { fileToDataUrl, resizeToJpeg } from "@/lib/image";
import { mealLabel, useLocale } from "@/lib/i18n";

type Props = { day: string; meal: Meal; setMeal: (m: Meal) => void; onLogged: () => void };

/** Capture (camera / upload) -> backend vision -> match against the food DB -> confirm & log. */
export default function PhotoCapture({ day, meal, setMeal, onLogged }: Props) {
  const { t } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setLive(false);
  };
  useEffect(() => stop, []);

  const startCamera = async () => {
    setErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = s;
      setLive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = s;
      });
    } catch {
      setErr(t.cameraUnavailable);
    }
  };

  const snap = async () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    stop();
    await analyze(c.toDataURL("image/jpeg", 0.9));
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      await analyze(await fileToDataUrl(f));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const analyze = async (dataUrl: string) => {
    setBusy(true);
    setErr("");
    setItems([]);
    try {
      const small = await resizeToJpeg(dataUrl, 768);
      setPhoto(small);
      const r = await api.analyze(small.split(",")[1]);
      setItems(r.items);
      if (r.items.length === 0) setErr(t.noFoodDetected);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setGrams = (i: number, g: number) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, grams: g } : x)));
  const drop = (i: number) => setItems((xs) => xs.filter((_, j) => j !== i));

  const matched = items.filter((x) => x.food_id !== null);
  const unmatched = items.filter((x) => x.food_id === null);
  const total = Math.round(matched.reduce((s, x) => s + (x.kcal100 * x.grams) / 100, 0));

  const logAll = async () => {
    setBusy(true);
    setErr("");
    try {
      for (const x of matched) {
        await api.addLog({ day, meal, food_id: x.food_id as number, grams: x.grams, source: "photo" });
      }
      setItems([]);
      setPhoto(null);
      onLogged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="row spread">
        <h2>{t.snapMeal}</h2>
        <div className="chips">
          {MEALS.map((m) => (
            <button key={m} className={`chip ${m === meal ? "on" : ""}`} onClick={() => setMeal(m)}>{mealLabel(t, m)}</button>
          ))}
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {live ? (
        <>
          <video ref={videoRef} className="preview" autoPlay playsInline muted />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={snap}>{t.capture}</button>
            <button className="btn plain" onClick={stop}>{t.cancel}</button>
          </div>
        </>
      ) : (
        <>
          {photo && <img className="preview" src={photo} alt={t.yourMeal} />}
          <div className="row" style={{ marginTop: photo ? 12 : 0 }}>
            <button className="btn" disabled={busy} onClick={startCamera}>{t.useCamera}</button>
            <label className="btn ghost" style={{ cursor: "pointer" }}>
              {t.uploadPhoto}
              <input className="hidden" type="file" accept="image/*" capture="environment"
                onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
        </>
      )}

      {busy && <div className="empty">{t.analyzing}</div>}

      {items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="sub" style={{ marginBottom: 6 }}>{t.adjustAmounts(mealLabel(t, meal))}</div>
          <div className="list">
            {items.map((x, i) => (
              <div className="item" key={i}>
                <div>
                  <div className="name">{x.name}</div>
                  <div className="sub">
                    {x.food_id === null
                      ? t.notInDb
                      : `${Math.round((x.kcal100 * x.grams) / 100)} kcal · ${t.sure(Math.round(x.confidence * 100))}`}
                  </div>
                </div>
                <div className="row">
                  <input className="grams" type="number" min={5} value={Math.round(x.grams)}
                    onChange={(e) => setGrams(i, Number(e.target.value))} aria-label={`grams of ${x.name}`} />
                  <span className="sub">g</span>
                  <button className="icon-btn" onClick={() => drop(i)} aria-label={t.remove}>×</button>
                </div>
              </div>
            ))}
          </div>
          {unmatched.length > 0 && <div className="reason">{t.unmatchedHint}</div>}
          <div className="row spread" style={{ marginTop: 12 }}>
            <div className="calc">{total} kcal</div>
            <button className="btn" disabled={busy || matched.length === 0} onClick={logAll}>{t.addItems(matched.length)}</button>
          </div>
        </div>
      )}
    </div>
  );
}
