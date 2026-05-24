from config import map_niche, map_style_tag

def test_map_niche_nurse():
    assert map_niche(["nurse", "healthcare"]) == "nurses"

def test_map_niche_dog():
    assert map_niche(["dog", "puppy"]) == "dogs"

def test_map_niche_gaming():
    assert map_niche(["gamer", "pixel art"]) == "gaming"

def test_map_niche_astrology():
    assert map_niche(["zodiac", "celestial"]) == "astrology"

def test_map_niche_hiking():
    assert map_niche(["hiking", "mountain trail"]) == "hiking"

def test_map_niche_unknown_returns_none():
    assert map_niche(["random", "stuff"]) is None

def test_map_niche_empty_returns_none():
    assert map_niche([]) is None

def test_map_style_tag_vintage():
    assert map_style_tag(["vintage badge", "retro"]) == "vintage-badge"

def test_map_style_tag_pixel():
    assert map_style_tag(["pixel art", "8-bit"]) == "retro-pixel"

def test_map_style_tag_celestial():
    assert map_style_tag(["celestial", "sacred geometry"]) == "celestial-mystical"

def test_map_style_tag_minimal():
    assert map_style_tag(["minimal", "line art"]) == "minimal-line"

def test_map_style_tag_unknown_returns_none():
    assert map_style_tag(["blah"]) is None
