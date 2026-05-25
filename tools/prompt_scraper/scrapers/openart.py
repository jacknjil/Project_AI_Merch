import json
import sqlite3
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import config
import db

SOURCE = "openart"
BASE_URL = "https://openart.ai/discovery"
FEED_API = "/api/feed/community"


def parse_items(items: list) -> list[dict]:
    results = []
    for item in items:
        if not isinstance(item, dict):
            continue

        raw_prompt = (item.get("prompt") or "").strip()
        if not raw_prompt or len(raw_prompt) < 6:
            continue

        if item.get("is_prompt_private"):
            continue

        source_id = item.get("id") or raw_prompt[:40]
        source_url = f"https://openart.ai/discovery/{source_id}"

        ai_model = (item.get("ai_model") or "").strip()
        prompt_words = [w.strip(",.:|") for w in raw_prompt.lower().split() if len(w) > 2]
        all_tags: list[str] = []
        if ai_model:
            all_tags.append(ai_model)
        all_tags.extend(prompt_words[:20])

        stats = item.get("stats") or {}
        popularity = (
            stats.get("like_count")
            or stats.get("vote_count")
            or stats.get("bookmark_count")
            or 0
        )
        try:
            popularity = int(popularity)
        except (ValueError, TypeError):
            popularity = 0

        results.append({
            "source_id": source_id,
            "source_url": source_url,
            "raw_prompt": raw_prompt,
            "tags": json.dumps(all_tags),
            "niche": config.map_niche(all_tags),
            "style_tag": config.map_style_tag(all_tags),
            "color_hints": None,
            "product_category": "shirt",
            "popularity": popularity,
        })
    return results


def scrape(conn: sqlite3.Connection, limit: int = 100) -> int:
    added = 0
    items_found = 0
    pages_fetched = 0

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                ],
            )
            ctx = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 800},
                locale="en-US",
                java_script_enabled=True,
            )
            page = ctx.new_page()
            # Remove webdriver flag to bypass bot detection
            page.add_init_script(  # strip webdriver flag to avoid bot detection
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            try:
                page.goto(BASE_URL, timeout=30000)
                page.wait_for_timeout(3000)
            except PWTimeout:
                print(f"{SOURCE}: timed out loading {BASE_URL}")
                browser.close()
                db.log_scrape(conn, SOURCE, 0, 0, 0)
                return 0

            pages_fetched = 1
            all_items: list[dict] = []
            cursor: str = ""

            while len(all_items) < limit:
                api_url = FEED_API if not cursor else f"{FEED_API}?cursor={cursor}"
                try:
                    result = page.evaluate(
                        f"""async () => {{
                            const resp = await fetch('{api_url}', {{
                                headers: {{'accept': 'application/json'}}
                            }});
                            if (!resp.ok) return null;
                            return await resp.json();
                        }}"""
                    )
                except PWTimeout as exc:
                    print(f"{SOURCE}: fetch error: {exc}")
                    break

                if not result or not isinstance(result, dict):
                    print(f"{SOURCE}: unexpected API response type: {type(result)}")
                    break

                batch = result.get("items") or []
                if not batch:
                    print(f"{SOURCE}: empty batch — stopping pagination")
                    break

                all_items.extend(batch)
                if cursor:
                    pages_fetched += 1

                next_cursor = (result.get("nextCursor") or "").strip()
                if not next_cursor or next_cursor == cursor:
                    break
                cursor = next_cursor

                page.wait_for_timeout(800)

            browser.close()

        items_found = len(all_items)
        print(f"{SOURCE}: fetched {items_found} items across {pages_fetched} page(s)")

        parsed = parse_items(all_items[:limit])
        for item in parsed:
            if not db.dedup_exists(conn, SOURCE, item["source_id"]):
                db.insert_prompt(conn, source=SOURCE, **item)
                added += 1

    except PWTimeout as e:
        print(f"{SOURCE}: playwright timeout: {e}")

    db.log_scrape(conn, SOURCE, pages_fetched, items_found, added)
    print(f"{SOURCE}: added {added} new prompts (found {items_found} total)")
    return added
