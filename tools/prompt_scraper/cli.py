import click
from openai import OpenAI, OpenAIError
import config
import db as _db
import export as _export
import generate as _generate
import matrix as _matrix
from scrapers import civitai, lexica, prompthero, openart, trends
from scrapers import scrape_all as _scrape_all

DB_PATH = "prompts.db"

@click.group()
@click.pass_context
def cli(ctx):
    ctx.ensure_object(dict)
    conn = _db.get_conn(DB_PATH)
    _db.init_db(conn)
    ctx.obj["conn"] = conn

# ── scrape group ──────────────────────────────────────────────────────────────

@cli.group()
def scrape():
    """Scrape prompts from image generation platforms."""
    pass

@scrape.command("civitai")
@click.option("--limit", default=200, show_default=True)
@click.option("--tags", default="apparel,t-shirt,illustration", show_default=True)
@click.pass_context
def scrape_civitai(ctx, limit, tags):
    added = civitai.scrape(ctx.obj["conn"], limit=limit, tags=tags)
    click.echo(f"civitai: {added} new prompts added")

@scrape.command("lexica")
@click.option("--query", default="vintage badge merch illustration", show_default=True)
@click.option("--limit", default=100, show_default=True)
@click.pass_context
def scrape_lexica(ctx, query, limit):
    added = lexica.scrape(ctx.obj["conn"], query=query, limit=limit)
    click.echo(f"lexica: {added} new prompts added")

@scrape.command("prompthero")
@click.option("--limit", default=100, show_default=True)
@click.pass_context
def scrape_prompthero(ctx, limit):
    added = prompthero.scrape(ctx.obj["conn"], limit=limit)
    click.echo(f"prompthero: {added} new prompts added")

@scrape.command("openart")
@click.option("--limit", default=100, show_default=True)
@click.pass_context
def scrape_openart(ctx, limit):
    added = openart.scrape(ctx.obj["conn"], limit=limit)
    click.echo(f"openart: {added} new prompts added")

@scrape.command("trends")
@click.option("--category", default=None, help="Scope trends to a product category, e.g. 'sticker'")
@click.pass_context
def scrape_trends(ctx, category):
    added = trends.scrape(ctx.obj["conn"], category=category)
    click.echo(f"trends: {added} niche signals added")

@scrape.command("all")
@click.pass_context
def scrape_all(ctx):
    results = _scrape_all(ctx.obj["conn"])
    for source, count in results.items():
        click.echo(f"{source}: {count} new items added")

# ── export ────────────────────────────────────────────────────────────────────

@cli.command("export")
@click.option("--count", default=20, show_default=True)
@click.option("--niche", default=None)
@click.option("--style", default=None)
@click.option("--category", default=None)
@click.option("--min-popularity", default=0, show_default=True)
@click.option("--priority", default="medium", show_default=True)
@click.option("--start-id", default=62, show_default=True,
              help="Starting sheet id (increment from last sheet row)")
@click.option("--out", default=None, help="Output CSV filename")
@click.option("--allow-reuse", is_flag=True, default=False)
@click.option("--shuffle", is_flag=True, default=False,
              help="Pick rows randomly for variety across niches")
@click.pass_context
def export_cmd(ctx, count, niche, style, category, min_popularity,
               priority, start_id, out, allow_reuse, shuffle):
    try:
        csv_path = _export.export_batch(
            ctx.obj["conn"], count=count, niche=niche, style_tag=style,
            category=category, min_popularity=min_popularity, priority=priority,
            start_id=start_id, out=out, allow_reuse=allow_reuse, shuffle=shuffle,
        )
        click.echo(f"Exported to {csv_path}")
    except (ValueError, OpenAIError) as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ── generate ──────────────────────────────────────────────────────────────────

@cli.command("generate")
@click.option("--niche", required=True, help="Target niche (e.g. cats, coffee, fitness)")
@click.option("--style", required=True, help="Style tag (e.g. vintage-badge, minimal-line)")
@click.option("--count", default=20, show_default=True, help="Number of seeds to generate")
@click.option("--category", default="shirt", show_default=True)
@click.pass_context
def generate_cmd(ctx, niche, style, count, category):
    """Generate concept seeds via GPT for a given niche and style."""
    client = OpenAI(api_key=config.OPENAI_API_KEY)
    try:
        seeds = _generate.generate_seeds(client, niche=niche, style=style,
                                         category=category, count=count)
        added = _generate.store_seeds(ctx.obj["conn"], seeds,
                                      niche=niche, style=style, category=category)
        click.echo(f"generate: {added} new seeds added ({len(seeds)} generated)")
    except (OpenAIError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ── matrix ────────────────────────────────────────────────────────────────────

@cli.command("matrix")
@click.option("--niches", default=None,
              help="Comma-separated niches (default: 15 canonical)")
@click.option("--styles", default=None,
              help="Comma-separated style tags (default: 5 core styles)")
@click.option("--category", default="shirt", show_default=True)
@click.option("--priority", default="medium", show_default=True)
@click.option("--start-id", default=102, show_default=True,
              help="Starting sheet id (should follow last sheet row)")
@click.option("--out", default="matrix_batch.csv", show_default=True,
              help="Output CSV filename")
@click.pass_context
def matrix_cmd(ctx, niches, styles, category, priority, start_id, out):
    """Generate a niche × style matrix — one design per combination."""
    niche_list = [n.strip() for n in niches.split(",")] if niches else _matrix.DEFAULT_NICHES
    style_list = [s.strip() for s in styles.split(",")] if styles else _matrix.DEFAULT_STYLES
    total = len(niche_list) * len(style_list)
    click.echo(f"Building {len(niche_list)} niches × {len(style_list)} styles = {total} rows")
    try:
        _matrix.build_matrix(
            niche_list, style_list,
            category=category, start_id=start_id, priority=priority, out=out,
        )
    except (OpenAIError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)


# ── status ────────────────────────────────────────────────────────────────────

@cli.command("status")
@click.pass_context
def status_cmd(ctx):
    s = _db.get_status(ctx.obj["conn"])
    click.echo(f"\nprompts.db — {s['total']} total prompts")
    for src, info in s["by_source"].items():
        click.echo(f"  {src:<14} {info['count']}  (last scraped: {info['last_scraped']})")
    click.echo(
        f"\nunused: {s['unused']}  |  exported: {s['exported']}  |  batches: {s['batches']}"
    )
    if s["top_niches"]:
        niches_str = " | ".join(f"{n} {c}" for n, c in s["top_niches"].items())
        click.echo(f"\ntop niches (unused): {niches_str}")
    if s["trends"]:
        trends_str = " | ".join(f"{t['niche']} ↑" for t in s["trends"][:3])
        click.echo(f"niche trends: {trends_str}")
    click.echo()
