"""Descarga los artículos de Wikipedia que forman la colección de ejemplo."""

import argparse
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://es.wikipedia.org/w/api.php"
USER_AGENT = "redes-generativas-26-rag/1.0 (https://github.com/nahuelcostac/redes-generativas-26)"
LICENSE = "CC BY-SA 4.0"
# Secciones sin contenido útil para responder preguntas.
SKIPPED_SECTIONS = {"referencias", "notas", "bibliografía", "enlaces externos", "véase también",
                    "fuentes", "lecturas adicionales", "obras", "publicaciones"}


def clean(text):
    """Elimina las secciones de referencias y normaliza los saltos de línea."""
    kept, skipping = [], False
    # Wikipedia deja espacios de ancho cero donde estaban las notas.
    for line in text.replace("​", "").splitlines():
        heading = re.fullmatch(r"(={2,})\s*(.*?)\s*\1", line.strip())
        if heading:
            level = len(heading.group(1))
            if level == 2:
                skipping = heading.group(2).lower() in SKIPPED_SECTIONS
            if not skipping:
                kept.append("#" * (level - 1) + " " + heading.group(2))
            continue
        if not skipping:
            kept.append(line.strip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()


def fetch(title):
    params = {"action": "query", "format": "json", "formatversion": "2", "redirects": "1",
              "prop": "extracts|revisions", "explaintext": "1", "exsectionformat": "wiki",
              "rvprop": "ids|timestamp", "titles": title}
    request = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}",
                                     headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        page = json.load(response)["query"]["pages"][0]
    if page.get("missing") or not page.get("extract"):
        raise ValueError(f"No se encontró el artículo {title}.")
    revision = page["revisions"][0]
    return {
        "title": page["title"],
        "url": f"https://es.wikipedia.org/w/index.php?oldid={revision['revid']}",
        "revision": revision["revid"],
        "revision_timestamp": revision["timestamp"],
        "license": LICENSE,
        "text": clean(page["extract"]),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--titles", type=Path, default=Path("documents.txt"),
                        help="Archivo con un título de Wikipedia en español por línea.")
    parser.add_argument("--output", type=Path, default=Path("../results/documents.json"))
    args = parser.parse_args()
    titles = [line.strip() for line in args.titles.read_text(encoding="utf-8").splitlines()
              if line.strip() and not line.startswith("#")]
    documents = []
    for index, title in enumerate(titles, 1):
        document = fetch(title)
        documents.append({"id": f"doc-{index}", **document})
        print(f"{document['title']} · revisión {document['revision']} · "
              f"{len(document['text'])} caracteres")
    data = {"source": "Wikipedia en español", "license": LICENSE,
            "retrieved_at": datetime.now(timezone.utc).isoformat(), "documents": documents}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
