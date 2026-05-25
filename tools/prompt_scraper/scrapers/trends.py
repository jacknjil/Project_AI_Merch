import re
import sqlite3
from datetime import datetime

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

import config
import db

SOURCE = "redbubble"
TRENDING_URL = "https://www.redbubble.com/shop/trending"

# Matches topic slugs like /shop/anime+all-departments or /shop/legendary+animals+all-departments
_TOPIC_RE = re.compile(r'href="/shop/([a-zA-Z][a-z0-9+\-]*)\+all-departments"')

_STATIC_FALLBACK = [
    "cottagecore", "dark academia", "Y2K", "gaming", "astrology",
    "nurses", "hiking", "dogs", "anime", "music", "cats", "coffee",
    "fitness", "teachers", "pets",
]


def _fetch_topics() -> list[str]:
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
            page.goto(TRENDING_URL, timeout=30000)
            page.wait_for_timeout(3000)
            html = page.content()
        except PWTimeout:
            browser.close()
            return []
        browser.close()

    raw_slugs = list(dict.fromkeys(_TOPIC_RE.findall(html)))  # ordered dedup
    topics = [slug.replace("+", " ").replace("-", " ") for slug in raw_slugs]
    return topics


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


def scrape(conn: sqlite3.Connection) -> int:
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
