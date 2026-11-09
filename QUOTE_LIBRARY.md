# Philosophia quote publishing

The static quote library is generated from the JSON snapshots in `data/`.

- `data/quotes-en.json`: the published quotes, copied from the app's audited
  content (`local/raw-content` in the app repo). Never use the v1 back end.
- `data/philosophers-en.json`, `data/philosophies-en.json`: biographies and
  schools, a fixed v1 snapshot from July 2026.
- `data/quote-publication.json`: the IDs of the published quotes.

## Initial publication

The initial release (2026-07-23) had 150 quote pages: ten named-source records
for each of 15 philosophers. Selection was deterministic and considered source
specificity, duplicate text, readable length, popularity, source diversity, and
balanced philosopher coverage.

On 2026-11-08 the site was checked against the app's quote audit. 39 pages
showed lines that the audit removed (fake, misattributed, templated, or
duplicate). 25 more pages kept their line, but the audit left it with only an
“Attributed…” source, so they had no named work. All 64 IDs were removed from
`data/quote-publication.json` (86 pages stay), and `website/_redirects` sends
each old URL to the best page with a 301. Then 12 new quotes were added with
the same selection rules, so each philosopher has at least 6 pages (98 pages).

## Update the quotes

Do this when the app's quote content changes:

1. In the app repo, run `local/audit/scripts/content_build.py` if
   `local/raw-content` changed.
2. Run the import and the generator:

```sh
python3 scripts/import_app_quotes.py
python3 scripts/generate_quote_library.py --publish-due 2026-07-23
```

`--publish-due 2026-07-23` keeps the current set of pages. Without it, the
generator tries to add monthly batches of 20 quotes and stops, because
`data/quotes-en.json` holds only the published quotes.

If the import stops with a list of IDs, the audit removed or merged those
quotes. Remove the IDs from `data/quote-publication.json`. Add a 301 for each old
page to `website/_redirects`. Then run the import again.

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
