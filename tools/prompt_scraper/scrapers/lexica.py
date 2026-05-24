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
