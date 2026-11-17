"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "vi";

const STORAGE_KEY = "mealwise.locale";

const dict = {
  en: {
    today: "Today",
    plan: "Meal plan",
    profile: "Profile",
    foodLog: "Food log",
    emptyLog: "Nothing logged yet. Add a meal with the camera or by searching.",
    loading: "Loading…",
    goalLine: (target: number, eaten: number, rem: number) =>
      rem >= 0
        ? `Goal ${target} kcal · eaten ${eaten} · ${rem} left`
        : `Goal ${target} kcal · eaten ${eaten} · ${-rem} over`,
    kcalLeft: (n: number) => `${n} kcal left`,
    kcalOver: (n: number) => `${n} kcal over`,
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    breakfast: "breakfast",
    lunch: "lunch",
    dinner: "dinner",
    snack: "snack",
    backendDown: "Can't reach the backend. Start it with: uvicorn main:app --port 8000",
    snapMeal: "Snap your meal",
    useCamera: "Use camera",
    uploadPhoto: "Upload photo",
    capture: "Capture",
    cancel: "Cancel",
    analyzing: "Analyzing…",
    adjustAmounts: (meal: string) => `Adjust amounts, then add to ${meal}. Calories come from your food database.`,
    notInDb: "Not in database — add it manually",
    sure: (pct: number) => `${pct}% sure`,
    unmatchedHint: "Unmatched items are skipped. Add them with “Add food manually”.",
    addItems: (n: number) => `Add ${n} item${n === 1 ? "" : "s"}`,
    cameraUnavailable: "Camera unavailable. Allow camera access, or upload a photo instead.",
    noFoodDetected: "No food detected. Try a closer, brighter photo.",
    yourMeal: "Your meal",
    remove: "Remove",
    addManually: "Add food manually",
    searchPlaceholder: "Search ingredients or dishes (e.g. chicken, rice, banana)",
    select: "Select",
    noMatch: "No match. Add it as a custom food below.",
    amountG: "Amount (g)",
    addTo: (meal: string) => `Add to ${meal}`,
    customFood: "+ Custom food",
    nutritionPer100: "Nutrition values per 100 g",
    name: "Name",
    saveFood: "Save food",
    needNameKcal: "Give the food a name and kcal per 100 g.",
    suggested: "Suggested for you",
    leftToday: (kcal: number, protein: number) => `Left today: ${kcal} kcal · ${protein} g protein`,
    add: "Add",
    nothingFits: "Nothing fits right now.",
    mealPlanTitle: "Today’s meal plan",
    plannedLine: (kcal: number, target: number, protein: number) =>
      `${kcal} kcal planned · target ${target} · P ${protein} g`,
    shuffle: "Shuffle plan",
    logThisMeal: "Log this meal",
    noMatchingDiet: "No matching foods for your diet settings.",
    aboutYou: "About you",
    sex: "Sex",
    male: "Male",
    female: "Female",
    age: "Age",
    height: "Height (cm)",
    weight: "Weight (kg)",
    activity: "Activity",
    sedentary: "Sedentary",
    light: "Light",
    moderate: "Moderate",
    active: "Active",
    veryActive: "Very active",
    goal: "Goal",
    lose: "Lose weight",
    maintain: "Maintain",
    gain: "Gain muscle",
    diet: "Diet",
    noRestriction: "No restriction",
    pescatarian: "Pescatarian",
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    exclude: "Exclude (comma-separated)",
    excludePh: "e.g. shellfish, nuts, soy",
    saveProfile: "Save profile",
    saved: "Saved",
    profileInvalid: "Please check your values (age 14–100, height 100–250 cm, weight 30–300 kg).",
    dailyTargets: "Your daily targets",
    bmr: "Resting energy (BMR)",
    tdee: "Maintenance (TDEE)",
    estimateNote: "Estimated with the Mifflin-St Jeor equation. These are general estimates, not medical advice.",
    langEn: "EN",
    langVi: "VI",
  },
  vi: {
    today: "Hôm nay",
    plan: "Thực đơn",
    profile: "Hồ sơ",
    foodLog: "Nhật ký ăn uống",
    emptyLog: "Chưa có món nào. Thêm bằng camera hoặc tìm kiếm.",
    loading: "Đang tải…",
    goalLine: (target: number, eaten: number, rem: number) =>
      rem >= 0
        ? `Mục tiêu ${target} kcal · đã ăn ${eaten} · còn ${rem}`
        : `Mục tiêu ${target} kcal · đã ăn ${eaten} · vượt ${-rem}`,
    kcalLeft: (n: number) => `còn ${n} kcal`,
    kcalOver: (n: number) => `vượt ${n} kcal`,
    protein: "Đạm",
    carbs: "Tinh bột",
    fat: "Béo",
    breakfast: "sáng",
    lunch: "trưa",
    dinner: "tối",
    snack: "phụ",
    backendDown: "Không kết nối được backend. Chạy: uvicorn main:app --port 8000",
    snapMeal: "Chụp món ăn",
    useCamera: "Dùng camera",
    uploadPhoto: "Tải ảnh lên",
    capture: "Chụp",
    cancel: "Hủy",
    analyzing: "Đang phân tích…",
    adjustAmounts: (meal: string) => `Chỉnh gram rồi thêm vào bữa ${meal}. Calo lấy từ cơ sở dữ liệu món ăn.`,
    notInDb: "Chưa có trong CSDL — thêm thủ công",
    sure: (pct: number) => `${pct}% chắc`,
    unmatchedHint: "Món chưa khớp sẽ bỏ qua. Thêm bằng “Thêm món thủ công”.",
    addItems: (n: number) => `Thêm ${n} món`,
    cameraUnavailable: "Không dùng được camera. Cho phép quyền camera hoặc tải ảnh lên.",
    noFoodDetected: "Không nhận diện được món. Thử ảnh gần hơn, sáng hơn.",
    yourMeal: "Món của bạn",
    remove: "Xóa",
    addManually: "Thêm món thủ công",
    searchPlaceholder: "Tìm nguyên liệu hoặc món (vd: cơm, gà, chuối)",
    select: "Chọn",
    noMatch: "Không khớp. Thêm món tùy chỉnh bên dưới.",
    amountG: "Khối lượng (g)",
    addTo: (meal: string) => `Thêm vào ${meal}`,
    customFood: "+ Món tùy chỉnh",
    nutritionPer100: "Giá trị dinh dưỡng trên 100 g",
    name: "Tên",
    saveFood: "Lưu món",
    needNameKcal: "Nhập tên món và kcal trên 100 g.",
    suggested: "Gợi ý cho bạn",
    leftToday: (kcal: number, protein: number) => `Còn hôm nay: ${kcal} kcal · ${protein} g đạm`,
    add: "Thêm",
    nothingFits: "Chưa có gợi ý phù hợp.",
    mealPlanTitle: "Thực đơn hôm nay",
    plannedLine: (kcal: number, target: number, protein: number) =>
      `${kcal} kcal dự kiến · mục tiêu ${target} · Đạm ${protein} g`,
    shuffle: "Đổi thực đơn",
    logThisMeal: "Ghi bữa này",
    noMatchingDiet: "Không có món phù hợp chế độ ăn của bạn.",
    aboutYou: "Thông tin của bạn",
    sex: "Giới tính",
    male: "Nam",
    female: "Nữ",
    age: "Tuổi",
    height: "Chiều cao (cm)",
    weight: "Cân nặng (kg)",
    activity: "Vận động",
    sedentary: "Ít vận động",
    light: "Nhẹ",
    moderate: "Trung bình",
    active: "Năng động",
    veryActive: "Rất năng động",
    goal: "Mục tiêu",
    lose: "Giảm cân",
    maintain: "Giữ cân",
    gain: "Tăng cơ",
    diet: "Chế độ ăn",
    noRestriction: "Không hạn chế",
    pescatarian: "Ăn cá (không thịt đỏ)",
    vegetarian: "Ăn chay (có trứng/sữa)",
    vegan: "Thuần chay",
    exclude: "Loại trừ (cách nhau bằng dấu phẩy)",
    excludePh: "vd: hải sản, đậu nành, đậu phộng",
    saveProfile: "Lưu hồ sơ",
    saved: "Đã lưu",
    profileInvalid: "Kiểm tra lại giá trị (tuổi 14–100, cao 100–250 cm, cân 30–300 kg).",
    dailyTargets: "Mục tiêu mỗi ngày",
    bmr: "Năng lượng nghỉ (BMR)",
    tdee: "Duy trì cân nặng (TDEE)",
    estimateNote: "Ước tính theo Mifflin-St Jeor. Chỉ mang tính tham khảo, không phải lời khuyên y tế.",
    langEn: "EN",
    langVi: "VI",
  },
} as const;

export type Dict = typeof dict.en;

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Dict;
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "vi" || saved === "en") setLocaleState(saved);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    if (typeof document !== "undefined") document.documentElement.lang = l;
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t: dict[locale] as Dict }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

export function mealLabel(t: Dict, meal: string) {
  if (meal === "breakfast") return t.breakfast;
  if (meal === "lunch") return t.lunch;
  if (meal === "dinner") return t.dinner;
  if (meal === "snack") return t.snack;
  return meal;
}
