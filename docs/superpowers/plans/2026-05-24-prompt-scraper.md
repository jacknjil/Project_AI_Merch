# Prompt Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Python CLI that scrapes image-gen platforms for prompts, stores them in SQLite, and exports sheet-ready CSV via GPT-4.1-mini to feed the n8n batch generation pipeline.

**Architecture:** Modular package at `tools/prompt_scraper/` — one file per scraper source, shared `db.py` layer, `export.py` for GPT transform, `cli.py` (Click) as the unified entrypoint. SQLite DB is local-only (gitignored). Tests live in `tools/prompt_scraper/tests/` and run from that directory.

**Tech Stack:** Python 3.11+, click, requests, playwright (chromium), openai, pytest, pytest-mock

---

## File Map

| File | Responsibility |
|------|---------------|
| `tools/prompt_scraper/__main__.py` | `python -m prompt_scraper` entrypoint |
| `tools/prompt_scraper/cli.py` | Click group + all subcommands |
| `tools/prompt_scraper/db.py` | SQLite schema + all query functions |
| `tools/prompt_scraper/config.py` | Env vars, niche/style vocabulary maps |
| `tools/prompt_scraper/export.py` | DB query → GPT transform → CSV write |
| `tools/prompt_scraper/scrapers/__init__.py` | `scrape_all()` dispatcher |
| `tools/prompt_scraper/scrapers/civitai.py` | Civitai REST API scraper |
| `tools/prompt_scraper/scrapers/lexica.py` | Lexica.art search API scraper |
| `tools/prompt_scraper/scrapers/prompthero.py` | PromptHero Playwright scraper |
| `tools/prompt_scraper/scrapers/openart.py` | OpenArt Playwright scraper |
| `tools/prompt_scraper/scrapers/trends.py` | Redbubble/Etsy niche-signal scraper |
| `tools/prompt_scraper/tests/conftest.py` | Shared pytest fixtures (temp DB) |
| `tools/prompt_scraper/tests/test_db.py` | DB layer tests |
| `tools/prompt_scraper/tests/test_config.py` | Vocabulary mapping tests |
| `tools/prompt_scraper/tests/test_civitai.py` | Civitai parse logic tests |
| `tools/prompt_scraper/tests/test_lexica.py` | Lexica parse logic tests |
| `tools/prompt_scraper/tests/test_export.py` | Export pipeline tests (mocked GPT) |
| `tools/prompt_scraper/requirements.txt` | Python dependencies |

---

## Task 1: Project Scaffold

**Files:**
- Create: `tools/prompt_scraper/` (all dirs)
- Create: `tools/prompt_scraper/requirements.txt`
- Create: `tools/prompt_scraper/scrapers/__init__.py` (empty stub)
- Create: `tools/prompt_scraper/tests/__init__.py` (empty)
- Modify: `.gitignore` (root)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p tools/prompt_scraper/scrapers
mkdir -p tools/prompt_scraper/tests
touch tools/prompt_scraper/tests/__init__.py
```

Create `tools/prompt_scraper/scrapers/__init__.py` with a stub (replaced in Task 11):

```python
import sqlite3

def scrape_all(conn: sqlite3.Connection) -> dict[str, int]:
    return {}
```

- [ ] **Step 2: Write requirements.txt**

Create `tools/prompt_scraper/requirements.txt`:

```
click>=8.1
requests>=2.31
playwright>=1.44
openai>=1.30
pytest>=8.0
pytest-mock>=3.12
```

- [ ] **Step 3: Add prompts.db to .gitignore**

Append to root `.gitignore`:

```
tools/prompt_scraper/prompts.db
```

- [ ] **Step 4: Install dependencies**

```bash
cd tools/prompt_scraper
pip install -r requirements.txt
playwright install chromium
```

Expected: no errors, `playwright` and `click` available.

- [ ] **Step 5: Commit scaffold**

```bash
git add tools/prompt_scraper/ .gitignore
git commit -m "feat: scaffold prompt_scraper package structure"
```

---

## Task 2: Database Layer

**Files:**
- Create: `tools/prompt_scraper/db.py`
- Create: `tools/prompt_scraper/tests/conftest.py`
- Create: `tools/prompt_scraper/tests/test_db.py`

- [ ] **Step 1: Write conftest.py**

Create `tools/prompt_scraper/tests/conftest.py`:

```python
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import tempfile
from db import get_conn, init_db

@pytest.fixture
def conn():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    c = get_conn(db_path)
    init_db(c)
    yield c
    c.close()
    os.unlink(db_path)
```

- [ ] **Step 2: Write failing tests**

Create `tools/prompt_scraper/tests/test_db.py`:

```python
from db import (
    insert_prompt, dedup_exists, get_unused_prompts,
    mark_used, log_scrape, create_export_batch, get_status
)

def _insert(conn, source="civitai", source_id="abc", raw_prompt="a cat", popularity=10):
    return insert_prompt(
        conn, source=source, source_id=source_id, source_url="https://example.com",
        raw_prompt=raw_prompt, tags='["illustration"]', niche="cats",
        style_tag="vintage-badge", color_hints="blue, white",
        product_category="shirt", popularity=popularity
    )

def test_init_creates_all_tables(conn):
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()}
    assert tables == {"prompts", "scrape_log", "niche_trends", "export_batches"}

def test_insert_and_retrieve(conn):
    pid = _insert(conn)
    assert pid > 0
    row = conn.execute("SELECT * FROM prompts WHERE id = ?", (pid,)).fetchone()
    assert row["raw_prompt"] == "a cat"
    assert row["niche"] == "cats"

def test_dedup_exists_true(conn):
    _insert(conn, source="civitai", source_id="abc")
    assert dedup_exists(conn, "civitai", "abc") is True

def test_dedup_exists_false(conn):
    assert dedup_exists(conn, "civitai", "nonexistent") is False

def test_dedup_different_source(conn):
    _insert(conn, source="civitai", source_id="abc")
    assert dedup_exists(conn, "lexica", "abc") is False

def test_get_unused_prompts_returns_unused(conn):
    _insert(conn, source_id="u1")
    rows = get_unused_prompts(conn, limit=10)
    assert len(rows) == 1
    assert rows[0]["source_id"] == "u1"

def test_get_unused_prompts_filters_niche(conn):
    insert_prompt(conn, "civitai", "x1", "", "dogs prompt", "[]",
                  "dogs", "vintage-badge", None, "shirt", 5)
    insert_prompt(conn, "civitai", "x2", "", "cats prompt", "[]",
                  "cats", "minimal-line", None, "shirt", 5)
    rows = get_unused_prompts(conn, niche="dogs", limit=10)
    assert len(rows) == 1
    assert rows[0]["niche"] == "dogs"

def test_get_unused_prompts_filters_min_popularity(conn):
    _insert(conn, source_id="low", popularity=5)
    _insert(conn, source_id="high", popularity=100)
    rows = get_unused_prompts(conn, min_popularity=50, limit=10)
    assert len(rows) == 1
    assert rows[0]["source_id"] == "high"

