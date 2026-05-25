import csv
import json
import sqlite3
from datetime import datetime
from typing import Optional

import db
import config
from openai import OpenAI

SHEET_COLUMNS = [
    "id", "rowId", "title", "niche", "concept", "styleTag", "colorPalette",
    "product_category", "size", "priority", "live-mode", "n8n_status",
    "n8n_error", "assetIds", "imageUrl", "firebaseProductId",
    "published", "lastRun", "retryCount", "notes",
]

def transform_prompt(client: OpenAI, raw_prompt: str, niche: str,
                     style_tag: str, color_hints: Optional[str],
                     product_category: str) -> dict:
    resp = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": (
                "You are a DALL-E prompt engineer for a print-on-demand merchandise store. "
                "Convert image generation prompts into DALL-E-ready product design descriptions. "
                "Respond with valid JSON only — no markdown, no explanation."
            )},
            {"role": "user", "content": (
                f"Convert this image-generation prompt into a DALL-E product design concept "
                f"for a {product_category}.\n\n"
                f"Raw prompt: {raw_prompt}\n"
                f"Niche: {niche or 'general'}\n"
                f"Style: {style_tag or 'illustration'}\n"
                f"Color hints: {color_hints or 'none provided'}\n\n"
                'Return JSON: {"concept": "Centered graphic design, [description]...", '
                '"colorPalette": "[color1], [color2], [color3]", "title": "[Product Title]"}'
            )},
        ],
        temperature=0.7,
    )
    return json.loads(resp.choices[0].message.content)

def assemble_row(sheet_id: int, niche: str, style_tag: str,
                 product_category: str, priority: str,
                 source: str, transformed: dict) -> dict:
    return {
        "id": sheet_id,
        "rowId": sheet_id + 1,
        "title": transformed.get("title", ""),
        "niche": niche or "",
        "concept": transformed.get("concept", ""),
        "styleTag": style_tag or "",
        "colorPalette": transformed.get("colorPalette", ""),
        "product_category": product_category,
        "size": "1024x1024",
        "priority": priority,
        "live-mode": "FALSE",
        "n8n_status": "",
        "n8n_error": "",
        "assetIds": "",
        "imageUrl": "",
        "firebaseProductId": "",
        "published": "",
        "lastRun": "",
        "retryCount": "0",
        "notes": f"scraped:{source}",
    }

def export_batch(conn: sqlite3.Connection, count: int = 20,
                 niche: Optional[str] = None, style_tag: Optional[str] = None,
                 category: Optional[str] = None, min_popularity: int = 0,
                 priority: str = "medium", start_id: int = 62,
                 out: Optional[str] = None,
                 allow_reuse: bool = False, shuffle: bool = False) -> str:
    if allow_reuse:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM prompts ORDER BY RANDOM() LIMIT ?" if shuffle
            else "SELECT * FROM prompts ORDER BY popularity DESC LIMIT ?", (count,)
        ).fetchall()]
    else:
        rows = db.get_unused_prompts(
            conn, niche=niche, style_tag=style_tag,
            min_popularity=min_popularity, category=category, limit=count,
            shuffle=shuffle,
        )

    if not rows:
        raise ValueError("No matching prompts found in DB")

    client = OpenAI(api_key=config.OPENAI_API_KEY)
    batch_id = db.create_export_batch(conn, row_count=0, csv_path="")

    if out is None:
        out = f"batch_{datetime.utcnow().strftime('%Y-%m-%d')}.csv"

    sheet_rows = []
    exported_ids = []
    current_id = start_id

    for row in rows:
        try:
            transformed = transform_prompt(
                client,
                raw_prompt=row["raw_prompt"],
                niche=row.get("niche") or "general",
                style_tag=row.get("style_tag") or "illustration",
                color_hints=row.get("color_hints"),
                product_category=row.get("product_category") or "shirt",
            )
        except Exception as e:
            print(f"Warning: GPT transform failed for prompt id {row['id']}: {e}")
            continue

        sheet_rows.append(assemble_row(
            sheet_id=current_id,
            niche=row.get("niche") or "",
            style_tag=row.get("style_tag") or "",
            product_category=row.get("product_category") or "shirt",
            priority=priority,
            source=row["source"],
            transformed=transformed,
        ))
        exported_ids.append(row["id"])
        current_id += 1

    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SHEET_COLUMNS)
        writer.writeheader()
        writer.writerows(sheet_rows)

    if exported_ids:
        db.mark_used(conn, exported_ids, batch_id)
        conn.execute(
            "UPDATE export_batches SET row_count = ?, csv_path = ? WHERE id = ?",
            (len(exported_ids), out, batch_id)
        )
        conn.commit()

    print(f"{len(exported_ids)} rows exported → {out} (batch #{batch_id})")
    return out
