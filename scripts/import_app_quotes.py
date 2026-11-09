#!/usr/bin/env python3
"""Copy the published quotes from the app's audited content into data/quotes-en.json.

Source: the app repo's English content build, local/audit/content_build/json/en.json.
content_build.py makes it from local/raw-content and keeps the v1 quote IDs.
Run content_build.py in the app repo first if local/raw-content changed.
Like counts come from local/raw-content/ids/likes_v1_seed.json.

The script stops if a published ID is no longer in the app (the audit removed or
merged it), or if its source is only "Attributed…" (no named work). Then remove
that ID from data/quote-publication.json and add a 301 for its page to
website/_redirects.
"""

from __future__ import annotations

import json
from pathlib import Path


PROJECT = Path(__file__).resolve().parent.parent
DATA = PROJECT / "data"
APP_LOCAL = Path.home() / "AndroidStudioProjects/Multiplatform/PhilosophiaMultiplatform/local"
CONTENT = APP_LOCAL / "audit/content_build/json/en.json"
LIKES = APP_LOCAL / "raw-content/ids/likes_v1_seed.json"


def published_ids() -> list[str]:
    manifest = json.loads((DATA / "quote-publication.json").read_text(encoding="utf-8"))
    identifiers = list(manifest["initialQuoteIds"])
    for batch in manifest["monthlyBatches"]:
        identifiers.extend(batch["quoteIds"])
    return identifiers


def main() -> int:
    quotes = {item["id"]: item for item in json.loads(CONTENT.read_text(encoding="utf-8"))["quotes"]}
    likes = json.loads(LIKES.read_text(encoding="utf-8"))["EN"]
    identifiers = published_ids()
    missing = [identifier for identifier in identifiers if identifier not in quotes]
    if missing:
        raise SystemExit(
            f"{len(missing)} published quote IDs are not in the app content:\n" + "\n".join(missing)
        )
    attributed = [
        identifier for identifier in identifiers
        if quotes[identifier]["translations"][0]["source"].startswith("Attributed")
    ]
    if attributed:
        raise SystemExit(
            f"{len(attributed)} published quotes have no named source (Attributed…):\n" + "\n".join(attributed)
        )
    payload = [
        {"id": identifier, "likeCount": likes.get(identifier, 0), "translations": quotes[identifier]["translations"]}
        for identifier in identifiers
    ]
    target = DATA / "quotes-en.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Updated {target.relative_to(PROJECT)} ({len(payload)} quotes from {CONTENT})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