def test_get_unused_prompts_orders_by_popularity(conn):
    _insert(conn, source_id="p10", popularity=10)
    _insert(conn, source_id="p90", popularity=90)
    rows = get_unused_prompts(conn, limit=10)
    assert rows[0]["source_id"] == "p90"

def test_mark_used(conn):
    pid = _insert(conn)
    batch_id = create_export_batch(conn, row_count=1, csv_path="out.csv")
    mark_used(conn, [pid], batch_id)
    row = conn.execute("SELECT used_at, batch_id FROM prompts WHERE id = ?", (pid,)).fetchone()
    assert row["used_at"] is not None
    assert row["batch_id"] == batch_id

def test_marked_used_excluded_from_get_unused(conn):
    pid = _insert(conn)
    batch_id = create_export_batch(conn, row_count=1, csv_path="out.csv")
    mark_used(conn, [pid], batch_id)
    rows = get_unused_prompts(conn, limit=10)
    assert len(rows) == 0

def test_log_scrape(conn):
    log_scrape(conn, source="civitai", pages_fetched=2, items_found=50, items_added=45)
    row = conn.execute("SELECT * FROM scrape_log").fetchone()
    assert row["source"] == "civitai"
    assert row["items_added"] == 45

def test_create_export_batch(conn):
    bid = create_export_batch(conn, row_count=20, csv_path="batch1.csv", notes="test")
    assert bid > 0
    row = conn.execute("SELECT * FROM export_batches WHERE id = ?", (bid,)).fetchone()
    assert row["row_count"] == 20
    assert row["csv_path"] == "batch1.csv"

def test_get_status_counts(conn):
    _insert(conn, source="civitai", source_id="a1")
    _insert(conn, source="lexica", source_id="b1")
    s = get_status(conn)
    assert s["total"] == 2
    assert s["unused"] == 2
    assert s["exported"] == 0
    assert s["by_source"]["civitai"]["count"] == 1
    assert s["by_source"]["lexica"]["count"] == 1
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd tools/prompt_scraper
pytest tests/test_db.py -v 2>&1 | head -20
```

Expected: `ImportError: No module named 'db'`

- [ ] **Step 4: Implement db.py**

Create `tools/prompt_scraper/db.py`:

```python
import sqlite3
from datetime import datetime
from typing import Optional

DEFAULT_DB = "prompts.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS prompts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source           TEXT NOT NULL,
    source_id        TEXT,
    source_url       TEXT,
    raw_prompt       TEXT NOT NULL,
    tags             TEXT,
    niche            TEXT,
    style_tag        TEXT,
    color_hints      TEXT,
    product_category TEXT DEFAULT 'shirt',
    popularity       INTEGER DEFAULT 0,
    scraped_at       TEXT NOT NULL,
    used_at          TEXT,
    batch_id         INTEGER REFERENCES export_batches(id)
);
CREATE TABLE IF NOT EXISTS scrape_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source        TEXT NOT NULL,
    run_at        TEXT NOT NULL,
    pages_fetched INTEGER,
    items_found   INTEGER,
    items_added   INTEGER
);
CREATE TABLE IF NOT EXISTS niche_trends (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    niche       TEXT NOT NULL,
    trend_score REAL,
    source      TEXT,
    scraped_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS export_batches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    row_count  INTEGER,
    csv_path   TEXT,
    notes      TEXT
);
"""

def get_conn(db_path: str = DEFAULT_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)
    conn.commit()

def dedup_exists(conn: sqlite3.Connection, source: str, source_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM prompts WHERE source = ? AND source_id = ?",
        (source, source_id)
    ).fetchone()
    return row is not None

def insert_prompt(conn: sqlite3.Connection, source: str, source_id: str,
                  source_url: str, raw_prompt: str, tags: str,
                  niche: Optional[str], style_tag: Optional[str],
                  color_hints: Optional[str], product_category: str,
                  popularity: int) -> int:
    cur = conn.execute(
        """INSERT INTO prompts
           (source, source_id, source_url, raw_prompt, tags, niche, style_tag,
            color_hints, product_category, popularity, scraped_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (source, source_id, source_url, raw_prompt, tags, niche, style_tag,
         color_hints, product_category, popularity,
         datetime.utcnow().isoformat())
    )
    conn.commit()
    return cur.lastrowid

def get_unused_prompts(conn: sqlite3.Connection, niche: Optional[str] = None,
                       style_tag: Optional[str] = None, min_popularity: int = 0,
                       category: Optional[str] = None, limit: int = 20) -> list[dict]:
    q = "SELECT * FROM prompts WHERE used_at IS NULL AND popularity >= ?"
    params: list = [min_popularity]
    if niche:
        q += " AND niche = ?"
        params.append(niche)
    if style_tag:
        q += " AND style_tag = ?"
        params.append(style_tag)
    if category:
        q += " AND product_category = ?"
        params.append(category)
    q += " ORDER BY popularity DESC LIMIT ?"
    params.append(limit)
    return [dict(r) for r in conn.execute(q, params).fetchall()]

def mark_used(conn: sqlite3.Connection, prompt_ids: list[int], batch_id: int) -> None:
    now = datetime.utcnow().isoformat()
    conn.executemany(
        "UPDATE prompts SET used_at = ?, batch_id = ? WHERE id = ?",
        [(now, batch_id, pid) for pid in prompt_ids]
    )
    conn.commit()

def log_scrape(conn: sqlite3.Connection, source: str, pages_fetched: int,
               items_found: int, items_added: int) -> None:
    conn.execute(
        """INSERT INTO scrape_log
           (source, run_at, pages_fetched, items_found, items_added)
           VALUES (?, ?, ?, ?, ?)""",
        (source, datetime.utcnow().isoformat(), pages_fetched, items_found, items_added)
    )
    conn.commit()

def create_export_batch(conn: sqlite3.Connection, row_count: int,
                        csv_path: str, notes: str = "") -> int:
    cur = conn.execute(
        "INSERT INTO export_batches (created_at, row_count, csv_path, notes) VALUES (?, ?, ?, ?)",
        (datetime.utcnow().isoformat(), row_count, csv_path, notes)
    )
    conn.commit()
    return cur.lastrowid

def get_status(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) FROM prompts").fetchone()[0]
    unused = conn.execute("SELECT COUNT(*) FROM prompts WHERE used_at IS NULL").fetchone()[0]
    exported = conn.execute("SELECT COUNT(*) FROM prompts WHERE used_at IS NOT NULL").fetchone()[0]
    batches = conn.execute("SELECT COUNT(*) FROM export_batches").fetchone()[0]

    by_source = {}
    for r in conn.execute(
        "SELECT source, COUNT(*) c, MAX(scraped_at) last FROM prompts GROUP BY source"
    ).fetchall():
        by_source[r["source"]] = {
            "count": r["c"],
            "last_scraped": r["last"][:10] if r["last"] else None
        }

    top_niches: dict[str, int] = {}
    for r in conn.execute(
        """SELECT niche, COUNT(*) c FROM prompts
           WHERE used_at IS NULL AND niche IS NOT NULL
           GROUP BY niche ORDER BY c DESC LIMIT 5"""
    ).fetchall():
        top_niches[r["niche"]] = r["c"]

    trends = [dict(r) for r in conn.execute(
        "SELECT niche, trend_score, source, scraped_at FROM niche_trends ORDER BY scraped_at DESC LIMIT 5"
    ).fetchall()]

    return {
        "total": total, "unused": unused, "exported": exported,
        "batches": batches, "by_source": by_source,
        "top_niches": top_niches, "trends": trends,
    }
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd tools/prompt_scraper
pytest tests/test_db.py -v
```

Expected: all 14 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/prompt_scraper/db.py tools/prompt_scraper/tests/
git commit -m "feat: add db layer with schema + query functions"
```

