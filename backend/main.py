import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

import vision
from db import all_foods, day_totals, db, get_profile, init_db
from nutrition import targets
from recommender import build_plan, recommend

Meal = Literal["breakfast", "lunch", "dinner", "snack"]
Locale = Literal["en", "vi"]


def _locale(v: str | None) -> str:
    return "vi" if (v or "").lower() == "vi" else "en"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Meal Planner API", lifespan=lifespan)

_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_vercel = os.getenv("VERCEL_URL") or os.getenv("VERCEL_PROJECT_PRODUCTION_URL")
if _vercel:
    host = _vercel if _vercel.startswith("http") else f"https://{_vercel}"
    _origins.append(host)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


def _check_day(day: str) -> str:
    try:
        date.fromisoformat(day)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")
    return day


# ---------- models ----------
class ProfileIn(BaseModel):
    sex: Literal["male", "female"]
    age: int = Field(ge=14, le=100)
    height_cm: float = Field(ge=100, le=250)
    weight_kg: float = Field(ge=30, le=300)
    activity: Literal["sedentary", "light", "moderate", "active", "very_active"]
    goal: Literal["lose", "maintain", "gain"]
    diet: Literal["none", "pescatarian", "vegetarian", "vegan"]
    exclusions: str = ""


class LogIn(BaseModel):
    day: str
    meal: Meal
    food_id: int
    grams: float = Field(gt=0, le=5000)
    source: Literal["manual", "photo", "plan", "recommendation"] = "manual"

    @field_validator("day")
    @classmethod
    def _d(cls, v):
        return _check_day(v)


class FoodIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str = "mixed"
    kcal: float = Field(ge=0, le=900)
    protein: float = Field(ge=0, le=100)
    carbs: float = Field(ge=0, le=100)
    fat: float = Field(ge=0, le=100)
    serving_g: float = Field(default=100, gt=0, le=2000)
    locale: Locale = "en"


class PhotoIn(BaseModel):
    image_base64: str
    media_type: Literal["image/jpeg", "image/png", "image/webp", "image/gif"] = "image/jpeg"
    locale: Locale = "en"


# ---------- profile ----------
@app.get("/api/profile")
def read_profile():
    with db() as c:
        p = get_profile(c)
    return {"profile": p, "targets": targets(p)}


@app.put("/api/profile")
def write_profile(body: ProfileIn):
    with db() as c:
        c.execute(
            "UPDATE profile SET sex=?, age=?, height_cm=?, weight_kg=?, activity=?, goal=?, diet=?, exclusions=? WHERE id=1",
            (body.sex, body.age, body.height_cm, body.weight_kg, body.activity, body.goal, body.diet, body.exclusions),
        )
        p = get_profile(c)
    return {"profile": p, "targets": targets(p)}


# ---------- foods ----------
@app.get("/api/foods")
def list_foods(q: str = "", locale: Locale = "en", limit: int = Query(40, le=200)):
    loc = _locale(locale)
    with db() as c:
        rows = c.execute(
            "SELECT * FROM foods WHERE locale = ? AND name LIKE ? ORDER BY name LIMIT ?",
            (loc, f"%{q.strip()}%", limit),
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/foods")
def create_food(body: FoodIn):
    loc = _locale(body.locale)
    with db() as c:
        try:
            cur = c.execute(
                "INSERT INTO foods(name,category,kcal,protein,carbs,fat,serving_g,meals,tags,locale) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (body.name.strip(), body.category, body.kcal, body.protein, body.carbs, body.fat,
                 body.serving_g, "blds", "", loc),
            )
        except Exception:
            raise HTTPException(409, "A food with that name already exists")
        row = c.execute("SELECT * FROM foods WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


# ---------- log ----------
@app.post("/api/log")
def add_log(body: LogIn):
    with db() as c:
        f = c.execute("SELECT * FROM foods WHERE id = ?", (body.food_id,)).fetchone()
        if not f:
            raise HTTPException(404, "Food not found")
        k = body.grams / 100
        cur = c.execute(
            "INSERT INTO logs(day,meal,food_id,name,grams,kcal,protein,carbs,fat,source) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (body.day, body.meal, f["id"], f["name"], body.grams,
             round(f["kcal"] * k, 1), round(f["protein"] * k, 1), round(f["carbs"] * k, 1), round(f["fat"] * k, 1),
             body.source),
        )
        row = c.execute("SELECT * FROM logs WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


@app.get("/api/log")
def read_log(day: str):
    _check_day(day)
    with db() as c:
        rows = c.execute("SELECT * FROM logs WHERE day = ? ORDER BY id", (day,)).fetchall()
    return [dict(r) for r in rows]


@app.delete("/api/log/{log_id}")
def delete_log(log_id: int):
    with db() as c:
        c.execute("DELETE FROM logs WHERE id = ?", (log_id,))
    return {"ok": True}


@app.get("/api/summary")
def summary(day: str):
    _check_day(day)
    with db() as c:
        tg = targets(get_profile(c))
        tot = day_totals(c, day)
        by_meal = {r["meal"]: round(r["k"]) for r in c.execute(
            "SELECT meal, SUM(kcal) k FROM logs WHERE day = ? GROUP BY meal", (day,))}
    remaining = {k: round(tg[k] - tot[k], 1) for k in ("kcal", "protein", "carbs", "fat")}
    return {"day": day, "consumed": tot, "target": tg, "remaining": remaining, "by_meal": by_meal}


# ---------- intelligence ----------
@app.get("/api/recommendations")
def recommendations(day: str, meal: Optional[Meal] = None, locale: Locale = "en"):
    _check_day(day)
    with db() as c:
        return recommend(c, day, meal, locale=_locale(locale))


@app.get("/api/mealplan")
def mealplan(day: str, variation: int = 0, locale: Locale = "en"):
    _check_day(day)
    with db() as c:
        return build_plan(c, day, variation, locale=_locale(locale))


@app.post("/api/analyze-photo")
def analyze_photo(body: PhotoIn):
    data = body.image_base64.split(",", 1)[-1]
    if len(data) > 8_000_000:
        raise HTTPException(413, "Image too large")
    loc = _locale(body.locale)
    with db() as c:
        foods = all_foods(c, loc)
    try:
        detected = vision.analyze(data, body.media_type, [f["name"] for f in foods], locale=loc)
    except vision.VisionUnavailable as e:
        raise HTTPException(503, str(e))
    except vision.VisionError as e:
        raise HTTPException(502, str(e))

    items = []
    for d in detected:
        f = vision.match_food(d["name"], foods)
        items.append({
            "raw_name": d["name"],
            "name": f["name"] if f else d["name"],
            "food_id": f["id"] if f else None,
            "grams": d["grams"],
            "confidence": d["confidence"],
            "kcal100": f["kcal"] if f else 0,
            "protein100": f["protein"] if f else 0,
            "carbs100": f["carbs"] if f else 0,
            "fat100": f["fat"] if f else 0,
        })
    return {"items": items}
