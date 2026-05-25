__all__ = ["scrape_all"]


def __getattr__(name):
    if name == "scrape_all":
        from .scrapers import scrape_all
        return scrape_all
    raise AttributeError(name)
