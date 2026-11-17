"""Calorie / macro targets (Mifflin-St Jeor)."""

ACTIVITY = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}
GOAL_ADJUST_KCAL = {"lose": -500, "maintain": 0, "gain": 300}
PROTEIN_G_PER_KG = {"lose": 1.8, "maintain": 1.4, "gain": 1.8}

MEAL_LETTER = {"breakfast": "b", "lunch": "l", "dinner": "d", "snack": "s"}
SHARE = {"breakfast": 0.25, "lunch": 0.35, "dinner": 0.30, "snack": 0.10}


def bmr(sex: str, age: int, height_cm: float, weight_kg: float) -> float:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return base + 5 if sex == "male" else base - 161


def targets(p: dict) -> dict:
    b = bmr(p["sex"], p["age"], p["height_cm"], p["weight_kg"])
    tdee = b * ACTIVITY.get(p["activity"], 1.55)
    floor = 1500 if p["sex"] == "male" else 1200  # safety floor for weight loss
    kcal = max(tdee + GOAL_ADJUST_KCAL.get(p["goal"], 0), floor)
    protein = PROTEIN_G_PER_KG.get(p["goal"], 1.4) * p["weight_kg"]
    fat = 0.27 * kcal / 9
    carbs = max((kcal - protein * 4 - fat * 9) / 4, 50)
    return {
        "kcal": round(kcal),
        "protein": round(protein),
        "carbs": round(carbs),
        "fat": round(fat),
        "bmr": round(b),
        "tdee": round(tdee),
    }
