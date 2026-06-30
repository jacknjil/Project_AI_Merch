#!/usr/bin/env python3
"""Generate the 2026-trends concept batch CSV for the n8n Asset Generation sheet.

Source: /home/ibjjr/Downloads/tshirt_trends_2026.pdf (T-Shirt Market Trends 2026).
Output: tools/sheet_batch_trends2026.csv -- 24 generation-ready concept rows,
ids 245-268, matching the live Sheet1 20-column schema.

Conventions (from existing batches + n8n prompt-engineering notes):
  - concept: rich, composed description; explicit composition; anti-text where
    the design is not text-led; kept under ~850 chars.
  - styleTag: the variant lever.
  - colorPalette: earthy per the PDF design rule (rust/sage/terracotta on
    cream/sand); deliberate bold exceptions only for Y2K (PDF: "bold colors").
  - product_category=shirt, size=1024x1024, live-mode=FALSE.
  - n8n_status=blank (STAGED -- flip to "todo" to generate).
  - notes=trends2026-batch.
Dev-stage artifact: edit ROWS below and re-run to regenerate.
"""
import csv

HEADER = [
    "id", "rowId", "title", "niche", "concept", "styleTag", "colorPalette",
    "product_category", "size", "priority", "live-mode", "n8n_status",
    "n8n_error", "assetIds", "imageUrl", "firebaseProductId", "published",
    "lastRun", "retryCount", "notes",
]

