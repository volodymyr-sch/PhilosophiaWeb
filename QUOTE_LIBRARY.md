# Philosophia quote publishing

The static quote library is generated from the English backend snapshots in
`data/`. The API key is not stored in this repository or in the generated site.

## Initial publication

Run:

```sh
python3 scripts/generate_quote_library.py --publish-due 2026-07-23
python3 scripts/validate_site.py
```

The initial release contains 150 quote pages: ten named-source records for each
of 15 philosophers. Selection is deterministic and considers source
specificity, duplicate text, readable length, popularity, source diversity, and
balanced philosopher coverage.

## Local catalog and manual updates

The selected content is stored as JSON snapshots in `data/`; there is no local
database and no scheduled publishing automation. `data/quotes-en.json` contains
only the 150 records used by the website, rather than the complete backend
catalog. The current website remains fixed at those 150 quote pages until a
manual content update is requested.

Refresh the snapshots when backend content changes:

```sh
PHILOSOPHIA_API_KEY="…" python3 scripts/fetch_quote_catalog.py
python3 scripts/generate_quote_library.py
python3 scripts/validate_site.py
```

## Editorial policy

- A backend source label is a discovery aid, not a complete scholarly citation.
- Every quote page says when translator, edition, page, or section data is
  absent.
- “Attributed…” and generic-source records are excluded from the ranked release
  queue.
- Quote pages use one of four reading lenses—resilience, self-knowledge,
  virtue, or happiness—to add practical questions without claiming that one
  sentence represents an author’s full philosophy.
- Academic use should verify wording in a complete edition and cite that edition
  directly.
