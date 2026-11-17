"""Food photo analysis via Cursor Cloud Agents (CURSOR_KEY) or Anthropic Messages API.

Flow: the model is shown the photo plus the names in our food database, and returns the
items it sees with estimated grams. Each name is then fuzzy-matched back to a database row,
so calories always come from the database, not from the model.

Primary: Cursor Cloud Agents API with CURSOR_KEY / CURSOR_API_KEY (no-repo agent + image).
Fallback: Anthropic Messages API with ANTHROPIC_API_KEY.
"""
from __future__ import annotations

import base64
import difflib
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
CURSOR_AGENTS_URL = "https://api.cursor.com/v1/agents"
# Cloud Agents model id (override with CURSOR_MODEL). Must exist in GET /v1/models.
DEFAULT_CURSOR_MODEL = "claude-haiku-5-5"
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5"


def _load_dotenv() -> None:
    """Load KEY=VALUE pairs from project /.env and backend/.env (no overwrite of existing env)."""
    here = Path(__file__).resolve().parent
    for path in (here.parent / ".env", here / ".env"):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()


class VisionUnavailable(Exception):
    pass


class VisionError(Exception):
    pass


def _cursor_key() -> str | None:
    return os.getenv("CURSOR_KEY") or os.getenv("CURSOR_API_KEY") or None


def _anthropic_key() -> str | None:
    return os.getenv("ANTHROPIC_API_KEY") or None


def _food_prompt(catalog_names: list[str], locale: str = "en") -> str:
    catalog = catalog_names[:120]
    lang = (
        "Catalog names are Vietnamese — prefer those exact Vietnamese names when matching. "
        if locale == "vi"
        else "Prefer exact catalog names when they match; otherwise use a short common English name. "
    )
    return (
        "You are a food photo analyzer. Do not edit files or run tools. "
        "Look at the attached image only and reply with a single JSON object — no markdown, no prose. "
        "Identify every distinct edible food and estimate edible grams for each. "
        + lang
        + 'Schema: {"items":[{"name":"...","grams":123,"confidence":0.0}]}. '
        'No food -> {"items":[]}.\n'
        f"Catalog: {json.dumps(catalog, separators=(',', ':'), ensure_ascii=False)}"
    )