---

## Task 3: Config + Vocabulary Mappings

**Files:**
- Create: `tools/prompt_scraper/config.py`
- Create: `tools/prompt_scraper/tests/test_config.py`

- [ ] **Step 1: Write failing tests**

Create `tools/prompt_scraper/tests/test_config.py`:

```python
from config import map_niche, map_style_tag

def test_map_niche_nurse():
    assert map_niche(["nurse", "healthcare"]) == "nurses"

def test_map_niche_dog():
    assert map_niche(["dog", "puppy"]) == "dogs"

def test_map_niche_gaming():
    assert map_niche(["gamer", "pixel art"]) == "gaming"

def test_map_niche_astrology():
    assert map_niche(["zodiac", "celestial"]) == "astrology"

def test_map_niche_hiking():
    assert map_niche(["hiking", "mountain trail"]) == "hiking"

def test_map_niche_unknown_returns_none():
    assert map_niche(["random", "stuff"]) is None

def test_map_niche_empty_returns_none():
    assert map_niche([]) is None

def test_map_style_tag_vintage():
    assert map_style_tag(["vintage badge", "retro"]) == "vintage-badge"

def test_map_style_tag_pixel():
    assert map_style_tag(["pixel art", "8-bit"]) == "retro-pixel"

def test_map_style_tag_celestial():
    assert map_style_tag(["celestial", "sacred geometry"]) == "celestial-mystical"

def test_map_style_tag_minimal():
    assert map_style_tag(["minimal", "line art"]) == "minimal-line"

def test_map_style_tag_unknown_returns_none():
    assert map_style_tag(["blah"]) is None
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd tools/prompt_scraper
pytest tests/test_config.py -v 2>&1 | head -10
```

Expected: `ImportError: No module named 'config'`

- [ ] **Step 3: Implement config.py**

Create `tools/prompt_scraper/config.py`:

```python
import os
from typing import Optional

OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
CIVITAI_API_BASE: str = "https://civitai.com/api/v1"
LEXICA_API_BASE: str = "https://lexica.art/api/v1"
REQUEST_TIMEOUT: int = 30
REQUEST_DELAY: float = 1.0  # seconds between paginated requests

# Keys are lowercase substrings to match against source tags.
# First match wins — order from most specific to least.
NICHE_TAG_MAP: dict[str, str] = {
    "nurse": "nurses",
    "nursing": "nurses",
    "medical": "nurses",
    "healthcare": "nurses",
    "teacher": "teachers",
    "classroom": "teachers",
    "education": "teachers",
    "dog": "dogs",
    "puppy": "dogs",
    "canine": "dogs",
    "cat": "cats",
    "kitten": "cats",
    "feline": "cats",
    "pet": "pets",
    "astrology": "astrology",
    "zodiac": "astrology",
    "celestial": "astrology",
    "horoscope": "astrology",
    "gaming": "gaming",
    "gamer": "gaming",
    "pixel": "gaming",
    "video game": "gaming",
    "hiking": "hiking",
    "mountain": "hiking",
    "trail": "hiking",
    "outdoor": "hiking",
    "coffee": "coffee",
    "espresso": "coffee",
    "cafe": "coffee",
    "fitness": "fitness",
    "gym": "fitness",
    "workout": "fitness",
}

STYLE_TAG_MAP: dict[str, str] = {
    "vintage badge": "vintage-badge",
    "retro badge": "vintage-badge",
    "badge": "vintage-badge",
    "vintage": "vintage-badge",
    "retro surf": "retro-surf",
    "surf": "retro-surf",
    "wave": "retro-surf",
    "woodcut": "woodcut-emblem",
    "linocut": "woodcut-emblem",
    "block print": "woodcut-emblem",
    "engraving": "vintage-engraving",
    "etching": "vintage-engraving",
    "pixel art": "retro-pixel",
    "8-bit": "retro-pixel",
    "sticker": "sticker",
    "kawaii": "kawaii",
    "chibi": "kawaii",
    "celestial": "celestial-mystical",
    "mystical": "celestial-mystical",
    "sacred geometry": "celestial-mystical",
    "art nouveau": "art-nouveau",
    "cyberpunk": "cyberpunk-neon",
    "neon": "cyberpunk-neon",
    "watercolor": "watercolor",
    "minimal": "minimal-line",
    "line art": "minimal-line",
    "flat": "flat-vector",
    "vector": "flat-vector",
    "typography": "typography-humor",
    "lettering": "typography-humor",
}

def map_niche(tags: list[str]) -> Optional[str]:
    for tag in tags:
        tag_lower = tag.lower()
        for key, niche in NICHE_TAG_MAP.items():
            if key in tag_lower:
                return niche
    return None

def map_style_tag(tags: list[str]) -> Optional[str]:
    for tag in tags:
        tag_lower = tag.lower()
        for key, style in STYLE_TAG_MAP.items():
            if key in tag_lower:
                return style
    return None
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd tools/prompt_scraper
pytest tests/test_config.py -v
```

Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/prompt_scraper/config.py tools/prompt_scraper/tests/test_config.py
git commit -m "feat: add config with niche/style vocabulary mappings"
```

---

## Task 4: Civitai Scraper

**Files:**
- Create: `tools/prompt_scraper/scrapers/civitai.py`
- Create: `tools/prompt_scraper/tests/test_civitai.py`

- [ ] **Step 1: Write failing tests**

Create `tools/prompt_scraper/tests/test_civitai.py`:

```python
from scrapers.civitai import parse_items

SAMPLE_ITEMS = [
    {
        "id": 111,
        "url": "https://image.civitai.com/abc.jpg",
        "meta": {
            "prompt": "a beautiful vintage badge illustration of a mountain",
            "negativePrompt": "blurry, nsfw",
        },
        "tags": [{"name": "illustration"}, {"name": "badge"}, {"name": "mountain"}],
        "stats": {"likeCount": 45, "heartCount": 20, "downloadCount": 300},
    },
    {
        "id": 222,
        "url": "https://image.civitai.com/def.jpg",
        "meta": None,  # no prompt — should be skipped
        "tags": [],
        "stats": {"likeCount": 5, "heartCount": 2, "downloadCount": 10},
    },
    {
        "id": 333,
        "url": "https://image.civitai.com/ghi.jpg",
        "meta": {"prompt": "cute dog pixel art t-shirt design"},
        "tags": [{"name": "pixel art"}, {"name": "dog"}],
        "stats": {"likeCount": 100, "heartCount": 80, "downloadCount": 500},
    },
]

def test_parse_items_skips_no_meta():
    results = parse_items(SAMPLE_ITEMS)
    assert len(results) == 2

