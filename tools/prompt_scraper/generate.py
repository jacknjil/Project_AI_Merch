import hashlib
import json
import sqlite3

import config
import db
from openai import OpenAI

SOURCE = "gpt-generated"

def generate_seeds(client: OpenAI, niche: str, style: str,
                   category: str, count: int) -> list[str]:
    resp = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": (
                "You are a product designer for a print-on-demand merchandise store. "
                "Generate brief design concept seeds for t-shirt graphics. "
                "Each seed is one sentence describing a centered graphic design — "
                "visually striking, merch-appropriate, and fitting the niche and style. "
                "Do not include DALL-E prompt syntax, quality tags, or technical jargon. "
                "Respond with a JSON array of strings only — no markdown, no explanation."
            )},
            {"role": "user", "content": (
                f"Generate {count} distinct design concept seeds.\n"
                f"Niche: {niche}\n"
                f"Style: {style}\n"
                f"Product: {category}\n\n"
                f'Return: ["concept seed 1", "concept seed 2", ...]'
            )},
        ],
        temperature=0.9,
    )
    return json.loads(resp.choices[0].message.content)


def store_seeds(conn: sqlite3.Connection, seeds: list[str],
                niche: str, style: str, category: str) -> int:
    added = 0
    for seed in seeds:
        source_id = hashlib.sha256(seed.encode()).hexdigest()[:16]
        if not db.dedup_exists(conn, SOURCE, source_id):
            db.insert_prompt(
                conn,
                source=SOURCE,
                source_id=source_id,
                source_url="",
                raw_prompt=seed,
                tags=json.dumps([niche, style]),
                niche=niche,
                style_tag=style,
                color_hints=None,
                product_category=category,
                popularity=0,
            )
            added += 1
    return added