def _parse_items(text: str) -> list[dict]:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise VisionError("Could not parse the model's answer.")
    try:
        items = json.loads(m.group(0)).get("items", [])
    except json.JSONDecodeError:
        raise VisionError("Could not parse the model's answer.")
    clean = []
    for it in items:
        try:
            clean.append({
                "name": str(it["name"]),
                "grams": max(5.0, min(float(it.get("grams", 100)), 1500.0)),
                "confidence": max(0.0, min(float(it.get("confidence", 0.5)), 1.0)),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return clean


def _http_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    body: dict | None = None,
    timeout: float = 60,
) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            if not raw:
                return {}
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")[:300]
        raise VisionError(f"API error {e.code}: {detail}")
    except Exception as e:
        raise VisionError(f"API unreachable: {e}")


def _analyze_cursor(image_b64: str, media_type: str, catalog_names: list[str], locale: str = "en") -> list[dict]:
    """No-repo Cloud Agent with image prompt; poll until the run finishes."""
    key = _cursor_key()
    assert key
    auth = "Basic " + base64.b64encode(f"{key}:".encode()).decode()
    headers = {
        "Authorization": auth,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    model_id = (os.getenv("CURSOR_MODEL") or DEFAULT_CURSOR_MODEL).strip()
    create_body: dict = {
        "prompt": {
            "text": _food_prompt(catalog_names, locale),
            "images": [{"data": image_b64, "mimeType": media_type}],
        },
        "name": "mealwise-photo",
        # Omit repos -> no-repo cloud agent (must be enabled for the account).
    }
    if model_id:
        model: dict = {"id": model_id}
        # Cursor Router needs an explicit optimize_for when using auto-smart.
        if model_id in ("auto-smart", "auto", "default"):
            opt = (os.getenv("CURSOR_OPTIMIZE_FOR") or "cost").strip().lower()
            if model_id == "auto-smart" and opt in ("cost", "balanced", "intelligence"):
                model["params"] = [{"id": "optimize_for", "value": opt}]
        create_body["model"] = model

    created = _http_json("POST", CURSOR_AGENTS_URL, headers=headers, body=create_body, timeout=90)
    agent = created.get("agent") or {}
    run = created.get("run") or {}
    agent_id = agent.get("id")
    run_id = run.get("id")
    if not agent_id or not run_id:
        raise VisionError(f"Cursor agent create returned unexpected payload: {str(created)[:200]}")

    # Poll run until terminal. Cloud agents can take a while to boot.
    deadline = time.time() + float(os.getenv("CURSOR_VISION_TIMEOUT_SEC", "180"))
    status = run.get("status") or "CREATING"
    result_text = run.get("result") or ""
    while status in ("CREATING", "RUNNING", "WAITING_FOR_BACKGROUND_WORK"):
        if time.time() > deadline:
            raise VisionError("Cursor vision timed out waiting for the cloud agent.")
        time.sleep(2.5)
        detail = _http_json(
            "GET",
            f"{CURSOR_AGENTS_URL}/{agent_id}/runs/{run_id}",
            headers=headers,
            timeout=60,
        )
        status = detail.get("status") or status
        result_text = detail.get("result") or result_text

    # Best-effort cleanup so photo runs don't clutter the Agents dashboard.
    try:
        _http_json("POST", f"{CURSOR_AGENTS_URL}/{agent_id}/archive", headers=headers, body={}, timeout=30)
    except VisionError:
        pass

    if status != "FINISHED":
        raise VisionError(f"Cursor agent ended with status {status}: {(result_text or '')[:200]}")
    if not result_text:
        raise VisionError("Cursor agent finished with an empty reply.")
    return _parse_items(result_text)


def _analyze_anthropic(image_b64: str, media_type: str, catalog_names: list[str], locale: str = "en") -> list[dict]:
    key = _anthropic_key()
    assert key
    model = os.getenv("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)
    body = {
        "model": model,
        "max_tokens": 500,
        "output_config": {"effort": "low"},
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                {"type": "text", "text": _food_prompt(catalog_names, locale)},
            ],
        }],
    }
    resp = _http_json(
        "POST",
        ANTHROPIC_URL,
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body=body,
        timeout=60,
    )
    text = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
    return _parse_items(text)


def analyze(image_b64: str, media_type: str, catalog_names: list[str], locale: str = "en") -> list[dict]:
    provider = (os.getenv("VISION_PROVIDER") or "auto").strip().lower()
    cursor = _cursor_key()
    anthropic = _anthropic_key()
    loc = "vi" if locale == "vi" else "en"

    if provider == "cursor":
        if not cursor:
            raise VisionUnavailable("VISION_PROVIDER=cursor but CURSOR_KEY is missing in .env.")
        return _analyze_cursor(image_b64, media_type, catalog_names, loc)
    if provider == "anthropic":
        if not anthropic:
            raise VisionUnavailable("VISION_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing in .env.")
        return _analyze_anthropic(image_b64, media_type, catalog_names, loc)

    # auto: prefer Cursor key when present
    if cursor:
        return _analyze_cursor(image_b64, media_type, catalog_names, loc)
    if anthropic:
        return _analyze_anthropic(image_b64, media_type, catalog_names, loc)
    raise VisionUnavailable(
        "Photo analysis needs CURSOR_KEY or ANTHROPIC_API_KEY in the project .env. "
        "You can still add foods manually."
    )


def match_food(name: str, foods: list[dict]) -> dict | None:
    n = name.strip().lower()
    by_name = {f["name"].lower(): f for f in foods}
    if n in by_name:
        return by_name[n]
    close = difflib.get_close_matches(n, list(by_name), n=1, cutoff=0.6)
    if close:
        return by_name[close[0]]
    words = set(re.findall(r"[a-z]+", n))
    best, best_score = None, 0.0
    for f in foods:
        fw = set(re.findall(r"[a-z]+", f["name"].lower()))
        if not fw or not words:
            continue
        score = len(words & fw) / len(words | fw)
        if score > best_score:
            best, best_score = f, score
    return best if best_score >= 0.5 else None
