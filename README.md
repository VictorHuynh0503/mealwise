# Mealwise — personalized meal planner

Next.js (TypeScript) frontend + Python (FastAPI, SQLite) backend. Soft white UI.

## Run

```bash
# Windows: double-click start.bat (loads root .env automatically)

# 1) backend  (http://127.0.0.1:8000)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Photo recognition: set CURSOR_KEY=crsr_... in the project root .env
uvicorn main:app --port 8000

# 2) frontend (http://localhost:3000)
cd frontend
npm install
npm run dev
```

Photo recognition uses your **Cursor API key** (`CURSOR_KEY`) via the [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) (no-repo agent + image). Default model: `claude-haiku-5-5` (`CURSOR_MODEL`) — cheapest Claude with vision on your account. (`composer-2` is not a valid id; use `composer-2.5` if you want Composer.) This is slower than a direct Anthropic call because it boots a cloud agent. Optional fallback: set `ANTHROPIC_API_KEY` and `VISION_PROVIDER=anthropic`.

The browser talks to `/api/*` on Next.js, which proxies to the backend (`BACKEND_URL`, default `http://127.0.0.1:8000`).
Camera capture needs `localhost` or HTTPS; on other hosts use "Upload photo".

## Deploy on Vercel

Root `vercel.json` uses [Vercel Services](https://vercel.com/docs/services): Next.js (`frontend/`) + FastAPI (`backend/`). `/api/*` goes to the backend; everything else to the frontend.

1. Import the repo in Vercel (project root = this folder, not `frontend/`).
2. Set env vars: `CURSOR_KEY` (or `ANTHROPIC_API_KEY`), optionally `CURSOR_MODEL`, `VISION_PROVIDER`.
3. Deploy. SQLite lives under `/tmp` on Vercel (resets between cold starts — fine for demos, not durable production storage).

Photo analysis can take up to ~3 minutes; use a plan that allows longer function timeouts if uploads time out.

## Language / food catalogs

Toggle **EN / VI** in the header. English uses `backend/seed_foods.py`; Vietnamese UI + catalog uses `backend/seed_foods_vi.py`. Both are seeded into SQLite with a `locale` column; APIs take `?locale=vi|en`.

## Features

- **Targets**: BMR/TDEE (Mifflin-St Jeor) + goal -> daily kcal, protein, carbs, fat.
- **Log food**: capture or upload a photo, or search the food database and enter grams (live calories). Add custom foods.
- **Photo -> database**: the image is sent to the Anthropic Messages API (plain REST, no SDK) together with your
  food names. It returns items and gram estimates; each is fuzzy-matched to a DB row, so calories always come from
  your database. You confirm/adjust grams before anything is saved.
- **End-of-day view**: consumed vs needed, remaining kcal and macros, log grouped by meal.
- **Recommendations** (`backend/recommender.py`): scores foods on calorie fit for the meal slot, protein gap,
  your 30-day eating frequency, and variety; respects diet and exclusions. Each suggestion explains why.
- **Meal plan**: builds breakfast/lunch/dinner/snack to hit your target; "Shuffle" gives variations; log a meal in one click.

## Plugging in your own algorithm

Replace `score_food` logic inside `recommend()` / `_pick()` in `backend/recommender.py`. Inputs available: profile,
today's totals, remaining macros, per-food history (`affinity`). Keep the returned shape and the UI works unchanged.

## Notes

- Food values in `backend/seed_foods.py` are approximate per-100 g figures; edit or extend freely.
- Photo portion estimates are rough. Always check the grams.
- Targets are general estimates, not medical advice.
