# Prompt Scraper & Database — Design Spec
**Date:** 2026-05-24  
**Status:** Approved  
**Location:** `tools/prompt_scraper/`

---

## Overview

A local Python CLI tool that scrapes image-generation platforms for prompts, categories, and style signals, stores them in a SQLite database, and exports sheet-ready CSV rows that feed directly into the existing n8n batch generation pipeline.

**Goal:** Replace hand-crafted Google Sheet rows with a data-driven prompt pipeline that surfaces diverse niches and styles at scale, reducing the manual bottleneck that caused niche/style lapses in Batches 1 and 2.

---

## Architecture

Lives at `tools/prompt_scraper/` in the repo root, separate from `apps/frontend/`.

```
tools/prompt_scraper/
├── __main__.py          # python -m prompt_scraper entry
├── cli.py               # subcommand routing (click)
├── db.py                # SQLite connection + all queries
├── config.py            # API keys, rate limits, source URLs
├── scrapers/
│   ├── civitai.py       # REST API — tags, ratings, model filter
│   ├── lexica.py        # Search API — image + prompt pairs
│   ├── prompthero.py    # Playwright — JS-rendered gallery
│   ├── openart.py       # Playwright — JS-rendered gallery
│   └── trends.py        # Redbubble/Etsy — niche signals only, no prompts
├── export.py            # DB query → GPT transform → sheet-ready CSV
├── prompts.db           # SQLite file (gitignored)
└── requirements.txt     # requests, playwright, openai, click
```

Each scraper is one file with one responsibility. Adding a new source is a new file in `scrapers/` with no changes elsewhere. `prompts.db` is gitignored — it's a local artifact, not source-controlled.

---

## Data Sources

| Source | Type | Data collected | Notes |
|--------|------|----------------|-------|
| Civitai | REST API (free) | prompts, tags, model, likes, downloads | Filter by `DALL-E` or `illustration` model type |
| Lexica.art | Search API | prompt + image pairs, tags | Query by style/niche keywords |
| PromptHero | Playwright scrape | prompts, categories, likes | JS-rendered, needs headless browser |
| OpenArt.ai | Playwright scrape | prompts, style tags, views | JS-rendered, needs headless browser |
| Redbubble / Etsy | Playwright scrape | niche trend signals only | No prompts — used to validate niche demand |

---

## Database Schema

Four tables in `prompts.db`:

```sql
CREATE TABLE prompts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT NOT NULL,          -- civitai | lexica | prompthero | openart
    source_id       TEXT,                   -- original ID from the platform
    source_url      TEXT,
    raw_prompt      TEXT NOT NULL,
    tags            TEXT,                   -- JSON array from source
    niche           TEXT,                   -- mapped to our vocabulary: dogs | nurses | gaming...
    style_tag       TEXT,                   -- mapped to our styleTag: vintage-badge | retro-pixel...
    color_hints     TEXT,                   -- color data from source if available
    product_category TEXT DEFAULT 'shirt', -- inferred from source tags (shirt | cup | tote); overridable at export
    popularity      INTEGER DEFAULT 0,      -- likes / downloads / views from source
    scraped_at      TEXT NOT NULL,
    used_at         TEXT,                   -- NULL = never exported
    batch_id        INTEGER REFERENCES export_batches(id)
);

CREATE TABLE scrape_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT NOT NULL,
    run_at          TEXT NOT NULL,
    pages_fetched   INTEGER,
    items_found     INTEGER,
    items_added     INTEGER                 -- net new after dedup
);

CREATE TABLE niche_trends (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    niche           TEXT NOT NULL,
    trend_score     REAL,
    source          TEXT,
    scraped_at      TEXT NOT NULL
);

CREATE TABLE export_batches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at      TEXT NOT NULL,
    row_count       INTEGER,
    csv_path        TEXT,
    notes           TEXT
);
```

