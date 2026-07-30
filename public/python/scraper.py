"""
public/python/scraper.py
Fetches the 24 currently most popular movies on IMDb and writes them to public/json/scrapedMoviesTemp.json.
"""

import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_FILE = ROOT / "public" / "json" / "scrapedMoviesTemp.json"

LIMIT = 24  # 24 first movies


def fetch_moviemeter_movies(limit: int = LIMIT) -> dict:
    query = """query MoviemeterChart($first: Int!, $sort: AdvancedTitleSearchSort) {
    chartTitles(first: $first, chart: { chartType: MOST_POPULAR_MOVIES }, sort: $sort) {
        edges {
            currentRank
            node {
                id
                titleText { text }
                releaseYear { year }
                primaryImage { url }
            }
        }
    }
}"""

    payload = {
        "query": query,
        "variables": {
            "first": limit,
            "sort": {"sortBy": "POPULARITY", "sortOrder": "ASC"},
        },
    }

    headers = {
        "content-type": "application/json",
        "origin": "https://www.imdb.com",
        "referer": "https://www.imdb.com/fr/chart/moviemeter/",
        "user-agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    }

    response = requests.post(
        "https://api.graphql.imdb.com/", headers=headers, json=payload, timeout=30
    )
    response.raise_for_status()
    data = response.json()
    edges = data.get("data", {}).get("chartTitles", {}).get("edges", [])

    results = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue

        node = edge.get("node", {}) or {}
        title_text = node.get("titleText", {}).get("text") if isinstance(node.get("titleText"), dict) else None
        release_year = node.get("releaseYear", {}).get("year") if isinstance(node.get("releaseYear"), dict) else None
        poster = node.get("primaryImage", {}).get("url") if isinstance(node.get("primaryImage"), dict) else None
        title_id = node.get("id")

        if not title_id or not title_text:
            continue

        results.append({
            "id": title_id,
            "name": title_text,
            "year": release_year,
            "poster": poster,
            "url": f"https://www.imdb.com/title/{title_id}/",
            "rank": edge.get("currentRank"),
        })

    return {"result_count": len(results), "results": results}


def main() -> int:
    try:
        movies = fetch_moviemeter_movies(LIMIT)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(movies, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Wrote {movies['result_count']} movies to {OUTPUT_FILE}")
    print("SCRAPING_COMPLETE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
