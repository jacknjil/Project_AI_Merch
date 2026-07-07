import html
import re
import sqlite3
from datetime import datetime

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

import config
import db

SOURCE = "redbubble"
TRENDING_URL = "https://www.redbubble.com/shop/trending"

# iaCode=all-stickers scopes results to the stickers department; sortOrder=top selling
# is Redbubble's actual bestseller ranking (verified live 2026-07-07 via the site's own
# sort menu — the SEO-style "/shop/trending+stickers" URL just redirects to the generic
# stickers listing sorted by relevance, not real trend/sales data).
STICKER_BESTSELLING_URL = "https://www.redbubble.com/shop?iaCode=all-stickers&sortOrder=top%20selling"

# Matches topic slugs like /shop/anime+all-departments or /shop/legendary+animals+all-departments
_TOPIC_RE = re.compile(r'href="/shop/([a-zA-Z][a-z0-9+\-]*)\+all-departments"')

# Matches sticker product-card alt text: alt="Item preview, TITLE  designed and sold by ARTIST."
# Artist names can contain periods (e.g. "Not a front for Large Explosives.."), so match
# up to the closing quote rather than excluding "." — avoids runaway backtracking into
# unrelated HTML when an artist name breaks the old [^."]+ assumption.
_ITEM_RE = re.compile(r'alt="Item preview, (.*?)\s+designed and sold by [^"]+\."')

_STATIC_FALLBACK = [
    "cottagecore", "dark academia", "Y2K", "gaming", "astrology",
    "nurses", "hiking", "dogs", "anime", "music", "cats", "coffee",
    "fitness", "teachers", "pets",
]

# Verified live 2026-07-07 from the Best Selling sort of the stickers department —
# durable animal-humor and dry-humor one-liners, not fandom/meme spikes.
_STICKER_STATIC_FALLBACK = [
    "cats", "dogs", "opossums", "otters", "frogs", "crocodiles",
    "sarcastic one-liner humor", "self-deprecating humor", "botanical",
]


def _fetch_html(url: str) -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = ctx.new_page()
        try:
            page.goto(url, timeout=30000)
            page.wait_for_timeout(3000)
            page_html = page.content()
        except PWTimeout:
            browser.close()
            return ""
        browser.close()
    return page_html


def _fetch_topics() -> list[str]:
    html = _fetch_html(TRENDING_URL)
    raw_slugs = list(dict.fromkeys(_TOPIC_RE.findall(html)))  # ordered dedup
    return [slug.replace("+", " ").replace("-", " ") for slug in raw_slugs]


def _fetch_sticker_titles() -> list[str]:
    page_html = _fetch_html(STICKER_BESTSELLING_URL)
    raw_titles = _ITEM_RE.findall(page_html)
    titles = [html.unescape(title) for title in raw_titles]
    return list(dict.fromkeys(titles))  # ordered dedup


def _insert_topics(conn: sqlite3.Connection, topics: list[str], source: str, score: float) -> int:
    now = datetime.utcnow().isoformat()
    added = 0
    for topic in topics:
        niche = config.map_niche([topic]) or topic
        conn.execute(
            "INSERT INTO niche_trends (niche, trend_score, source, scraped_at) VALUES (?, ?, ?, ?)",
            (niche, score, source, now),
        )
        added += 1
    conn.commit()
    return added


def _scrape_stickers(conn: sqlite3.Connection) -> int:
    titles = _fetch_sticker_titles()
    source = "redbubble-stickers-bestselling"

    if titles:
        added = _insert_topics(conn, titles, source, 1.0)
        db.log_scrape(conn, "trends", pages_fetched=1, items_found=len(titles), items_added=added)
        print(f"trends: inserted {added} sticker bestseller titles from {source}")
        return added

    print("trends: live sticker scrape returned 0 items — using static fallback")
    added = _insert_topics(conn, _STICKER_STATIC_FALLBACK, "static-stickers", 0.5)
    db.log_scrape(conn, "trends", pages_fetched=0, items_found=0, items_added=added)
    print(f"trends: inserted {added} topics from static sticker fallback")
    return added


def scrape(conn: sqlite3.Connection, category: str | None = None) -> int:
    if category == "sticker":
        return _scrape_stickers(conn)

    topics = _fetch_topics()

    if topics:
        added = _insert_topics(conn, topics, SOURCE, 1.0)
        db.log_scrape(conn, "trends", pages_fetched=1, items_found=len(topics), items_added=added)
        print(f"trends: inserted {added} topics from {SOURCE}")
        return added

    # Static fallback when site is unreachable or returns no topics
    print("trends: live scrape returned 0 topics — using static fallback")
    added = _insert_topics(conn, _STATIC_FALLBACK, "static", 0.5)
    db.log_scrape(conn, "trends", pages_fetched=0, items_found=0, items_added=added)
    print(f"trends: inserted {added} topics from static fallback")
    return added
