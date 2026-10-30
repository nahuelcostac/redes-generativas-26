"""Descarga los artículos de Wikipedia que forman la colección de documentos."""

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://es.wikipedia.org/w/api.php"
USER_AGENT = "redes-generativas-26-rag/0.1 (práctica universitaria)"


def fetch_article(title):
    """Devuelve el texto plano y la revisión actual de un artículo."""
    params = {
        "action": "query", "format": "json", "formatversion": "2", "redirects": "1",
        "prop": "extracts|revisions|info", "explaintext": "1", "exsectionformat": "wiki",
        "rvprop": "ids|timestamp", "inprop": "url", "titles": title,
    }
    request = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}",
                                     headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                page = json.load(response)["query"]["pages"][0]
            break
        except urllib.error.HTTPError as error:
            # Wikipedia limita la frecuencia de peticiones. Se espera y se repite.
            if error.code != 429 or attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))
    if page.get("missing") or not page.get("extract", "").strip():
        raise ValueError(f"No se encontró el artículo «{title}».")
    revision = page["revisions"][0]
    return {
        "title": page["title"],
        "url": f"{page['fullurl']}?oldid={revision['revid']}",
        "revision": revision["revid"],
        "revision_timestamp": revision["timestamp"],
        "text": page["extract"].strip(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--titles", default="articles.json",
                        help="JSON con la lista de títulos y sus identificadores.")
    parser.add_argument("--output", default="../results/documents.json")
    args = parser.parse_args()
    articles = json.loads(Path(args.titles).read_text(encoding="utf-8"))
    documents = []
    for article in articles:
        document = {"id": article["id"], **fetch_article(article["title"])}
        documents.append(document)
        time.sleep(2)
        print(f"{document['id']}: {document['title']} ({len(document['text'].split())} palabras)")
    data = {
        "source": "Wikipedia en español",
        "license": "CC BY-SA 4.0",
        "license_url": "https://creativecommons.org/licenses/by-sa/4.0/deed.es",
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "documents": documents,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
