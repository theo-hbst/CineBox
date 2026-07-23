from __future__ import annotations
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parent
PORT = 8000
DATA_FILE = ROOT / 'popular_movies.json'


def fetch_moviemeter_movies(limit: int = 100) -> dict:
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
        'query': query,
        'variables': {
            'first': limit,
            'sort': {
                'sortBy': 'POPULARITY',
                'sortOrder': 'ASC',
            },
        },
    }

    headers = {
        'content-type': 'application/json',
        'origin': 'https://www.imdb.com',
        'referer': 'https://www.imdb.com/fr/chart/moviemeter/',
        'user-agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ),
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
    }

    response = requests.post('https://api.graphql.imdb.com/', headers=headers, json=payload, timeout=30)
    response.raise_for_status()
    data = response.json()
    edges = data.get('data', {}).get('chartTitles', {}).get('edges', [])

    results = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue

        node = edge.get('node', {}) or {}
        title_text = node.get('titleText', {}).get('text') if isinstance(node.get('titleText'), dict) else None
        release_year = node.get('releaseYear', {}).get('year') if isinstance(node.get('releaseYear'), dict) else None
        poster = node.get('primaryImage', {}).get('url') if isinstance(node.get('primaryImage'), dict) else None
        title_id = node.get('id')

        if not title_id or not title_text:
            continue

        results.append({
            'id': title_id,
            'name': title_text,
            'year': release_year,
            'poster': poster,
            'url': f'https://www.imdb.com/title/{title_id}/',
            'rank': edge.get('currentRank'),
        })

    return {
        'result_count': len(results),
        'results': results,
    }


def write_data_file() -> None:
    movies = fetch_moviemeter_movies()
    DATA_FILE.write_text(json.dumps(movies, indent=2, ensure_ascii=False), encoding='utf-8')


class DemoHandler(BaseHTTPRequestHandler):
    def _send(self, status_code: int, content_type: str, body: bytes) -> None:
        self.send_response(status_code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split('?', 1)[0]

        if path in ('/', '/index.html'):
            body = (ROOT / 'index.html').read_bytes()
            self._send(200, 'text/html; charset=utf-8', body)
            return

        if path == '/styles.css':
            body = (ROOT / 'styles.css').read_bytes()
            self._send(200, 'text/css; charset=utf-8', body)
            return

        if path == '/app.js':
            body = (ROOT / 'app.js').read_bytes()
            self._send(200, 'application/javascript; charset=utf-8', body)
            return

        if path == '/popular_movies.json':
            if not DATA_FILE.exists():
                write_data_file()
            body = DATA_FILE.read_bytes()
            self._send(200, 'application/json; charset=utf-8', body)
            return

        self._send(404, 'text/plain; charset=utf-8', b'Not Found')

    def do_POST(self) -> None:  # noqa: N802
        if self.path == '/refresh':
            try:
                write_data_file()
                body = json.dumps({'ok': True}).encode('utf-8')
                self._send(200, 'application/json; charset=utf-8', body)
            except Exception as exc:  # pragma: no cover - user-facing demo path
                body = json.dumps({'ok': False, 'error': str(exc)}).encode('utf-8')
                self._send(500, 'application/json; charset=utf-8', body)
            return

        self._send(404, 'text/plain; charset=utf-8', b'Not Found')


if __name__ == '__main__':
    write_data_file()
    print(f'Serving demo on http://localhost:{PORT}')
    ThreadingHTTPServer(('localhost', PORT), DemoHandler).serve_forever()