# (title, niche, concept, styleTag, colorPalette, priority)
ROWS = [
    # --- Mental health awareness  [HOT +200%/3yr] ---
    ("It's Okay To Not Be Okay Hand-Lettered Tee", "mental-health",
     "Centered text-forward design with the phrase 'It's Okay To Not Be Okay' in warm hand-lettered organic script, gently arched over a small line-art sprig of wildflowers. A thin underline flourish anchors the words and a tiny heart dots the final letter, creating a comforting, supportive feel without clutter or extra graphics.",
     "hand-lettered", "cream, sage green, terracotta", "high"),
    ("Boundaries Are A Love Language Tee", "mental-health",
     "Centered hand-lettered composition reading 'Boundaries Are A Love Language' in relaxed mixed serif-and-script typography, framed by a simple open laurel of small leaves. Calm, balanced layout with generous negative space, evoking gentle therapy-culture affirmation; no additional imagery or busy elements.",
     "hand-lettered", "sand, dusty rose, muted clay", "high"),

    # --- Niche hobbies + micro-niche intersections  [60-65% margin] ---
    ("Powered By Coffee And Cats Badge Tee", "cats-coffee",
     "Centered vintage badge combining two passions: a cozy cat curled around a steaming coffee mug inside a circular rope border. The arched top band reads 'Powered By Coffee And Cats' in weathered block lettering, with a small coffee-bean motif anchoring the bottom, blending feline and cafe identities in a classic stamp aesthetic.",
     "vintage-badge", "cream, espresso brown, muted gold", "high"),
    ("Certified Plant Person Botanical Tee", "gardening",
     "Centered illustrated arrangement of potted houseplants -- monstera, trailing pothos, and a small succulent -- on a single shelf line, with the hand-lettered phrase 'Certified Plant Person' tucked beneath in organic script. Detailed leaf linework gives a botanical-journal feel in a balanced, uncluttered composition.",
     "cottagecore", "cream, forest green, terracotta", "high"),
    ("Adventure Buddy Hike More Vintage Tee", "hiking-dogs",
     "Centered vintage outdoor emblem featuring a dog standing beside a pine-tree mountain scene inside a rounded badge. The banner above reads 'Adventure Buddy' and the lower arc reads 'Hike More, Worry Less' in distressed serif lettering, merging trail-life and dog-lover identities with a retro national-park feel.",
     "vintage-badge", "sand, pine green, rust", "high"),

    # --- Custom pet portrait / dog breed-specific ---
    ("Corgi Mom Retro Sunset Tee", "dogs",
     "Centered retro design featuring a cheerful corgi silhouette in front of a tiered 1970s-style sunset of horizontal stripes, all enclosed in a rounded-rectangle badge. The phrase 'Corgi Mom' sits below in groovy rounded vintage lettering, delivering a warm nostalgic dog-lover vibe.",
     "retro-sunset", "cream, burnt orange, mustard, dusty teal", "high"),
    ("Just A Girl Who Loves Cats Line Tee", "cats",
     "Centered line-art illustration of three different cat faces stacked in a neat column, each with subtle personality, above the hand-lettered phrase 'Just A Girl Who Loves Cats.' Minimal single-color linework with a friendly modern feel and clean negative space.",
     "line-art", "cream, charcoal, dusty rose", "high"),

    # --- Vintage / retro bootleg ---
    ("Self-Care World Tour Bootleg Tee", "vintage",
     "Bootleg rap-tee inspired layout with a large central distressed sunburst inside a photo-style frame, surrounded by scattered text reading 'Self-Care World Tour 2026' and a faux back-print list of cities. Heavy grunge texture, oversized varsity-meets-graffiti typography, and a worn vintage-merch aesthetic.",
     "retro-bootleg", "washed black, cream, faded red", "medium"),
    ("Good Vibes Only Distressed Retro Tee", "vintage",
     "Centered retro typographic design with 'Good Vibes Only' in bold 1970s bubble lettering set against a faded distressed sunburst of radiating lines. Subtle cracked-ink texture gives an authentic worn vintage-tee look; balanced and symmetrical with a sunny nostalgic mood.",
     "vintage-distressed", "tan, burnt orange, cream", "medium"),

    # --- Retro sports / 2026 World Cup  [SURGING / EARLY MOVER] ---
    ("Hometown Varsity Athletics Tee", "retro-sports",
     "Centered collegiate varsity design featuring a large block letter 'H' with a small football and basketball crossed beneath it, framed by an arched 'Hometown Athletics' banner above and 'Est. 1926' below in distressed varsity serif. Classic vintage-sports feel with collegiate stitching texture.",
     "varsity", "cream, navy blue, athletic gold", "high"),
    ("Pride And Glory 2026 Soccer Crest Tee", "soccer",
     "Centered vintage soccer crest with a detailed soccer ball at the center inside a heraldic shield, flanked by laurel branches and topped by a star. The banner reads 'Football 2026' above and 'Pride & Glory' below in distressed varsity lettering, evoking World Cup country-pride spirit in a retro-sports style.",
     "vintage-badge", "cream, deep red, navy, gold", "high"),

    # --- AI & tech humor  [RISING] ---
    ("404 Motivation Not Found Tee", "tech-humor",
     "Centered minimalist tech-humor design with '404: Motivation Not Found' displayed like a browser error message in clean monospace typography, set inside a simple rounded dialog-box outline with a small broken-plug icon above. Crisp, modern, single-accent layout with abundant negative space.",
     "minimalist", "cream, charcoal, muted teal", "medium"),
    ("Too Many Tabs Open Tee", "tech-humor",
     "Centered design illustrating a row of overlapping browser-tab shapes stacking off the edge, with the hand-lettered phrase 'My Brain Has Too Many Tabs Open' beneath. Playful flat-illustration style with subtle line detail and a balanced, relatable composition.",
     "line-art", "cream, slate blue, muted orange", "medium"),

    # --- Cottagecore / botanical  [RISING] ---
    ("Stay Wild Cottagecore Mushroom Tee", "cottagecore",
     "Centered botanical illustration of a cluster of toadstool mushrooms surrounded by ferns, tiny wildflowers, and a curling vine arch, with delicate hand-lettered text 'Stay Wild' tucked into the lower arch. Detailed storybook linework with soft shading for a cozy cottagecore-forest mood.",
     "cottagecore", "sage green, cream, dusty mauve, soft brown", "medium"),
    ("Celestial Pressed Botanical Tee", "cottagecore",
     "Centered symmetrical arrangement of pressed wildflowers and ferns framing a fine line-art crescent moon and scattered stars. Delicate botanical-and-celestial linework with an airy, ethereal balance and generous negative space, evoking a dreamy cottagecore aesthetic.",
     "line-art", "cream, dusty blue, sage, muted gold", "medium"),

    # --- Y2K / nostalgia revival  [SUSTAINED]  (bold colors per PDF) ---
    ("Y2K Butterfly Cutie Baby Tee", "y2k",
     "Centered Y2K-revival graphic with a glossy gradient butterfly above bubbly chrome-style lettering reading 'Cutie 2000,' framed by sparkle stars and tiny heart accents. Bold early-2000s aesthetic with playful retro shine; eye-catching and nostalgic for Gen Z.",
     "y2k", "baby pink, lilac, silver, sky blue", "medium"),
    ("Loading Vibes 2000s Cyber Heart Tee", "y2k",
     "Centered 2000s-kitsch design featuring a pixelated cyber heart with a glossy gradient finish, surrounded by orbiting stars and the chrome bubble phrase 'Loading Vibes...' with a small progress-bar motif beneath. Bold nostalgic early-internet aesthetic with playful shine.",
     "y2k", "electric blue, hot pink, silver, white", "medium"),

    # --- Minimalist typography ---
    ("Minimalist Mountain Line Tee", "outdoor",
     "Centered single continuous-line illustration of a mountain range with a small sun arc above, rendered in one unbroken minimalist stroke. Clean, modern, and calm with abundant negative space; no text, letting the elegant geometric linework stand alone.",
     "minimalist", "cream, charcoal, terracotta", "medium"),
    ("Take It Slow Minimalist Tee", "minimalist",
     "Centered minimalist typographic design with the lowercase phrase 'take it slow' in a clean hand-lettered serif, underlined by a single thin wavy line. Lots of negative space and an earthy calm tone; understated and modern for everyday wear.",
     "minimalist", "sand, muted clay, sage", "medium"),

    # --- Funny / sarcastic ---
    ("Caffeine And Sarcasm Vintage Tee", "sarcastic",
     "Centered typographic design reading 'Powered By Caffeine & Sarcasm' in bold condensed vintage lettering, with a small steaming coffee cup replacing the ampersand's loop. Slightly distressed texture and a dry-humor tone; balanced and instantly readable.",
     "vintage-distressed", "cream, espresso brown, muted red", "medium"),
    ("Professional Overthinker Tee", "funny",
     "Centered humorous design with 'Professional Overthinker' in playful bold lettering above a small tangled-scribble brain illustration, with a tiny 'est. always' tag beneath. Relatable everyday-humor tone in a clean layout with a single line-art accent.",
     "line-art", "cream, charcoal, mustard", "medium"),

    # --- Zodiac/astrology + Faith/inspirational  (steady) ---
    ("Celestial Zodiac Constellation Tee", "astrology",
     "Centered celestial design featuring a fine line-art zodiac constellation connected by thin lines and dotted stars, encircled by a delicate ring with small sun and moon symbols at the cardinal points. Elegant mystical linework with airy negative space.",
     "line-art", "midnight navy, cream, muted gold", "low"),
    ("Faith Over Fear Hand-Lettered Tee", "faith",
     "Centered hand-lettered design reading 'Faith Over Fear' in flowing script with a small line-art cross integrated into the lettering and a simple sprig of olive branch beneath. Warm, uplifting, and uncluttered with a gentle inspirational tone.",
     "hand-lettered", "cream, warm taupe, sage", "low"),

    # --- Occasion-led (Nurses Week / occupation) ---
    ("Nurse Life Vintage Badge Tee", "occupation",
     "Centered vintage badge celebrating nurses, featuring a caduceus-and-heartbeat-line emblem inside a circular rope border. The arched top reads 'Nurse Life' and the lower banner reads 'Caring Since Day One' in classic distressed serif lettering, styled as a timeless occupation tribute for Nurses Week gifting.",
     "vintage-badge", "cream, teal, muted coral", "medium"),
]

START_ID = 245
NOTES = "trends2026-batch"


def _row(i, title, niche, concept, style, palette, priority):
    rid = START_ID + i
    assert len(concept) <= 850, f"concept for id {rid} exceeds 850 chars ({len(concept)})"
    return [
        rid, rid, title, niche, concept, style, palette,
        "shirt", "1024x1024", priority, "FALSE", "",  # n8n_status blank = staged
        "", "", "", "", "", "", "0", NOTES,
    ]


def main() -> None:
    # CSV (File > Import in Google Sheets) and TSV (paste straight into cells --
    # tabs land each field in its own column, no "split text to columns" needed).
    targets = [
        ("tools/sheet_batch_trends2026.csv", ","),
        ("tools/sheet_batch_trends2026.tsv", "\t"),
    ]
    for out_path, delim in targets:
        with open(out_path, "w", newline="") as f:
            w = csv.writer(f, delimiter=delim, quoting=csv.QUOTE_MINIMAL)
            w.writerow(HEADER)
            for i, row in enumerate(ROWS):
                w.writerow(_row(i, *row))
        print(f"Wrote {len(ROWS)} rows (ids {START_ID}-{START_ID + len(ROWS) - 1}) to {out_path}")


if __name__ == "__main__":
    main()