def test_parse_items_extracts_prompt():
    results = parse_items(SAMPLE_ITEMS)
    assert results[0]["raw_prompt"] == "a beautiful vintage badge illustration of a mountain"

def test_parse_items_maps_source_id():
    results = parse_items(SAMPLE_ITEMS)
    assert results[0]["source_id"] == "111"

def test_parse_items_maps_source_url():
    results = parse_items(SAMPLE_ITEMS)
    assert results[0]["source_url"] == "https://image.civitai.com/abc.jpg"

def test_parse_items_sums_popularity():
    results = parse_items(SAMPLE_ITEMS)
    # item 111: likeCount(45) + heartCount(20) = 65
    assert results[0]["popularity"] == 65

def test_parse_items_maps_niche_from_tags():
    results = parse_items(SAMPLE_ITEMS)
    # item 333 has "dog" tag
    dog_item = next(r for r in results if r["source_id"] == "333")
    assert dog_item["niche"] == "dogs"

def test_parse_items_maps_style_from_tags():
    results = parse_items(SAMPLE_ITEMS)
    badge_item = next(r for r in results if r["source_id"] == "111")
    assert badge_item["style_tag"] == "vintage-badge"

def test_parse_items_tags_as_json_list():
    import json
    results = parse_items(SAMPLE_ITEMS)
    tags = json.loads(results[0]["tags"])
    assert "illustration" in tags
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd tools/prompt_scraper
pytest tests/test_civitai.py -v 2>&1 | head -10
```

Expected: `ImportError`

- [ ] **Step 3: Implement scrapers/civitai.py**

Create `tools/prompt_scraper/scrapers/civitai.py`:

```python
import json
import time
import sqlite3
import requests
from typing import Optional
import config
import db

SOURCE = "civitai"

def parse_items(items: list[dict]) -> list[dict]:
    results = []
    for item in items:
        meta = item.get("meta") or {}
        raw_prompt = meta.get("prompt", "").strip() if isinstance(meta, dict) else ""
        if not raw_prompt:
            continue
        tag_names = [t["name"] for t in item.get("tags", []) if "name" in t]
        stats = item.get("stats") or {}
        popularity = stats.get("likeCount", 0) + stats.get("heartCount", 0)
        results.append({
            "source_id": str(item["id"]),
            "source_url": item.get("url", ""),
            "raw_prompt": raw_prompt,
            "tags": json.dumps(tag_names),
            "niche": config.map_niche(tag_names),
            "style_tag": config.map_style_tag(tag_names),
            "color_hints": None,
            "product_category": "shirt",
            "popularity": popularity,
        })
    return results

def scrape(conn: sqlite3.Connection, limit: int = 200,
           tags: str = "apparel,t-shirt,illustration") -> int:
    url = f"{config.CIVITAI_API_BASE}/images"
    params = {
        "limit": min(limit, 200),
        "nsfw": "false",
        "sort": "Most Reactions",
        "period": "Month",
    }
    added = 0
    pages_fetched = 0
    items_found = 0
    fetched = 0
    cursor = None

    while fetched < limit:
        if cursor:
            params["cursor"] = cursor
        try:
            resp = requests.get(url, params=params,
                                timeout=config.REQUEST_TIMEOUT)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"civitai fetch error: {e}")
            break

        data = resp.json()
        items = data.get("items", [])
        pages_fetched += 1
        items_found += len(items)
        if not items:
            break

        parsed = parse_items(items)
        for p in parsed:
            if not db.dedup_exists(conn, SOURCE, p["source_id"]):
                db.insert_prompt(
                    conn, source=SOURCE, **p
                )
                added += 1
        fetched += len(items)

        metadata = data.get("metadata", {})
        cursor = metadata.get("nextCursor")
        if not cursor:
            break
        time.sleep(config.REQUEST_DELAY)

    db.log_scrape(conn, SOURCE, pages_fetched, items_found, added)
    return added
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd tools/prompt_scraper
pytest tests/test_civitai.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/prompt_scraper/scrapers/civitai.py tools/prompt_scraper/tests/test_civitai.py
git commit -m "feat: add civitai scraper with parse_items"
```

---

## Task 5: Lexica Scraper

**Files:**
- Create: `tools/prompt_scraper/scrapers/lexica.py`
- Create: `tools/prompt_scraper/tests/test_lexica.py`

- [ ] **Step 1: Write failing tests**

Create `tools/prompt_scraper/tests/test_lexica.py`:

```python
from scrapers.lexica import parse_images

SAMPLE_IMAGES = [
    {
        "id": "aaa",
        "src": "https://image.lexica.art/aaa.jpg",
        "prompt": "vintage badge illustration hiking mountain national park",
        "nsfw": False,
    },
    {
        "id": "bbb",
        "src": "https://image.lexica.art/bbb.jpg",
        "prompt": "",  # empty prompt — skip
        "nsfw": False,
    },
    {
        "id": "ccc",
        "src": "https://image.lexica.art/ccc.jpg",
        "prompt": "cute dog pixel art t-shirt sticker",
        "nsfw": True,  # nsfw — skip
    },
    {
        "id": "ddd",
        "src": "https://image.lexica.art/ddd.jpg",
        "prompt": "watercolor cat celestial mystical illustration",
        "nsfw": False,
    },
]

def test_parse_images_skips_empty_prompt():
    results = parse_images(SAMPLE_IMAGES)
    ids = [r["source_id"] for r in results]
    assert "bbb" not in ids

def test_parse_images_skips_nsfw():
    results = parse_images(SAMPLE_IMAGES)
    ids = [r["source_id"] for r in results]
    assert "ccc" not in ids

def test_parse_images_keeps_valid():
    results = parse_images(SAMPLE_IMAGES)
    assert len(results) == 2

def test_parse_images_extracts_prompt():
    results = parse_images(SAMPLE_IMAGES)
    assert results[0]["raw_prompt"] == "vintage badge illustration hiking mountain national park"

def test_parse_images_maps_niche():
    results = parse_images(SAMPLE_IMAGES)
    hiking = next(r for r in results if r["source_id"] == "aaa")
    assert hiking["niche"] == "hiking"

def test_parse_images_maps_style_tag():
    results = parse_images(SAMPLE_IMAGES)
    badge = next(r for r in results if r["source_id"] == "aaa")
    assert badge["style_tag"] == "vintage-badge"

def test_parse_images_no_popularity():
    results = parse_images(SAMPLE_IMAGES)
    assert results[0]["popularity"] == 0
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd tools/prompt_scraper
pytest tests/test_lexica.py -v 2>&1 | head -10
```

Expected: `ImportError`

- [ ] **Step 3: Implement scrapers/lexica.py**

Create `tools/prompt_scraper/scrapers/lexica.py`:

```python
import json
import sqlite3
import requests
import config
import db

SOURCE = "lexica"

