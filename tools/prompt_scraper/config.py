import os
from typing import Optional

OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
CIVITAI_API_BASE: str = "https://civitai.com/api/v1"
LEXICA_API_BASE: str = "https://lexica.art/api/v1"
REQUEST_TIMEOUT: int = 30
REQUEST_DELAY: float = 1.0  # seconds between paginated requests

# Keys are lowercase substrings to match against source tags.
# First match wins — order from most specific to least.
NICHE_TAG_MAP: dict[str, str] = {
    "nurse": "nurses",
    "nursing": "nurses",
    "medical": "nurses",
    "healthcare": "nurses",
    "teacher": "teachers",
    "classroom": "teachers",
    "education": "teachers",
    "dog": "dogs",
    "puppy": "dogs",
    "canine": "dogs",
    "cat": "cats",
    "kitten": "cats",
    "feline": "cats",
    "pet": "pets",
    "astrology": "astrology",
    "zodiac": "astrology",
    "celestial": "astrology",
    "horoscope": "astrology",
    "gaming": "gaming",
    "gamer": "gaming",
    "video game": "gaming",
    "hiking": "hiking",
    "mountain": "hiking",
    "trail": "hiking",
    "outdoor": "hiking",
    "coffee": "coffee",
    "espresso": "coffee",
    "cafe": "coffee",
    "fitness": "fitness",
    "gym": "fitness",
    "workout": "fitness",
}

STYLE_TAG_MAP: dict[str, str] = {
    "vintage badge": "vintage-badge",
    "retro badge": "vintage-badge",
    "badge": "vintage-badge",
    "vintage": "vintage-badge",
    "retro surf": "retro-surf",
    "surf": "retro-surf",
    "wave": "retro-surf",
    "woodcut": "woodcut-emblem",
    "linocut": "woodcut-emblem",
    "block print": "woodcut-emblem",
    "engraving": "vintage-engraving",
    "etching": "vintage-engraving",
    "pixel art": "retro-pixel",
    "8-bit": "retro-pixel",
    "sticker": "sticker",
    "kawaii": "kawaii",
    "chibi": "kawaii",
    "celestial": "celestial-mystical",
    "mystical": "celestial-mystical",
    "sacred geometry": "celestial-mystical",
    "art nouveau": "art-nouveau",
    "cyberpunk": "cyberpunk-neon",
    "neon": "cyberpunk-neon",
    "watercolor": "watercolor",
    "minimal": "minimal-line",
    "line art": "minimal-line",
    "flat": "flat-vector",
    "vector": "flat-vector",
    "typography": "typography-humor",
    "lettering": "typography-humor",
}

def map_niche(tags: list[str]) -> Optional[str]:
    for tag in tags:
        tag_lower = tag.lower()
        for key, niche in NICHE_TAG_MAP.items():
            if key in tag_lower:
                return niche
    return None

def map_style_tag(tags: list[str]) -> Optional[str]:
    for tag in tags:
        tag_lower = tag.lower()
        for key, style in STYLE_TAG_MAP.items():
            if key in tag_lower:
                return style
    return None
