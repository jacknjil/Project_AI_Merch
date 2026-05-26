import csv
import json

from openai import OpenAI

import config
from export import SHEET_COLUMNS, assemble_row

DEFAULT_NICHES = [
    "cats", "dogs", "nurses", "teachers", "astrology",
    "gaming", "hiking", "outdoors", "coffee", "fitness",
    "pets", "food", "music", "travel", "wellness",
]

ANIMAL_NICHES = [
    "wildlife", "birds", "ocean", "farm",
]

OUTDOOR_NICHES = [
    "camping", "fishing",
]

HUMOR_NICHES = [
    "humor",
]

DEFAULT_STYLES = [
    "vintage-badge",
    "watercolor",
    "flat-vector",
    "typography-humor",
    "kawaii",
]

EXTENDED_STYLES = DEFAULT_STYLES + ["cartoon-humor"]

STYLE_HINTS = {
    "cartoon-humor": (
        "cartoonish illustration where the humor lives entirely in the visual concept — "
        "absurd scenario, unexpected twist, or animal doing something relatable. "
        "Minimal text annotation only (2-5 words max), Far Side-inspired."
    ),
}


def _generate_row(client: OpenAI, niche: str, style: str, category: str) -> dict:
    style_hint = STYLE_HINTS.get(style, f"{style} illustration style")
    resp = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": (
                "You are a product designer for a print-on-demand merchandise store. "
                "Generate a single t-shirt graphic design concept that is visually distinct, "
                "centered, and immediately recognizable for the target niche. "
                "Respond with valid JSON only — no markdown, no explanation."
            )},
            {"role": "user", "content": (
                f"Create a design concept for the '{niche}' niche on a {category}.\n"
                f"Style: {style_hint}\n\n"
                f"The design must feel authentic to the niche and visually distinct from generic art. "
                f"Avoid clichés. Be specific and evocative.\n\n"
                'Return JSON: {"title": "Product Title Here", '
                '"concept": "Centered graphic design, [full DALL-E-ready description]...", '
                '"colorPalette": "descriptive color name 1, color name 2, color name 3"}'
                " Use plain English color names only — never hex codes."
            )},
        ],
        temperature=0.9,
    )
    return json.loads(resp.choices[0].message.content)


def build_matrix(niches: list, styles: list, category: str,
                 start_id: int, priority: str, out: str) -> str:
    client = OpenAI(api_key=config.OPENAI_API_KEY)
    rows = []
    current_id = start_id
    total = len(niches) * len(styles)
    done = 0

    for niche in niches:
        for style in styles:
            done += 1
            print(f"[{done}/{total}] {niche} × {style} ...", end=" ", flush=True)
            try:
                data = _generate_row(client, niche=niche, style=style, category=category)
                rows.append(assemble_row(
                    sheet_id=current_id,
                    niche=niche,
                    style_tag=style,
                    product_category=category,
                    priority=priority,
                    source="matrix-gpt",
                    transformed=data,
                ))
                current_id += 1
                print("ok")
            except Exception as e:
                print(f"FAILED: {e}")

    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SHEET_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n{len(rows)}/{total} rows written → {out}")
    return out
