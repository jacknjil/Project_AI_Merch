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
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)
    conn.commit()

def dedup_exists(conn: sqlite3.Connection, source: str, source_id: Optional[str]) -> bool:
    if source_id is None:
        row = conn.execute(
            "SELECT 1 FROM prompts WHERE source = ? AND source_id IS NULL",
            (source,)
        ).fetchone()
    else:
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