def parse_images(images: list[dict]) -> list[dict]:
    results = []
    for img in images:
        if img.get("nsfw"):
            continue
        raw_prompt = (img.get("prompt") or "").strip()
        if not raw_prompt:
            continue
        # Derive tags from prompt words for niche/style mapping
        words = [w.strip(",.") for w in raw_prompt.lower().split()]
        results.append({
            "source_id": str(img["id"]),
            "source_url": img.get("src", ""),
            "raw_prompt": raw_prompt,
            "tags": json.dumps(words[:10]),
            "niche": config.map_niche(words),
            "style_tag": config.map_style_tag(words),
            "color_hints": None,
            "product_category": "shirt",
            "popularity": 0,
        })
    return results

def scrape(conn: sqlite3.Connection, query: str = "vintage badge merch illustration",
           limit: int = 100) -> int:
    url = f"{config.LEXICA_API_BASE}/search"
    added = 0
    items_found = 0
    try:
        resp = requests.get(url, params={"q": query, "n": limit},
                            timeout=config.REQUEST_TIMEOUT)
        resp.raise_for_status()
        images = resp.json().get("images", [])
        items_found = len(images)
        parsed = parse_images(images)
        for p in parsed:
            if not db.dedup_exists(conn, SOURCE, p["source_id"]):
                db.insert_prompt(conn, source=SOURCE, **p)
                added += 1
    except requests.RequestException as e:
        print(f"lexica fetch error: {e}")

    db.log_scrape(conn, SOURCE, 1, items_found, added)
    return added
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd tools/prompt_scraper
pytest tests/test_lexica.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/prompt_scraper/scrapers/lexica.py tools/prompt_scraper/tests/test_lexica.py
git commit -m "feat: add lexica scraper with parse_images"
```

---

## Task 6: Export Pipeline

**Files:**
- Create: `tools/prompt_scraper/export.py`
- Create: `tools/prompt_scraper/tests/test_export.py`

- [ ] **Step 1: Write failing tests**

Create `tools/prompt_scraper/tests/test_export.py`:

```python
import csv
import os
import tempfile
import pytest
from unittest.mock import MagicMock, patch
from export import transform_prompt, assemble_row, export_batch
import db

MOCK_TRANSFORMED = {
    "concept": "Centered graphic design, vintage badge: mountain silhouette with pine trees",
    "colorPalette": "forest green, cream, rust orange",
    "title": "National Park Vintage Badge Tee",
}

def make_mock_openai(response_json: dict):
    mock_client = MagicMock()
    mock_msg = MagicMock()
    mock_msg.content = __import__("json").dumps(response_json)
    mock_client.chat.completions.create.return_value.choices = [
        MagicMock(message=mock_msg)
    ]
    return mock_client

def test_transform_prompt_calls_gpt():
    client = make_mock_openai(MOCK_TRANSFORMED)
    result = transform_prompt(
        client,
        raw_prompt="mountain badge illustration",
        niche="hiking",
        style_tag="vintage-badge",
        color_hints="green, brown",
        product_category="shirt",
    )
    assert result["concept"].startswith("Centered graphic design")
    assert "forest green" in result["colorPalette"]
    assert client.chat.completions.create.called

def test_transform_prompt_uses_gpt_4_1_mini():
    client = make_mock_openai(MOCK_TRANSFORMED)
    transform_prompt(client, "prompt", "hiking", "vintage-badge", None, "shirt")
    call_kwargs = client.chat.completions.create.call_args
    assert call_kwargs.kwargs["model"] == "gpt-4.1-mini"

def test_assemble_row_has_20_columns():
    row = assemble_row(
        sheet_id=62,
        niche="hiking",
        style_tag="vintage-badge",
        product_category="shirt",
        priority="medium",
        source="civitai",
        transformed=MOCK_TRANSFORMED,
    )
    EXPECTED_KEYS = {
        "id", "rowId", "title", "niche", "concept", "styleTag", "colorPalette",
        "product_category", "size", "priority", "live-mode", "n8n_status",
        "n8n_error", "assetIds", "imageUrl", "firebaseProductId",
        "published", "lastRun", "retryCount", "notes"
    }
    assert set(row.keys()) == EXPECTED_KEYS

def test_assemble_row_fixed_fields():
    row = assemble_row(62, "hiking", "vintage-badge", "shirt", "medium", "civitai", MOCK_TRANSFORMED)
    assert row["id"] == 62
    assert row["rowId"] == 63
    assert row["size"] == "1024x1024"
    assert row["live-mode"] == "FALSE"
    assert row["n8n_status"] == ""
    assert row["retryCount"] == "0"

def test_export_batch_writes_csv(conn):
    db.insert_prompt(
        conn, source="civitai", source_id="x1",
        source_url="", raw_prompt="mountain badge",
        tags='["badge","mountain"]', niche="hiking",
        style_tag="vintage-badge", color_hints="green",
        product_category="shirt", popularity=50
    )
    with patch("export.OpenAI") as MockOpenAI:
        MockOpenAI.return_value = make_mock_openai(MOCK_TRANSFORMED)
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as f:
            out_path = f.name
        try:
            result_path = export_batch(conn, count=1, out=out_path, start_id=62)
            assert os.path.exists(result_path)
            with open(result_path) as f:
                rows = list(csv.DictReader(f))
            assert len(rows) == 1
            assert rows[0]["id"] == "62"
            assert rows[0]["live-mode"] == "FALSE"
        finally:
            os.unlink(out_path)

def test_export_batch_marks_used(conn):
    db.insert_prompt(
        conn, source="civitai", source_id="y1",
        source_url="", raw_prompt="dog pixel art",
        tags='["dog","pixel"]', niche="dogs",
        style_tag="retro-pixel", color_hints=None,
        product_category="shirt", popularity=30
    )
    with patch("export.OpenAI") as MockOpenAI:
        MockOpenAI.return_value = make_mock_openai(MOCK_TRANSFORMED)
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            out_path = f.name
        try:
            export_batch(conn, count=1, out=out_path, start_id=62)
            unused = db.get_unused_prompts(conn, limit=10)
            assert len(unused) == 0
        finally:
            os.unlink(out_path)

def test_export_batch_empty_db_raises(conn):
    with patch("export.OpenAI"):
        with pytest.raises(ValueError, match="No matching prompts"):
            export_batch(conn, count=10, out="dummy.csv", start_id=62)
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd tools/prompt_scraper
pytest tests/test_export.py -v 2>&1 | head -10
```

Expected: `ImportError`

- [ ] **Step 3: Implement export.py**

Create `tools/prompt_scraper/export.py`:

```python
import csv
import json
import sqlite3
from datetime import datetime
from typing import Optional

import db
import config
from openai import OpenAI

SHEET_COLUMNS = [
    "id", "rowId", "title", "niche", "concept", "styleTag", "colorPalette",
    "product_category", "size", "priority", "live-mode", "n8n_status",
    "n8n_error", "assetIds", "imageUrl", "firebaseProductId",
    "published", "lastRun", "retryCount", "notes",
]

