from scrapers.civitai import parse_items

SAMPLE_ITEMS = [
    {
        "id": 111,
        "url": "https://image.civitai.com/abc.jpg",
        "meta": {
            "prompt": "a beautiful vintage badge illustration of a mountain",
            "negativePrompt": "blurry, nsfw",
        },
        "tags": [{"name": "illustration"}, {"name": "badge"}, {"name": "mountain"}],
        "stats": {"likeCount": 45, "heartCount": 20, "downloadCount": 300},
    },
    {
        "id": 222,
        "url": "https://image.civitai.com/def.jpg",
        "meta": None,  # no prompt — should be skipped
        "tags": [],
        "stats": {"likeCount": 5, "heartCount": 2, "downloadCount": 10},
    },
    {
        "id": 333,
        "url": "https://image.civitai.com/ghi.jpg",
        "meta": {"prompt": "cute dog pixel art t-shirt design"},
        "tags": [{"name": "pixel art"}, {"name": "dog"}],
        "stats": {"likeCount": 100, "heartCount": 80, "downloadCount": 500},
    },
]

def test_parse_items_skips_no_meta():
    results = parse_items(SAMPLE_ITEMS)
    assert len(results) == 2

def test_parse_items_extracts_prompt():
    results = parse_items(SAMPLE_ITEMS)
    assert results[0]["raw_prompt"] == "a beautiful vintage badge illustration of a mountain"

def test_parse_items_maps_source_id():
    results = parse_items(SAMPLE_ITEMS)
    assert results[0]["source_id"] == "111"

def test_parse_items_maps_source_url():
    results = parse_items(SAMPLE_ITEMS)
    assert results[0]["source_url"] == "https://image.civitai.com/abc.jpg"

def test_parse_items_sums_popularity():
    results = parse_items(SAMPLE_ITEMS)
    # item 111: likeCount(45) + heartCount(20) = 65
    assert results[0]["popularity"] == 65

def test_parse_items_maps_niche_from_tags():
    results = parse_items(SAMPLE_ITEMS)
    # item 333 has "dog" tag
    dog_item = next(r for r in results if r["source_id"] == "333")
    assert dog_item["niche"] == "dogs"

def test_parse_items_maps_style_from_tags():
    results = parse_items(SAMPLE_ITEMS)
    badge_item = next(r for r in results if r["source_id"] == "111")
    assert badge_item["style_tag"] == "vintage-badge"

def test_parse_items_tags_as_json_list():
    import json
    results = parse_items(SAMPLE_ITEMS)
    tags = json.loads(results[0]["tags"])
    assert "illustration" in tags
