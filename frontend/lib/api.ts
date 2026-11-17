export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
export type Locale = "en" | "vi";

let currentLocale: Locale = "en";
export function setApiLocale(locale: Locale) {
  currentLocale = locale === "vi" ? "vi" : "en";
}
export function getApiLocale(): Locale {
  return currentLocale;
}

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };
export type Targets = Macros & { bmr: number; tdee: number };

export type Profile = {
  sex: "male" | "female";
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal: "lose" | "maintain" | "gain";
  diet: "none" | "pescatarian" | "vegetarian" | "vegan";
  exclusions: string;
};

export type Food = {
  id: number;
  name: string;
  category: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_g: number;
  locale?: string;
};

export type LogEntry = Macros & {
  id: number;
  day: string;
  meal: Meal;
  food_id: number | null;
  name: string;
  grams: number;
  source: string;
};

export type Summary = {
  day: string;
  consumed: Macros;
  target: Targets;
  remaining: Macros;
  by_meal: Partial<Record<Meal, number>>;
};

export type Recommendation = Macros & {
  food_id: number;
  name: string;
  category: string;
  serving_g: number;
  score: number;
  reasons: string[];
};
export type RecommendationResponse = {
  items: Recommendation[];
  message?: string;
  remaining?: { kcal: number; protein: number };
};

export type PlanItem = Macros & { food_id: number; name: string; grams: number };
export type PlanSlot = { meal: Meal; target_kcal: number; items: PlanItem[]; totals: Macros };
export type Plan = { day: string; variation: number; slots: PlanSlot[]; totals: Macros; target: Targets };

export type DetectedItem = {
  raw_name: string;
  name: string;
  food_id: number | null;
  grams: number;
  confidence: number;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
};

export type NewFood = {
  name: string;
  category?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_g: number;
  locale?: Locale;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(typeof e.detail === "string" ? e.detail : "Request failed");
  }
  return r.json() as Promise<T>;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const withLocale = (path: string) => {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}locale=${currentLocale}`;
};

export const api = {
  profile: () => req<{ profile: Profile; targets: Targets }>("/profile"),
  saveProfile: (p: Profile) =>
    req<{ profile: Profile; targets: Targets }>("/profile", { method: "PUT", body: JSON.stringify(p) }),
  foods: (q: string) => req<Food[]>(withLocale(`/foods?q=${encodeURIComponent(q)}`)),
  addFood: (f: NewFood) => req<Food>("/foods", post({ ...f, locale: f.locale ?? currentLocale })),
  addLog: (b: { day: string; meal: Meal; food_id: number; grams: number; source?: string }) =>
    req<LogEntry>("/log", post(b)),
  log: (day: string) => req<LogEntry[]>(`/log?day=${day}`),
  deleteLog: (id: number) => req<{ ok: boolean }>(`/log/${id}`, { method: "DELETE" }),
  summary: (day: string) => req<Summary>(`/summary?day=${day}`),
  recommend: (day: string, meal?: Meal) =>
    req<RecommendationResponse>(withLocale(`/recommendations?day=${day}${meal ? `&meal=${meal}` : ""}`)),
  plan: (day: string, variation: number) =>
    req<Plan>(withLocale(`/mealplan?day=${day}&variation=${variation}`)),
  analyze: (image_base64: string, media_type = "image/jpeg") =>
    req<{ items: DetectedItem[] }>("/analyze-photo", post({ image_base64, media_type, locale: currentLocale })),
};

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function defaultMeal(): Meal {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