def transform_prompt(client: OpenAI, raw_prompt: str, niche: str,
                     style_tag: str, color_hints: Optional[str],
                     product_category: str) -> dict:
    resp = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": (
                "You are a DALL-E prompt engineer for a print-on-demand merchandise store. "
                "Convert image generation prompts into DALL-E-ready product design descriptions. "
                "Respond with valid JSON only — no markdown, no explanation."
            )},
            {"role": "user", "content": (
                f"Convert this image-generation prompt into a DALL-E product design concept "
                f"for a {product_category}.\n\n"
                f"Raw prompt: {raw_prompt}\n"
                f"Niche: {niche or 'general'}\n"
                f"Style: {style_tag or 'illustration'}\n"
                f"Color hints: {color_hints or 'none provided'}\n\n"
                'Return JSON: {"concept": "Centered graphic design, [description]...", '
                '"colorPalette": "[color1], [color2], [color3]", "title": "[Product Title]"}'
            )},
        ],
        temperature=0.7,
    )
    return json.loads(resp.choices[0].message.content)

def assemble_row(sheet_id: int, niche: str, style_tag: str,
                 product_category: str, priority: str,
                 source: str, transformed: dict) -> dict:
    return {
        "id": sheet_id,
        "rowId": sheet_id + 1,
        "title": transformed.get("title", ""),
        "niche": niche or "",
        "concept": transformed.get("concept", ""),
        "styleTag": style_tag or "",
        "colorPalette": transformed.get("colorPalette", ""),
        "product_category": product_category,
        "size": "1024x1024",
        "priority": priority,
        "live-mode": "FALSE",
        "n8n_status": "",
        "n8n_error": "",
        "assetIds": "",
        "imageUrl": "",
        "firebaseProductId": "",
        "published": "",
        "lastRun": "",
        "retryCount": "0",
        "notes": f"scraped:{source}",
    }

def export_batch(conn: sqlite3.Connection, count: int = 20,
                 niche: Optional[str] = None, style_tag: Optional[str] = None,
                 category: Optional[str] = None, min_popularity: int = 0,
                 priority: str = "medium", start_id: int = 62,
                 out: Optional[str] = None,
                 allow_reuse: bool = False) -> str:
    if allow_reuse:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM prompts ORDER BY popularity DESC LIMIT ?", (count,)
        ).fetchall()]
    else:
        rows = db.get_unused_prompts(
            conn, niche=niche, style_tag=style_tag,
            min_popularity=min_popularity, category=category, limit=count
        )

    if not rows:
        raise ValueError("No matching prompts found in DB")

    client = OpenAI(api_key=config.OPENAI_API_KEY)
    batch_id = db.create_export_batch(conn, row_count=0, csv_path="")

    if out is None:
        out = f"batch_{datetime.utcnow().strftime('%Y-%m-%d')}.csv"

    sheet_rows = []
    exported_ids = []
    current_id = start_id

    for row in rows:
        try:
            transformed = transform_prompt(
                client,
                raw_prompt=row["raw_prompt"],
                niche=row.get("niche") or "general",
                style_tag=row.get("style_tag") or "illustration",
                color_hints=row.get("color_hints"),
                product_category=row.get("product_category") or "shirt",
            )
        except Exception as e:
            print(f"Warning: GPT transform failed for prompt id {row['id']}: {e}")
            continue

        sheet_rows.append(assemble_row(
            sheet_id=current_id,
            niche=row.get("niche") or "",
            style_tag=row.get("style_tag") or "",
            product_category=row.get("product_category") or "shirt",
            priority=priority,
            source=row["source"],
            transformed=transformed,
        ))
        exported_ids.append(row["id"])
        current_id += 1

    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SHEET_COLUMNS)
        writer.writeheader()
        writer.writerows(sheet_rows)

    if exported_ids:
        db.mark_used(conn, exported_ids, batch_id)
        conn.execute(
            "UPDATE export_batches SET row_count = ?, csv_path = ? WHERE id = ?",
            (len(exported_ids), out, batch_id)
        )
        conn.commit()

    print(f"{len(exported_ids)} rows exported → {out} (batch #{batch_id})")
    return out
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd tools/prompt_scraper
pytest tests/test_export.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/prompt_scraper/export.py tools/prompt_scraper/tests/test_export.py
git commit -m "feat: add export pipeline with GPT transform and CSV writer"
```

---

## Task 7: CLI + __main__.py

**Files:**
- Create: `tools/prompt_scraper/cli.py`
- Create: `tools/prompt_scraper/__main__.py`

- [ ] **Step 1: Implement cli.py**

Create `tools/prompt_scraper/cli.py`:

```python
import click
import db as _db
import export as _export
from scrapers import civitai, lexica, prompthero, openart, trends
from scrapers import scrape_all as _scrape_all

DB_PATH = "prompts.db"

@click.group()
@click.pass_context
def cli(ctx):
    ctx.ensure_object(dict)
    conn = _db.get_conn(DB_PATH)
    _db.init_db(conn)
    ctx.obj["conn"] = conn

# ── scrape group ──────────────────────────────────────────────────────────────

@cli.group()
def scrape():
    """Scrape prompts from image generation platforms."""
    pass

@scrape.command("civitai")
@click.option("--limit", default=200, show_default=True)
@click.option("--tags", default="apparel,t-shirt,illustration", show_default=True)
@click.pass_context
def scrape_civitai(ctx, limit, tags):
    added = civitai.scrape(ctx.obj["conn"], limit=limit, tags=tags)
    click.echo(f"civitai: {added} new prompts added")

@scrape.command("lexica")
@click.option("--query", default="vintage badge merch illustration", show_default=True)
@click.option("--limit", default=100, show_default=True)
@click.pass_context
def scrape_lexica(ctx, query, limit):
    added = lexica.scrape(ctx.obj["conn"], query=query, limit=limit)
    click.echo(f"lexica: {added} new prompts added")

@scrape.command("prompthero")
@click.option("--limit", default=100, show_default=True)
@click.pass_context
def scrape_prompthero(ctx, limit):
    added = prompthero.scrape(ctx.obj["conn"], limit=limit)
    click.echo(f"prompthero: {added} new prompts added")

@scrape.command("openart")
@click.option("--limit", default=100, show_default=True)
@click.pass_context
def scrape_openart(ctx, limit):
    added = openart.scrape(ctx.obj["conn"], limit=limit)
    click.echo(f"openart: {added} new prompts added")

@scrape.command("trends")
@click.pass_context
def scrape_trends(ctx):
    added = trends.scrape(ctx.obj["conn"])
    click.echo(f"trends: {added} niche signals added")

@scrape.command("all")
@click.pass_context
def scrape_all(ctx):
    results = _scrape_all(ctx.obj["conn"])
    for source, count in results.items():
        click.echo(f"{source}: {count} new items added")

# ── export ────────────────────────────────────────────────────────────────────

@cli.command("export")
@click.option("--count", default=20, show_default=True)
@click.option("--niche", default=None)
@click.option("--style", default=None)
@click.option("--category", default=None)
@click.option("--min-popularity", default=0, show_default=True)
@click.option("--priority", default="medium", show_default=True)
@click.option("--start-id", default=62, show_default=True,
              help="Starting sheet id (increment from last sheet row)")
