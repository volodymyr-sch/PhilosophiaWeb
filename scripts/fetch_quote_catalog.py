#!/usr/bin/env python3
"""Refresh the local English Philosophia content snapshots.

Set PHILOSOPHIA_API_KEY in the environment. The key is intentionally never
written to the repository or generated website.
"""

from __future__ import annotations

import json
import os
import tempfile
import urllib.request
from pathlib import Path


PROJECT = Path(__file__).resolve().parent.parent
DATA = PROJECT / "data"
BASE_URL = "https://mob.vlsch-serenity.org"
ENDPOINTS = {
    "quotes-en.json": "/quote?language=en",
    "philosophers-en.json": "/philosophers?language=en",
    "philosophies-en.json": "/philosophies?language=en",
}


def selected_quote_ids() -> set[str]:
    manifest_path = DATA / "quote-publication.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    identifiers = set(manifest.get("initialQuoteIds", []))
    for batch in manifest.get("monthlyBatches", []):
        identifiers.update(batch.get("quoteIds", []))
    return identifiers


def main() -> int:
    api_key = os.environ.get("PHILOSOPHIA_API_KEY")
    if not api_key:
        raise SystemExit("PHILOSOPHIA_API_KEY is required.")

    DATA.mkdir(parents=True, exist_ok=True)
    quote_ids = selected_quote_ids()
    for filename, endpoint in ENDPOINTS.items():
        request = urllib.request.Request(
            BASE_URL + endpoint,
            headers={"X-API-Key": api_key, "Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
        if filename == "quotes-en.json":
            payload = [item for item in payload if item.get("id") in quote_ids]
            retained_ids = {item.get("id") for item in payload}
            missing_ids = quote_ids - retained_ids
            if missing_ids:
                raise RuntimeError(
                    f"The backend response is missing {len(missing_ids)} selected quote records."
                )
        target = DATA / filename
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=DATA, delete=False
        ) as temporary:
            json.dump(payload, temporary, ensure_ascii=False, separators=(",", ":"))
            temporary.write("\n")
            temporary_path = Path(temporary.name)
        temporary_path.replace(target)
        print(f"Updated {target.relative_to(PROJECT)} ({len(payload)} records)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
