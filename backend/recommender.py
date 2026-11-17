"""Personalized recommendations + daily meal plan.

Transparent, rule-based scoring so every suggestion can explain itself. To plug in
a learned model later, replace `score_food` (or `affinity`) and keep the same outputs.
"""
import random

from db import all_foods, day_totals, get_profile
from nutrition import MEAL_LETTER, SHARE, targets

DIET_BLOCK = {
    "none": set(),
    "pescatarian": {"meat"},
    "vegetarian": {"meat", "fish", "shellfish"},
    "vegan": {"meat", "fish", "shellfish", "dairy", "egg"},
}

TEMPLATES = {
    "breakfast": [(("carb",), 0.45), (("protein", "dairy"), 0.35), (("fruit",), 0.20)],
    "lunch": [(("protein",), 0.40), (("carb",), 0.38), (("veg",), 0.22)],
    "dinner": [(("protein",), 0.40), (("carb",), 0.38), (("veg",), 0.22)],
    "snack": [(("fruit", "snack", "dairy"), 0.6), (("snack", "fruit"), 0.4)],
}
DISH_TEMPLATE = [(("mixed",), 0.8), (("veg",), 0.2)]


def _tags(food: dict) -> set:
    return {t for t in food["tags"].split(",") if t}


def allowed(food: dict, profile: dict) -> bool:
    tags = _tags(food)
    if tags & DIET_BLOCK.get(profile["diet"], set()):
        return False
    for ex in (x.strip().lower() for x in profile["exclusions"].split(",")):
        if ex and (ex in tags or ex in food["name"].lower()):
            return False
    return True


def affinity(conn, day: str) -> dict:
    """How often each food was eaten over the last 30 days, normalised 0..1."""
    rows = conn.execute(
        "SELECT food_id, COUNT(*) c FROM logs WHERE food_id IS NOT NULL "
        "AND day >= date(?, '-30 day') AND day <= ? GROUP BY food_id",
        (day, day),
    ).fetchall()
    mx = max((r["c"] for r in rows), default=1)
    return {r["food_id"]: r["c"] / mx for r in rows}


def _serving_macros(f: dict, grams: float | None = None) -> dict:
    g = grams if grams is not None else f["serving_g"]
    k = g / 100
    return {
        "grams": round(g),
        "kcal": round(f["kcal"] * k),
        "protein": round(f["protein"] * k, 1),
        "carbs": round(f["carbs"] * k, 1),
        "fat": round(f["fat"] * k, 1),
    }


def _reasons(locale: str):
    if locale == "vi":
        return {
            "protein": "Giàu đạm so với phần còn thiếu hôm nay",
            "fit": "Khẩu phần vừa với lượng calo còn lại",
            "often": "Bạn hay ăn món này",
            "eaten": "Đã ăn hôm nay, xếp thấp hơn",
            "balanced": "Lựa chọn cân bằng",
            "done": "Bạn đã đạt mục tiêu calo hôm nay.",
        }
    return {
        "protein": "High in protein for what you still need today",
        "fit": "Good size for the calories you have left",
        "often": "You eat this often",
        "eaten": "Already eaten today, ranked lower",
        "balanced": "Balanced option",
        "done": "You've reached today's calorie target.",
    }