@click.option("--out", default=None, help="Output CSV filename")
@click.option("--allow-reuse", is_flag=True, default=False)
@click.pass_context
def export_cmd(ctx, count, niche, style, category, min_popularity,
               priority, start_id, out, allow_reuse):
    try:
        csv_path = _export.export_batch(
            ctx.obj["conn"], count=count, niche=niche, style_tag=style,
            category=category, min_popularity=min_popularity, priority=priority,
            start_id=start_id, out=out, allow_reuse=allow_reuse
        )
        click.echo(f"Exported to {csv_path}")
    except ValueError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ── status ────────────────────────────────────────────────────────────────────

@cli.command("status")
@click.pass_context
def status_cmd(ctx):
    s = _db.get_status(ctx.obj["conn"])
    click.echo(f"\nprompts.db — {s['total']} total prompts")
    for src, info in s["by_source"].items():
        click.echo(f"  {src:<14} {info['count']}  (last scraped: {info['last_scraped']})")
    click.echo(
        f"\nunused: {s['unused']}  |  exported: {s['exported']}  |  batches: {s['batches']}"
    )
    if s["top_niches"]:
        niches_str = " | ".join(f"{n} {c}" for n, c in s["top_niches"].items())
        click.echo(f"\ntop niches (unused): {niches_str}")
    if s["trends"]:
        trends_str = " | ".join(f"{t['niche']} ↑" for t in s["trends"][:3])
        click.echo(f"niche trends: {trends_str}")
    click.echo()
```

- [ ] **Step 2: Implement __main__.py**

Create `tools/prompt_scraper/__main__.py`:

```python
from cli import cli

if __name__ == "__main__":
    cli()
```

- [ ] **Step 3: Smoke test the CLI**

```bash
cd tools/prompt_scraper
python -m prompt_scraper --help
```

Expected output contains: `scrape`, `export`, `status` in the command list.

```bash
python -m prompt_scraper status
```

Expected: `prompts.db — 0 total prompts` (empty DB, no crash).

- [ ] **Step 4: Commit**

```bash
git add tools/prompt_scraper/cli.py tools/prompt_scraper/__main__.py
git commit -m "feat: add CLI with scrape/export/status commands"
```

---

## Task 8: PromptHero Scraper

**Files:**
- Create: `tools/prompt_scraper/scrapers/prompthero.py`

**Note:** Playwright scrapers require selector verification before writing the parse step. Follow the selector discovery step carefully.

- [ ] **Step 1: Discover live selectors**

```bash
cd tools/prompt_scraper
python -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    page.goto('https://prompthero.com/prompts')
    page.wait_for_timeout(4000)
    # Open DevTools and inspect a prompt card.
    # Note the selector for: prompt text, like count, any tags.
    input('Press Enter when done inspecting...')
    browser.close()
"
```

Inspect the page and note the selectors. The typical structure as of 2026 is:
- Prompt card container: `article.post` or `div[data-testid="prompt-card"]`
- Prompt text: `p.prompt-text` or `[data-prompt]`
- Like count: `span.like-count` or `button[aria-label*="like"] span`

Update `CARD_SELECTOR`, `PROMPT_SELECTOR`, `LIKES_SELECTOR` in the next step with real values.

- [ ] **Step 2: Implement scrapers/prompthero.py**

Create `tools/prompt_scraper/scrapers/prompthero.py`:

```python
import json
import sqlite3
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import config
import db

SOURCE = "prompthero"

# Update these after selector discovery in Step 1
CARD_SELECTOR = "article.post"
PROMPT_SELECTOR = "p.prompt-text"
LIKES_SELECTOR = "span.like-count"
BASE_URL = "https://prompthero.com/prompts"

def parse_cards(cards) -> list[dict]:
    results = []
    for card in cards:
        try:
            prompt_el = card.query_selector(PROMPT_SELECTOR)
            raw_prompt = prompt_el.inner_text().strip() if prompt_el else ""
            if not raw_prompt:
                continue
            likes_el = card.query_selector(LIKES_SELECTOR)
            try:
                popularity = int(likes_el.inner_text().strip().replace(",", "")) if likes_el else 0
            except ValueError:
                popularity = 0
            src = card.get_attribute("data-url") or ""
            source_id = card.get_attribute("data-id") or raw_prompt[:40]
            words = [w.strip(",.") for w in raw_prompt.lower().split()]
            results.append({
                "source_id": source_id,
                "source_url": src,
                "raw_prompt": raw_prompt,
                "tags": json.dumps(words[:10]),
                "niche": config.map_niche(words),
                "style_tag": config.map_style_tag(words),
                "color_hints": None,
                "product_category": "shirt",
                "popularity": popularity,
            })
        except Exception:
            continue
    return results

def scrape(conn: sqlite3.Connection, limit: int = 100) -> int:
    added = 0
    items_found = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(BASE_URL, timeout=30000)
            page.wait_for_selector(CARD_SELECTOR, timeout=15000)
            # Scroll to load more cards up to limit
            while items_found < limit:
                cards = page.query_selector_all(CARD_SELECTOR)
                items_found = len(cards)
                if items_found >= limit:
                    break
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                try:
                    page.wait_for_timeout(2000)
                    new_cards = page.query_selector_all(CARD_SELECTOR)
                    if len(new_cards) == items_found:
                        break  # no new cards loaded
                    items_found = len(new_cards)
                except PWTimeout:
                    break

            cards = page.query_selector_all(CARD_SELECTOR)[:limit]
            parsed = parse_cards(cards)
            for item in parsed:
                if not db.dedup_exists(conn, SOURCE, item["source_id"]):
                    db.insert_prompt(conn, source=SOURCE, **item)
                    added += 1
        except PWTimeout:
            print("prompthero: page load timed out")
        finally:
            browser.close()

    db.log_scrape(conn, SOURCE, 1, items_found, added)
    return added
```

- [ ] **Step 3: Live smoke test**

```bash
cd tools/prompt_scraper
python -c "
import db, scrapers.prompthero as ph
conn = db.get_conn('test_ph.db')
db.init_db(conn)
added = ph.scrape(conn, limit=10)
print(f'Added: {added}')
rows = db.get_unused_prompts(conn, limit=5)
for r in rows:
    print(r['raw_prompt'][:80])
conn.close()
import os; os.unlink('test_ph.db')
"
```

Expected: prints 5–10 prompt excerpts. If 0 added, the selectors need updating — revisit Step 1.

- [ ] **Step 4: Commit**

```bash
git add tools/prompt_scraper/scrapers/prompthero.py
git commit -m "feat: add prompthero playwright scraper"
```

---

## Task 9: OpenArt Scraper

**Files:**
- Create: `tools/prompt_scraper/scrapers/openart.py`

- [ ] **Step 1: Discover live selectors**

```bash
cd tools/prompt_scraper
python -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    page.goto('https://openart.ai/discovery')
    page.wait_for_timeout(4000)
    # Inspect a prompt card and note selectors for:
    # card container, prompt text, view/like count
    input('Press Enter when done...')
    browser.close()
"
```

Typical structure:
- Card: `div.artwork-card` or `div[class*='ArtCard']`
- Prompt: `p[class*='prompt']` or `div[class*='prompt-text']`
- Views: `span[class*='view']`

Update `CARD_SELECTOR`, `PROMPT_SELECTOR`, `VIEWS_SELECTOR` with real values.

- [ ] **Step 2: Implement scrapers/openart.py**

Create `tools/prompt_scraper/scrapers/openart.py`:

```python
import json
import sqlite3
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import config
import db

