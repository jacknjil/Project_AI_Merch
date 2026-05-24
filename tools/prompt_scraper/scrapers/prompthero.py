import json
import sqlite3
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import config
import db

SOURCE = "prompthero"
BASE_URL = "https://prompthero.com/"

# Card container selector: the repeating "group" div wrapping each prompt card
CARD_SEL = "div.group.relative.overflow-hidden"

# Prompt text inside each card (hover-overlay paragraph)
PROMPT_P_SEL = "p.text-white\\/90"

# Prompt link (contains source_id and slug)
PROMPT_LINK_SEL = 'a[href*="/prompt/"]'

# Stats spans (likes then views)
STAT_SPAN_SEL = "span.flex.items-center"

# Model tag
MODEL_TAG_SEL = "span.uppercase.tracking-wide"


def _extract_prompt_text(card) -> str:
    """Extract the raw prompt text from a card element handle."""
    # 1. Hover-overlay paragraph (most reliable, full text)
    p_el = card.query_selector(PROMPT_P_SEL)
    if p_el:
        text = (p_el.text_content() or "").strip()
        if text and text not in ("View prompt details",):
            return text

    # 2. img[alt^="AI generated: "] attribute
    img_el = card.query_selector('img[alt^="AI generated: "]')
    if img_el:
        alt = (img_el.get_attribute("alt") or "").strip()
        if alt.startswith("AI generated: "):
            text = alt[len("AI generated: "):].strip()
            if text and not text.endswith("..."):
                return text
            elif text:  # truncated — still usable
                return text

    # 3. aria-label on the link (fallback)
    link_el = card.query_selector(PROMPT_LINK_SEL)
    if link_el:
        aria = (link_el.get_attribute("aria-label") or "").strip()
        if aria and aria not in ("View prompt details", "Remix this prompt", "Add to favorites"):
            return aria

    return ""


def _extract_source_id(href: str) -> str:
    """Extract the short hex source_id from a /prompt/abc123... href."""
    # href format: /prompt/<id>-optional-slug or /prompt/<id>
    if not href:
        return ""
    parts = href.lstrip("/").split("/")
    if len(parts) >= 2:
        slug = parts[1]  # e.g. "803441baca4-stable-diffusion-..."
        return slug.split("-")[0]
    return ""


def _extract_popularity(card) -> int:
    """Extract likes count (first stat span) from a card element handle."""
    spans = card.query_selector_all(STAT_SPAN_SEL)
    if spans:
        try:
            text = (spans[0].text_content() or "").strip()
            return int(text)
        except (ValueError, TypeError):
            pass
    return 0


def _extract_model_tags(card) -> list[str]:
    """Return model tag text(s) from the card."""
    model_el = card.query_selector(MODEL_TAG_SEL)
    if model_el:
        tag = (model_el.text_content() or "").strip()
        if tag:
            return [tag]
    return []


def parse_cards(cards) -> list[dict]:
    """
    Given a list of Playwright element handles (prompt cards), extract:
    source_id, source_url, raw_prompt, tags (JSON), niche, style_tag,
    color_hints (None), product_category ("shirt"), popularity (int).
    """
    results = []
    for card in cards:
        link_el = card.query_selector(PROMPT_LINK_SEL)
        if not link_el:
            continue

        href = (link_el.get_attribute("href") or "").strip()
        source_id = _extract_source_id(href)
        if not source_id:
            continue

        source_url = f"https://prompthero.com{href}" if href.startswith("/") else href

        raw_prompt = _extract_prompt_text(card)
        if not raw_prompt:
            continue

        # Build tags: model tag + prompt words (for niche/style mapping)
        model_tags = _extract_model_tags(card)
        prompt_words = [w.strip(",.:|") for w in raw_prompt.lower().split() if len(w) > 2]
        all_tags = model_tags + prompt_words[:15]

        results.append({
            "source_id": source_id,
            "source_url": source_url,
            "raw_prompt": raw_prompt,
            "tags": json.dumps(all_tags),
            "niche": config.map_niche(all_tags),
            "style_tag": config.map_style_tag(all_tags),
            "color_hints": None,
            "product_category": "shirt",
            "popularity": _extract_popularity(card),
        })
    return results


def scrape(conn: sqlite3.Connection, limit: int = 100) -> int:
    """
    Open prompthero.com with headless Playwright, wait for prompt cards,
    parse them, dedup + insert via db, log the run, return count added.
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
            # Remove webdriver flag to bypass Cloudflare bot detection
            page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            page.goto(BASE_URL, timeout=30000)
            # Wait for at least one card to be in the DOM (state="attached" avoids
            # visibility issues with overflow-hidden masonry containers)
            try:
                page.wait_for_selector(CARD_SEL, timeout=15000, state="attached")
            except PWTimeout:
                # Fall back: check if cards are queryable despite timeout
                fallback = page.query_selector_all(CARD_SEL)
                if not fallback:
                    print(f"{SOURCE}: timed out waiting for cards — page may have changed")
                    browser.close()
                    db.log_scrape(conn, SOURCE, 0, 0, 0)
                    return 0
                print(f"{SOURCE}: wait_for_selector timed out but {len(fallback)} cards found via query")

            pages_fetched = 1

            # Scroll to load more cards if limit > initial count
            initial_cards = page.query_selector_all(CARD_SEL)
            if len(initial_cards) < limit:
                # Scroll down in increments to trigger lazy-loading
                for _ in range(4):
                    page.evaluate("window.scrollBy(0, document.body.scrollHeight * 0.5)")
                    page.wait_for_timeout(1500)

            cards = page.query_selector_all(CARD_SEL)
            items_found = len(cards)
            print(f"{SOURCE}: found {items_found} cards on page")

            parsed = parse_cards(cards[:limit])
            for item in parsed:
                if not db.dedup_exists(conn, SOURCE, item["source_id"]):
                    db.insert_prompt(conn, source=SOURCE, **item)
                    added += 1

            browser.close()

    except PWTimeout as e:
        print(f"{SOURCE}: playwright timeout: {e}")
    except Exception as e:
        print(f"{SOURCE}: unexpected error: {e}")

    db.log_scrape(conn, SOURCE, pages_fetched, items_found, added)
    print(f"{SOURCE}: added {added} new prompts (found {items_found} total)")
    return added