def recommend(conn, day: str, meal: str | None = None, limit: int = 8, locale: str = "en") -> dict:
    profile = get_profile(conn)
    tg = targets(profile)
    tot = day_totals(conn, day)
    rem_k = max(tg["kcal"] - tot["kcal"], 0)
    rem_p = max(tg["protein"] - tot["protein"], 0)
    msg = _reasons(locale)
    if rem_k < 60:
        return {"items": [], "message": msg["done"]}

    share = SHARE.get(meal, 0.3)
    slot_k = min(rem_k, tg["kcal"] * share)
    ideal = max(slot_k / 2.5, 80)
    target_ratio = max(min(rem_p * 4 / max(rem_k, 1), 0.5), 0.08)
    aff = affinity(conn, day)
    eaten_today = {
        r["food_id"] for r in conn.execute("SELECT food_id FROM logs WHERE day = ?", (day,))
    }
    letter = MEAL_LETTER.get(meal) if meal else None

    scored = []
    for f in all_foods(conn, locale):
        if not allowed(f, profile) or f["category"] == "fat":
            continue
        if letter and letter not in f["meals"]:
            continue
        sm = _serving_macros(f)
        if sm["kcal"] > rem_k * 1.1 + 30:
            continue
        fit = 1 - min(1, abs(sm["kcal"] - ideal) / ideal)
        p_ratio = sm["protein"] * 4 / max(sm["kcal"], 1)
        pscore = min(1, p_ratio / target_ratio)
        a = aff.get(f["id"], 0)
        penalty = 0.3 if f["id"] in eaten_today else 0
        score = 0.4 * fit + 0.35 * pscore + 0.25 * a - penalty

        reasons = []
        if pscore > 0.8 and rem_p > 15:
            reasons.append(msg["protein"])
        if fit > 0.7:
            reasons.append(msg["fit"])
        if a > 0.3:
            reasons.append(msg["often"])
        if f["id"] in eaten_today:
            reasons.append(msg["eaten"])
        scored.append({"food_id": f["id"], "name": f["name"], "category": f["category"],
                       "serving_g": round(f["serving_g"]), "score": round(score, 3),
                       "reasons": reasons or [msg["balanced"]], **{k: v for k, v in sm.items() if k != "grams"}})

    scored.sort(key=lambda x: x["score"], reverse=True)
    out, per_cat = [], {}
    for s in scored:  # keep variety: max 3 per category
        if per_cat.get(s["category"], 0) >= 3:
            continue
        per_cat[s["category"]] = per_cat.get(s["category"], 0) + 1
        out.append(s)
        if len(out) >= limit:
            break
    return {"items": out, "remaining": {"kcal": round(rem_k), "protein": round(rem_p)}}


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def _pick(foods, meal, cats, rng, aff, used):
    letter = MEAL_LETTER[meal]
    pool = [f for f in foods if f["category"] in cats and letter in f["meals"]]
    fresh = [f for f in pool if f["id"] not in used] or pool
    if not fresh:
        return None

    def s(f):
        dense = min(f["protein"] * 4 / max(f["kcal"], 1) / 0.4, 1) if f["category"] in ("protein", "dairy") else 0
        return 0.45 * aff.get(f["id"], 0) + 0.25 * dense + rng.random() * 0.5

    return max(fresh, key=s)


def build_plan(conn, day: str, variation: int = 0, locale: str = "en") -> dict:
    profile = get_profile(conn)
    tg = targets(profile)
    foods = [f for f in all_foods(conn, locale) if allowed(f, profile)]
    aff = affinity(conn, day)
    rng = random.Random(f"{day}:{variation}")
    used: set = set()
    slots = []

    for meal in ("breakfast", "lunch", "dinner", "snack"):
        slot_k = tg["kcal"] * SHARE[meal]
        template = TEMPLATES[meal]
        letter = MEAL_LETTER[meal]
        has_dish = any(f["category"] == "mixed" and letter in f["meals"] for f in foods)
        if meal in ("lunch", "dinner") and has_dish and rng.random() < 0.3:
            template = DISH_TEMPLATE

        picked = []
        for cats, frac in template:
            f = _pick(foods, meal, cats, rng, aff, used)
            if not f:
                continue
            used.add(f["id"])
            g = _clamp(slot_k * frac * 100 / f["kcal"], 0.4 * f["serving_g"], 1.5 * f["serving_g"])
            picked.append((f, g))

        total = sum(f["kcal"] * g / 100 for f, g in picked)
        if total > 0:  # one calibration pass toward the slot target
            k = slot_k / total
            picked = [(f, _clamp(g * k, 0.4 * f["serving_g"], 1.5 * f["serving_g"])) for f, g in picked]

        items = []
        for f, g in picked:
            g = max(5, round(g / 5) * 5)
            items.append({"food_id": f["id"], "name": f["name"], **_serving_macros(f, g)})
        slots.append({
            "meal": meal,
            "target_kcal": round(slot_k),
            "items": items,
            "totals": {k: round(sum(i[k] for i in items), 1) for k in ("kcal", "protein", "carbs", "fat")},
        })

    totals = {k: round(sum(s["totals"][k] for s in slots), 1) for k in ("kcal", "protein", "carbs", "fat")}
    return {"day": day, "variation": variation, "slots": slots, "totals": totals, "target": tg}