SOURCE = "openart"

# Update after selector discovery
CARD_SELECTOR = "div.artwork-card"
PROMPT_SELECTOR = "p.prompt-text"
VIEWS_SELECTOR = "span.view-count"
BASE_URL = "https://openart.ai/discovery"

def parse_cards(cards) -> list[dict]:
    results = []
    for card in cards:
        try:
            prompt_el = card.query_selector(PROMPT_SELECTOR)
            raw_prompt = prompt_el.inner_text().strip() if prompt_el else ""
            if not raw_prompt:
                continue
            views_el = card.query_selector(VIEWS_SELECTOR)
            try:
                popularity = int(views_el.inner_text().strip().replace(",", "").replace("k", "000")) if views_el else 0
            except ValueError:
                popularity = 0
            source_id = raw_prompt[:40]
            words = [w.strip(",.") for w in raw_prompt.lower().split()]
            results.append({
                "source_id": source_id,
                "source_url": BASE_URL,
                "raw_prompt": raw_prompt,
                "tags": json.dumps(words[:10]),
                "niche": config.map_niche(words),
                "style_tag": config.map_style_tag(words),
                "color_hints": None,
                "product_category": "shirt",
                "popularity": popularity,
            })
        except Exception:
            continue
    return results

def scrape(conn: sqlite3.Connection, limit: int = 100) -> int:
    added = 0
    items_found = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(BASE_URL, timeout=30000)
            page.wait_for_selector(CARD_SELECTOR, timeout=15000)
            while items_found < limit:
                cards = page.query_selector_all(CARD_SELECTOR)
                if len(cards) >= limit or len(cards) == items_found:
                    break
                items_found = len(cards)
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(2000)
            cards = page.query_selector_all(CARD_SELECTOR)[:limit]
            items_found = len(cards)
            parsed = parse_cards(cards)
            for item in parsed:
                if not db.dedup_exists(conn, SOURCE, item["source_id"]):
                    db.insert_prompt(conn, source=SOURCE, **item)
                    added += 1
        except PWTimeout:
            print("openart: page load timed out")
        finally:
            browser.close()

    db.log_scrape(conn, SOURCE, 1, items_found, added)
    return added
```

- [ ] **Step 3: Live smoke test**

```bash
cd tools/prompt_scraper
python -c "
import db, scrapers.openart as oa
conn = db.get_conn('test_oa.db')
db.init_db(conn)
added = oa.scrape(conn, limit=10)
print(f'Added: {added}')
rows = db.get_unused_prompts(conn, limit=5)
for r in rows: print(r['raw_prompt'][:80])
conn.close()
import os; os.unlink('test_oa.db')
"
```

Expected: 5–10 prompt excerpts. 0 results = update selectors.

- [ ] **Step 4: Commit**

```bash
git add tools/prompt_scraper/scrapers/openart.py
git commit -m "feat: add openart playwright scraper"
```

---

## Task 10: Trends Scraper

**Files:**
- Create: `tools/prompt_scraper/scrapers/trends.py`

- [ ] **Step 1: Implement scrapers/trends.py**

Create `tools/prompt_scraper/scrapers/trends.py`:

```python
import sqlite3
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import config
import db

REDBUBBLE_URL = "https://www.redbubble.com/shop/trending"
REDBUBBLE_TAG_SELECTOR = "a[class*='Tag'], span[class*='trending-tag'], a[href*='/shop/']"

def scrape(conn: sqlite3.Connection) -> int:
    added = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(REDBUBBLE_URL, timeout=30000)
            page.wait_for_timeout(3000)
            tag_els = page.query_selector_all(REDBUBBLE_TAG_SELECTOR)
            tag_texts = []
            for el in tag_els[:50]:
                text = el.inner_text().strip().lower()
                if text and len(text) > 2:
                    tag_texts.append(text)

            seen: set[str] = set()
            for text in tag_texts:
                niche = config.map_niche([text]) or text
                if niche in seen:
                    continue
                seen.add(niche)
                conn.execute(
                    "INSERT INTO niche_trends (niche, trend_score, source, scraped_at) VALUES (?, ?, ?, ?)",
                    (niche, 1.0, "redbubble", datetime.utcnow().isoformat())
                )
                conn.commit()
                added += 1
        except PWTimeout:
            print("trends: page load timed out")
        finally:
            browser.close()

    db.log_scrape(conn, "trends", 1, added, added)
    return added
```

- [ ] **Step 2: Live smoke test**

```bash
cd tools/prompt_scraper
python -c "
import db, scrapers.trends as t
conn = db.get_conn('test_tr.db')
db.init_db(conn)
added = t.scrape(conn)
print(f'Trends added: {added}')
rows = conn.execute('SELECT niche FROM niche_trends').fetchall()
for r in rows: print(r[0])
conn.close()
import os; os.unlink('test_tr.db')
"
```

Expected: 5–15 niche trend rows printed.

- [ ] **Step 3: Commit**

```bash
git add tools/prompt_scraper/scrapers/trends.py
git commit -m "feat: add redbubble trends scraper"
```

---

## Task 11: Wire scrapers/__init__.py

**Files:**
- Modify: `tools/prompt_scraper/scrapers/__init__.py` (replace stub from Task 1)

- [ ] **Step 1: Implement scrape_all dispatcher**

Replace `tools/prompt_scraper/scrapers/__init__.py` with:

```python
import sqlite3
from scrapers import civitai, lexica, prompthero, openart, trends

def scrape_all(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "civitai":    civitai.scrape(conn),
        "lexica":     lexica.scrape(conn),
        "prompthero": prompthero.scrape(conn),
        "openart":    openart.scrape(conn),
        "trends":     trends.scrape(conn),
    }
```

- [ ] **Step 2: Test scrape all CLI command**

```bash
cd tools/prompt_scraper
python -m prompt_scraper scrape civitai --limit 10
python -m prompt_scraper status
```

Expected: status shows civitai row count > 0.

- [ ] **Step 3: End-to-end test with export**

```bash
cd tools/prompt_scraper
python -m prompt_scraper scrape lexica --query "vintage illustration badge" --limit 20
python -m prompt_scraper status
python -m prompt_scraper export --count 5 --out test_batch.csv --start-id 62
cat test_batch.csv | head -3
```

Expected: CSV with header + 5 rows, `id` column starting at 62, `live-mode` = FALSE.

- [ ] **Step 4: Clean up test artifact and commit**

```bash
rm -f tools/prompt_scraper/test_batch.csv
git add tools/prompt_scraper/scrapers/__init__.py
git commit -m "feat: add scrape_all dispatcher; complete prompt scraper v1"
```

---

## Done

The prompt scraper is complete when:
- `pytest tests/` passes from `tools/prompt_scraper/`
- `python -m prompt_scraper status` runs without error
- `python -m prompt_scraper scrape civitai --limit 20` adds rows to the DB
- `python -m prompt_scraper export --count 5 --out batch.csv` writes a valid 20-column CSV
- The CSV pastes cleanly into the Google Sheet starting at the specified `--start-id`
