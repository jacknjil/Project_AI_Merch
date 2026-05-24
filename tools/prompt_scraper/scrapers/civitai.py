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
