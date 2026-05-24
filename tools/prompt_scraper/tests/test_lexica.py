from scrapers.lexica import parse_images

SAMPLE_IMAGES = [
    {
        "id": "aaa",
        "src": "https://image.lexica.art/aaa.jpg",
        "prompt": "vintage badge illustration hiking mountain national park",
        "nsfw": False,
    },
    {
        "id": "bbb",
        "src": "https://image.lexica.art/bbb.jpg",
        "prompt": "",  # empty prompt — skip
        "nsfw": False,
    },
    {
        "id": "ccc",
        "src": "https://image.lexica.art/ccc.jpg",
        "prompt": "cute dog pixel art t-shirt sticker",
        "nsfw": True,  # nsfw — skip
    },
    {
        "id": "ddd",
        "src": "https://image.lexica.art/ddd.jpg",
        "prompt": "watercolor cat celestial mystical illustration",
        "nsfw": False,
    },
]

def test_parse_images_skips_empty_prompt():
    results = parse_images(SAMPLE_IMAGES)
    ids = [r["source_id"] for r in results]
    assert "bbb" not in ids

def test_parse_images_skips_nsfw():
    results = parse_images(SAMPLE_IMAGES)
    ids = [r["source_id"] for r in results]
    assert "ccc" not in ids

def test_parse_images_keeps_valid():
    results = parse_images(SAMPLE_IMAGES)
    assert len(results) == 2

def test_parse_images_extracts_prompt():
    results = parse_images(SAMPLE_IMAGES)
    assert results[0]["raw_prompt"] == "vintage badge illustration hiking mountain national park"

def test_parse_images_maps_niche():
    results = parse_images(SAMPLE_IMAGES)
    hiking = next(r for r in results if r["source_id"] == "aaa")
    assert hiking["niche"] == "hiking"

def test_parse_images_maps_style_tag():
    results = parse_images(SAMPLE_IMAGES)
    badge = next(r for r in results if r["source_id"] == "aaa")
    assert badge["style_tag"] == "vintage-badge"

def test_parse_images_no_popularity():
    results = parse_images(SAMPLE_IMAGES)
    assert results[0]["popularity"] == 0
