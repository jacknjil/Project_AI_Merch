import json
import sqlite3
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import config
import db

SOURCE = "openart"
BASE_URL = "https://openart.ai/discovery"
FEED_API = "/api/feed/community"


def parse_items(items: list) -> list[dict]:
    """
    Given a list of feed item dicts from OpenArt's /api/feed/community endpoint,
    extract: source_id, source_url, raw_prompt, tags, niche, style_tag,
    color_hints (None), product_category ("shirt"), popularity (int).
    Only items with non-empty prompts (> 5 chars) are returned.
    """
    results = []
    for item in items:
        if not isinstance(item, dict):
            continue

        raw_prompt = (item.get("prompt") or "").strip()
        if not raw_prompt or len(raw_prompt) < 6:
            continue

        # Skip private prompts
        if item.get("is_prompt_private"):
            continue

        source_id = item.get("id") or raw_prompt[:40]
        source_url = f"https://openart.ai/discovery/{source_id}"

        # Build tags: ai_model + prompt words (for niche/style mapping)
        ai_model = (item.get("ai_model") or "").strip()
        prompt_words = [w.strip(",.:|") for w in raw_prompt.lower().split() if len(w) > 2]
        all_tags: list[str] = []
        if ai_model:
            all_tags.append(ai_model)
        all_tags.extend(prompt_words[:20])

        # Popularity: prefer like_count, fall back to vote_count or bookmark_count
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
    """
    Open openart.ai/discovery with headless Playwright, call the internal
    /api/feed/community JSON endpoint (with cursor pagination), parse feed
    items, dedup + insert via db, log the run, and return the count added.
    """
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
            page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            # Load the discovery page first to establish session/cookies
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
                except Exception as exc:
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
                # Stop if no more pages or we've collected enough
                if not next_cursor or next_cursor == cursor:
                    break
                cursor = next_cursor

                if len(all_items) >= limit:
                    break

                # Small delay between paginated requests
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
    except Exception as e:
        print(f"{SOURCE}: unexpected error: {e}")

    db.log_scrape(conn, SOURCE, pages_fetched, items_found, added)
    print(f"{SOURCE}: added {added} new prompts (found {items_found} total)")
    return added
