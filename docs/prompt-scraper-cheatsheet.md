# Prompt Scraper — Quick Reference

**All commands run from `tools/` directory:**

```bash
cd ~/Project_AI_Merch/tools
```

---

## Scrapers

| Scraper      | Source               | Method     | Notes                                          |
| ------------ | -------------------- | ---------- | ---------------------------------------------- |
| `civitai`    | Civitai REST API     | HTTP       | Fast, reliable, paginated                      |
| `lexica`     | Lexica.art API       | HTTP       | Returns 500 intermittently                     |
| `prompthero` | PromptHero           | Playwright | Most prompts gated behind login; ~5-10 per run |
| `openart`    | OpenArt internal API | Playwright | Internal JSON feed via page; ~10-20 per run    |
| `trends`     | Redbubble trending   | Playwright | Niche signals only, no prompts                 |

---

## Scrape commands

```bash
# Individual scrapers
python -m prompt_scraper scrape civitai --limit 200
python -m prompt_scraper scrape civitai --limit 200 --tags "illustration,badge,apparel"

python -m prompt_scraper scrape lexica --query "vintage badge merch" --limit 100
python -m prompt_scraper scrape lexica --query "dogs illustration t-shirt" --limit 100

python -m prompt_scraper scrape prompthero --limit 100   # slow, ~30s
python -m prompt_scraper scrape openart --limit 100      # slow, ~20s

python -m prompt_scraper scrape trends                   # populates niche_trends table

# All at once (sequential)
python -m prompt_scraper scrape all
```

---

## Check what's in the DB

```bash
python -m prompt_scraper status

```

Shows total prompts, by-source counts, unused vs exported, top niches, and any trend signals.

---

## Export to CSV

```bash
# Basic — 20 rows starting at sheet id 62
OPENAI_API_KEY=<key> python -m prompt_scraper export --count 20 --start-id 62 --out batch3.csv

# Filtered by niche or style
OPENAI_API_KEY=<key> python -m prompt_scraper export --count 10 --niche dogs --start-id 62

# High popularity only
OPENAI_API_KEY=<key> python -m prompt_scraper export --count 20 --min-popularity 50 --start-id 62

# Specific product type
OPENAI_API_KEY=<key> python -m prompt_scraper export --count 10 --category cup --start-id 62
```

`--start-id` = the `id` value for the first exported row. Must be one higher than your last sheet row.

---

## Full workflow (each batch cycle)

```bash
# 1. Scrape fresh prompts
python -m prompt_scraper scrape civitai --limit 200
python -m prompt_scraper scrape openart --limit 100

# 2. Check what you have
python -m prompt_scraper status

# 3. Export
OPENAI_API_KEY=<key> python -m prompt_scraper export --count 20 --start-id 62 --out batch3.csv

# 4. Paste data rows into Google Sheet (skip header row)
# 5. Set n8n_status=todo on rows you want to run
# 6. Trigger n8n workflow HlxK50rV54KSiNRD from n8n UI
```

---

## Gotchas

- **Lexica 500 errors** — intermittent, not a bug; just retry later
- **PromptHero low yield** — most prompts require login; 5-10 per run is normal
- **`--start-id`** — always double-check your last sheet row before exporting to avoid ID collisions
- **Dedup is automatic** — re-running a scraper never creates duplicate DB rows
- **Used rows are tracked** — exported prompts are marked `used_at` and won't appear in future exports unless you pass `--allow-reuse`
