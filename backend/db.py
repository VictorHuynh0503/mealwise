"""SQLite storage (stdlib only)."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

def _default_db_path() -> Path:
    # Vercel Functions have a read-only filesystem except /tmp (ephemeral).
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV"):
        return Path("/tmp/meals.db")
    return Path(__file__).parent / "meals.db"


DB_PATH = Path(os.getenv("MEALS_DB", _default_db_path()))

SCHEMA = """
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'mixed',
  kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
  serving_g REAL NOT NULL DEFAULT 100,
  meals TEXT NOT NULL DEFAULT 'blds',
  tags TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'en'
);
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sex TEXT NOT NULL DEFAULT 'male',
  age INTEGER NOT NULL DEFAULT 30,
  height_cm REAL NOT NULL DEFAULT 170,
  weight_kg REAL NOT NULL DEFAULT 70,
  activity TEXT NOT NULL DEFAULT 'moderate',
  goal TEXT NOT NULL DEFAULT 'maintain',
  diet TEXT NOT NULL DEFAULT 'none',
  exclusions TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  meal TEXT NOT NULL,
  food_id INTEGER,
  name TEXT NOT NULL,
  grams REAL NOT NULL,
  kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logs_day ON logs(day);
"""


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _migrate(conn):
    cols = {r[1] for r in conn.execute("PRAGMA table_info(foods)")}
    if cols and "locale" not in cols:
        conn.execute("ALTER TABLE foods ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_foods_locale ON foods(locale)")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_name_locale ON foods(name, locale)"
    )


def _seed_foods(conn):
    from seed_foods import FOODS
    from seed_foods_vi import FOODS_VI

    for locale, foods in (("en", FOODS), ("vi", FOODS_VI)):
        for row in foods:
            conn.execute(
                "INSERT OR IGNORE INTO foods(name,category,kcal,protein,carbs,fat,serving_g,meals,tags,locale) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (*row, locale),
            )


def init_db():
    with db() as c:
        c.executescript(SCHEMA)
        _migrate(c)
        _seed_foods(c)
        c.execute("INSERT OR IGNORE INTO profile(id) VALUES (1)")


def get_profile(conn) -> dict:
    return dict(conn.execute("SELECT * FROM profile WHERE id = 1").fetchone())


def all_foods(conn, locale: str = "en") -> list[dict]:
    loc = "vi" if locale == "vi" else "en"
    return [dict(r) for r in conn.execute(
        "SELECT * FROM foods WHERE locale = ? ORDER BY name", (loc,)
    )]


def day_totals(conn, day: str) -> dict:
    r = conn.execute(
        "SELECT COALESCE(SUM(kcal),0) kcal, COALESCE(SUM(protein),0) protein, "
        "COALESCE(SUM(carbs),0) carbs, COALESCE(SUM(fat),0) fat FROM logs WHERE day = ?",
        (day,),
    ).fetchone()
    return {k: round(r[k], 1) for k in ("kcal", "protein", "carbs", "fat")}
