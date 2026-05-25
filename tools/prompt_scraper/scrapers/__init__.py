import sqlite3
from . import civitai, lexica, prompthero, openart, trends


def scrape_all(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "civitai":    civitai.scrape(conn),
        "lexica":     lexica.scrape(conn),
        "prompthero": prompthero.scrape(conn),
        "openart":    openart.scrape(conn),
        "trends":     trends.scrape(conn),
    }