**Key decisions:**
- `source_id` + `source` form a natural dedup key — re-running a scrape never creates duplicates
- `niche` and `style_tag` are normalized to the project vocabulary at scrape time, not export time — enables fast filtered queries without a GPT call. Vocabulary mappings (tag → niche, tag → style_tag) live as dicts in `config.py` and are the single source of truth
- `used_at` + `batch_id` together give full lineage — every exported prompt is traceable to a batch and timestamp
- `--unused-only` is the default export behavior; `--allow-reuse` must be passed explicitly

---

## CLI Commands

```bash
# Scrape individual sources or all at once
python -m prompt_scraper scrape civitai --limit 200 --tags "apparel,t-shirt,illustration"
python -m prompt_scraper scrape lexica --query "vintage badge merch"
python -m prompt_scraper scrape prompthero --limit 100
python -m prompt_scraper scrape openart --limit 100
python -m prompt_scraper scrape trends          # niche signals only, no prompts
python -m prompt_scraper scrape all             # runs all sources sequentially

# Export — query unused prompts → GPT transform → sheet-ready CSV
python -m prompt_scraper export --count 20
python -m prompt_scraper export --count 10 --niche dogs
python -m prompt_scraper export --count 15 --style vintage-badge --unused-only
python -m prompt_scraper export --count 20 --min-popularity 500 --out batch3.csv
python -m prompt_scraper export --count 10 --category cup --niche pets

# Inspect DB state
python -m prompt_scraper status
```

**`status` sample output:**
```
prompts.db — 1,842 total prompts
  civitai:      943  (last scraped: 2026-05-23)
  lexica:       512  (last scraped: 2026-05-22)
  prompthero:   241  (last scraped: 2026-05-21)
  openart:      146  (last scraped: 2026-05-20)

unused: 1,791  |  exported: 51  |  batches: 3

top niches (unused): dogs 312 | gaming 287 | astrology 201 | nurses 98
niche trends (redbubble, 2026-05-23): cottagecore ↑ | dark academia ↑ | Y2K ↑
```

---

## Export Pipeline

What happens when `python -m prompt_scraper export --count 20` runs:

```
1. QUERY
   SELECT unused prompts from DB
   → filter by niche / style / popularity flags
   → order by popularity DESC
   → limit to --count

2. TRANSFORM (per row, GPT-4.1-mini)
   Input:  raw_prompt, niche, style_tag, color_hints
   System: "Convert this image-gen prompt into a DALL-E product design concept
            for a [product_category]. Output a centered graphic description in
            natural language. Style: [style_tag]. Return JSON:
            {concept, colorPalette, title}"

3. ASSEMBLE SHEET ROW
   All 20 columns matching Google Sheet schema:
   id, rowId, title, niche, concept, styleTag, colorPalette,
   product_category, size (1024x1024), priority, live-mode (FALSE),
   n8n_status (blank), n8n_error, assetIds, imageUrl,
   firebaseProductId, published, lastRun, retryCount, notes

4. WRITE CSV
   → output to --out filename (default: batch_YYYY-MM-DD.csv)
   → mark exported rows: used_at = now, batch_id = new batch record

5. LOG
   → insert row into export_batches
   → print summary: "20 rows exported → batch3.csv (batch #4)"
```

**Key export rules:**
- `live-mode` always exports as `FALSE` — user flips rows to `n8n_status=todo` manually in the sheet
- `priority` defaults to `medium`; pass `--priority high` to override for a whole export batch
- `id` / `rowId` auto-increment from the last known sheet row so the CSV pastes without collision
- GPT failures on individual rows skip with a warning — partial exports are valid, no crash
- GPT calls are batched where possible to reduce latency and token cost

---

## Future Extensions (out of scope for v1)

- Move to GCP VM, expose as a small REST endpoint for n8n to call directly
- Add a `suggest-niches` command that cross-references `niche_trends` with unused prompt counts
- Per-niche style-tag heatmap (which style tags have the most unused high-popularity prompts)
- Automatic `scrape all` on a local cron, keeping the DB fresh passively
