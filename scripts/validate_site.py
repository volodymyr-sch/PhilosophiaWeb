#!/usr/bin/env python3
"""Static checks for the generated Philosophia website."""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit

from lxml import html


ROOT = (Path(__file__).resolve().parent.parent / "website").resolve()


def main() -> int:
    files = sorted(ROOT.rglob("*.html"))
    errors: list[str] = []
    titles: dict[str, Path] = {}
    canonicals: dict[str, Path] = {}
    document_cache: dict[Path, html.HtmlElement] = {}

    def document(path: Path) -> html.HtmlElement:
        if path not in document_cache:
            document_cache[path] = html.fromstring(path.read_text(encoding="utf-8"))
        return document_cache[path]

    for path in files:
        rel = path.relative_to(ROOT)
        try:
            doc = document(path)
        except Exception as exc:  # pragma: no cover - diagnostic script
            errors.append(f"{rel}: parse error: {exc}")
            continue

        if doc.get("lang") != "en-US":
            errors.append(f"{rel}: missing lang=en-US")

        title = "".join(doc.xpath("//title/text()"))
        if not title:
            errors.append(f"{rel}: missing title")
        elif title in titles:
            errors.append(f"{rel}: duplicate title with {titles[title]}")
        else:
            titles[title] = rel

        h1 = doc.xpath("//h1")
        if len(h1) != 1:
            errors.append(f"{rel}: expected one h1, found {len(h1)}")

        descriptions = doc.xpath('//meta[@name="description"]/@content')
        length = len(descriptions[0]) if descriptions else 0
        if len(descriptions) != 1 or not 80 <= length <= 180:
            errors.append(f"{rel}: meta description count/length is {len(descriptions)}/{length}")

        canonical = doc.xpath('//link[@rel="canonical"]/@href')
        if len(canonical) != 1:
            errors.append(f"{rel}: canonical count is {len(canonical)}")
        elif canonical[0] in canonicals:
            errors.append(f"{rel}: duplicate canonical with {canonicals[canonical[0]]}")
        else:
            canonicals[canonical[0]] = rel

        ids = doc.xpath("//*[@id]/@id")
        if len(ids) != len(set(ids)):
            errors.append(f"{rel}: duplicate id attributes")

        for raw_json in doc.xpath('//script[@type="application/ld+json"]/text()'):
            try:
                structured_data = json.loads(raw_json)
            except json.JSONDecodeError as exc:
                errors.append(f"{rel}: invalid JSON-LD: {exc}")
                continue
            if "FAQPage" in json.dumps(structured_data):
                errors.append(f"{rel}: deprecated FAQPage schema present")

        for image in doc.xpath("//img"):
            src = image.get("src", "")
            if image.get("alt") is None:
                errors.append(f"{rel}: image missing alt: {src}")
            if not image.get("width") or not image.get("height"):
                errors.append(f"{rel}: image missing width/height: {src}")
            if src.startswith(("http://", "https://")):
                errors.append(f"{rel}: remote image hotlink: {src}")

        references: list[tuple[str, str]] = []
        references.extend(("href", value) for value in doc.xpath("//*[@href]/@href"))
        references.extend(("src", value) for value in doc.xpath("//*[@src]/@src"))
        references.extend(("poster", value) for value in doc.xpath("//*[@poster]/@poster"))
        for srcset in doc.xpath("//*[@srcset]/@srcset"):
            references.extend(("srcset", part.strip().split()[0]) for part in srcset.split(","))

        for attribute, reference in references:
            if not reference or reference.startswith(
                ("http://", "https://", "mailto:", "tel:", "data:")
            ):
                continue
            parsed = urlsplit(reference)
            target = (path.parent / parsed.path).resolve() if parsed.path else path
            if parsed.path and not target.exists():
                errors.append(f"{rel}: broken local {attribute}: {reference}")
            if parsed.fragment and target.suffix == ".html" and target.exists():
                if not document(target).xpath(f'//*[@id="{parsed.fragment}"]'):
                    errors.append(f"{rel}: missing target fragment: {reference}")

        store_links = doc.xpath(
            '//a[contains(@href,"apps.apple.com") or contains(@href,"play.google.com")]'
        )
        for link in store_links:
            classes = (link.get("class") or "").split()
            in_footer = bool(
                link.xpath(
                    'ancestor::*[contains(concat(" ", normalize-space(@class), " "), " footer-col ")]'
                )
            )
            if ("button" in classes or in_footer) and not link.get("data-location"):
                errors.append(f"{rel}: store CTA missing data-location")

        paired_store_classes = (
            "nav-store-actions",
            "cta-store-actions",
            "mobile-store-actions",
        )
        for class_name in paired_store_classes:
            groups = doc.xpath(
                f'//*[contains(concat(" ", normalize-space(@class), " "), " {class_name} ")]'
            )
            for group in groups:
                apple_links = group.xpath('.//a[contains(@href,"apps.apple.com")]')
                play_links = group.xpath('.//a[contains(@href,"play.google.com")]')
                if len(apple_links) != 1 or len(play_links) != 1:
                    errors.append(
                        f"{rel}: {class_name} must contain one App Store and one Google Play link"
                    )
                elif any(
                    not link.get("data-location") for link in apple_links + play_links
                ):
                    errors.append(f"{rel}: {class_name} link missing data-location")

        nav_store_groups = doc.xpath(
            '//*[contains(concat(" ", normalize-space(@class), " "), " nav-store-actions ")]'
        )
        expected_nav_store_groups = 0 if rel == Path("index.html") else 1
        if len(nav_store_groups) != expected_nav_store_groups:
            errors.append(
                f"{rel}: expected {expected_nav_store_groups} balanced navigation store groups, "
                f"found {len(nav_store_groups)}"
            )

        download_footers = doc.xpath(
            '//*[contains(concat(" ", normalize-space(@class), " "), " footer-col ")]'
            '[.//h2[normalize-space()="Download"]]'
        )
        for footer in download_footers:
            apple_links = footer.xpath('.//a[contains(@href,"apps.apple.com")]')
            play_links = footer.xpath('.//a[contains(@href,"play.google.com")]')
            if len(apple_links) != 1 or len(play_links) != 1:
                errors.append(
                    f"{rel}: download footer must contain one App Store and one Google Play link"
                )

    homepage = ROOT / "index.html"
    if homepage.exists():
        home_doc = document(homepage)
        body_classes = (home_doc.xpath("string(//body/@class)") or "").split()
        if "landing-page" not in body_classes:
            errors.append("index.html: missing landing-page body class")
        videos = home_doc.xpath("//video[@data-product-video]")
        if len(videos) != 1:
            errors.append(f"index.html: expected one product video, found {len(videos)}")
        else:
            video = videos[0]
            if video.get("autoplay") is not None:
                errors.append("index.html: product video must not bypass motion preferences")
            if any(video.get(attribute) is None for attribute in ("muted", "loop", "playsinline")):
                errors.append("index.html: product video missing muted/loop/playsinline")
            if not video.get("width") or not video.get("height") or not video.get("poster"):
                errors.append("index.html: product video missing dimensions or poster")
            source_types = set(video.xpath(".//source/@type"))
            if source_types != {"video/mp4", "video/webm"}:
                errors.append(f"index.html: unexpected video source types: {source_types}")
        obsolete_ids = {"screenshots", "how-it-works", "guides", "faq", "download"}
        present_obsolete = obsolete_ids.intersection(home_doc.xpath("//*[@id]/@id"))
        if present_obsolete:
            errors.append(f"index.html: obsolete long-page sections remain: {sorted(present_obsolete)}")
        landing_actions = home_doc.xpath(
            '//*[contains(concat(" ", normalize-space(@class), " "), " landing-actions ")]'
        )
        if len(landing_actions) != 1:
            errors.append(
                f"index.html: expected one landing store action group, found {len(landing_actions)}"
            )
        else:
            apple_links = landing_actions[0].xpath(
                './/a[contains(@href,"apps.apple.com")]'
            )
            play_links = landing_actions[0].xpath(
                './/a[contains(@href,"play.google.com")]'
            )
            if len(apple_links) != 1 or len(play_links) != 1:
                errors.append(
                    "index.html: landing actions must contain one App Store and one Google Play link"
                )
        homepage_apple_links = home_doc.xpath('//a[contains(@href,"apps.apple.com")]')
        homepage_play_links = home_doc.xpath('//a[contains(@href,"play.google.com")]')
        if len(homepage_apple_links) != 1 or len(homepage_play_links) != 1:
            errors.append(
                "index.html: homepage must expose only the central App Store and Google Play pair"
            )

    guide_hub = ROOT / "guides" / "index.html"
    if guide_hub.exists():
        hub_doc = document(guide_hub)
        hub_links = hub_doc.xpath(
            '//div[contains(concat(" ", normalize-space(@class), " "), " hub-grid ")]'
            '//a[contains(concat(" ", normalize-space(@class), " "), " guide-card ")]/@href'
        )
        if len(hub_links) != 8 or len(set(hub_links)) != 8:
            errors.append(f"guides/index.html: expected 8 unique guide links, found {len(set(hub_links))}")

    faq = ROOT / "faq.html"
    if faq.exists():
        faq_doc = document(faq)
        questions = faq_doc.xpath(
            '//details[contains(concat(" ", normalize-space(@class), " "), " faq-item ")]'
        )
        learn_more = faq_doc.xpath(
            '//details[contains(concat(" ", normalize-space(@class), " "), " faq-item ")]'
            '//a[contains(concat(" ", normalize-space(@class), " "), " text-link ")]'
        )
        if len(questions) != 8 or len(learn_more) != 8:
            errors.append(
                f"faq.html: expected 8 questions and Learn More links, found {len(questions)}/{len(learn_more)}"
            )

    library_summary_path = ROOT / "assets" / "data" / "quote-library.json"
    if not library_summary_path.exists():
        errors.append("assets/data/quote-library.json: missing generated library summary")
    else:
        library_summary = json.loads(library_summary_path.read_text(encoding="utf-8"))
        expected_quote_count = int(library_summary.get("publishedQuoteCount", 0))
        expected_quote_pages = set(library_summary.get("quotePages", []))
        actual_quote_pages = {
            str(path.relative_to(ROOT))
            for path in (ROOT / "quotes").glob("*.html")
            if path.name != "index.html"
        }
        if len(actual_quote_pages) != expected_quote_count:
            errors.append(
                "quotes/: generated quote page count mismatch "
                f"expected={expected_quote_count} actual={len(actual_quote_pages)}"
            )
        if actual_quote_pages != expected_quote_pages:
            errors.append(
                "quotes/: generated quote file list does not match quote-library.json"
            )

        quote_index = ROOT / "quotes" / "index.html"
        if not quote_index.exists():
            errors.append("quotes/index.html: missing")
        else:
            quote_index_links = {
                str((quote_index.parent / href).relative_to(ROOT))
                for href in document(quote_index).xpath(
                    '//a[contains(concat(" ", normalize-space(@class), " "), " quote-card ")]/@href'
                )
            }
            if quote_index_links != actual_quote_pages:
                errors.append(
                    "quotes/index.html: quote cards do not link every published quote exactly once"
                )

        for relative_path in sorted(actual_quote_pages):
            quote_path = ROOT / relative_path
            quote_doc = document(quote_path)
            source_lenses = quote_doc.xpath(
                '//*[contains(concat(" ", normalize-space(@class), " "), " source-lens ")]'
            )
            hero_quotes = quote_doc.xpath(
                '//*[contains(concat(" ", normalize-space(@class), " "), " quote-hero ")]'
                "//blockquote"
            )
            if len(source_lenses) != 1 or len(hero_quotes) != 1:
                errors.append(
                    f"{relative_path}: expected one hero quote and one Source Lens"
                )
            page_text = " ".join(quote_doc.xpath("//text()"))
            if "Attributed in " in page_text or "Various Sources" in page_text:
                errors.append(
                    f"{relative_path}: weak generic attribution entered the published queue"
                )
            json_ld_text = " ".join(
                quote_doc.xpath('//script[@type="application/ld+json"]/text()')
            )
            if '"Article"' not in json_ld_text or '"BreadcrumbList"' not in json_ld_text:
                errors.append(
                    f"{relative_path}: missing Article or BreadcrumbList structured data"
                )

        expected_hub_counts = {
            "philosophers": 15,
            "works": 5,
            "schools": 6,
            "topics": 4,
        }
        actual_hub_count = 0
        for section, expected_count in expected_hub_counts.items():
            section_pages = [
                path
                for path in (ROOT / section).glob("*.html")
                if path.name != "index.html"
            ]
            actual_hub_count += len(section_pages)
            if len(section_pages) != expected_count:
                errors.append(
                    f"{section}/: expected {expected_count} hubs, found {len(section_pages)}"
                )
            for hub_path in section_pages:
                quote_cards = document(hub_path).xpath(
                    '//a[contains(concat(" ", normalize-space(@class), " "), " quote-card ")]'
                )
                if not quote_cards:
                    errors.append(
                        f"{hub_path.relative_to(ROOT)}: hub has no published quote links"
                    )
        if actual_hub_count != int(library_summary.get("hubCount", 0)):
            errors.append(
                "editorial hub count does not match quote-library.json "
                f"expected={library_summary.get('hubCount')} actual={actual_hub_count}"
            )

    publication_manifest = ROOT.parent / "data" / "quote-publication.json"
    if not publication_manifest.exists():
        errors.append("data/quote-publication.json: missing publication selection manifest")
    else:
        publication = json.loads(publication_manifest.read_text(encoding="utf-8"))
        if len(publication.get("initialQuoteIds", [])) != 150:
            errors.append("data/quote-publication.json: initial release must contain 150 IDs")
        if publication.get("monthlyBatchSize") != 20:
            errors.append("data/quote-publication.json: manual batch size must be 20")
        all_scheduled_ids = list(publication.get("initialQuoteIds", []))
        for batch in publication.get("monthlyBatches", []):
            quote_ids = batch.get("quoteIds", [])
            if len(quote_ids) != 20:
                errors.append(
                    f"data/quote-publication.json: {batch.get('month')} batch has {len(quote_ids)} IDs"
                )
            all_scheduled_ids.extend(quote_ids)
        if len(all_scheduled_ids) != len(set(all_scheduled_ids)):
            errors.append("data/quote-publication.json: duplicate scheduled quote IDs")
        quote_snapshot = ROOT.parent / "data" / "quotes-en.json"
        if not quote_snapshot.exists():
            errors.append("data/quotes-en.json: missing selected quote snapshot")
        else:
            stored_quote_ids = {
                item.get("id")
                for item in json.loads(quote_snapshot.read_text(encoding="utf-8"))
            }
            if stored_quote_ids != set(all_scheduled_ids):
                errors.append(
                    "data/quotes-en.json: must contain exactly the selected publication IDs"
                )

    sitemap = ROOT / "sitemap.xml"
    if not sitemap.exists():
        errors.append("sitemap.xml: missing")
    else:
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemap_urls = {
            element.text.strip()
            for element in ET.parse(sitemap).getroot().findall("sm:url/sm:loc", namespace)
            if element.text
        }
        canonical_urls = set(canonicals)
        missing_from_sitemap = canonical_urls - sitemap_urls
        extra_in_sitemap = sitemap_urls - canonical_urls
        if missing_from_sitemap or extra_in_sitemap:
            errors.append(
                "sitemap.xml: canonical mismatch "
                f"missing={sorted(missing_from_sitemap)} extra={sorted(extra_in_sitemap)}"
            )

    media_limits = {
        ROOT / "assets" / "video" / "philosophia-demo-clean.mp4": 2_500_000,
        ROOT / "assets" / "video" / "philosophia-demo-clean.webm": 2_500_000,
        ROOT / "assets" / "video" / "philosophia-demo-poster-clean.webp": 150_000,
    }
    for media, limit in media_limits.items():
        if not media.exists():
            errors.append(f"{media.relative_to(ROOT)}: missing media asset")
        elif media.stat().st_size > limit:
            errors.append(
                f"{media.relative_to(ROOT)}: {media.stat().st_size} bytes exceeds {limit}"
            )

    print(f"HTML pages: {len(files)}")
    print(f"Unique titles: {len(titles)}")
    print(f"Unique canonicals: {len(canonicals)}")
    if errors:
        print("FAIL")
        print("\n".join(errors))
        return 1
    print("PASS: markup, JSON-LD, local references, fragments, images, and CTA attributes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
