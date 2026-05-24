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
    assert {"prompts", "scrape_log", "niche_trends", "export_batches"} <= tables

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
